-- Create secure lookup function for customer reservation verification
-- Requires BOTH reservation code AND phone number to prevent data disclosure

CREATE OR REPLACE FUNCTION public.lookup_reservation(
  p_code TEXT,
  p_phone TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation RECORD;
  v_normalized_phone TEXT;
BEGIN
  -- Validate inputs
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN NULL;
  END IF;
  
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Normalize phone: strip non-digits, handle +63/0 prefix
  v_normalized_phone := regexp_replace(TRIM(p_phone), '[^0-9]', '', 'g');
  
  -- Handle +63 prefix conversion to 0
  IF TRIM(p_phone) LIKE '+63%' THEN
    v_normalized_phone := '0' || RIGHT(v_normalized_phone, 10);
  END IF;
  
  -- If starts with 63 (12 digits), convert to 0 prefix
  IF LENGTH(v_normalized_phone) = 12 AND LEFT(v_normalized_phone, 2) = '63' THEN
    v_normalized_phone := '0' || RIGHT(v_normalized_phone, 10);
  END IF;
  
  -- If starts with 9 (10 digits), add 0 prefix
  IF LENGTH(v_normalized_phone) = 10 AND LEFT(v_normalized_phone, 1) = '9' THEN
    v_normalized_phone := '0' || v_normalized_phone;
  END IF;
  
  -- Lookup by code (case-insensitive) AND phone (normalized match)
  SELECT 
    r.id,
    r.reservation_code,
    r.confirmation_code,
    r.name,
    r.pax,
    r.reservation_date,
    r.reservation_time,
    r.status,
    r.preorder_items,
    r.created_at
  INTO v_reservation
  FROM reservations r
  WHERE (
    UPPER(r.confirmation_code) = UPPER(TRIM(p_code))
    OR UPPER(r.reservation_code) = UPPER(TRIM(p_code))
  )
  AND (
    -- Match normalized phone in various formats
    regexp_replace(r.phone, '[^0-9]', '', 'g') = v_normalized_phone
    OR regexp_replace(r.phone, '[^0-9]', '', 'g') = RIGHT(v_normalized_phone, 10)
    OR RIGHT(regexp_replace(r.phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
  )
  LIMIT 1;
  
  -- If not found, return null (no information disclosure)
  IF v_reservation IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Return safe reservation data (no sensitive admin fields)
  RETURN json_build_object(
    'reservation_code', COALESCE(v_reservation.confirmation_code, v_reservation.reservation_code),
    'name', v_reservation.name,
    'pax', v_reservation.pax,
    'reservation_date', v_reservation.reservation_date,
    'reservation_time', v_reservation.reservation_time,
    'status', v_reservation.status,
    'preorder_items', v_reservation.preorder_items
  );
END;
$$;