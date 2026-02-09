# ISSUE R4.1 — Automated Reservation Reminder Engine

## ✅ COMPLETED

**Implementation Date:** February 9, 2026

---

## Summary

Built an automated reminder system that sends SMS and email notifications to customers before their confirmed reservations. The system uses pg_cron to trigger an edge function every 15 minutes that processes due reminders.

---

## What Was Implemented

### 1. Database Infrastructure

**Table: `reservation_reminders`**
- `id` (uuid) - Primary key
- `reservation_id` (uuid) - FK to reservations
- `reminder_type` (text) - '24h', '3h', or 'immediate'
- `scheduled_for` (timestamptz) - When to send
- `status` (text) - 'pending', 'sent', 'failed', 'cancelled'
- `created_at`, `sent_at`, `error_message`

**Indexes:**
- Composite index on `(status, scheduled_for)` for efficient cron queries
- Index on `reservation_id` for lookups

**RLS Policies:**
- Admins can SELECT, INSERT, UPDATE, DELETE

**pg_cron Job:**
- Name: `send-reservation-reminders`
- Schedule: `*/15 * * * *` (every 15 minutes)
- Calls: `send-reservation-reminder` edge function

### 2. Edge Function: `send-reservation-reminder`

**Location:** `supabase/functions/send-reservation-reminder/index.ts`

**Flow:**
1. Query due reminders (status='pending' AND scheduled_for <= now())
2. For each reminder:
   - Fetch reservation details
   - Verify reservation is still 'confirmed'
   - Send SMS to customer
   - Send SMS copies to admin backup numbers
   - Send email if customer has email
   - Log to `reservation_notifications` table
   - Update reminder status

### 3. Reminder Scheduling Logic (ReservationDetail.tsx)

**On Confirmation:**
- Case 1: >24h before → Schedule both 24h and 3h reminders
- Case 2: 3-24h before → Schedule only 3h reminder
- Case 3: <3h before → Send immediate reminder

**On Cancellation/No-Show:**
- Cancel all pending reminders for the reservation

### 4. Notification Templates

**SMS (reservation_reminder):**
```
ARW Reminder 🍽️

Hi {{name}},
Reminder for your reservation today at {{time}} for {{pax}} guests.

Code: {{code}}
📍 American Ribs & Wings – Floridablanca

See you soon!
```

**Email Subject:**
```
🍽️ Reminder: Your ARW Reservation – {{date}} at {{time}}
```

### 5. Admin Backup SMS Copies

Sent to configured admin backup numbers from settings:
- `sms_admin_backup_numbers` setting

---

## Files Created/Modified

| File | Change |
|------|--------|
| `supabase/functions/send-reservation-reminder/index.ts` | NEW - Cron-triggered reminder processor |
| `supabase/config.toml` | Added `send-reservation-reminder` function config |
| `src/pages/admin/ReservationDetail.tsx` | Added reminder scheduling on confirm, cancellation on reject |
| `src/hooks/useSmsNotifications.ts` | Added `reservation_reminder` type |
| `src/hooks/useEmailNotifications.ts` | Added `reservation_reminder` type |
| `supabase/functions/send-sms-notification/index.ts` | Added `reservation_reminder` template |
| `supabase/functions/send-email-notification/index.ts` | Added `reservation_reminder` subject and template |

---

## Acceptance Criteria ✅

| Criteria | Status |
|----------|--------|
| Confirmed reservations receive reminders automatically | ✅ Cron job + edge function every 15 min |
| SMS is always sent when phone exists | ✅ Phone is required for reservations |
| Email is sent only when email exists | ✅ Conditional check in edge function |
| No reminders for cancelled/rejected | ✅ Status check before sending, cancellation on reject |
| Reminders are never duplicated | ✅ Unique constraint + status check |
| All reminders are logged | ✅ reservation_notifications table |

---

## Testing the System

1. **Create a reservation** and confirm it
2. **Check `reservation_reminders` table** for scheduled reminders
3. **Wait for cron job** (runs every 15 minutes) or **manually trigger**:
   ```sql
   SELECT net.http_post(
     url:='https://saxwbdwmuzkmxztagfot.supabase.co/functions/v1/send-reservation-reminder',
     headers:='{"Content-Type": "application/json", "Authorization": "Bearer ..."}'::jsonb,
     body:='{}'::jsonb
   );
   ```
4. **Check `reservation_notifications` table** for logs
5. **Check `sms_logs` table** for SMS delivery details

---

## Future Enhancements (R4.7)

- 24h reminder toggle (admin configurable)
- Reminder customization UI
- WhatsApp/Messenger notifications
- Analytics dashboards
