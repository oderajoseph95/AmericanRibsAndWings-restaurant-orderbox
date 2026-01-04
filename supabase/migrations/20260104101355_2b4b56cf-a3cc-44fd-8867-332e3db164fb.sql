-- Fix admin photo upload RLS to be truly permissive
DROP POLICY IF EXISTS "Admins can insert delivery photos" ON public.delivery_photos;

CREATE POLICY "Admins can insert delivery photos"
ON public.delivery_photos
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- Create trigger function to log new orders
CREATE OR REPLACE FUNCTION public.log_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_name text;
BEGIN
  -- Get customer name
  SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
  
  INSERT INTO admin_logs (
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    entity_name,
    details,
    new_values
  ) VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(v_customer_name, 'customer'),
    'create',
    'order',
    NEW.id,
    NEW.order_number,
    'New ' || NEW.order_type || ' order placed by customer',
    jsonb_build_object(
      'order_type', NEW.order_type,
      'total_amount', NEW.total_amount,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new orders
DROP TRIGGER IF EXISTS log_new_order_trigger ON orders;
CREATE TRIGGER log_new_order_trigger
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION log_new_order();

-- Create trigger function to log delivery photos
CREATE OR REPLACE FUNCTION public.log_delivery_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_number text;
  v_user_email text;
  v_actor_type text;
BEGIN
  -- Get order number
  SELECT order_number INTO v_order_number FROM orders WHERE id = NEW.order_id;
  
  -- Determine who uploaded
  IF NEW.driver_id IS NOT NULL THEN
    SELECT CONCAT('driver:', email) INTO v_user_email FROM drivers WHERE id = NEW.driver_id;
    v_actor_type := 'Driver';
  ELSE
    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    v_actor_type := 'Admin';
  END IF;
  
  INSERT INTO admin_logs (
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    entity_name,
    details,
    new_values
  ) VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(v_user_email, 'system'),
    'photo_upload',
    'delivery_photo',
    NEW.id,
    v_order_number,
    v_actor_type || ' uploaded ' || NEW.photo_type || ' photo for order ' || v_order_number,
    jsonb_build_object(
      'photo_type', NEW.photo_type,
      'image_url', NEW.image_url
    )
  );
  RETURN NEW;
END;
$$;

-- Create trigger for delivery photos
DROP TRIGGER IF EXISTS log_delivery_photo_trigger ON delivery_photos;
CREATE TRIGGER log_delivery_photo_trigger
AFTER INSERT ON delivery_photos
FOR EACH ROW
EXECUTE FUNCTION log_delivery_photo();

-- Create trigger function to log order status changes
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_email text;
  v_actor_type text;
  v_driver_record RECORD;
BEGIN
  -- Only fire if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Check if driver made the change
    SELECT * INTO v_driver_record FROM drivers WHERE user_id = auth.uid();
    
    IF v_driver_record IS NOT NULL THEN
      v_user_email := 'driver:' || v_driver_record.email;
      v_actor_type := 'Driver';
    ELSE
      SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
      v_actor_type := 'Admin';
    END IF;
    
    INSERT INTO admin_logs (
      user_id,
      user_email,
      action,
      entity_type,
      entity_id,
      entity_name,
      old_values,
      new_values,
      details
    ) VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(v_user_email, 'system'),
      'status_change',
      'order',
      NEW.id,
      NEW.order_number,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      v_actor_type || ' changed status from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for order status changes
DROP TRIGGER IF EXISTS log_order_status_change_trigger ON orders;
CREATE TRIGGER log_order_status_change_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_status_change();