

# Fix: Reservation Module - Single Code & Email Subjects

## Problem Summary

| Issue | Status |
|-------|--------|
| Two reservation codes (`ARW-RSV-XXXX` + `ARW-RES-XXXXX`) | **NONSENSE - MUST FIX** |
| Customer email "Order #undefined Update" | Missing `new_reservation` in subject function |
| Admin email wrong subject on confirm | Missing `reservation_confirmed` in admin subject function |

## Root Cause Analysis

### Why Two Codes Exist
- **Line 30-54 in `ReservationDetail.tsx`**: When admin clicks "Confirm", it generates a SECOND code (`ARW-RES-XXXXX`) called `confirmation_code`
- This is completely unnecessary - we already have `reservation_code`

### Email Subject Bugs
- **Line 621-649 in `send-email-notification/index.ts`**: `getDefaultSubject()` is MISSING `new_reservation`
- **Line 1310-1332**: `getAdminNotificationSubject()` is MISSING `reservation_confirmed`

---

## Solution: Single Code System

### Part 1: Remove `confirmation_code` Generation

**File:** `src/pages/admin/ReservationDetail.tsx`

**Delete** the `generateConfirmationCode()` function (lines 29-54) and remove all references to it.

When admin confirms:
- DO NOT generate a new code
- Just change status to `confirmed`
- Use existing `reservation_code` for all notifications

### Part 2: Update ReservationDetail.tsx Status Update

Remove confirmation code generation from the mutation:
- Delete lines 143-146 (confirmation code generation on confirm)
- Delete lines 154-157 (adding confirmation_code to updateData)
- Change all references from `confirmationCode || reservation.confirmation_code || reservation.reservation_code` to just `reservation.reservation_code`

### Part 3: Fix Email Subject Functions

**File:** `supabase/functions/send-email-notification/index.ts`

**Add `new_reservation` to `getDefaultSubject()` (around line 646):**
```typescript
new_reservation: `📅 Reservation Request Received - ${payload?.reservationCode || ''}`,
```

**Add `reservation_confirmed` to `getAdminNotificationSubject()` (around line 1326):**
```typescript
reservation_confirmed: `✅ [CONFIRMED] ${payload?.reservationCode} - ${payload?.pax} guests - ${payload?.customerName}`,
reservation_cancelled: `❌ [CANCELLED] ${payload?.reservationCode} - ${payload?.customerName}`,
reservation_cancelled_by_customer: `🚫 [CUSTOMER CANCELLED] ${payload?.reservationCode} - ${payload?.customerName}`,
```

### Part 4: Add Admin Templates for Confirmation/Cancellation

**File:** `supabase/functions/send-email-notification/index.ts`

Add templates in `getAdminNotificationTemplate()` for:
- `reservation_confirmed` 
- `reservation_cancelled`
- `reservation_cancelled_by_customer`

### Part 5: Clean Up All Other Files

Update these files to use only `reservation_code`:
- `src/pages/ReservationTracking.tsx` - Remove `confirmation_code` references
- `supabase/functions/process-no-shows/index.ts` - Use only `reservation_code`
- `supabase/functions/send-reservation-reminder/index.ts` - Use only `reservation_code`
- Database functions that reference both codes

### Part 6: Database Cleanup (Optional)

The `confirmation_code` column can remain in the database (existing data), but we stop populating it. No migration needed - just code changes.

---

## Files to Change

| File | Changes |
|------|---------|
| `src/pages/admin/ReservationDetail.tsx` | Remove `generateConfirmationCode()` function and all `confirmation_code` references |
| `supabase/functions/send-email-notification/index.ts` | Add missing email types to subject functions, add admin templates |
| `src/pages/ReservationTracking.tsx` | Use only `reservation_code` |
| `supabase/functions/process-no-shows/index.ts` | Use only `reservation_code` |
| `supabase/functions/send-reservation-reminder/index.ts` | Use only `reservation_code` |

---

## After This Fix

**Single Code System:**
```
Customer submits → ARW-RSV-1234 (this is THE code)
Admin confirms → Same code: ARW-RSV-1234
Customer gets SMS/Email → Uses ARW-RSV-1234
Reminders → Uses ARW-RSV-1234
```

**Email Subjects Fixed:**
```
NEW RESERVATION (Customer): "📅 Reservation Request Received - ARW-RSV-1234"
NEW RESERVATION (Admin): "📅 [NEW RESERVATION] ARW-RSV-1234 - 3 guests - John"
CONFIRMED (Customer): "✅ Your Reservation is Confirmed! - ARW-RSV-1234"  
CONFIRMED (Admin): "✅ [CONFIRMED] ARW-RSV-1234 - 3 guests - John"
```

---

## Technical Changes Summary

1. **Delete** `generateConfirmationCode()` function from ReservationDetail.tsx
2. **Remove** all logic that sets `confirmation_code` field
3. **Replace** all `confirmation_code || reservation_code` with just `reservation_code`
4. **Add** `new_reservation` to customer subject dictionary
5. **Add** `reservation_confirmed`, `reservation_cancelled`, `reservation_cancelled_by_customer` to admin subject dictionary
6. **Add** admin email templates for reservation confirmations and cancellations

