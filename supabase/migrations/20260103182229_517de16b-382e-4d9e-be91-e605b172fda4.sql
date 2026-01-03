-- Fix get_order_tracking RPC function with proper data masking for public viewers
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
  
  -- Combine order and items
  RETURN json_build_object(
    'order', v_order,
    'items', COALESCE(v_items, '[]'::json),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin
  );
END;
$$;