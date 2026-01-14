-- Fix the create_checkout_order function to properly convert pickup_time text to TIME
CREATE OR REPLACE FUNCTION public.create_checkout_order(
  p_customer_id text,
  p_delivery_address text DEFAULT NULL,
  p_delivery_distance_km double precision DEFAULT NULL,
  p_delivery_fee double precision DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_order_type text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_pickup_date text DEFAULT NULL,
  p_pickup_time text DEFAULT NULL,
  p_subtotal double precision DEFAULT NULL,
  p_total_amount double precision DEFAULT NULL,
  p_delivery_date text DEFAULT NULL,
  p_delivery_time text DEFAULT NULL
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
BEGIN
  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  
  INSERT INTO orders (
    customer_id,
    delivery_address,
    delivery_distance_km,
    delivery_fee,
    internal_notes,
    order_type,
    payment_method,
    pickup_date,
    pickup_time,
    subtotal,
    total_amount,
    order_number,
    status,
    delivery_date,
    delivery_time
  ) VALUES (
    p_customer_id::uuid,
    p_delivery_address,
    p_delivery_distance_km,
    p_delivery_fee,
    p_internal_notes,
    p_order_type::order_type,
    p_payment_method,
    CASE WHEN p_pickup_date IS NOT NULL THEN p_pickup_date::date ELSE NULL END,
    CASE WHEN p_pickup_time IS NOT NULL 
         THEN to_timestamp(p_pickup_time, 'HH:MI AM')::time 
         ELSE NULL END,
    p_subtotal,
    p_total_amount,
    v_order_number,
    'pending'::order_status,
    CASE WHEN p_delivery_date IS NOT NULL THEN p_delivery_date::date ELSE NULL END,
    p_delivery_time
  )
  RETURNING orders.id INTO v_order_id;
  
  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;