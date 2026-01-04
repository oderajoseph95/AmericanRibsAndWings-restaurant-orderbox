-- Add payment_method column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;

-- Update the RPC function to accept payment method
CREATE OR REPLACE FUNCTION public.create_checkout_order(
  p_customer_id uuid,
  p_order_type text,
  p_subtotal numeric,
  p_total_amount numeric,
  p_delivery_address text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 0,
  p_delivery_distance_km numeric DEFAULT NULL,
  p_pickup_date date DEFAULT NULL,
  p_pickup_time time DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
BEGIN
  -- Validate customer exists
  IF NOT EXISTS (SELECT 1 FROM customers WHERE customers.id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Insert the order with pending status
  INSERT INTO orders (
    customer_id,
    order_type,
    status,
    subtotal,
    total_amount,
    delivery_address,
    delivery_fee,
    delivery_distance_km,
    pickup_date,
    pickup_time,
    internal_notes,
    payment_method
  )
  VALUES (
    p_customer_id,
    p_order_type::order_type,
    'pending'::order_status,
    p_subtotal,
    p_total_amount,
    p_delivery_address,
    p_delivery_fee,
    p_delivery_distance_km,
    p_pickup_date,
    p_pickup_time,
    p_internal_notes,
    p_payment_method
  )
  RETURNING orders.id, orders.order_number INTO v_order_id, v_order_number;
  
  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$function$;