-- Phase 1: Driver Module Database Setup

-- 1.1 Add 'driver' to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'driver';

-- 1.2 Create drivers table
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  profile_photo_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on drivers
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- 1.3 Add driver_id to orders table
ALTER TABLE public.orders ADD COLUMN driver_id uuid REFERENCES public.drivers(id);

-- 1.4 Create delivery_photos table
CREATE TYPE public.delivery_photo_type AS ENUM ('pickup', 'delivery');

CREATE TABLE public.delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  photo_type delivery_photo_type NOT NULL,
  image_url text NOT NULL,
  taken_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on delivery_photos
ALTER TABLE public.delivery_photos ENABLE ROW LEVEL SECURITY;

-- 1.5 Create driver-photos storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver-photos', 'driver-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for driver-photos bucket
CREATE POLICY "Drivers can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-photos' 
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.drivers 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Anyone can view driver photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-photos');

CREATE POLICY "Admins can delete driver photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'driver-photos' 
  AND is_admin(auth.uid())
);

-- 1.6 RLS Policies for drivers table

-- Drivers can view their own record
CREATE POLICY "Drivers can view own record"
ON public.drivers FOR SELECT
USING (user_id = auth.uid());

-- Admins can view all drivers
CREATE POLICY "Admins can view all drivers"
ON public.drivers FOR SELECT
USING (is_admin(auth.uid()));

-- Owner/Manager can insert drivers
CREATE POLICY "Owner/Manager can insert drivers"
ON public.drivers FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Owner/Manager can update drivers
CREATE POLICY "Owner/Manager can update drivers"
ON public.drivers FOR UPDATE
USING (
  has_role(auth.uid(), 'owner'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Owner/Manager can delete drivers
CREATE POLICY "Owner/Manager can delete drivers"
ON public.drivers FOR DELETE
USING (
  has_role(auth.uid(), 'owner'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 1.7 RLS Policies for delivery_photos table

-- Drivers can insert their own photos
CREATE POLICY "Drivers can insert delivery photos"
ON public.delivery_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.drivers 
    WHERE id = driver_id AND user_id = auth.uid()
  )
);

-- Drivers can view photos for their orders
CREATE POLICY "Drivers can view their delivery photos"
ON public.delivery_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.drivers 
    WHERE id = driver_id AND user_id = auth.uid()
  )
);

-- Admins can view all delivery photos
CREATE POLICY "Admins can view all delivery photos"
ON public.delivery_photos FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can insert delivery photos
CREATE POLICY "Admins can insert delivery photos"
ON public.delivery_photos FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- 1.8 Update orders RLS for drivers

-- Drivers can view their assigned orders
CREATE POLICY "Drivers can view assigned orders"
ON public.orders FOR SELECT
USING (
  driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  )
);

-- Drivers can update status on their assigned orders
CREATE POLICY "Drivers can update assigned order status"
ON public.orders FOR UPDATE
USING (
  driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid()
  )
  AND status IN ('waiting_for_rider', 'picked_up', 'in_transit')
);

-- 1.9 Add trigger for drivers updated_at
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.10 Update get_order_tracking function to include driver info
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order json;
  v_items json;
  v_driver json;
  v_is_owner boolean := false;
  v_is_admin boolean := false;
BEGIN
  -- Check if current user is admin
  IF auth.uid() IS NOT NULL THEN
    v_is_admin := is_admin(auth.uid());
  END IF;
  
  -- Check if current user owns this order (through customer link)
  IF auth.uid() IS NOT NULL AND NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = p_order_id AND c.user_id = auth.uid()
    ) INTO v_is_owner;
  END IF;
  
  -- Get order with appropriate data based on access level
  SELECT json_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'order_type', o.order_type,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'status_changed_at', o.status_changed_at,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'total_amount', o.total_amount,
    'pickup_date', o.pickup_date,
    'pickup_time', o.pickup_time,
    'driver_id', o.driver_id,
    -- SECURITY FIX: Properly mask delivery address, remove GPS coordinates for public
    'delivery_address', CASE 
      WHEN v_is_admin OR v_is_owner THEN o.delivery_address
      WHEN o.order_type = 'delivery' AND o.delivery_address IS NOT NULL THEN 
        -- Extract only barangay/city, hide street and GPS
        CONCAT(
          '*******, ',
          COALESCE(
            (regexp_match(o.delivery_address, ',\s*([^,\[]+),?\s*Pampanga'))[1],
            ''
          ),
          'Pampanga'
        )
      ELSE NULL
    END,
    -- Hide exact distance for public
    'delivery_distance_km', CASE 
      WHEN v_is_admin OR v_is_owner THEN o.delivery_distance_km
      ELSE NULL
    END,
    'customer', json_build_object(
      'id', c.id,
      -- SECURITY FIX: Mask customer name (show only first initial)
      'name', CASE 
        WHEN v_is_admin OR v_is_owner THEN c.name
        WHEN c.name IS NOT NULL THEN CONCAT(LEFT(SPLIT_PART(c.name, ' ', 1), 1), '***')
        ELSE NULL
      END,
      -- SECURITY FIX: Better phone masking (show only first 4 digits)
      'phone', CASE 
        WHEN v_is_admin OR v_is_owner THEN c.phone
        WHEN c.phone IS NOT NULL AND LENGTH(c.phone) > 6 THEN CONCAT(LEFT(c.phone, 4), '******')
        ELSE NULL
      END,
      -- SECURITY FIX: Completely hide email for public tracking
      'email', CASE 
        WHEN v_is_admin OR v_is_owner THEN c.email
        ELSE NULL
      END
    )
  ) INTO v_order
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id
  WHERE o.id = p_order_id;
  
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Get driver info if assigned and order is in delivery phase
  SELECT json_build_object(
    'id', d.id,
    'name', d.name,
    'phone', d.phone,
    'profile_photo_url', d.profile_photo_url
  ) INTO v_driver
  FROM orders o
  JOIN drivers d ON o.driver_id = d.id
  WHERE o.id = p_order_id
    AND o.status IN ('waiting_for_rider', 'picked_up', 'in_transit', 'delivered');
  
  -- Get order items (no sensitive data here)
  SELECT json_agg(
    json_build_object(
      'id', oi.id,
      'product_name', oi.product_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'line_total', oi.line_total,
      'flavors', (
        SELECT json_agg(
          json_build_object(
            'flavor_name', oif.flavor_name,
            'quantity', oif.quantity,
            'surcharge_applied', oif.surcharge_applied
          )
        )
        FROM order_item_flavors oif
        WHERE oif.order_item_id = oi.id
      )
    )
  ) INTO v_items
  FROM order_items oi
  WHERE oi.order_id = p_order_id;
  
  -- Combine order, items, and driver info
  RETURN json_build_object(
    'order', v_order,
    'items', COALESCE(v_items, '[]'::json),
    'driver', v_driver,
    'is_owner', v_is_owner,
    'is_admin', v_is_admin
  );
END;
$function$;