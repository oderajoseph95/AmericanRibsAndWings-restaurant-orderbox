-- Drop the overly permissive public insert policy
DROP POLICY IF EXISTS "Public can create customers" ON public.customers;

-- Create a secure function for guest customer creation during checkout
-- This function validates inputs and creates the customer record
CREATE OR REPLACE FUNCTION public.create_checkout_customer(
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- Validate required fields
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  
  -- At least one contact method required
  IF (p_email IS NULL OR trim(p_email) = '') AND (p_phone IS NULL OR trim(p_phone) = '') THEN
    RAISE EXCEPTION 'Either email or phone is required';
  END IF;
  
  -- Validate email format if provided
  IF p_email IS NOT NULL AND trim(p_email) != '' THEN
    IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Check if customer with same email or phone exists
  SELECT id INTO v_customer_id
  FROM customers
  WHERE (p_email IS NOT NULL AND email = p_email)
     OR (p_phone IS NOT NULL AND phone = p_phone)
  LIMIT 1;
  
  -- If existing customer found, update name and return
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET name = trim(p_name),
        email = COALESCE(NULLIF(trim(p_email), ''), email),
        phone = COALESCE(NULLIF(trim(p_phone), ''), phone)
    WHERE id = v_customer_id;
    RETURN v_customer_id;
  END IF;
  
  -- Create new customer
  INSERT INTO customers (name, email, phone)
  VALUES (
    trim(p_name),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_phone), '')
  )
  RETURNING id INTO v_customer_id;
  
  RETURN v_customer_id;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.create_checkout_customer(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_customer(text, text, text) TO authenticated;