

# ISSUE R4.1 — Automated Reservation Reminder Engine

## Overview

Build an automated reminder system that sends SMS and email notifications to customers before their confirmed reservations. This reduces no-shows and improves operational reliability by eliminating manual follow-ups.

---

## Current State Analysis

### Infrastructure Available
- **pg_net**: Enabled (version 0.19.5)
- **pg_cron**: NOT enabled - must be enabled first
- **SMS System**: Semaphore via `send-sms-notification` edge function
- **Email System**: Resend via `send-email-notification` edge function
- **Reservation Table**: Has `reservation_date`, `reservation_time`, `phone` (required), `email` (optional), `status`, `confirmation_code`
- **Existing Audit Logging**: `reservation_notifications` table for tracking all sends

### Admin Backup Numbers
From settings: `["+639214080286", "+639569669710", "+639762074276"]`

---

## Technical Implementation

### Step 1: Enable pg_cron Extension

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
```

### Step 2: Create Reservation Reminders Table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| reservation_id | uuid | FK to reservations |
| reminder_type | text | '24h' or '3h' |
| scheduled_for | timestamptz | When to send |
| status | text | 'pending', 'sent', 'failed', 'cancelled' |
| created_at | timestamptz | When scheduled |
| sent_at | timestamptz | When actually sent |
| error_message | text | Error details if failed |

```sql
CREATE TABLE public.reservation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '3h')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  error_message text,
  
  -- Unique constraint to prevent duplicate reminders
  CONSTRAINT unique_reservation_reminder UNIQUE (reservation_id, reminder_type)
);

CREATE INDEX idx_reservation_reminders_due 
  ON public.reservation_reminders(status, scheduled_for);

CREATE INDEX idx_reservation_reminders_reservation_id 
  ON public.reservation_reminders(reservation_id);

ALTER TABLE public.reservation_reminders ENABLE ROW LEVEL SECURITY;

-- Admins can view all
CREATE POLICY "Admins can view reservation reminders"
  ON public.reservation_reminders FOR SELECT
  USING (is_admin(auth.uid()));

-- Admins can insert
CREATE POLICY "Admins can insert reservation reminders"
  ON public.reservation_reminders FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Admins can update
CREATE POLICY "Admins can update reservation reminders"
  ON public.reservation_reminders FOR UPDATE
  USING (is_admin(auth.uid()));
```

### Step 3: Create Edge Function `send-reservation-reminder`

**File: `supabase/functions/send-reservation-reminder/index.ts`**

This function:
1. Queries `reservation_reminders` for due reminders (`status = 'pending'` AND `scheduled_for <= now()`)
2. Joins with `reservations` to get customer details
3. Verifies reservation is still `confirmed` (skip if cancelled/rejected)
4. Sends SMS to customer (primary channel)
5. Sends email to customer if email exists (secondary channel)
6. Sends SMS copies to admin backup numbers
7. Logs to `reservation_notifications` table for audit
8. Updates reminder status to `sent` or `failed`

**SMS Template:**
```text
ARW Reminder 🍽️

Hi {{name}},
Reminder for your reservation today at {{time}} for {{pax}} guests.

Code: {{code}}
📍 American Ribs & Wings – Floridablanca

See you soon!
```

**Email Subject:**
```text
Reminder: Your ARW Reservation – {{date}} at {{time}}
```

### Step 4: Schedule pg_cron Job

```sql
SELECT cron.schedule(
  'send-reservation-reminders',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url:='https://saxwbdwmuzkmxztagfot.supabase.co/functions/v1/send-reservation-reminder',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNheHdiZHdtdXprbXh6dGFnZm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjM0NDUsImV4cCI6MjA4Mjc5OTQ0NX0.cMcSJxeh3DcPYQtrDxC8x4VwMLApABa_nu_MCBZh9OA"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### Step 5: Update ReservationDetail.tsx

When status changes to **confirmed**:
1. Calculate reminder windows (24h and 3h before reservation datetime)
2. Insert reminder records into `reservation_reminders` table
3. For immediate reminders (less than 3h away), call edge function directly

When status changes to **cancelled** or **rejected**:
1. Update all pending reminders for this reservation to `status = 'cancelled'`

### Step 6: Add Reminder Type Support

**Update `src/hooks/useSmsNotifications.ts`:**
- Add `reservation_reminder` type

**Update `supabase/functions/send-sms-notification/index.ts`:**
- Add `reservation_reminder` default message template

**Update `src/hooks/useEmailNotifications.ts`:**
- Add `reservation_reminder` type

---

## Reminder Scheduling Logic

When a reservation is confirmed at time T, with reservation at time R (date + time in Philippines timezone):

```text
┌─────────────────────────────────────────────────────────────┐
│ Case 1: R - T > 24 hours                                    │
│   → Schedule 24h reminder for R - 24h                       │
│   → Schedule 3h reminder for R - 3h                         │
├─────────────────────────────────────────────────────────────┤
│ Case 2: 3h < R - T ≤ 24 hours                               │
│   → Skip 24h reminder (too late)                            │
│   → Schedule 3h reminder for R - 3h                         │
├─────────────────────────────────────────────────────────────┤
│ Case 3: R - T ≤ 3 hours                                     │
│   → Send one immediate reminder NOW                         │
│   → No scheduled reminders                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Function Flow

```text
┌─────────────────────────────────────┐
│ Cron triggers every 15 minutes     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Query due reminders:                │
│ status='pending' AND                │
│ scheduled_for <= now()              │
│ LIMIT 50                            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ For each reminder:                  │
│ 1. Fetch reservation details        │
│ 2. Check status = 'confirmed'       │
│    If not → mark cancelled, skip    │
│ 3. Format date/time for PH timezone │
│ 4. Send SMS to customer phone       │
│ 5. Send SMS to admin backup numbers │
│ 6. Send email if customer has email │
│ 7. Log to reservation_notifications │
│ 8. Update reminder status           │
└─────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Enable pg_cron, create `reservation_reminders` table, schedule cron job |
| `supabase/functions/send-reservation-reminder/index.ts` | CREATE | New edge function for processing reminders |
| `supabase/config.toml` | MODIFY | Add `send-reservation-reminder` function config |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Add reminder scheduling on confirm, cancellation on reject |
| `src/hooks/useSmsNotifications.ts` | MODIFY | Add `reservation_reminder` type |
| `src/hooks/useEmailNotifications.ts` | MODIFY | Add `reservation_reminder` type |
| `supabase/functions/send-sms-notification/index.ts` | MODIFY | Add `reservation_reminder` default template |
| `supabase/functions/send-email-notification/index.ts` | MODIFY | Add `reservation_reminder` subject and template |

---

## Duplication Prevention

Each reminder uniquely identified by composite key: `(reservation_id, reminder_type)`

**Before sending:**
1. Check reminder `status = 'pending'`
2. Check reservation `status = 'confirmed'`
3. Immediately update status to `sent` after successful send

**Result:** Even if cron runs multiple times, each reminder is only sent once.

---

## Admin Backup SMS Copies

For reminder SMS, always send copies to the configured admin backup numbers:
- `+639214080286`
- `+639569669710`

These are silent copies - the edge function sends SMS to these numbers automatically, just like it does for order SMS notifications.

---

## Logging Integration

All reminder sends logged to `reservation_notifications` table:
- **channel**: 'email' or 'sms'
- **trigger_type**: 'automatic'
- **message_type**: 'reservation_reminder_24h' or 'reservation_reminder_3h'
- **status**: 'sent' or 'failed'
- **recipient**: Customer phone/email or admin backup number

Visible in admin reservation detail under "Notification History".

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Confirmed reservations receive reminders automatically | Cron job + edge function every 15 min |
| SMS is always sent when phone exists | Phone is required for reservations |
| Email is sent only when email exists | Conditional check in edge function |
| No reminders for cancelled/rejected | Status check before sending |
| Reminders are never duplicated | Unique constraint + status check |
| All reminders are logged | reservation_notifications table |

---

## What This Creates

1. `reservation_reminders` table for scheduling
2. `send-reservation-reminder` edge function
3. pg_cron job running every 15 minutes
4. Reminder scheduling on confirmation
5. Reminder cancellation on rejection
6. SMS + Email templates for reminders
7. Admin backup SMS copies
8. Full audit logging

---

## What This Does NOT Create

- Manual reminder sending UI
- Reminder customization UI
- WhatsApp/Messenger/Push notifications
- Analytics dashboards
- 24h reminder toggle (configurable later in R4.7)

