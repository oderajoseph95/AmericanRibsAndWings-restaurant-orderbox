

# ISSUE R4.5 — Reservation No-Show Handling & Auto-Closure

## Overview

Create an automated system that marks confirmed reservations as `no_show` after a 30-minute grace period has elapsed. This job runs on a cron schedule, releases capacity automatically, logs all transitions, and notifies admins.

---

## Current State Analysis

### Existing Infrastructure
- **Reservation Status Enum**: Already includes `no_show` value
- **Reservation Table**: Has `status_changed_at`, `status_changed_by` columns for tracking
- **Cron Jobs**: Already have `pg_cron` extension enabled for `send-reservation-reminders` (runs every 15 min)
- **Edge Functions Pattern**: `send-reservation-reminder` provides a template for scheduled jobs
- **Capacity System (R4.2)**: Only counts `pending` and `confirmed` — `no_show` is automatically excluded
- **Reminder Cancellation**: Already cancels pending reminders when status becomes `no_show`

### Key Architecture Decision
Following the existing pattern from R4.1, I'll create:
1. A dedicated **Edge Function** (`process-no-shows`) that scans and marks eligible reservations
2. A **pg_cron job** that calls this function every 5 minutes
3. **Audit logging** to `reservation_notifications` table

---

## Technical Implementation

### 1. Create Edge Function: `process-no-shows`

This function will:
- Query for confirmed reservations where `reservation_date + reservation_time + 30 min` has passed
- Update status to `no_show`
- Cancel any pending reminders
- Log to `reservation_notifications` for audit
- Create admin notifications

**Logic Flow:**
```
Query reservations WHERE:
  - status = 'confirmed'
  - (reservation_date + reservation_time + 30 minutes) < NOW() (in Asia/Manila timezone)
  
For each eligible reservation:
  1. UPDATE status = 'no_show', status_changed_at = NOW(), status_changed_by = 'system_no_show_job'
  2. UPDATE reservation_reminders SET status = 'cancelled' WHERE status = 'pending'
  3. INSERT into reservation_notifications (audit log)
  4. INSERT into admin_notifications (for admin visibility)
```

### 2. Database Migration

Add a new cron job calling the edge function:

```sql
SELECT cron.schedule(
  'process-reservation-no-shows',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url:='https://saxwbdwmuzkmxztagfot.supabase.co/functions/v1/process-no-shows',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### 3. supabase/config.toml Update

Add configuration for the new edge function:
```toml
[functions.process-no-shows]
verify_jwt = false
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/process-no-shows/index.ts` | CREATE | Edge function to scan and mark no-shows |
| **Database Migration** | CREATE | Add pg_cron job for every 5 minutes |
| `supabase/config.toml` | MODIFY | Add process-no-shows function config |

---

## Edge Function Structure

```typescript
// supabase/functions/process-no-shows/index.ts

// 1. Query confirmed reservations past grace period
const gracePeriodMinutes = 30;

// Calculate cutoff: NOW() - 30 minutes = reservation datetime threshold
// Any confirmed reservation with datetime before cutoff should be marked no_show

// 2. For each eligible reservation:
//    - Update status to 'no_show'
//    - Set status_changed_at = now()
//    - Set status_changed_by = 'system_no_show_job'
//    - Cancel pending reminders
//    - Log to reservation_notifications
//    - Create admin notification

// 3. Return summary: { processed: N, successful: N, results: [...] }
```

---

## Grace Period Calculation

The 30-minute grace period is calculated as:

```sql
-- Reservation datetime in Philippines timezone
reservation_datetime = (reservation_date || ' ' || reservation_time)::TIMESTAMP AT TIME ZONE 'Asia/Manila'

-- Grace cutoff = reservation_datetime + 30 minutes
grace_cutoff = reservation_datetime + INTERVAL '30 minutes'

-- Mark as no_show if: NOW() > grace_cutoff
-- i.e., reservation_datetime < NOW() - INTERVAL '30 minutes'
```

**Example:**
- Reservation at 7:00 PM → Grace until 7:30 PM
- At 7:31 PM → Status becomes `no_show`

---

## Audit Logging

All auto-closures are logged to `reservation_notifications`:

```typescript
await supabase.from('reservation_notifications').insert({
  reservation_id: reservation.id,
  channel: 'system',
  recipient: 'internal',
  status: 'sent',
  trigger_type: 'automatic',
  message_type: 'no_show_auto_closure',
});
```

This provides:
- Timestamp of auto-closure
- System-generated flag (trigger_type = 'automatic')
- Traceable history in admin notification log

---

## Admin Notifications

Admins receive a notification entry for each no-show:

```typescript
await supabase.from('admin_notifications').insert({
  user_id: adminUserId,
  title: 'Reservation marked as No-Show',
  message: `${reservation.name} - ${formattedDate} at ${formattedTime} - ${reservation.pax} guests`,
  type: 'reservation',
  metadata: {
    reservation_code: reservation.confirmation_code || reservation.reservation_code,
    customer_name: reservation.name,
    action_url: `/admin/reservations/${reservation.id}`,
  },
});
```

---

## Capacity Release

**No changes needed** — the existing capacity system (R4.2) only counts reservations with status `pending` or `confirmed`:

```sql
WHERE status IN ('pending', 'confirmed')
```

When status changes to `no_show`, the reservation is automatically excluded from capacity calculations.

---

## Safety Features

### Idempotency
- The function only processes reservations where `status = 'confirmed'`
- Once marked `no_show`, the reservation won't be selected again
- No duplicate transitions possible

### Error Handling
- Each reservation is processed independently
- Failures are logged but don't block other reservations
- Function returns summary with success/failure counts

### Status Protection
- `no_show` is terminal — no customer reversal possible
- Only admins can manually override if needed (existing behavior)

---

## Edge Cases

| Case | Handling |
|------|----------|
| Reservation already cancelled | Not selected (status filter) |
| Completed reservation | Not selected (status filter) |
| Multiple runs in quick succession | Idempotent — no duplicates |
| Function failure | Logged, retried on next cron run |
| Timezone edge cases | All calculations in Asia/Manila |

---

## ReservationDetail Admin View

No code changes needed — the existing UI already:
- Displays `no_show` status with appropriate styling
- Shows `status_changed_at` timestamp
- Shows `status_changed_by` (will show "system_no_show_job")
- Displays notification history from `reservation_notifications`

---

## Notification Policy

Per the spec:
- **Customers**: No notification (avoid confrontation/abuse)
- **Admins**: Notification entry created for visibility
- **Audit**: Full logging to `reservation_notifications`

---

## Testing Scenarios

1. **Fresh no-show**: Confirmed reservation 31+ min past time → Marked no_show
2. **Within grace**: Confirmed reservation 29 min past time → No change
3. **Already processed**: Reservation already no_show → Skipped
4. **Cancelled**: Cancelled reservation past time → Not affected
5. **Multiple runs**: Same reservations eligible → Only first run marks them

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Confirmed reservations auto-close as No-Show | Edge function with 30-min grace check |
| Grace period is respected | Datetime calculation with INTERVAL |
| Capacity is released | Status excluded from capacity query |
| Admin sees the transition clearly | status_changed_by = 'system_no_show_job' |
| No duplicate transitions | Status filter ensures single processing |
| No customer notification | No SMS/email triggered |
| Full audit trail | reservation_notifications + admin_notifications |

---

## What This Creates

1. `process-no-shows` Edge Function (idempotent batch processor)
2. pg_cron job running every 5 minutes
3. System-initiated status transitions with audit trail
4. Admin notifications for visibility

---

## What This Does NOT Create

- Customer notifications
- Penalties or blacklisting
- Manual override UI
- Deposit/payment enforcement

