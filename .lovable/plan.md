

# ISSUE R3.3 — Customer Reservation Confirmation (SMS)

## Overview

Send SMS confirmation to customers when their reservation status changes from `pending` to `confirmed` or `pending` to `cancelled`. Unlike email (which depends on customer providing an email), SMS is sent to all customers since phone number is required.

---

## Current System Analysis

### Existing SMS Infrastructure
- **Edge Function**: `supabase/functions/send-sms-notification/index.ts` handles all SMS via Semaphore
- **Hook**: `src/hooks/useSmsNotifications.ts` provides `sendSmsNotification()` function
- **Existing Types**: `reservation_received` already exists for new reservation notification
- **Reservation Variables**: Already supported in edge function (reservationCode, reservationDate, reservationTime, pax)

### Key Observation
The SMS infrastructure already supports reservation fields - we only need to:
1. Add two new SMS types
2. Add default message templates
3. Trigger SMS sending in the status mutation

---

## Technical Implementation

### 1. Add New SMS Types to Hook

**File: `src/hooks/useSmsNotifications.ts`**

Add to `SmsType` union:
```typescript
| "reservation_confirmed"
| "reservation_cancelled"
```

---

### 2. Add Default SMS Templates in Edge Function

**File: `supabase/functions/send-sms-notification/index.ts`**

Add to `getDefaultMessage()` function (~line 204):
```typescript
// Reservation confirmation types
reservation_confirmed: `Your reservation is CONFIRMED.\nCode: ${reservationCode}\n${reservationDate}, ${reservationTime} - ${pax} guests\nSee you soon! - American Ribs & Wings`,

reservation_cancelled: `Your reservation was not approved.\nCode: ${reservationCode}\nPlease contact us if you have questions.\n- American Ribs & Wings`,
```

**Message Format Rules:**
- No emojis
- No URLs
- Clear status wording
- Under 160 characters (single SMS segment)
- Includes: confirmation code, date, time, pax

---

### 3. Add SMS Sending to Status Mutation

**File: `src/pages/admin/ReservationDetail.tsx`**

#### A. Add import:
```typescript
import { sendSmsNotification } from '@/hooks/useSmsNotifications';
```

#### B. Add SMS sending after email sending block:

```typescript
// Send customer SMS notification (always - phone is required)
if (reservation?.phone && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
  const smsType = newStatus === 'confirmed' ? 'reservation_confirmed' : 'reservation_cancelled';
  
  // Format date and time for SMS
  const formattedDate = format(new Date(reservation.reservation_date), 'MMM d');
  const [hours, minutes] = reservation.reservation_time.split(':');
  const timeDate = new Date();
  timeDate.setHours(parseInt(hours), parseInt(minutes));
  const formattedTime = format(timeDate, 'h:mm a');
  
  // Send SMS (fire and forget - don't block status update)
  sendSmsNotification({
    type: smsType,
    recipientPhone: reservation.phone,
    reservationId: reservation.id,
    reservationCode: confirmationCode || reservation.confirmation_code || reservation.reservation_code,
    customerName: reservation.name,
    reservationDate: formattedDate,
    reservationTime: formattedTime,
    pax: reservation.pax,
  }).then(result => {
    if (!result.success) {
      console.error('Failed to send reservation SMS:', result.error);
    } else {
      console.log('Reservation SMS sent successfully');
    }
  }).catch(err => {
    console.error('SMS notification error:', err);
  });
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useSmsNotifications.ts` | Add `reservation_confirmed`, `reservation_cancelled` types |
| `src/pages/admin/ReservationDetail.tsx` | Add SMS sending after status change, import hook |
| `supabase/functions/send-sms-notification/index.ts` | Add default message templates for reservation SMS |

---

## SMS Content

### Confirmed SMS (~120 characters)
```
Your reservation is CONFIRMED.
Code: ARW-RES-48321
Jan 12, 7:00 PM - 4 guests
See you soon! - American Ribs & Wings
```

### Cancelled SMS (~95 characters)
```
Your reservation was not approved.
Code: ARW-RES-48321
Please contact us if you have questions.
- American Ribs & Wings
```

**Rules applied:**
- No emojis
- No URLs
- Clear status wording
- Transactional tone
- Under SMS character limits

---

## Trigger Conditions

| Status Change | Send SMS? | SMS Type |
|---------------|-----------|----------|
| pending → confirmed | YES | `reservation_confirmed` |
| pending → cancelled | YES | `reservation_cancelled` |
| confirmed → completed | NO | - |
| confirmed → no_show | NO | - |
| Creation (pending) | NO | - |

---

## Key Differences from Email (R3.2)

| Aspect | Email | SMS |
|--------|-------|-----|
| Condition | Only if email exists | Always (phone required) |
| Content | Full details + pre-orders | Short, essential info only |
| Format | HTML template | Plain text |
| Character limit | None | ~160 chars |
| URLs | Future tracking link | None |

---

## Failure Handling

```text
Admin clicks "Confirm Reservation"
     ↓
Database updated (status + confirmation_code)
     ↓
[Success?]───NO──→ Show error toast, stop
     ↓ YES
Log admin action
     ↓
Toast success shown
     ↓
Send Email (async, if email exists)
     ↓
Send SMS (async, always)
     ↓
[SMS fails?]───YES──→ Log error (no user impact)
     ↓ NO
SMS delivered
```

**Key principle:** SMS failure does NOT block status change.

---

## Logging

SMS logs recorded in `sms_logs` table:
- `recipient_phone`
- `sms_type` (reservation_confirmed / reservation_cancelled)
- `status` (sent / failed)
- `message_id` (from Semaphore)
- `metadata` (includes reservation details)
- `created_at`

---

## What This Creates

- Two new SMS types: `reservation_confirmed`, `reservation_cancelled`
- Default message templates (short, transactional)
- Non-blocking SMS sending on status change
- SMS logging for audit trail

---

## What This Does NOT Create

- Email logic (R3.2 - already implemented)
- Tracking pages (R3.4)
- Admin resend controls (R3.5)
- Marketing messages
- SMS on reservation creation

