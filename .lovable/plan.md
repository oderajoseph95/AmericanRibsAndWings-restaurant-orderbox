
# Plan: Fix Reservation Function Ambiguity & Phone Lookup Issues

## Problems Identified

### Problem 1: Duplicate `create_reservation` Functions
**Error**: "Could not choose the best candidate function between: public.create_reservation(...)"

The database has **two versions** of `create_reservation` with overlapping signatures:
- Version 1: 8 parameters (without `p_idempotency_hash`)
- Version 2: 9 parameters (with `p_idempotency_hash`)

When the frontend calls with 8 parameters, PostgreSQL can't decide which to use because both have the same first 8 parameters with defaults.

### Problem 2: Reservation Lookup Phone Mismatch
- Stored phone: `639214080286` (international format)
- User enters: `09214080286` (local format)
- The `lookup_reservation` function normalizes user input to local format (`09...`), but the phone comparison logic may not correctly match the stored international format.

---

## Solution

### Part 1: Drop the Duplicate Function (Database Migration)

Remove the older version that doesn't have `p_idempotency_hash`. This leaves only ONE function:

```sql
-- Drop the old function signature (without idempotency_hash)
DROP FUNCTION IF EXISTS public.create_reservation(
  text, text, text, integer, date, time without time zone, text, jsonb
);
```

### Part 2: Ensure Remaining Function Handles Missing Parameter

The remaining function should accept NULL for `p_idempotency_hash` and generate it internally (which it already does). No changes needed here - the function already has `p_idempotency_hash` with a DEFAULT.

### Part 3: Fix Frontend to NOT Pass idempotency_hash

The frontend should not pass this parameter - the database function will generate it. Currently the form doesn't pass it anyway, so once we drop the old function, it will work.

### Part 4: Fix `lookup_reservation` Phone Matching

Update the phone matching logic to handle both formats properly:

```sql
-- Improve phone matching to handle 63 prefix stored in DB
AND (
  -- Direct match after stripping non-digits
  regexp_replace(r.phone, '[^0-9]', '', 'g') = v_normalized_phone
  -- Last 10 digits match (handles 63 vs 0 prefix)
  OR RIGHT(regexp_replace(r.phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
  -- If DB has 63 prefix and we have 0 prefix
  OR ('63' || RIGHT(v_normalized_phone, 10)) = regexp_replace(r.phone, '[^0-9]', '', 'g')
)
```

### Part 5: Fix `cancel_reservation_by_customer` Phone Matching

Apply the same phone normalization fix to the cancellation function to ensure consistency.

---

## Files to Modify

| Type | Action | Description |
|------|--------|-------------|
| Database Migration | **Create** | Drop duplicate function, update phone matching in lookup/cancel functions |

---

## Summary

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| "Could not choose best candidate function" | Two `create_reservation` functions with overlapping signatures | Drop the old function without `p_idempotency_hash` |
| "Reservation not found" when tracking | Phone stored as `639...` but searched as `09...` | Update phone matching to compare last 10 digits |
| Cancel loop/error | Same phone mismatch issue | Same phone matching fix |

---

## Expected Result

After this fix:
- Reservations will create successfully (only one function, no ambiguity)
- Tracking will find reservations regardless of phone format entered
- Cancellation will work for any valid phone format
