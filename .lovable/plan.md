

# ISSUE R5.3 — Reservation Timeline & Status History (Admin)

## Overview

Add a read-only, chronological timeline component to the admin reservation detail page showing every meaningful lifecycle event with attribution (System vs Admin vs Customer).

---

## Current State Analysis

### Data Sources Available

1. **`reservations` table columns**:
   - `created_at` - When reservation was submitted
   - `status_changed_at` - Last status change timestamp
   - `status_changed_by` - Last admin who changed status (UUID or "system_no_show_job")
   - `checked_in_at` / `checked_in_by` - Check-in tracking
   - `completed_at` / `completed_by` - Completion tracking
   - `confirmation_code` - Set when confirmed (indicates confirmation happened)

2. **`reservation_notifications` table**:
   - Already tracks events with `channel`, `message_type`, `trigger_type`, `created_at`, `sent_by_admin_id`
   - Message types logged: `check_in`, `completed`, `no_show_auto_closure`, email/SMS notifications
   - Trigger types: `automatic`, `manual`

3. **`admin_logs` table**:
   - Logs all admin actions with `action`, `entity_id`, `created_at`, `display_name`
   - Actions: `reservation_checked_in`, `reservation_completed`, `status_change`, `resend_email`, etc.

### Key Insight
The `admin_logs` table already contains the most complete audit trail of reservation events with admin attribution. We can query this table filtered by `entity_type = 'reservation'` and `entity_id` to build the timeline. For events triggered by customers or system, we'll use `reservation_notifications` and the reservation's own timestamps.

---

## Technical Implementation

### 1. Timeline Data Query Strategy

Build timeline from multiple sources, merged and sorted by timestamp:

**Source A: Reservation Core Events** (from `reservations` table)
- `created_at` → "Reservation Created" (by Customer)

**Source B: Admin Actions** (from `admin_logs` table)
- All logs where `entity_type = 'reservation'` and `entity_id = reservation.id`
- Includes: confirmation, rejection, check-in, completion, no-show, resends

**Source C: System Events** (from `reservation_notifications` table)
- System-triggered events (channel = 'system')
- No-show auto-closure (`no_show_auto_closure`)

### 2. Timeline Event Type Mapping

```typescript
interface TimelineEvent {
  id: string;
  timestamp: string;
  eventType: 
    | 'created'
    | 'confirmed'
    | 'rejected'
    | 'cancelled_by_customer'
    | 'checked_in'
    | 'completed'
    | 'no_show'
    | 'notification_sent'
    | 'reminder_sent';
  triggerSource: 'system' | 'admin' | 'customer';
  adminName?: string;
  details?: string;
}
```

### 3. Create ReservationTimeline Component

New component: `src/components/admin/ReservationTimeline.tsx`

**UI Structure:**
```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Timeline                                                   │
│ Chronological history of this reservation                    │
└──────────────────────────────────────────────────────────────┘
│                                                               │
│  ○─── Created                                                 │
│  │    Feb 9, 2026 at 10:15 AM                                │
│  │    by Customer                                             │
│  │                                                            │
│  ●─── Confirmed                                               │
│  │    Feb 9, 2026 at 10:22 AM                                │
│  │    by Admin (Joseph)                                       │
│  │                                                            │
│  ○─── Reminder Sent                                           │
│  │    Feb 10, 2026 at 6:00 PM                                │
│  │    by System (24h reminder)                               │
│  │                                                            │
│  ●─── Checked In                                              │
│  │    Feb 11, 2026 at 7:12 PM                                │
│  │    by Admin (Leiramariel)                                  │
│  │                                                            │
│  ●─── Completed                                               │
│       Feb 11, 2026 at 8:34 PM                                │
│       by Admin (Maria)                                        │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Visual Styling:**
- Vertical timeline with connecting line
- Filled circles (●) for staff actions - stronger emphasis
- Hollow circles (○) for system/customer events - muted styling
- Icons per event type (CheckCircle, XCircle, Clock, Bell, etc.)
- Newest events at bottom (chronological oldest → newest)

### 4. Query Implementation

```typescript
// New query in ReservationDetail.tsx
const { data: timelineEvents = [], isLoading: timelineLoading } = useQuery({
  queryKey: ['reservation-timeline', id],
  queryFn: async () => {
    // 1. Get admin logs for this reservation
    const { data: adminLogs, error: logsError } = await supabase
      .from('admin_logs')
      .select('id, action, created_at, display_name, details, old_values, new_values')
      .eq('entity_type', 'reservation')
      .eq('entity_id', id!)
      .order('created_at', { ascending: true });
    
    if (logsError) throw logsError;
    
    // 2. Get system notifications for this reservation
    const { data: notifications, error: notifError } = await supabase
      .from('reservation_notifications')
      .select('id, created_at, channel, message_type, trigger_type')
      .eq('reservation_id', id!)
      .eq('channel', 'system')
      .order('created_at', { ascending: true });
    
    if (notifError) throw notifError;
    
    // 3. Build unified timeline
    const events: TimelineEvent[] = [];
    
    // Add reservation creation event
    if (reservation?.created_at) {
      events.push({
        id: 'creation',
        timestamp: reservation.created_at,
        eventType: 'created',
        triggerSource: 'customer',
      });
    }
    
    // Map admin logs to timeline events
    adminLogs?.forEach(log => {
      events.push(mapAdminLogToEvent(log));
    });
    
    // Map system notifications
    notifications?.forEach(notif => {
      events.push(mapNotificationToEvent(notif));
    });
    
    // Sort by timestamp ascending (oldest first)
    return events.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },
  enabled: !!id && !!reservation,
});
```

### 5. Event Label & Icon Mapping

```typescript
const eventConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  created: { 
    label: 'Reservation Created', 
    icon: Plus, 
    color: 'text-gray-500' 
  },
  confirmed: { 
    label: 'Confirmed', 
    icon: CheckCircle, 
    color: 'text-green-600' 
  },
  rejected: { 
    label: 'Rejected', 
    icon: XCircle, 
    color: 'text-red-600' 
  },
  cancelled_by_customer: { 
    label: 'Cancelled by Customer', 
    icon: XCircle, 
    color: 'text-orange-600' 
  },
  checked_in: { 
    label: 'Checked In', 
    icon: UserCheck, 
    color: 'text-blue-600' 
  },
  completed: { 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'text-emerald-600' 
  },
  no_show: { 
    label: 'Marked as No-Show', 
    icon: UserX, 
    color: 'text-gray-600' 
  },
  reminder_sent: { 
    label: 'Reminder Sent', 
    icon: Bell, 
    color: 'text-amber-500' 
  },
  notification_sent: { 
    label: 'Notification Sent', 
    icon: Send, 
    color: 'text-blue-500' 
  },
};
```

### 6. Attribution Display

Format the trigger source clearly:

```typescript
const getAttributionText = (event: TimelineEvent): string => {
  switch (event.triggerSource) {
    case 'admin':
      return event.adminName 
        ? `by Admin (${event.adminName})` 
        : 'by Admin';
    case 'system':
      return 'by System';
    case 'customer':
      return 'by Customer';
    default:
      return '';
  }
};
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/ReservationTimeline.tsx` | CREATE | New timeline component with vertical UI |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Add timeline query and render component |

---

## Component Placement

The timeline will be placed **after the Reservation Summary** and **before the Internal Notes** section, as specified in the requirements:

```
Order of cards on /admin/reservations/:id:
1. Header with Back button and Status badge
2. Reservation Summary (existing)
3. Customer Details (existing)
4. Pre-orders (conditional, existing)
5. Notes from Customer (conditional, existing)
6. Actions (conditional, existing)
7. Resend Notifications (conditional, existing)
8. Notification History (existing) - will keep for detailed logs
9. **Timeline (NEW - R5.3)**
10. Internal Notes (existing)
11. Metadata footer (existing)
```

---

## Action Mapping from admin_logs

Map `action` values from `admin_logs` to timeline event types:

| admin_logs.action | eventType | triggerSource |
|-------------------|-----------|---------------|
| `status_change` (new=confirmed) | `confirmed` | `admin` |
| `status_change` (new=cancelled) | `rejected` | `admin` |
| `reservation_checked_in` | `checked_in` | `admin` |
| `reservation_completed` | `completed` | `admin` |
| `status_change` (new=no_show) | `no_show` | `admin` |
| `resend_email` | `notification_sent` | `admin` |
| `resend_sms` | `notification_sent` | `admin` |

---

## Notification Mapping from reservation_notifications

Map `message_type` values to timeline events:

| message_type | eventType | triggerSource |
|--------------|-----------|---------------|
| `no_show_auto_closure` | `no_show` | `system` |
| `check_in` | `checked_in` | (skip - already in admin_logs) |
| `completed` | `completed` | (skip - already in admin_logs) |
| `reminder_24h`, `reminder_3h`, etc. | `reminder_sent` | `system` |

---

## Customer Cancellation Event

For customer-initiated cancellations, check if `status = 'cancelled_by_customer'` and no admin log exists - this indicates customer self-cancellation:

```typescript
// If status is cancelled_by_customer and status_changed_by is not in admin_logs,
// add a customer cancellation event at status_changed_at
if (reservation.status === 'cancelled_by_customer') {
  events.push({
    id: 'customer-cancellation',
    timestamp: reservation.status_changed_at,
    eventType: 'cancelled_by_customer',
    triggerSource: 'customer',
  });
}
```

---

## Graceful Degradation

If timeline fails to load:
- Display error message within the timeline card
- Reservation detail page continues to work
- Timeline uses its own loading state

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| All lifecycle events appear correctly | Query admin_logs + reservation_notifications + reservation timestamps |
| Timestamps are accurate | Display actual timestamps from source data |
| Trigger attribution is clear | "by Admin (Name)" / "by System" / "by Customer" |
| UI is readable and stable | Vertical timeline with icons, colors, clear typography |
| Timeline is immutable | Read-only component, no actions |

---

## What This Creates

1. New `ReservationTimeline.tsx` component
2. Timeline query combining multiple data sources
3. Visual timeline UI with icons and attribution
4. Clear distinction between System / Admin / Customer actions
5. Chronological event ordering

---

## What This Does NOT Create

- Customer-facing timelines
- Export functionality
- Filtering or searching events
- Editing past events
- Additional database tables (uses existing data)

