-- Drop and recreate cancel_reservation_by_customer function to read cancellation cutoff from settings

DROP FUNCTION IF EXISTS cancel_reservation_by_customer(TEXT, TEXT);

CREATE FUNCTION cancel_reservation_by_customer(p_reservation_code TEXT, p_phone TEXT)
RETURNS TABLE(success BOOLEAN, message TEXT, reservation_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
  v_reservation_datetime TIMESTAMP;
  v_cutoff TIMESTAMP;
  v_cutoff_hours INTEGER;
  v_now TIMESTAMP;
BEGIN
  -- Get current time in Manila timezone
  v_now := (NOW() AT TIME ZONE 'Asia/Manila');
  
  -- Fetch cancellation cutoff from settings (default to 2 hours)
  SELECT COALESCE((value->>'cancellation_cutoff_hours')::INT, 2)
  INTO v_cutoff_hours
  FROM settings 
  WHERE key = 'reservation_settings';
  
  -- Default to 2 if no setting found
  IF v_cutoff_hours IS NULL THEN
    v_cutoff_hours := 2;
  END IF;

  -- Find the reservation by code and phone
  SELECT r.id, r.status, r.reservation_date, r.reservation_time
  INTO v_reservation
  FROM reservations r
  WHERE (r.reservation_code = p_reservation_code OR r.confirmation_code = p_reservation_code)
    AND r.phone = p_phone
  LIMIT 1;

  -- Check if reservation exists
  IF v_reservation IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Reservation not found. Please check your code and phone number.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check if reservation is in a cancellable state
  IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
    RETURN QUERY SELECT FALSE, 'This reservation cannot be cancelled. Current status: ' || v_reservation.status::TEXT, v_reservation.id;
    RETURN;
  END IF;

  -- Calculate reservation datetime
  v_reservation_datetime := (v_reservation.reservation_date || ' ' || v_reservation.reservation_time)::TIMESTAMP;
  
  -- Calculate cutoff time using dynamic setting
  v_cutoff := v_reservation_datetime - (v_cutoff_hours || ' hours')::INTERVAL;

  -- Check if we're past the cutoff
  IF v_now > v_cutoff THEN
    RETURN QUERY SELECT FALSE, 
      'Cancellation window has closed. Reservations must be cancelled at least ' || v_cutoff_hours || ' hours before the scheduled time. Please contact the store directly.'::TEXT, 
      v_reservation.id;
    RETURN;
  END IF;

  -- Update the reservation status
  UPDATE reservations
  SET 
    status = 'cancelled_by_customer',
    status_changed_at = NOW(),
    status_changed_by = 'customer_self_cancel'
  WHERE id = v_reservation.id;

  -- Cancel any pending reminders
  UPDATE reservation_reminders
  SET status = 'cancelled'
  WHERE reservation_id = v_reservation.id
    AND status = 'pending';

  RETURN QUERY SELECT TRUE, 'Reservation cancelled successfully.'::TEXT, v_reservation.id;
END;
$$;