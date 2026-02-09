

# Fix: Reservation Database Function Type Casting Error

## Problem Identified

The error message `"cannot cast type time without time zone to timestamp without time zone"` is happening inside the `create_reservation` PostgreSQL function.

**Root Cause:** Line in the capacity check logic:
```sql
v_slot_start := (DATE_TRUNC('hour', p_reservation_time::TIMESTAMP) + 
    INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30))::TIME;
```

PostgreSQL cannot directly cast a `TIME` type (`p_reservation_time`) to `TIMESTAMP`. It needs a date component.

---

## Solution

Fix the `create_reservation` function by properly calculating the 30-minute slot boundaries using TIME arithmetic instead of trying to cast to TIMESTAMP.

### Fixed SQL Logic

**Before (broken):**
```sql
v_slot_start := (DATE_TRUNC('hour', p_reservation_time::TIMESTAMP) + 
    INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30))::TIME;
```

**After (fixed):**
```sql
-- Calculate slot boundaries using TIME arithmetic (no TIMESTAMP cast needed)
v_slot_start := (
  (EXTRACT(HOUR FROM p_reservation_time)::INTEGER * INTERVAL '1 hour') +
  (FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30) * INTERVAL '30 minutes')
)::TIME;
v_slot_end := v_slot_start + INTERVAL '30 minutes';
```

This calculates the 30-minute slot start time using only TIME-compatible operations:
- Extract the hour and multiply by 1-hour interval
- Floor the minutes to nearest 30 (0 or 30) and multiply by 30-minute interval
- Cast result to TIME

---

## Database Migration

```sql
-- Fix the create_reservation function to handle TIME type correctly
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
  
  -- Calculate slot boundaries using TIME arithmetic (FIX: no TIMESTAMP cast)
  v_slot_start := (
    (EXTRACT(HOUR FROM p_reservation_time)::INTEGER * INTERVAL '1 hour') +
    (FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30) * INTERVAL '30 minutes')
  )::TIME;
  v_slot_end := v_slot_start + INTERVAL '30 minutes';
  
  -- Lock and sum pax for this slot (FOR UPDATE to prevent race conditions)
  SELECT COALESCE(SUM(pax), 0) INTO v_current_pax
  FROM reservations
  WHERE reservation_date = p_reservation_date
    AND reservation_time >= v_slot_start
    AND reservation_time < v_slot_end
    AND status IN ('pending', 'confirmed')
  FOR UPDATE;
  
  -- Block if capacity would be exceeded
  IF (v_current_pax + p_pax) > v_max_pax THEN
    RAISE EXCEPTION 'Sorry, this time slot is already full. Please choose a different time.';
  END IF;
  
  -- ========== END CAPACITY CHECK ==========
  
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
$function$;
```

---

## Summary

| Item | Description |
|------|-------------|
| **Error** | `cannot cast type time without time zone to timestamp without time zone` |
| **Location** | `create_reservation` function, capacity check section |
| **Fix** | Use TIME-compatible arithmetic instead of casting to TIMESTAMP |
| **Files Changed** | Database migration only (no code changes needed) |

After applying this migration, reservations will work correctly.

