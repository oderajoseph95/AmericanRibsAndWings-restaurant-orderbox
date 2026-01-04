-- Update the driver_earnings status check to include 'pending'
ALTER TABLE public.driver_earnings DROP CONSTRAINT IF EXISTS driver_earnings_status_check;
ALTER TABLE public.driver_earnings ADD CONSTRAINT driver_earnings_status_check 
  CHECK (status IN ('pending', 'available', 'requested', 'processing', 'paid'));

-- Drop and recreate the trigger function with improved logic
CREATE OR REPLACE FUNCTION public.create_driver_earning_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Case 1: Driver assigned to delivery order - create pending earning
  IF (OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL) 
     AND NEW.order_type = 'delivery' THEN
    INSERT INTO driver_earnings (driver_id, order_id, delivery_fee, distance_km, status)
    VALUES (NEW.driver_id, NEW.id, COALESCE(NEW.delivery_fee, 0), COALESCE(NEW.delivery_distance_km, 0), 'pending')
    ON CONFLICT (order_id) DO UPDATE SET
      driver_id = EXCLUDED.driver_id,
      delivery_fee = EXCLUDED.delivery_fee,
      distance_km = EXCLUDED.distance_km,
      status = 'pending',
      updated_at = now();
  END IF;
  
  -- Case 2: Driver changed on an existing order - update the earning record
  IF (OLD.driver_id IS NOT NULL AND NEW.driver_id IS NOT NULL AND OLD.driver_id != NEW.driver_id)
     AND NEW.order_type = 'delivery' THEN
    UPDATE driver_earnings 
    SET driver_id = NEW.driver_id,
        delivery_fee = COALESCE(NEW.delivery_fee, 0),
        distance_km = COALESCE(NEW.delivery_distance_km, 0),
        updated_at = now()
    WHERE order_id = NEW.id;
  END IF;
  
  -- Case 3: Order delivered/completed - make earnings available
  IF (OLD.status IS DISTINCT FROM NEW.status) 
     AND NEW.status IN ('delivered', 'completed')
     AND NEW.driver_id IS NOT NULL 
     AND NEW.order_type = 'delivery' THEN
    -- Insert or update earnings
    INSERT INTO driver_earnings (driver_id, order_id, delivery_fee, distance_km, status)
    VALUES (NEW.driver_id, NEW.id, COALESCE(NEW.delivery_fee, 0), COALESCE(NEW.delivery_distance_km, 0), 'available')
    ON CONFLICT (order_id) DO UPDATE SET
      status = 'available',
      delivery_fee = COALESCE(NEW.delivery_fee, 0),
      distance_km = COALESCE(NEW.delivery_distance_km, 0),
      updated_at = now();
  END IF;
  
  -- Case 4: Driver unassigned - delete pending earning only
  IF (OLD.driver_id IS NOT NULL AND NEW.driver_id IS NULL) THEN
    DELETE FROM driver_earnings 
    WHERE order_id = NEW.id AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;