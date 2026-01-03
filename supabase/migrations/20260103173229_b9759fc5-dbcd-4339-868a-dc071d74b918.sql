-- 1. Add new order statuses to the enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'preparing';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'waiting_for_rider';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'picked_up';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Add user_id column to customers table for account linking
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

-- 3. Add RLS policy for customers to view their own linked orders
CREATE POLICY "Customers can view their own orders"
ON orders
FOR SELECT
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- 4. Add RLS policy for customers to view their own customer record
CREATE POLICY "Customers can view own customer record"
ON customers
FOR SELECT
USING (user_id = auth.uid());

-- 5. Add RLS policy for customers to update their own customer record
CREATE POLICY "Customers can update own customer record"
ON customers
FOR UPDATE
USING (user_id = auth.uid());

-- 6. Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- 7. Update the status transition trigger to allow new statuses
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

  -- Validate transitions
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

-- 8. Function to link customer account by email/phone
CREATE OR REPLACE FUNCTION public.link_customer_to_user(p_user_id uuid, p_email text, p_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- Find customer by email or phone and link to user
  UPDATE customers
  SET user_id = p_user_id
  WHERE user_id IS NULL 
    AND (
      (p_email IS NOT NULL AND email = p_email)
      OR (p_phone IS NOT NULL AND phone = p_phone)
    )
  RETURNING id INTO v_customer_id;
  
  RETURN v_customer_id;
END;
$$;