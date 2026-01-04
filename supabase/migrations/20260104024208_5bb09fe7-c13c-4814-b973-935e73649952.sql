-- Update the get_orders_by_contact function with stricter phone validation
CREATE OR REPLACE FUNCTION public.get_orders_by_contact(
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id uuid;
  v_orders json;
  v_normalized_phone text;
BEGIN
  -- Validate: at least one contact method required
  IF (p_email IS NULL OR trim(p_email) = '') AND (p_phone IS NULL OR trim(p_phone) = '') THEN
    RAISE EXCEPTION 'Either email or phone is required';
  END IF;
  
  -- Validate email format if provided
  IF p_email IS NOT NULL AND trim(p_email) != '' THEN
    IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Validate phone format if provided (must be 11 digits starting with 09)
  IF p_phone IS NOT NULL AND trim(p_phone) != '' THEN
    -- Remove non-numeric characters for validation
    v_normalized_phone := regexp_replace(trim(p_phone), '[^0-9]', '', 'g');
    
    -- Handle +63 prefix - convert to 0 prefix
    IF trim(p_phone) LIKE '+63%' THEN
      v_normalized_phone := '0' || RIGHT(v_normalized_phone, 10);
    END IF;
    
    -- Must be exactly 11 digits
    IF LENGTH(v_normalized_phone) != 11 THEN
      RAISE EXCEPTION 'Phone number must be exactly 11 digits (e.g., 09171234567)';
    END IF;
    
    -- Must start with 09
    IF LEFT(v_normalized_phone, 2) != '09' THEN
      RAISE EXCEPTION 'Phone number must start with 09';
    END IF;
  END IF;
  
  -- Find customer by email first, then by phone
  IF p_email IS NOT NULL AND trim(p_email) != '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE LOWER(email) = LOWER(trim(p_email))
    LIMIT 1;
  END IF;
  
  -- If not found by email, try phone
  IF v_customer_id IS NULL AND p_phone IS NOT NULL AND trim(p_phone) != '' THEN
    -- Match phone with various formats (with/without +63, with/without leading 0)
    SELECT id INTO v_customer_id
    FROM customers
    WHERE 
      -- Exact match
      phone = trim(p_phone)
      -- Or match without +63 prefix
      OR phone = regexp_replace(trim(p_phone), '^\+63', '0')
      -- Or match adding +63 prefix
      OR phone = '+63' || regexp_replace(trim(p_phone), '^0', '')
      -- Or match just the last 10 digits
      OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
    LIMIT 1;
  END IF;
  
  IF v_customer_id IS NULL THEN
    -- Return empty result (no error - just no orders found)
    RETURN json_build_object('orders', '[]'::json, 'found', false);
  END IF;
  
  -- Get all orders for this customer
  SELECT json_agg(
    json_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'order_type', o.order_type,
      'total_amount', o.total_amount,
      'created_at', o.created_at,
      'pickup_date', o.pickup_date,
      'pickup_time', o.pickup_time
    ) ORDER BY o.created_at DESC
  ) INTO v_orders
  FROM orders o
  WHERE o.customer_id = v_customer_id;
  
  RETURN json_build_object(
    'orders', COALESCE(v_orders, '[]'::json),
    'found', true
  );
END;
$$;