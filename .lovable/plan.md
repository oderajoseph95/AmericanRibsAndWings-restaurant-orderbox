
# Fix: Reservation System - Complete Database & Notification Fix

## Problem Summary

The reservation system has **TWO critical database errors** that must be fixed:

**Error 1 (Current)**: `FOR UPDATE is not allowed with aggregate functions`
- The `create_reservation` function uses `FOR UPDATE` with `SUM(pax)`, which PostgreSQL does not allow

**Error 2 (Hidden)**: `check_slot_capacity` function has a `TIME` to `TIMESTAMP` casting issue (same error we fixed before)

---

## Solution Overview

### Part 1: Fix `create_reservation` Function

The problem is this SQL:
```sql
SELECT COALESCE(SUM(pax), 0) INTO v_current_pax
FROM reservations
WHERE ...
FOR UPDATE;  -- CANNOT use with SUM()!
```

**Fix**: Use a CTE (Common Table Expression) to first lock the rows, then aggregate:
```sql
WITH locked_reservations AS (
  SELECT id
  FROM reservations
  WHERE reservation_date = p_reservation_date
    AND reservation_time >= v_slot_start
    AND reservation_time < v_slot_end
    AND status IN ('pending', 'confirmed')
  FOR UPDATE  -- Lock the rows first
)
SELECT COALESCE(SUM(r.pax), 0) INTO v_current_pax
FROM reservations r
JOIN locked_reservations lr ON r.id = lr.id;  -- Then aggregate
```

### Part 2: Fix `check_slot_capacity` Function

Same TIME casting issue - apply the same fix to calculate slot boundaries using TIME arithmetic.

---

## Database Migration SQL

```sql
-- ===========================================
-- FIX 1: create_reservation function
-- Error: FOR UPDATE is not allowed with aggregate functions
-- Solution: Use CTE to lock rows first, then aggregate
-- ===========================================

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_name text, 
  p_phone text, 
  p_email text DEFAULT NULL::text, 
  p_pax integer DEFAULT 2, 
  p_reservation_date date DEFAULT NULL::date, 
  p_reservation_time time without time zone DEFAULT NULL::time without time zone, 
  p_notes text DEFAULT NULL::text, 
  p_preorder_items jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(id uuid, reservation_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_hash TEXT;
  v_existing_id UUID;
  v_attempts INTEGER := 0;
  v_max_pax INTEGER := 40;
  v_current_pax INTEGER := 0;
  v_slot_start TIME;
  v_slot_end TIME;
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
  
  -- ========== CAPACITY CHECK ==========
  
  -- Get capacity setting
  SELECT (value->>'max_pax_per_slot')::INTEGER INTO v_max_pax
  FROM settings WHERE key = 'reservation_capacity';
  
  IF v_max_pax IS NULL THEN
    v_max_pax := 40;
  END IF;
  
  -- Calculate slot boundaries using TIME arithmetic
  v_slot_start := (
    (EXTRACT(HOUR FROM p_reservation_time)::INTEGER * INTERVAL '1 hour') +
    (FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30) * INTERVAL '30 minutes')
  )::TIME;
  v_slot_end := v_slot_start + INTERVAL '30 minutes';
  
  -- FIX: Use CTE to lock rows first, then aggregate
  -- (FOR UPDATE cannot be used with aggregate functions)
  WITH locked_reservations AS (
    SELECT reservations.id
    FROM reservations
    WHERE reservation_date = p_reservation_date
      AND reservation_time >= v_slot_start
      AND reservation_time < v_slot_end
      AND status IN ('pending', 'confirmed')
    FOR UPDATE
  )
  SELECT COALESCE(SUM(r.pax), 0) INTO v_current_pax
  FROM reservations r
  JOIN locked_reservations lr ON r.id = lr.id;
  
  -- Block if capacity would be exceeded
  IF (v_current_pax + p_pax) > v_max_pax THEN
    RAISE EXCEPTION 'Sorry, this time slot is already full. Please choose a different time.';
  END IF;
  
  -- ========== END CAPACITY CHECK ==========
  
  -- Generate idempotency hash
  v_hash := md5(
    LOWER(TRIM(p_name)) || '|' || 
    TRIM(p_phone) || '|' || 
    p_reservation_date::TEXT || '|' || 
    p_reservation_time::TEXT
  );
  
  -- Check for duplicate within 5 minutes
  SELECT reservations.id INTO v_existing_id
  FROM reservations
  WHERE idempotency_hash = v_hash
    AND created_at > (now() - INTERVAL '5 minutes');
  
  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT reservations.id, reservations.reservation_code
    FROM reservations WHERE reservations.id = v_existing_id;
    RETURN;
  END IF;
  
  -- Generate unique code
  LOOP
    v_code := 'ARW-RSV-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.reservation_code = v_code) THEN
      EXIT;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique reservation code';
    END IF;
  END LOOP;
  
  -- Insert reservation
  INSERT INTO reservations (
    reservation_code, name, phone, email, pax,
    reservation_date, reservation_time, notes,
    status, preorder_items, idempotency_hash
  ) VALUES (
    v_code, TRIM(p_name), TRIM(p_phone), NULLIF(TRIM(p_email), ''),
    p_pax, p_reservation_date, p_reservation_time,
    NULLIF(TRIM(p_notes), ''), 'pending', p_preorder_items, v_hash
  )
  RETURNING reservations.id INTO v_reservation_id;
  
  RETURN QUERY SELECT v_reservation_id, v_code;
END;
$function$;

-- ===========================================
-- FIX 2: check_slot_capacity function
-- Fix the TIME->TIMESTAMP casting issue
-- ===========================================

CREATE OR REPLACE FUNCTION public.check_slot_capacity(
  p_reservation_date date, 
  p_reservation_time time without time zone, 
  p_requested_pax integer
)
RETURNS TABLE(available boolean, current_pax integer, max_pax integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max_pax INTEGER := 40;
  v_current_pax INTEGER := 0;
  v_slot_start TIME;
  v_slot_end TIME;
BEGIN
  -- Get capacity setting
  SELECT (value->>'max_pax_per_slot')::INTEGER INTO v_max_pax
  FROM settings WHERE key = 'reservation_capacity';
  
  IF v_max_pax IS NULL THEN
    v_max_pax := 40;
  END IF;
  
  -- Calculate slot boundaries using TIME arithmetic (no TIMESTAMP cast)
  v_slot_start := (
    (EXTRACT(HOUR FROM p_reservation_time)::INTEGER * INTERVAL '1 hour') +
    (FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30) * INTERVAL '30 minutes')
  )::TIME;
  v_slot_end := v_slot_start + INTERVAL '30 minutes';
  
  -- Sum pax for this slot (no FOR UPDATE needed for read-only check)
  SELECT COALESCE(SUM(pax), 0) INTO v_current_pax
  FROM reservations
  WHERE reservation_date = p_reservation_date
    AND reservation_time >= v_slot_start
    AND reservation_time < v_slot_end
    AND status IN ('pending', 'confirmed');
  
  RETURN QUERY SELECT 
    (v_current_pax + p_requested_pax) <= v_max_pax AS available,
    v_current_pax AS current_pax,
    v_max_pax AS max_pax,
    GREATEST(v_max_pax - v_current_pax, 0) AS remaining;
END;
$function$;
```

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| `create_reservation` function | Use CTE to lock rows first, then aggregate (fixes `FOR UPDATE` with aggregate error) |
| `check_slot_capacity` function | Fix TIME arithmetic (same pattern as create_reservation) |

---

## Notification Flow (Already Implemented)

The notification system is already correctly implemented:

1. **On Reservation Submit** → SMS + Email (type: `reservation_received`)
2. **On Admin Confirm** → SMS + Email (type: `reservation_confirmed`) + Schedule 6 reminders
3. **Reminders** → 12h, 6h, 3h, 1h, 30min, 15min before reservation

---

## Files Already Correct (No Changes Needed)

- `src/components/reservation/ReservationForm.tsx` - Already sends notifications
- `src/pages/admin/ReservationDetail.tsx` - Already schedules 6 reminder intervals
- `supabase/functions/send-sms-notification/index.ts` - Already handles reservation types
- `supabase/functions/send-email-notification/index.ts` - Already has reservation templates
- `supabase/functions/send-reservation-reminder/index.ts` - Already processes reminders

---

## After This Fix

Once the database migration is applied:

1. Customer can submit reservation → Gets SMS + Email ("pending confirmation")
2. Admin confirms → Customer gets SMS + Email ("confirmed") + 6 reminders scheduled
3. Reminders auto-send at 12h, 6h, 3h, 1h, 30min, 15min before reservation time
4. Reservation appears in admin dashboard immediately
