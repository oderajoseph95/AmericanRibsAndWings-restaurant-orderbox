
# Plan: Fix Email/SMS Templates, Logs & Auto-Sync for Reservations

## Problems Identified

### Problem 1: Missing Reservation Email Templates
The `email_templates` table has **no reservation templates**:
- Currently has: order templates (new_order, order_approved, etc.) and payout templates
- Missing: `new_reservation_customer`, `new_reservation_admin`, `reservation_confirmed_customer`, `reservation_confirmed_admin`, `reservation_cancelled_customer`, `reservation_cancelled_admin`, `reservation_reminder_customer`

The edge function HAS reservation support (code is there), but the database doesn't have the templates for admins to customize.

### Problem 2: Missing Reservation SMS Templates
The `sms_templates` table has only 1 reservation template (`reservation_received`):
- Missing: `reservation_confirmed`, `reservation_cancelled`, `reservation_cancelled_by_customer`, `reservation_reminder`

### Problem 3: Templates Page Doesn't Show Reservation Variables
The EmailTemplates page and SMS page don't include reservation-specific variables in their help sections:
- Missing: `{{reservation_code}}`, `{{reservation_date}}`, `{{reservation_time}}`, `{{pax}}`

### Problem 4: SMS Status Not Auto-Syncing
Currently the user has to click "Sync Status" manually to update SMS delivery statuses from Semaphore API. There's NO cron job for `sync-sms-status`. The existing auto-sync only refreshes locally cached data (every 30s) - it doesn't call the Semaphore API to get actual delivery status updates.

---

## Solution

### Part 1: Add Missing Reservation Email Templates (Database)

Insert the following email templates:

| Type | Name | For |
|------|------|-----|
| `new_reservation_customer` | Reservation Received (Customer) | Customer confirmation |
| `new_reservation_admin` | New Reservation Alert (Admin) | Admin notification |
| `reservation_confirmed_customer` | Reservation Confirmed (Customer) | Customer confirmation |
| `reservation_confirmed_admin` | Reservation Confirmed (Admin) | Admin notification |
| `reservation_cancelled_customer` | Reservation Cancelled (Customer) | Customer notification |
| `reservation_cancelled_admin` | Reservation Cancelled (Admin) | Admin notification |
| `reservation_reminder_customer` | Reservation Reminder (Customer) | Reminder email |

### Part 2: Add Missing Reservation SMS Templates (Database)

Insert the following SMS templates:

| Type | Name |
|------|------|
| `reservation_confirmed` | Reservation Confirmed |
| `reservation_cancelled` | Reservation Cancelled |
| `reservation_cancelled_by_customer` | Reservation Cancelled by Customer |
| `reservation_reminder` | Reservation Reminder |

### Part 3: Add Reservation Variables to UI Help Sections

**File: `src/pages/admin/EmailTemplates.tsx`**

Add to `variablesList`:
```typescript
{ variable: '{{reservation_code}}', description: 'Reservation code (e.g., ARW-RSV-1234)', category: 'Reservation' },
{ variable: '{{reservation_date}}', description: 'Reservation date (e.g., Feb 17, 2026)', category: 'Reservation' },
{ variable: '{{reservation_time}}', description: 'Reservation time (e.g., 6:00 PM)', category: 'Reservation' },
{ variable: '{{pax}}', description: 'Number of guests', category: 'Reservation' },
```

**File: `src/pages/admin/Sms.tsx`**

Add to `smsVariables`:
```typescript
{ variable: '{{reservation_code}}', description: 'Reservation code' },
{ variable: '{{reservation_date}}', description: 'Reservation date' },
{ variable: '{{reservation_time}}', description: 'Reservation time' },
{ variable: '{{pax}}', description: 'Number of guests' },
```

### Part 4: Add Type Labels for Reservation Templates in UI

**File: `src/pages/admin/EmailTemplates.tsx`** - Add to `getEmailTypeLabel`:
```typescript
new_reservation: { label: 'New Reservation', color: 'bg-purple-500/20 text-purple-700' },
reservation_confirmed: { label: 'Reservation Confirmed', color: 'bg-green-500/20 text-green-700' },
reservation_cancelled: { label: 'Reservation Cancelled', color: 'bg-red-500/20 text-red-700' },
reservation_cancelled_by_customer: { label: 'Cancelled by Customer', color: 'bg-gray-500/20 text-gray-700' },
reservation_reminder: { label: 'Reservation Reminder', color: 'bg-amber-500/20 text-amber-700' },
```

**File: `src/pages/admin/Sms.tsx`** - Add to `getTypeLabel`:
```typescript
reservation_received: { label: 'Reservation Received', color: 'bg-purple-500/20 text-purple-700' },
reservation_confirmed: { label: 'Reservation Confirmed', color: 'bg-green-500/20 text-green-700' },
reservation_cancelled: { label: 'Reservation Cancelled', color: 'bg-red-500/20 text-red-700' },
reservation_cancelled_by_customer: { label: 'Cancelled by Customer', color: 'bg-gray-500/20 text-gray-700' },
reservation_reminder: { label: 'Reservation Reminder', color: 'bg-amber-500/20 text-amber-700' },
```

### Part 5: Create Cron Job for SMS Status Sync

Add a new cron job to automatically sync SMS statuses every 5 minutes:

```sql
SELECT cron.schedule(
  'sync-sms-status',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://saxwbdwmuzkmxztagfot.supabase.co/functions/v1/sync-sms-status',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body:='{"syncAll": true}'::jsonb
  ) as request_id;
  $$
);
```

### Part 6: Add sync-sms-status to config.toml

Add the edge function config:
```toml
[functions.sync-sms-status]
verify_jwt = false
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Database Migration | Add reservation email templates, SMS templates, and cron job |
| `supabase/config.toml` | Add `sync-sms-status` function config |
| `src/pages/admin/EmailTemplates.tsx` | Add reservation variables to help section + type labels |
| `src/pages/admin/Sms.tsx` | Add reservation variables to help section + type labels |

---

## Summary

| Issue | Fix |
|-------|-----|
| Missing reservation email templates | Add 7 new email templates for reservations |
| Missing reservation SMS templates | Add 4 new SMS templates for reservations |
| Templates UI missing reservation variables | Add `{{reservation_code}}`, `{{reservation_date}}`, `{{reservation_time}}`, `{{pax}}` |
| SMS status not auto-syncing | Add cron job to call `sync-sms-status` every 5 minutes |
| Logs not showing reservation types | Add type labels for reservation email/SMS types |

After this fix:
- Admins can customize all reservation email/SMS templates
- Email/SMS logs will properly display reservation-related entries with correct badges
- SMS delivery statuses will auto-sync from Semaphore API every 5 minutes (no manual clicking!)
- Template variable help sections will include reservation-specific variables
