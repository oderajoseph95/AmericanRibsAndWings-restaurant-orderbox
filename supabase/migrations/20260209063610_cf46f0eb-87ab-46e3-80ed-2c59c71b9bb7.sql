-- Add cancelled_by_customer to reservation_status enum
ALTER TYPE reservation_status ADD VALUE 'cancelled_by_customer';

-- Create function to handle customer-initiated cancellation
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(
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
  v_reservation_datetime TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
BEGIN
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
    r.phone,
    r.email,
    r.pax,
    r.reservation_date,
    r.reservation_time,
    r.status,
    r.preorder_items
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
  
  -- If not found, return error (no information disclosure)
  IF v_reservation IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'not_found',
      'message', 'Reservation not found. Please check your code and phone number.'
    );
  END IF;
  
  -- Check if already cancelled
  IF v_reservation.status IN ('cancelled', 'cancelled_by_customer') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'already_cancelled',
      'message', 'This reservation has already been cancelled.'
    );
  END IF;
  
  -- Check if status allows cancellation (only pending or confirmed)
  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'invalid_status',
      'message', 'This reservation cannot be cancelled online. Please contact the store.'
    );
  END IF;
  
  -- Calculate cutoff time (2 hours before reservation)
  -- Convert reservation date + time to timestamp in Philippines timezone
  v_reservation_datetime := (v_reservation.reservation_date::TEXT || ' ' || v_reservation.reservation_time::TEXT)::TIMESTAMP AT TIME ZONE 'Asia/Manila';
  v_cutoff := v_reservation_datetime - INTERVAL '2 hours';
  
  -- Check if past cutoff
  IF now() AT TIME ZONE 'Asia/Manila' > v_cutoff THEN
    RETURN json_build_object(
      'success', false,
      'error', 'past_cutoff',
      'message', 'This reservation can no longer be cancelled online. Please contact the store directly.'
    );
  END IF;
  
  -- Update reservation status to cancelled_by_customer
  UPDATE reservations
  SET 
    status = 'cancelled_by_customer',
    status_changed_at = now(),
    updated_at = now()
  WHERE id = v_reservation.id;
  
  -- Cancel any pending reminders
  UPDATE reservation_reminders
  SET status = 'cancelled'
  WHERE reservation_id = v_reservation.id
    AND status = 'pending';
  
  -- Log to reservation_notifications for audit trail
  INSERT INTO reservation_notifications (
    reservation_id,
    channel,
    recipient,
    status,
    trigger_type,
    message_type
  ) VALUES (
    v_reservation.id,
    'system',
    v_reservation.phone,
    'sent',
    'automatic',
    'customer_cancellation'
  );
  
  -- Return success with reservation details for confirmation
  RETURN json_build_object(
    'success', true,
    'reservation_code', COALESCE(v_reservation.confirmation_code, v_reservation.reservation_code),
    'customer_name', v_reservation.name,
    'customer_phone', v_reservation.phone,
    'customer_email', v_reservation.email,
    'pax', v_reservation.pax,
    'reservation_date', v_reservation.reservation_date,
    'reservation_time', v_reservation.reservation_time
  );
END;
$$;