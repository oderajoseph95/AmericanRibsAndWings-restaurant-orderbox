

# ISSUE R4.4 — Customer-Initiated Reservation Cancellation

## Overview

Allow customers to cancel their own reservations safely before a cutoff time (2 hours before reservation), freeing capacity immediately and sending confirmation notifications. This reduces no-shows and frees locked capacity without staff intervention.

---

## Current State Analysis

### Existing Infrastructure
- **Reservation Status Enum**: `pending`, `confirmed`, `cancelled`, `completed`, `no_show`
- **Tracking Page**: `/reserve/track` with form-based lookup (code + phone)
- **Lookup Function**: `lookup_reservation` returns safe subset of reservation data
- **Notification System**: SMS (Semaphore) and Email (Resend) already handle `reservation_cancelled` type
- **Reminder System**: Already cancels pending reminders when status changes to `cancelled`
- **Capacity System**: Only counts `pending` and `confirmed` reservations (R4.2)

### What Needs to be Added
1. New enum value: `cancelled_by_customer`
2. Cancellation token table for secure links
3. Database function for customer cancellation with cutoff enforcement
4. UI for cancellation on tracking page
5. New notification type for customer-initiated cancellation

---

## Technical Implementation

### 1. Database Changes

#### A. Add New Reservation Status Value

```sql
ALTER TYPE reservation_status ADD VALUE 'cancelled_by_customer';
```

#### B. Create Cancellation Tokens Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| reservation_id | uuid | FK to reservations |
| token | text | Secure random token (32 chars) |
| created_at | timestamptz | When token was generated |
| expires_at | timestamptz | Cutoff time (2h before reservation) |
| used_at | timestamptz | When cancellation was executed |
| source | text | 'tracking_page', 'email_link', 'sms_link' |

```sql
CREATE TABLE reservation_cancellation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  source text,
  
  CONSTRAINT unique_active_token UNIQUE (reservation_id)
);
```

#### C. Create Customer Cancellation Function

```sql
CREATE FUNCTION cancel_reservation_by_customer(
  p_code TEXT,
  p_phone TEXT
)
RETURNS JSON
```

This function will:
1. Validate code + phone combination
2. Check status is `pending` or `confirmed`
3. Check current time is before cutoff (2 hours before reservation)
4. Update status to `cancelled_by_customer`
5. Cancel any pending reminders
6. Return success/error response

### 2. Route Changes

No new routes needed. Cancellation happens via:
1. Button on `/reserve/track` page (primary)
2. Optional: Direct link `/reserve/cancel?token=xxx` (future enhancement)

### 3. Frontend Changes

#### A. Update ReservationTracking.tsx

Add to the reservation details view:
- "Cancel Reservation" button (only shown for `pending` or `confirmed`)
- Confirmation dialog before cancellation
- Cutoff time display
- Success/error states after cancellation

#### B. Status Config Update

Add `cancelled_by_customer` to statusConfig:
```typescript
cancelled_by_customer: {
  label: "Cancelled by You",
  className: "bg-orange-100 text-orange-800 border-orange-200",
  icon: <XCircle className="h-5 w-5" />,
  message: "You cancelled this reservation. Thank you for letting us know.",
}
```

### 4. Notification Updates

#### A. SMS Template (Default)
```
Your reservation has been cancelled.
Code: {{reservation_code}}
If you change your mind, please book again.
- American Ribs & Wings
```

#### B. Email Template
Subject: "Reservation Cancelled - {{reservation_code}}"

Content includes:
- Cancellation confirmation
- Original reservation details
- Store contact info for rebooking

### 5. Admin Visibility

Update admin ReservationDetail to:
- Show `cancelled_by_customer` with different styling
- Display cancellation timestamp
- Log cancellation in notification history

---

## Cancellation Flow

```
┌─────────────────────────────────────┐
│ Customer on /reserve/track          │
│ Lookup: code + phone                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Show reservation details            │
│ Status: pending OR confirmed        │
│                                     │
│ [Cancel Reservation] button visible │
└──────────────┬──────────────────────┘
               │ Click
               ▼
┌─────────────────────────────────────┐
│ Confirmation Dialog                 │
│                                     │
│ "Are you sure you want to cancel    │
│  this reservation?"                 │
│                                     │
│ [Keep Reservation] [Yes, Cancel]    │
└──────────────┬──────────────────────┘
               │ Confirm
               ▼
┌─────────────────────────────────────┐
│ Call cancel_reservation_by_customer │
│ with code + phone                   │
└──────────────┬──────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
┌───────────────┐ ┌────────────────────┐
│ Success:      │ │ Error:             │
│ - Update UI   │ │ - Past cutoff      │
│ - Send SMS    │ │ - Already cancelled│
│ - Send Email  │ │ - Not found        │
│ - Show msg    │ │ - Show reason      │
└───────────────┘ └────────────────────┘
```

---

## Cutoff Logic

Cutoff = Reservation datetime - 2 hours

```sql
-- In cancel_reservation_by_customer function
v_reservation_datetime := 
  (reservation_date || ' ' || reservation_time)::TIMESTAMPTZ AT TIME ZONE 'Asia/Manila';
v_cutoff := v_reservation_datetime - INTERVAL '2 hours';

IF now() > v_cutoff THEN
  RETURN json_build_object(
    'success', false,
    'error', 'past_cutoff',
    'message', 'This reservation can no longer be cancelled online. Please contact the store.'
  );
END IF;
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Add enum value, create tokens table, create cancel function |
| `src/pages/ReservationTracking.tsx` | MODIFY | Add cancel button, confirmation dialog, new status display |
| `src/hooks/useSmsNotifications.ts` | MODIFY | Add `reservation_cancelled_by_customer` type |
| `src/hooks/useEmailNotifications.ts` | MODIFY | Add `reservation_cancelled_by_customer` type |
| `supabase/functions/send-sms-notification/index.ts` | MODIFY | Add default template for customer cancellation |
| `supabase/functions/send-email-notification/index.ts` | MODIFY | Add email template for customer cancellation |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Handle `cancelled_by_customer` status display |

---

## Capacity Release

The existing capacity system (R4.2) only counts `pending` and `confirmed` reservations:

```sql
WHERE status IN ('pending', 'confirmed')
```

When status changes to `cancelled_by_customer`:
- Reservation is automatically excluded from capacity count
- No additional logic needed
- Capacity is freed immediately

---

## Reminder Cancellation

The existing reminder system (R4.1) already handles this. When status changes to `cancelled` or `cancelled_by_customer`, the ReservationDetail update mutation cancels pending reminders:

```typescript
if ((newStatus === 'cancelled' || newStatus === 'cancelled_by_customer' || newStatus === 'no_show') && reservation) {
  await supabase
    .from('reservation_reminders')
    .update({ status: 'cancelled' })
    .eq('reservation_id', reservation.id)
    .eq('status', 'pending');
}
```

This logic will be added to the database function for customer-initiated cancellations.

---

## Security Features

- **Dual verification**: Code + phone required (same as lookup)
- **No reservation ID exposure**: Uses code, not UUID
- **Time-bound**: Cutoff enforced server-side
- **Single-use**: Status change is terminal
- **Audit logging**: All cancellations logged to `reservation_notifications` table

---

## Edge Cases

| Case | Handling |
|------|----------|
| Already cancelled | Show message: "This reservation was already cancelled." |
| Completed reservation | Cannot cancel - status check fails |
| No-show reservation | Cannot cancel - status check fails |
| Past cutoff | Show message: "Please contact the store directly." |
| Wrong code/phone | Same error as lookup: "Reservation not found" |
| Double-click cancel | Second call sees `cancelled_by_customer` status, returns already-cancelled error |

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Customers can cancel within allowed window | Cutoff check in database function |
| Capacity is freed immediately | Status excludes from capacity count |
| Status transitions correctly | → `cancelled_by_customer` (terminal) |
| Notifications are sent | SMS + Email on successful cancellation |
| No double-cancellation | Status check prevents re-cancellation |
| Past-cutoff blocked cleanly | Clear error message shown |
| All actions logged | `reservation_notifications` audit table |

---

## What This Creates

1. `cancelled_by_customer` status in reservation_status enum
2. `cancel_reservation_by_customer` database function
3. Cancellation UI on tracking page with confirmation dialog
4. SMS and Email templates for customer cancellation
5. Full audit trail in notification logs

---

## What This Does NOT Create

- Admin-initiated cancellations (already exists as `cancelled`)
- Rescheduling functionality
- Refund processing
- No-show marking (R4.5)
- Editing reservation details
- Token-based direct cancel links (future enhancement)

