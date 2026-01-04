-- Update the get_order_tracking function to return driver info when assigned
-- (not just in specific statuses)
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
  
  -- Get driver info if assigned (show driver for all delivery statuses where driver is assigned)
  SELECT json_build_object(
    'id', d.id,
    'name', d.name,
    'phone', d.phone,
    'profile_photo_url', d.profile_photo_url
  ) INTO v_driver
  FROM orders o
  JOIN drivers d ON o.driver_id = d.id
  WHERE o.id = p_order_id
    AND o.driver_id IS NOT NULL;
  
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

-- Update status validation trigger to allow admin override (backwards status changes)
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If status hasn't changed, allow
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow admins to set any status (for corrections/overrides)
  IF is_admin(auth.uid()) THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  END IF;

  -- Validate transitions for non-admins
  IF OLD.status = 'pending' AND NEW.status IN ('for_verification', 'rejected', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'for_verification' AND NEW.status IN ('approved', 'rejected', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'approved' AND NEW.status IN ('preparing', 'completed', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'preparing' AND NEW.status IN ('ready_for_pickup', 'waiting_for_rider', 'completed', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'ready_for_pickup' AND NEW.status IN ('completed', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'waiting_for_rider' AND NEW.status IN ('picked_up', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'picked_up' AND NEW.status IN ('in_transit', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'in_transit' AND NEW.status IN ('delivered', 'cancelled') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'delivered' AND NEW.status = 'completed' THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot change status from % - it is terminal', OLD.status;
  ELSE
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;
END;
$function$;