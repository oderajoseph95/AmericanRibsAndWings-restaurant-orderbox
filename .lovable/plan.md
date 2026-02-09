

# ISSUE R1.4 — Reservation Submission & State Creation

## Overview

Align the current reservation implementation with R1.4's strict requirements. The current implementation went too far by including notifications and reservation codes. This plan strips back to the correct scope: **pure state creation only**.

---

## Gap Analysis

| Requirement | Current State | Action |
|---|---|---|
| Database record creation | ✅ Done | Keep |
| Status defaults to `pending` | ✅ Done | Keep |
| `preorder_items` column | ❌ Missing | Add column |
| Client-side submit lock | ✅ Done | Keep |
| Server-side idempotency | ❌ Missing | Add hash check |
| SMS/Email notifications | ❌ Incorrectly added | **Remove** |
| Reservation codes shown | ❌ Incorrectly added | **Remove from UI** |
| Success state shows "Pending" | ❌ Shows code instead | **Fix** |

---

## Technical Implementation

### 1. Database Migration - Add `preorder_items` Column & Idempotency

Add nullable JSONB column for optional pre-order selections:

```sql
-- Add preorder_items column for R1.3 optional menu selections
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS preorder_items JSONB;

-- Add idempotency_hash column for duplicate prevention
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS idempotency_hash TEXT;

-- Create unique index on idempotency_hash (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS reservations_idempotency_hash_idx 
ON reservations (idempotency_hash) 
WHERE idempotency_hash IS NOT NULL;
```

### 2. Update RPC Function - Add Idempotency Check

Modify `create_reservation` to:
- Accept optional `preorder_items` parameter
- Generate idempotency hash from (name + phone + date + time)
- Check for existing reservation with same hash within 5 minutes
- Reject duplicate attempts

```sql
CREATE OR REPLACE FUNCTION create_reservation(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_pax INTEGER DEFAULT 2,
  p_reservation_date DATE DEFAULT NULL,
  p_reservation_time TIME DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_preorder_items JSONB DEFAULT NULL  -- NEW
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
  -- Validation (unchanged)
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
    -- Return existing reservation (idempotent)
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

---

### 3. Update ReservationForm.tsx - Remove Notifications

**Changes:**
1. Remove SMS and Email notification imports
2. Remove notification triggers from `handleSubmit`
3. Keep reservation code in callback (stored in DB, just not shown yet)

```tsx
// REMOVE these imports:
// import { sendSmsNotification } from "@/hooks/useSmsNotifications";
// import { sendEmailNotification } from "@/hooks/useEmailNotifications";

// REMOVE this entire block from handleSubmit (lines 207-235):
// Promise.allSettled([
//   sendSmsNotification({...}),
//   sendEmailNotification({...}),
// ]).then((results) => {...});

// The rest of the submission logic remains unchanged
```

---

### 4. Update ReservationConfirmation.tsx - Show Pending Status

**Changes:**
1. Remove reservation code display
2. Show "Status: Pending confirmation" instead
3. Simplify messaging to match R1.4 requirements

```tsx
// REMOVE the reservation code card entirely (lines 64-75)

// REPLACE with simple pending status:
<Card className="mb-6 border-amber-500/20 bg-amber-500/5">
  <CardContent className="pt-6 text-center">
    <p className="text-sm text-muted-foreground mb-1">Status</p>
    <p className="text-xl font-semibold text-amber-600">
      Pending Confirmation
    </p>
    <p className="text-xs text-muted-foreground mt-2">
      We will contact you to confirm this reservation
    </p>
  </CardContent>
</Card>
```

---

### 5. Update Reserve.tsx ConfirmationData Interface

Remove `code` from the interface since we're not displaying it:

```tsx
interface ConfirmationData {
  id: string;
  // code: string;  // REMOVE - not needed for R1.4
  name: string;
  pax: number;
  date: string;
  time: string;
}
```

---

## Files to Modify

| File | Change |
|---|---|
| **Database** | Add `preorder_items` column, `idempotency_hash` column + index |
| **Database** | Update `create_reservation` RPC with idempotency + preorder |
| `src/components/reservation/ReservationForm.tsx` | Remove notification imports and triggers |
| `src/components/reservation/ReservationConfirmation.tsx` | Replace code display with "Pending" status |
| `src/pages/Reserve.tsx` | Remove `code` from ConfirmationData interface |

---

## What This Delivers

- Reservation record is created exactly once
- Status defaults to `pending`
- Pre-order items can be stored (nullable, for R1.3)
- Double-submit prevented (client + server-side idempotency)
- Clear error handling with retry capability
- Success screen shows "Pending Confirmation"

---

## What This Removes/Prevents

- NO SMS notifications (removed)
- NO Email notifications (removed)
- NO reservation code displayed to user (code exists in DB but hidden)
- NO confirmation messaging about SMS

---

## Anti-Double-Submit Implementation

**Client-side:**
- `isSubmitting` state disables button immediately on click
- Button stays disabled until response received

**Server-side:**
- MD5 hash of (name + phone + date + time) stored in `idempotency_hash`
- Unique index prevents duplicate inserts
- 5-minute window check returns existing reservation if duplicate detected
- Back button resubmission returns same reservation ID (idempotent)

---

## Result

After implementation:
- Customer submits form at `/reserve`
- Reservation created with `status = 'pending'`
- Pre-order selections stored in `preorder_items`
- Customer sees: "Pending Confirmation" status
- No SMS/Email sent
- No reservation code shown
- Refresh returns same reservation (no duplicate)

