-- Fix RLS: Allow public to update pending orders to for_verification status
CREATE POLICY "Public can update pending orders to for_verification"
ON public.orders
FOR UPDATE
USING (status = 'pending')
WITH CHECK (status = 'for_verification');

-- Create RPC function for email/phone order lookup
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
  
  -- Normalize phone if provided
  IF p_phone IS NOT NULL AND trim(p_phone) != '' THEN
    v_normalized_phone := regexp_replace(trim(p_phone), '[^0-9]', '', 'g');
    
    IF LENGTH(v_normalized_phone) < 10 THEN
      RAISE EXCEPTION 'Phone number must be at least 10 digits';
    END IF;
  END IF;
  
  -- Find customer by email first
  IF p_email IS NOT NULL AND trim(p_email) != '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE LOWER(email) = LOWER(trim(p_email))
    LIMIT 1;
  END IF;
  
  -- If not found by email, try phone
  IF v_customer_id IS NULL AND p_phone IS NOT NULL AND trim(p_phone) != '' THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE 
      phone = trim(p_phone)
      OR phone = regexp_replace(trim(p_phone), '^\+63', '0')
      OR phone = '+63' || regexp_replace(trim(p_phone), '^0', '')
      OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
    LIMIT 1;
  END IF;
  
  IF v_customer_id IS NULL THEN
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