-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.lookup_reservation(text, text);
DROP FUNCTION IF EXISTS public.cancel_reservation_by_customer(text, text);

-- Recreate lookup_reservation with improved phone matching
CREATE OR REPLACE FUNCTION public.lookup_reservation(p_reservation_code TEXT, p_phone TEXT)
RETURNS TABLE (
  id UUID,
  reservation_code TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  pax INTEGER,
  reservation_date DATE,
  reservation_time TIME,
  notes TEXT,
  status reservation_status,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_normalized_phone TEXT;
BEGIN
  -- Normalize the input phone number (strip non-digits)
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Convert to local format if international (63 -> 0)
  IF v_normalized_phone LIKE '63%' AND length(v_normalized_phone) = 12 THEN
    v_normalized_phone := '0' || substring(v_normalized_phone from 3);
  END IF;
  
  -- If starts with 9 and is 10 digits, add 0 prefix
  IF v_normalized_phone LIKE '9%' AND length(v_normalized_phone) = 10 THEN
    v_normalized_phone := '0' || v_normalized_phone;
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.reservation_code,
    r.name,
    r.phone,
    r.email,
    r.pax,
    r.reservation_date,
    r.reservation_time,
    r.notes,
    r.status,
    r.created_at
  FROM reservations r
  WHERE UPPER(r.reservation_code) = UPPER(p_reservation_code)
    AND (
      -- Direct match after stripping non-digits
      regexp_replace(r.phone, '[^0-9]', '', 'g') = v_normalized_phone
      -- Last 10 digits match (handles 63 vs 0 prefix)
      OR RIGHT(regexp_replace(r.phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
      -- If DB has 63 prefix and we have 0 prefix
      OR ('63' || RIGHT(v_normalized_phone, 10)) = regexp_replace(r.phone, '[^0-9]', '', 'g')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate cancel_reservation_by_customer with improved phone matching
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(p_reservation_code TEXT, p_phone TEXT)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  reservation_id UUID
) AS $$
DECLARE
  v_reservation_id UUID;
  v_current_status reservation_status;
  v_normalized_phone TEXT;
BEGIN
  -- Normalize the input phone number (strip non-digits)
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- Convert to local format if international (63 -> 0)
  IF v_normalized_phone LIKE '63%' AND length(v_normalized_phone) = 12 THEN
    v_normalized_phone := '0' || substring(v_normalized_phone from 3);
  END IF;
  
  -- If starts with 9 and is 10 digits, add 0 prefix
  IF v_normalized_phone LIKE '9%' AND length(v_normalized_phone) = 10 THEN
    v_normalized_phone := '0' || v_normalized_phone;
  END IF;

  -- Find the reservation with flexible phone matching
  SELECT r.id, r.status INTO v_reservation_id, v_current_status
  FROM reservations r
  WHERE UPPER(r.reservation_code) = UPPER(p_reservation_code)
    AND (
      -- Direct match after stripping non-digits
      regexp_replace(r.phone, '[^0-9]', '', 'g') = v_normalized_phone
      -- Last 10 digits match (handles 63 vs 0 prefix)
      OR RIGHT(regexp_replace(r.phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
      -- If DB has 63 prefix and we have 0 prefix
      OR ('63' || RIGHT(v_normalized_phone, 10)) = regexp_replace(r.phone, '[^0-9]', '', 'g')
    );

  -- Check if reservation exists
  IF v_reservation_id IS NULL THEN
    RETURN QUERY SELECT false, 'Reservation not found. Please check your reservation code and phone number.', NULL::UUID;
    RETURN;
  END IF;

  -- Check if reservation can be cancelled (only pending or confirmed)
  IF v_current_status NOT IN ('pending', 'confirmed') THEN
    RETURN QUERY SELECT false, 'This reservation cannot be cancelled. Status: ' || v_current_status::TEXT, v_reservation_id;
    RETURN;
  END IF;

  -- Cancel the reservation
  UPDATE reservations
  SET 
    status = 'cancelled_by_customer',
    status_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_reservation_id;

  RETURN QUERY SELECT true, 'Reservation cancelled successfully.', v_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;