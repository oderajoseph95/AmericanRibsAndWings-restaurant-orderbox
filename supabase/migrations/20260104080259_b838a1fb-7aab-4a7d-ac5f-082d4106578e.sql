-- Create SECURITY DEFINER function for order items insertion to bypass RLS
CREATE OR REPLACE FUNCTION public.create_checkout_order_item(
  p_order_id uuid,
  p_product_id uuid,
  p_product_name text,
  p_product_sku text,
  p_quantity integer,
  p_unit_price numeric,
  p_subtotal numeric,
  p_flavor_surcharge_total numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_item_id uuid;
BEGIN
  -- Validate order exists
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  -- Insert the order item
  INSERT INTO order_items (
    order_id,
    product_id,
    product_name,
    product_sku,
    quantity,
    unit_price,
    subtotal,
    flavor_surcharge_total
  )
  VALUES (
    p_order_id,
    p_product_id,
    p_product_name,
    p_product_sku,
    p_quantity,
    p_unit_price,
    p_subtotal,
    p_flavor_surcharge_total
  )
  RETURNING id INTO v_order_item_id;
  
  RETURN v_order_item_id;
END;
$$;

-- Create SECURITY DEFINER function for order item flavors insertion
CREATE OR REPLACE FUNCTION public.create_checkout_order_item_flavor(
  p_order_item_id uuid,
  p_flavor_id uuid,
  p_flavor_name text,
  p_quantity integer,
  p_surcharge_applied numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flavor_record_id uuid;
BEGIN
  -- Validate order item exists
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE id = p_order_item_id) THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;
  
  -- Insert the flavor record
  INSERT INTO order_item_flavors (
    order_item_id,
    flavor_id,
    flavor_name,
    quantity,
    surcharge_applied
  )
  VALUES (
    p_order_item_id,
    p_flavor_id,
    p_flavor_name,
    p_quantity,
    p_surcharge_applied
  )
  RETURNING id INTO v_flavor_record_id;
  
  RETURN v_flavor_record_id;
END;
$$;

-- Grant execute to public
GRANT EXECUTE ON FUNCTION public.create_checkout_order_item TO anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_order_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order_item_flavor TO anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_order_item_flavor TO authenticated;