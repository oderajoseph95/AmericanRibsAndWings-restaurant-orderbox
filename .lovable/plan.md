

# Plan: Fix Reservation System - Database Function, Notifications & Reminders

## Problem Summary

The reservation system is broken due to a PostgreSQL function overload conflict, and the notification/reminder system needs to be fully implemented.

**Critical Issues Found:**

1. **Database Error**: There are TWO versions of `create_reservation` function with overlapping signatures:
   - Version 1: 7 parameters (without `p_preorder_items`)
   - Version 2: 8 parameters (with `p_preorder_items`)
   - PostgreSQL cannot determine which to call, causing the error: "Could not choose the best candidate function between..."

2. **Missing Notification on New Reservation**: When a customer submits a reservation, no SMS or email is sent (status = "pending for confirmation")

3. **Confirmation Notifications**: Already implemented in admin ReservationDetail page (working)

4. **Reminder Schedule**: Current system only supports 2 reminder intervals (24h, 3h). User wants 6 intervals: 12h, 6h, 3h, 1h, 30min, 15min

---

## Solution

### Part 1: Fix Database Function Overload

**Action:** Drop the old function (without preorder_items) and keep only the new one. The frontend doesn't use preorder_items anyway, so we just pass `null` for it.

```sql
-- Drop the old function that's causing the conflict
DROP FUNCTION IF EXISTS public.create_reservation(text, text, text, integer, date, time without time zone, text);
```

**Result:** Only one function signature remains, eliminating the ambiguity error.

---

### Part 2: Send Notifications When Reservation is Created (Pending)

**Current State:** ReservationForm submits to database but doesn't trigger notifications.

**Solution:** After successful reservation creation, call the SMS and Email notification edge functions with type `reservation_received`.

**File:** `src/components/reservation/ReservationForm.tsx`

After the `supabase.rpc("create_reservation", ...)` call succeeds:

```typescript
// Send "pending confirmation" SMS to customer
await supabase.functions.invoke("send-sms-notification", {
  body: {
    type: "reservation_received",
    recipientPhone: normalizePhone(phone),
    reservationCode: reservation.reservation_code,
    customerName: name.trim(),
    reservationDate: displayDate,
    reservationTime: time,
    pax: pax,
  },
});

// Send email if customer provided one
if (email.trim()) {
  await supabase.functions.invoke("send-email-notification", {
    body: {
      type: "new_reservation",
      recipientEmail: email.trim(),
      reservationCode: reservation.reservation_code,
      customerName: name.trim(),
      reservationDate: displayDate,
      reservationTime: time,
      pax: pax,
    },
  });
}
```

---

### Part 3: Update Reminder Schedule (6 Intervals)

**Current:** 24h and 3h before reservation
**New:** 12h, 6h, 3h, 1h, 30min, 15min before reservation

**File:** `src/pages/admin/ReservationDetail.tsx` (Lines ~225-315)

Update the reminder scheduling logic when status changes to "confirmed":

```typescript
// UPDATED REMINDER INTERVALS: 12h, 6h, 3h, 1h, 30min, 15min
const reminderIntervals = [
  { hours: 12, minutes: 0, type: '12h' },
  { hours: 6, minutes: 0, type: '6h' },
  { hours: 3, minutes: 0, type: '3h' },
  { hours: 1, minutes: 0, type: '1h' },
  { hours: 0, minutes: 30, type: '30min' },
  { hours: 0, minutes: 15, type: '15min' },
];

const remindersToInsert = [];
for (const interval of reminderIntervals) {
  const reminderTime = new Date(reservationDateTime);
  reminderTime.setHours(reminderTime.getHours() - interval.hours);
  reminderTime.setMinutes(reminderTime.getMinutes() - interval.minutes);
  
  // Only schedule if reminder time is in the future
  if (reminderTime > new Date()) {
    remindersToInsert.push({
      reservation_id: id,
      reminder_type: interval.type,
      scheduled_for: reminderTime.toISOString(),
      status: 'pending',
    });
  }
}

// Insert all reminders
if (remindersToInsert.length > 0) {
  await supabase.from('reservation_reminders').insert(remindersToInsert);
}
```

**File:** `src/hooks/useReservationSettings.ts`

Update default settings to include all reminder intervals (for reference in admin settings panel):

```typescript
export const DEFAULT_RESERVATION_SETTINGS = {
  // ... existing settings
  reminder_intervals: [
    { hours: 12, type: '12h' },
    { hours: 6, type: '6h' },
    { hours: 3, type: '3h' },
    { hours: 1, type: '1h' },
    { minutes: 30, type: '30min' },
    { minutes: 15, type: '15min' },
  ],
};
```

---

### Part 4: Add `new_reservation` Email Template

**File:** `supabase/functions/send-email-notification/index.ts`

Add email template for new reservations (pending confirmation):

```typescript
case 'new_reservation':
  content = `
    <div class="content">
      <h2>Reservation Request Received, ${customerName}!</h2>
      <p>Thank you for requesting a table reservation. Our team will review and confirm your booking shortly.</p>
      
      <div class="order-box">
        <p><strong>Reservation Code:</strong> ${payload.reservationCode}</p>
        <p><strong>Date:</strong> ${payload.reservationDate}</p>
        <p><strong>Time:</strong> ${payload.reservationTime}</p>
        <p><strong>Guests:</strong> ${payload.pax}</p>
        <span class="status-badge status-warning">⏳ Pending Confirmation</span>
      </div>
      
      <p>You will receive an SMS and email once your reservation is confirmed.</p>
      <p>📍 American Ribs & Wings - Floridablanca, Pampanga</p>
    </div>
  `;
  break;
```

---

## Summary of Changes

| File | Change |
|------|--------|
| **Database** | Drop duplicate `create_reservation` function (SQL migration) |
| `src/components/reservation/ReservationForm.tsx` | Add SMS/Email calls after reservation created |
| `src/pages/admin/ReservationDetail.tsx` | Update reminder scheduling to 6 intervals (12h, 6h, 3h, 1h, 30min, 15min) |
| `src/hooks/useReservationSettings.ts` | Update default reminder interval settings |
| `supabase/functions/send-email-notification/index.ts` | Add `new_reservation` email template case |

---

## Notification Flow After Fix

```
CUSTOMER SUBMITS RESERVATION
         ↓
    Status: pending
         ↓
  ✉️ SMS: "Reservation received, pending confirmation"
  📧 Email: "Reservation request received" (if email provided)
         ↓
ADMIN CONFIRMS IN DASHBOARD
         ↓
    Status: confirmed
         ↓
  ✉️ SMS: "Your reservation is CONFIRMED!"
  📧 Email: "Reservation confirmed"
  ⏰ Schedule reminders: 12h, 6h, 3h, 1h, 30min, 15min
         ↓
AUTOMATIC REMINDERS (via pg_cron every 15 min)
         ↓
  ✉️ SMS + 📧 Email sent at each interval before reservation time
```

---

## Technical Details

### Database Migration SQL
```sql
-- Fix function overload: drop the old 7-parameter version
DROP FUNCTION IF EXISTS public.create_reservation(text, text, text, integer, date, time without time zone, text);

-- The 8-parameter version (with p_preorder_items) remains
-- Frontend passes null for preorder_items which is fine
```

### Cron Job Already Configured
The reminder system already has a cron job running every 15 minutes:
```
*/15 * * * * → send-reservation-reminder edge function
```
This will process all due reminders automatically.

