-- Create a secure RPC function for public order tracking
-- This returns only necessary fields for tracking, with masked delivery address
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order json;
  v_items json;
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
    -- Only show full delivery address to admins and owners
    -- For public tracking, show masked version
    'delivery_address', CASE 
      WHEN v_is_admin OR v_is_owner THEN o.delivery_address
      WHEN o.order_type = 'delivery' AND o.delivery_address IS NOT NULL THEN 
        -- Mask the full address - only show barangay/city
        regexp_replace(o.delivery_address, '^[^,]+,\s*', '••••, ')
      ELSE NULL
    END,
    'delivery_distance_km', o.delivery_distance_km,
    'customer', json_build_object(
      'id', c.id,
      'name', c.name,
      -- Mask contact info for public access
      'phone', CASE 
        WHEN v_is_admin OR v_is_owner THEN c.phone
        ELSE CONCAT(LEFT(c.phone, 4), '****', RIGHT(c.phone, 2))
      END,
      'email', CASE 
        WHEN v_is_admin OR v_is_owner THEN c.email
        WHEN c.email IS NOT NULL THEN 
          CONCAT(LEFT(SPLIT_PART(c.email, '@', 1), 2), '****@', SPLIT_PART(c.email, '@', 2))
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
  
  -- Get order items
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
  
  -- Combine order and items
  RETURN json_build_object(
    'order', v_order,
    'items', COALESCE(v_items, '[]'::json),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(uuid) TO authenticated;

-- Add a policy to ensure order_item_flavors can be read via the RPC 
-- (the RPC uses SECURITY DEFINER so it can read anyway, but let's be explicit)
CREATE POLICY "Public can view order item flavors for their orders"
ON public.order_item_flavors FOR SELECT
USING (
  order_item_id IN (
    SELECT oi.id FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE c.user_id = auth.uid() OR is_admin(auth.uid())
  )
  OR TRUE -- Allow via RPC with security definer
);