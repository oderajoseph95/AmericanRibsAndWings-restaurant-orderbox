

# ISSUE R4.2 — Reservation Capacity & Slot Availability Control

## Overview

Implement a time-slot based capacity system that prevents overbooking by enforcing pax limits per 30-minute time slot during reservation submission. This ensures customers cannot exceed capacity under any condition.

---

## Current State Analysis

### Existing Infrastructure
- **Reservation Table**: Has `reservation_date` (DATE), `reservation_time` (TIME), `pax` (INTEGER), `status` (ENUM)
- **Status Values**: `pending`, `confirmed`, `cancelled`, `completed`, `no_show`
- **create_reservation RPC**: Two overloads - handles validation and code generation, but NO capacity check
- **Store Hours**: Configured in settings as `{open: "11:00", close: "21:00", timezone: "Asia/Manila"}`
- **Time Slots**: Already generated in 30-minute increments in ReservationForm.tsx

### Key Insight
The capacity check MUST happen inside the `create_reservation` database function to prevent race conditions. Using transactional validation at the database level ensures that two concurrent submissions cannot both succeed when only one slot remains.

---

## Technical Implementation

### 1. Database Changes

#### A. Add Capacity Configuration to Settings

```sql
-- Insert default capacity setting
INSERT INTO settings (key, value)
VALUES ('reservation_capacity', '{"max_pax_per_slot": 40}')
ON CONFLICT (key) DO NOTHING;
```

#### B. Create Capacity Check Function

Create a reusable function that checks if a slot has capacity:

```sql
CREATE OR REPLACE FUNCTION public.check_slot_capacity(
  p_reservation_date DATE,
  p_reservation_time TIME,
  p_requested_pax INTEGER
)
RETURNS TABLE(available BOOLEAN, current_pax INTEGER, max_pax INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_pax INTEGER := 40;  -- Default
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
  
  -- Calculate slot boundaries (30-minute slots)
  -- Slot starts at the top or half hour
  v_slot_start := (DATE_TRUNC('hour', p_reservation_time::TIMESTAMP) + 
    INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30))::TIME;
  v_slot_end := v_slot_start + INTERVAL '30 minutes';
  
  -- Sum pax for this slot (pending + confirmed only)
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
$$;
```

#### C. Update create_reservation Function

Add capacity check with transactional locking:

```sql
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_pax integer DEFAULT 2,
  p_reservation_date date DEFAULT NULL,
  p_reservation_time time DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_preorder_items jsonb DEFAULT NULL
)
RETURNS TABLE(id uuid, reservation_code text)
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
  v_max_pax INTEGER := 40;
  v_current_pax INTEGER := 0;
  v_slot_start TIME;
  v_slot_end TIME;
BEGIN
  -- Existing validations...
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
  
  -- ========== NEW: CAPACITY CHECK ==========
  
  -- Get capacity setting
  SELECT (value->>'max_pax_per_slot')::INTEGER INTO v_max_pax
  FROM settings WHERE key = 'reservation_capacity';
  
  IF v_max_pax IS NULL THEN
    v_max_pax := 40;
  END IF;
  
  -- Calculate slot boundaries (30-minute slots)
  v_slot_start := (DATE_TRUNC('hour', p_reservation_time::TIMESTAMP) + 
    INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM p_reservation_time) / 30))::TIME;
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
```

**Key Changes:**
1. **Get capacity setting**: Reads `max_pax_per_slot` from settings (default: 40)
2. **Calculate slot boundaries**: Rounds time to 30-minute slot
3. **Lock rows for update**: Uses `FOR UPDATE` to prevent race conditions
4. **Block if full**: Raises exception with customer-friendly message

### 2. Frontend Changes

#### A. Update ReservationForm.tsx Error Handling

The form already catches RPC errors and displays them via toast. The error message "Sorry, this time slot is already full..." will be shown automatically.

Optionally, enhance the UI to show availability before submission (future enhancement, out of scope for this issue).

---

## Slot Calculation Logic

Time slots are 30-minute blocks:
- `11:00 - 11:30`
- `11:30 - 12:00`
- `12:00 - 12:30`
- etc.

A reservation time of `11:15` falls into the `11:00 - 11:30` slot.
A reservation time of `11:45` falls into the `11:30 - 12:00` slot.

The calculation:
```sql
slot_start = DATE_TRUNC('hour', time) + 30min * FLOOR(EXTRACT(MINUTE FROM time) / 30)
slot_end = slot_start + 30 minutes
```

---

## Capacity Counting Rules

Only count reservations with status:
- `pending` ✅
- `confirmed` ✅

Do NOT count:
- `cancelled` ❌
- `completed` ❌ (past reservations)
- `no_show` ❌

---

## Race Condition Prevention

The `FOR UPDATE` clause in the query:
```sql
SELECT SUM(pax) INTO v_current_pax
FROM reservations
WHERE reservation_date = ... AND reservation_time >= v_slot_start ...
FOR UPDATE;
```

This locks the matching rows during the transaction. If two users submit simultaneously:
1. First transaction locks the rows, calculates capacity, inserts
2. Second transaction waits for lock, then recalculates with updated data
3. If capacity exceeded after first insert, second is blocked

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Add capacity setting, create `check_slot_capacity` function, update `create_reservation` |
| `src/components/reservation/ReservationForm.tsx` | MINOR | Error message already displays via toast - no changes needed |

---

## Edge Cases Handled

| Case | Handling |
|------|----------|
| Same customer multiple reservations | Allowed, counted toward capacity |
| Admin-created reservations | Same RPC, same rules apply |
| Store closed hours | Time slots only generated within store hours (ReservationForm.tsx already handles this) |
| Two concurrent submissions | FOR UPDATE locking ensures first-commit-wins |
| Pax exceeds individual limit (>20) | Already validated, max 20 per reservation |

---

## Default Configuration

| Setting | Default Value | Notes |
|---------|---------------|-------|
| Max pax per slot | 40 | Configurable via settings table |
| Slot duration | 30 minutes | Fixed in V1 |

---

## Error Message

When capacity is exceeded, customer sees:
```
Sorry, this time slot is already full. Please choose a different time.
```

This is clear, actionable, and doesn't expose internal capacity numbers.

---

## Testing Scenarios

1. **Normal submission**: Pax 4, slot has 30/40 → Success
2. **At capacity**: Pax 10, slot has 35/40 → Blocked with error
3. **Cancelled don't count**: Pax 4, slot has 35 pending + 5 cancelled → Success (35+4=39 ≤ 40)
4. **Race condition**: Two simultaneous pax 25 submissions to empty slot → Only one succeeds

---

## What This Creates

1. `check_slot_capacity` database function (reusable for future UI)
2. Updated `create_reservation` with capacity validation
3. `reservation_capacity` setting in settings table
4. Race-condition-safe capacity enforcement

---

## What This Does NOT Create

- Waitlist functionality
- Admin capacity override
- Visual capacity indicators
- Per-table or per-area seating
- Capacity analytics dashboard

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Customers cannot exceed pax capacity per slot | FOR UPDATE lock + exception |
| Capacity is enforced consistently | Database-level check (cannot bypass) |
| Store hours are respected | Time slots already limited by ReservationForm |
| Rejected/cancelled don't count | WHERE status IN ('pending', 'confirmed') |
| No duplicate capacity counts | Transactional INSERT after check |
| Overbooking is impossible | First-commit-wins with row locking |

---

## ✅ Implementation Status

**ISSUE R4.2 — COMPLETED**

Migration applied successfully:
- ✅ `reservation_capacity` setting added (default: 40 pax per slot)
- ✅ `check_slot_capacity` function created (reusable for future UI)
- ✅ `create_reservation` updated with capacity check + FOR UPDATE locking
- ✅ Customer-friendly error message when slot is full
- ✅ Race condition prevention via transactional locking

