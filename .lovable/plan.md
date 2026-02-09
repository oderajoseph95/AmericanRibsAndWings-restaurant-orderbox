

# ISSUE R3.6 — Reservation Notification Log

## Overview

Create an audit log system for all reservation-related email and SMS messages. This provides observability for admins to verify what communications were sent, when, to whom, and their delivery status.

---

## Current System Analysis

### Existing Logging Infrastructure
- **Email logs**: `email_logs` table logs all emails, has `order_id` but NO `reservation_id`
- **SMS logs**: `sms_logs` table logs all SMS messages, has `order_id` but NO `reservation_id`
- **Both edge functions**: Already log sends/failures but don't track `reservation_id`

### Problem
When emails/SMS are sent for reservations (R3.2, R3.3, R3.5), the reservation ID is not captured in existing logs, making it impossible to query "what was sent for reservation X?"

---

## Technical Implementation

### 1. Create New `reservation_notifications` Table

Create a dedicated table for reservation notification audit trail:

```sql
CREATE TABLE public.reservation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('automatic', 'manual')),
  message_type text NOT NULL,
  error_message text,
  sent_by_admin_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Index for efficient lookup by reservation
CREATE INDEX idx_reservation_notifications_reservation_id 
  ON public.reservation_notifications(reservation_id);

-- Index for chronological ordering
CREATE INDEX idx_reservation_notifications_created_at 
  ON public.reservation_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.reservation_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view reservation notifications"
  ON public.reservation_notifications FOR SELECT
  USING (is_admin(auth.uid()));

-- System/Admins can insert logs
CREATE POLICY "Admins can insert reservation notifications"
  ON public.reservation_notifications FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Allow edge functions to insert (service role)
CREATE POLICY "Service role can insert reservation notifications"
  ON public.reservation_notifications FOR INSERT
  WITH CHECK (true);
```

### 2. Update Email & SMS Sending to Log Reservation Notifications

Modify `ReservationDetail.tsx` to log notifications after each send.

#### A. Create logging helper function

```typescript
// Helper to log reservation notification
const logReservationNotification = async ({
  reservationId,
  channel,
  recipient,
  status,
  triggerType,
  messageType,
  errorMessage,
  adminId,
}: {
  reservationId: string;
  channel: 'email' | 'sms';
  recipient: string;
  status: 'sent' | 'failed';
  triggerType: 'automatic' | 'manual';
  messageType: string;
  errorMessage?: string;
  adminId?: string;
}) => {
  try {
    await supabase.from('reservation_notifications').insert({
      reservation_id: reservationId,
      channel,
      recipient,
      status,
      trigger_type: triggerType,
      message_type: messageType,
      error_message: errorMessage || null,
      sent_by_admin_id: adminId || null,
    });
  } catch (err) {
    console.error('Failed to log reservation notification:', err);
  }
};
```

#### B. Update automatic sends (status mutation)

Add logging after the email/SMS promise chains (~line 163-204):

For Email:
```typescript
.then(result => {
  // Log to reservation_notifications
  logReservationNotification({
    reservationId: reservation.id,
    channel: 'email',
    recipient: reservation.email!,
    status: result.success ? 'sent' : 'failed',
    triggerType: 'automatic',
    messageType: emailType,
    errorMessage: result.error,
  });
  // existing console.log...
})
```

For SMS:
```typescript
.then(result => {
  // Log to reservation_notifications
  logReservationNotification({
    reservationId: reservation.id,
    channel: 'sms',
    recipient: reservation.phone,
    status: result.success ? 'sent' : 'failed',
    triggerType: 'automatic',
    messageType: smsType,
    errorMessage: result.error,
  });
  // existing console.log...
})
```

#### C. Update manual resend handlers

Add logging after `handleResendEmail` and `handleResendSms` send attempts:

```typescript
// In handleResendEmail, after sendEmailNotification call
await logReservationNotification({
  reservationId: reservation.id,
  channel: 'email',
  recipient: reservation.email!,
  status: result.success ? 'sent' : 'failed',
  triggerType: 'manual',
  messageType: emailType,
  errorMessage: result.error,
  adminId: user?.id,
});

// In handleResendSms, after sendSmsNotification call
await logReservationNotification({
  reservationId: reservation.id,
  channel: 'sms',
  recipient: reservation.phone,
  status: result.success ? 'sent' : 'failed',
  triggerType: 'manual',
  messageType: smsType,
  errorMessage: result.error,
  adminId: user?.id,
});
```

### 3. Add Notification History UI Section

Add a new Card component to display the notification log on the reservation detail page. Place it after the "Resend Notifications" card and before "Internal Notes".

#### A. Add Query for Notification Logs

```typescript
// Query for notification history
const { data: notificationLogs = [], isLoading: logsLoading } = useQuery({
  queryKey: ['reservation-notifications', id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('reservation_notifications')
      .select('*')
      .eq('reservation_id', id!)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  enabled: !!id,
});
```

#### B. Add UI Card

```tsx
{/* Notification History */}
<Card>
  <CardHeader>
    <CardTitle className="text-lg flex items-center gap-2">
      <History className="h-5 w-5 text-muted-foreground" />
      Notification History
    </CardTitle>
    <p className="text-sm text-muted-foreground">
      Audit log of all emails and SMS sent for this reservation
    </p>
  </CardHeader>
  <CardContent>
    {logsLoading ? (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    ) : notificationLogs.length > 0 ? (
      <div className="space-y-2">
        {notificationLogs.map((log) => (
          <div 
            key={log.id}
            className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm"
          >
            {/* Channel Badge */}
            <Badge variant="outline" className={
              log.channel === 'email' 
                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                : 'bg-purple-50 text-purple-700 border-purple-200'
            }>
              {log.channel === 'email' ? (
                <Mail className="h-3 w-3 mr-1" />
              ) : (
                <MessageSquare className="h-3 w-3 mr-1" />
              )}
              {log.channel === 'email' ? 'Email' : 'SMS'}
            </Badge>
            
            {/* Status Badge */}
            <Badge variant="outline" className={
              log.status === 'sent' 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-red-50 text-red-700 border-red-200'
            }>
              {log.status === 'sent' ? 'Sent' : 'Failed'}
            </Badge>
            
            {/* Trigger Type Badge */}
            <Badge variant="secondary" className="text-xs">
              {log.trigger_type === 'automatic' ? 'Auto' : 'Manual'}
            </Badge>
            
            {/* Recipient */}
            <span className="text-muted-foreground">
              → {log.recipient}
            </span>
            
            {/* Timestamp */}
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(log.created_at), 'MMM d, h:mm a')}
            </span>
            
            {/* Error message if failed */}
            {log.status === 'failed' && log.error_message && (
              <div className="w-full mt-1 text-xs text-red-600">
                Error: {log.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground text-center py-4">
        No notifications have been sent for this reservation.
      </p>
    )}
  </CardContent>
</Card>
```

### 4. Add Required Import

Add `History` icon to the lucide-react imports:
```typescript
import { ..., History } from 'lucide-react';
```

---

## UI Placement

```text
┌─────────────────────────────────────┐
│ ← Reservation Details      [Status] │
├─────────────────────────────────────┤
│ Reservation Summary Card            │
├─────────────────────────────────────┤
│ Customer Information Card           │
├─────────────────────────────────────┤
│ Pre-Order Selections Card           │
├─────────────────────────────────────┤
│ Actions Card (if pending/confirmed) │
├─────────────────────────────────────┤
│ Resend Notifications Card           │
├─────────────────────────────────────┤
│ 📋 Notification History Card  ← NEW │
│    [Email] [Sent] [Auto] → email    │
│    [SMS] [Sent] [Auto] → phone      │
├─────────────────────────────────────┤
│ Internal Notes Card                 │
├─────────────────────────────────────┤
│ Metadata                            │
└─────────────────────────────────────┘
```

---

## Log Entry Display Format

Each log entry shows (left to right):
1. **Channel badge**: Email (blue) or SMS (purple)
2. **Status badge**: Sent (green) or Failed (red)
3. **Trigger badge**: Auto or Manual
4. **Recipient**: Email address or phone number
5. **Timestamp**: "Feb 9, 2:30 PM"
6. **Error** (if failed): Shown on second line in red

---

## Data Model Summary

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| reservation_id | uuid | FK to reservations |
| channel | text | 'email' or 'sms' |
| recipient | text | Email address or phone number |
| status | text | 'sent' or 'failed' |
| trigger_type | text | 'automatic' or 'manual' |
| message_type | text | 'reservation_confirmed' / 'reservation_cancelled' |
| error_message | text | Error details if failed |
| sent_by_admin_id | uuid | Admin who triggered (for manual sends) |
| created_at | timestamptz | When the notification was sent |

---

## Files to Create/Modify

| File | Change |
|------|--------|
| **Database** | Create `reservation_notifications` table with RLS policies |
| `src/pages/admin/ReservationDetail.tsx` | Add logging helper, update sends to log, add Notification History UI |

---

## Security

- **RLS enabled**: Only admins can read/write logs
- **Append-only**: No UPDATE or DELETE policies
- **Immutable**: Logs cannot be edited once created
- **Audit trail**: Admin ID captured for manual resends

---

## What This Creates

- New `reservation_notifications` table
- Logging of all email and SMS sends (automatic + manual)
- Both successes and failures logged
- Admin UI to view notification history per reservation
- Clear distinction between automatic and manual sends
- Error messages visible for failed sends

---

## What This Does NOT Create

- Message sending logic (already exists in R3.2, R3.3, R3.5)
- Message editing capabilities
- Automatic retry functionality
- Global notification dashboard
- Marketing message tracking

