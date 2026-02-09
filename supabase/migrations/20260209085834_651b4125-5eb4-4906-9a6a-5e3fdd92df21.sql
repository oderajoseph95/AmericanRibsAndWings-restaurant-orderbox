-- Part 1: Add customer_id column to reservations table
ALTER TABLE public.reservations
ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Create index for faster lookups
CREATE INDEX idx_reservations_customer_id ON public.reservations(customer_id);

-- Part 2: Create phone normalization function for matching
CREATE OR REPLACE FUNCTION public.normalize_phone_for_match(phone TEXT) 
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digits
  phone := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- Convert 09XXXXXXXXX to 639XXXXXXXXX (Philippine local to international)
  IF phone ~ '^09[0-9]{9}$' THEN
    RETURN '63' || substring(phone from 2);
  END IF;
  
  -- Already in 63 format or other format - return as is
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Part 3: Update create_reservation function to use normalized phone matching and set customer_id
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_pax INTEGER,
  p_reservation_date DATE,
  p_reservation_time TIME,
  p_notes TEXT DEFAULT NULL,
  p_preorder_items JSONB DEFAULT NULL,
  p_idempotency_hash TEXT DEFAULT NULL
)
RETURNS TABLE(
  reservation_id UUID,
  reservation_code TEXT,
  is_duplicate BOOLEAN
) AS $$
DECLARE
  v_reservation_id UUID;
  v_reservation_code TEXT;
  v_customer_id UUID;
  v_existing_reservation_id UUID;
  v_existing_reservation_code TEXT;
  v_settings_row RECORD;
  v_max_capacity INTEGER;
  v_slot_duration INTEGER;
  v_current_pax INTEGER;
  v_slot_start TIME;
  v_slot_end TIME;
BEGIN
  -- Check for duplicate submission using idempotency hash
  IF p_idempotency_hash IS NOT NULL THEN
    SELECT r.id, r.reservation_code INTO v_existing_reservation_id, v_existing_reservation_code
    FROM reservations r
    WHERE r.idempotency_hash = p_idempotency_hash
    LIMIT 1;
    
    IF v_existing_reservation_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_reservation_id, v_existing_reservation_code, TRUE;
      RETURN;
    END IF;
  END IF;

  -- Get reservation settings
  SELECT 
    COALESCE((value->>'maxCapacityPerSlot')::integer, 50) as max_capacity,
    COALESCE((value->>'slotDurationMinutes')::integer, 60) as slot_duration
  INTO v_settings_row
  FROM settings 
  WHERE key = 'reservation_settings';
  
  v_max_capacity := COALESCE(v_settings_row.max_capacity, 50);
  v_slot_duration := COALESCE(v_settings_row.slot_duration, 60);
  
  -- Calculate slot boundaries using TIME arithmetic
  v_slot_start := p_reservation_time;
  v_slot_end := p_reservation_time + (v_slot_duration || ' minutes')::interval;
  
  -- Lock and check capacity using CTE to avoid aggregate + FOR UPDATE issue
  WITH locked_reservations AS (
    SELECT id, pax 
    FROM reservations
    WHERE reservation_date = p_reservation_date
      AND reservation_time >= v_slot_start
      AND reservation_time < v_slot_end
      AND status IN ('pending', 'confirmed')
    FOR UPDATE
  )
  SELECT COALESCE(SUM(pax), 0) INTO v_current_pax FROM locked_reservations;
  
  -- Check if adding this reservation would exceed capacity
  IF (v_current_pax + p_pax) > v_max_capacity THEN
    RAISE EXCEPTION 'This time slot is fully booked. Please choose another time.';
  END IF;

  -- Find or create customer using normalized phone matching
  SELECT id INTO v_customer_id
  FROM customers
  WHERE (p_email IS NOT NULL AND p_email != '' AND LOWER(email) = LOWER(p_email))
     OR (normalize_phone_for_match(phone) = normalize_phone_for_match(p_phone))
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    -- Create new customer
    INSERT INTO customers (name, phone, email)
    VALUES (p_name, p_phone, p_email)
    RETURNING id INTO v_customer_id;
  ELSE
    -- Update existing customer's name if provided
    UPDATE customers
    SET name = COALESCE(NULLIF(p_name, ''), name),
        email = COALESCE(NULLIF(p_email, ''), email),
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  -- Generate reservation code
  v_reservation_code := 'ARW-RSV-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  
  -- Create reservation with customer_id link
  INSERT INTO reservations (
    reservation_code,
    name,
    phone,
    email,
    pax,
    reservation_date,
    reservation_time,
    notes,
    status,
    preorder_items,
    idempotency_hash,
    customer_id
  ) VALUES (
    v_reservation_code,
    p_name,
    p_phone,
    p_email,
    p_pax,
    p_reservation_date,
    p_reservation_time,
    p_notes,
    'pending',
    p_preorder_items,
    p_idempotency_hash,
    v_customer_id
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT v_reservation_id, v_reservation_code, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Part 4: Backfill existing reservations to link with customers
UPDATE reservations r
SET customer_id = c.id
FROM customers c
WHERE r.customer_id IS NULL
  AND (
    (r.email IS NOT NULL AND r.email != '' AND LOWER(r.email) = LOWER(c.email))
    OR (normalize_phone_for_match(r.phone) = normalize_phone_for_match(c.phone))
  );