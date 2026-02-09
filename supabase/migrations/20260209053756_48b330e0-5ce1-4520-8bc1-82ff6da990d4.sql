-- Add preorder_items column for R1.3 optional menu selections
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS preorder_items JSONB;

-- Add idempotency_hash column for duplicate prevention
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS idempotency_hash TEXT;

-- Create unique index on idempotency_hash (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS reservations_idempotency_hash_idx 
ON reservations (idempotency_hash) 
WHERE idempotency_hash IS NOT NULL;

-- Update RPC function with idempotency check and preorder_items support
CREATE OR REPLACE FUNCTION create_reservation(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_pax INTEGER DEFAULT 2,
  p_reservation_date DATE DEFAULT NULL,
  p_reservation_time TIME DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_preorder_items JSONB DEFAULT NULL
)
RETURNS TABLE(id UUID, reservation_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_hash TEXT;
  v_existing_id UUID;
  v_attempts INTEGER := 0;
BEGIN
  -- Validate required fields
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone is required';
  END IF;
  
  IF p_pax < 1 OR p_pax > 20 THEN
    RAISE EXCEPTION 'Party size must be between 1 and 20';
  END IF;

  IF p_reservation_date IS NULL THEN
    RAISE EXCEPTION 'Reservation date is required';
  END IF;

  IF p_reservation_time IS NULL THEN
    RAISE EXCEPTION 'Reservation time is required';
  END IF;
  
  -- Generate idempotency hash from name + phone + date + time
  v_hash := md5(
    LOWER(TRIM(p_name)) || '|' || 
    TRIM(p_phone) || '|' || 
    p_reservation_date::TEXT || '|' || 
    p_reservation_time::TEXT
  );
  
  -- Check for duplicate within 5 minutes (idempotent behavior)
  SELECT reservations.id INTO v_existing_id
  FROM reservations
  WHERE idempotency_hash = v_hash
    AND created_at > (now() - INTERVAL '5 minutes');
  
  IF v_existing_id IS NOT NULL THEN
    -- Return existing reservation (idempotent - no duplicate created)
    RETURN QUERY SELECT reservations.id, reservations.reservation_code
    FROM reservations WHERE reservations.id = v_existing_id;
    RETURN;
  END IF;
  
  -- Generate unique code with retry
  LOOP
    v_code := 'ARW-RSV-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if code exists
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.reservation_code = v_code) THEN
      EXIT;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique reservation code';
    END IF;
  END LOOP;
  
  -- Insert reservation with idempotency hash and preorder items
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
    idempotency_hash
  ) VALUES (
    v_code,
    TRIM(p_name),
    TRIM(p_phone),
    NULLIF(TRIM(p_email), ''),
    p_pax,
    p_reservation_date,
    p_reservation_time,
    NULLIF(TRIM(p_notes), ''),
    'pending',
    p_preorder_items,
    v_hash
  )
  RETURNING reservations.id INTO v_reservation_id;
  
  RETURN QUERY SELECT v_reservation_id, v_code;
END;
$$;