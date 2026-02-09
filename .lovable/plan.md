
# Plan: Drop Duplicate `create_reservation` Function

## Root Cause (CONFIRMED)

The database has **TWO** `create_reservation` functions:

| OID | Parameters |
|-----|------------|
| 62839 | 8 params (p_name, p_phone, p_email, p_pax, p_reservation_date, p_reservation_time, p_notes, p_preorder_items) |
| 63026 | 9 params (same + p_idempotency_hash) |

When the frontend calls with 7 parameters, PostgreSQL sees both functions as equally valid candidates because:
- Both have defaults for the remaining parameters
- Both match the 7 parameters provided
- PostgreSQL can't pick between them → "Could not choose the best candidate function"

## Why Previous Fix Didn't Work

The migration file `20260209091147_bcccc7ef...` only updated `lookup_reservation` and `cancel_reservation_by_customer` functions. **It did NOT drop the duplicate `create_reservation` function!**

## Solution

Create a new database migration that:

1. **Drops the OLD 8-parameter function** (OID 62839 - without `p_idempotency_hash`)
2. Keeps only the new 9-parameter function (which has `p_idempotency_hash` with a DEFAULT value)

### Migration SQL

```sql
-- Drop the duplicate function causing ambiguity
-- This drops the version WITHOUT p_idempotency_hash parameter
DROP FUNCTION IF EXISTS public.create_reservation(
  text, text, text, integer, date, time without time zone, text, jsonb
);
```

This leaves only ONE function with signature:
```sql
create_reservation(
  p_name text, 
  p_phone text, 
  p_email text, 
  p_pax integer, 
  p_reservation_date date, 
  p_reservation_time time, 
  p_notes text, 
  p_preorder_items jsonb, 
  p_idempotency_hash text DEFAULT NULL
)
```

## Technical Details

- The remaining function has `p_idempotency_hash DEFAULT NULL` so callers don't need to provide it
- The function internally generates the hash if not provided (line 102-108 in the function body)
- The frontend call passes 7 params → PostgreSQL will match the only remaining function

## File to Create

| Type | Action |
|------|--------|
| Database Migration | DROP the 8-parameter `create_reservation` function |

## Expected Result

After this fix:
- Only ONE `create_reservation` function exists
- Reservations will create successfully without "Could not choose best candidate function" error
- The function will auto-generate idempotency hash internally
