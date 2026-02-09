
# ISSUE R5.1 — Reservation Check-In Control (Admin)

## Overview

Add a staff-only Check-In action that marks when a customer physically arrives. This creates an explicit barrier between "confirmed" and "checked-in" states, protecting the reservation from no-show automation while providing accountability.

---

## Current State Analysis

### Existing Infrastructure
- **Reservation Status Enum**: `pending`, `confirmed`, `cancelled`, `completed`, `no_show`, `cancelled_by_customer`
- **Missing**: `checked_in` status value
- **Reservations Table**: Has `status_changed_at` and `status_changed_by` but missing dedicated `checked_in_at` and `checked_in_by` columns
- **ReservationDetail.tsx**: Has action buttons when `status === 'confirmed'` for "Mark Completed" and "Mark No-Show"
- **process-no-shows Edge Function**: Already filters by `status = 'confirmed'` only - automatically skips any other status

### Key Insight
The no-show automation already only processes `confirmed` reservations. Adding `checked_in` to the enum will automatically protect checked-in reservations since they won't have status = 'confirmed'.

---

## Technical Implementation

### 1. Database Migration

Add `checked_in` to the reservation_status enum and add dedicated columns for check-in attribution:

```sql
-- Add checked_in to reservation_status enum
ALTER TYPE reservation_status ADD VALUE 'checked_in' AFTER 'confirmed';

-- Add dedicated columns for check-in tracking
ALTER TABLE reservations 
ADD COLUMN checked_in_at TIMESTAMPTZ,
ADD COLUMN checked_in_by UUID REFERENCES auth.users(id);
```

### 2. Update ReservationDetail.tsx

Add "Check In" button and display check-in information:

**Button Location**: In the Actions card, when `status === 'confirmed'`, add a prominent "Check In" button before "Mark Completed" and "Mark No-Show"

**UI Changes:**
```
┌──────────────────────────────────────────────────────────────┐
│ Actions                                                       │
│                                                               │
│  [ ✓ Check In ]  [ ✓ Mark Completed ]  [ Mark No-Show ]      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**After Check-In:**
- Status badge shows "Checked In" (blue styling)
- Summary section displays:
  - "Checked in at 7:12 PM"
  - "by Joseph"

### 3. Status Colors & Labels Update

Add styling for the new `checked_in` status:

```typescript
const statusColors: Record<ReservationStatus, string> = {
  // ... existing statuses
  checked_in: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
};

const statusLabels: Record<ReservationStatus, string> = {
  // ... existing statuses
  checked_in: 'Checked In',
};
```

### 4. Check-In Mutation

Create a new mutation or modify existing status update to handle check-in:

```typescript
const checkInMutation = useMutation({
  mutationFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('reservations')
      .update({
        status: 'checked_in',
        status_changed_at: new Date().toISOString(),
        status_changed_by: user?.id,
        checked_in_at: new Date().toISOString(),
        checked_in_by: user?.id,
      })
      .eq('id', id)
      .eq('status', 'confirmed'); // Ensure we only check in confirmed reservations
    
    if (error) throw error;
    
    // Log admin action
    await logAdminAction({
      action: 'reservation_checked_in',
      entityType: 'reservation',
      entityId: id,
      entityName: reservation?.confirmation_code || reservation?.reservation_code,
      oldValues: { status: 'confirmed' },
      newValues: { status: 'checked_in' },
      details: 'Customer physically arrived and was checked in',
    });
    
    // Log to reservation_notifications for timeline
    await supabase.from('reservation_notifications').insert({
      reservation_id: id,
      channel: 'system',
      recipient: 'internal',
      status: 'sent',
      trigger_type: 'manual',
      message_type: 'check_in',
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-reservation', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-reservations'] });
    toast.success('Reservation checked in');
  },
  onError: (error: Error) => {
    toast.error('Failed to check in: ' + error.message);
  },
});
```

### 5. Update Actions for Checked-In Status

When `status === 'checked_in'`, show only:
- "Mark Completed" button
- (No "Mark No-Show" - customer is physically present)

```typescript
{reservation.status === 'checked_in' && (
  <Button
    onClick={() => updateStatusMutation.mutate({ newStatus: 'completed' })}
    disabled={updateStatusMutation.isPending}
    className="bg-emerald-600 hover:bg-emerald-700"
  >
    <CheckCircle className="h-4 w-4 mr-2" />
    Mark Completed
  </Button>
)}
```

### 6. Display Check-In Attribution

Show check-in details in the reservation summary when checked in:

```typescript
{reservation.checked_in_at && (
  <div className="flex items-center gap-3">
    <Check className="h-4 w-4 text-blue-600" />
    <div>
      <p className="text-sm text-muted-foreground">Checked In</p>
      <p className="font-medium">
        {format(new Date(reservation.checked_in_at), 'h:mm a')}
        {checkedInByName && ` by ${checkedInByName}`}
      </p>
    </div>
  </div>
)}
```

### 7. Update Reservation Analytics

Update `get_reservation_analytics` RPC to include `checked_in` count:

```sql
'checked_in', (SELECT COUNT(*) FROM reservations WHERE status = 'checked_in' AND reservation_date >= start_date AND reservation_date <= end_date),
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Add `checked_in` to enum, add `checked_in_at` and `checked_in_by` columns |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Add Check In button, display check-in info, update action buttons |
| `src/pages/admin/ReservationAnalytics.tsx` | MODIFY | Add checked_in to status colors and display |
| `src/pages/admin/Reservations.tsx` | MODIFY | Add checked_in to status filters and display |
| **Database Migration** | CREATE | Update `get_reservation_analytics` to include checked_in count |

---

## No-Show Protection (Automatic)

The existing `process-no-shows` Edge Function already only queries:

```typescript
.eq("status", "confirmed")
```

Once a reservation transitions to `checked_in`, it will no longer have status = 'confirmed' and will be automatically excluded from no-show processing. **No changes needed to the Edge Function.**

---

## Status Workflow Update

```
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌───────────┐
│ pending │ ──► │ confirmed │ ──► │ checked_in │ ──► │ completed │
└─────────┘     └───────────┘     └────────────┘     └───────────┘
                      │                                    
                      ▼                                    
               ┌────────────┐                              
               │  no_show   │  (only from confirmed,       
               └────────────┘   never from checked_in)     
```

---

## Customer Visibility

Customers on the tracking page will NOT see "Checked In" status. The existing `lookup_reservation` function returns only safe fields. The `checked_in` status is internal-only.

For customer tracking, we can map `checked_in` to display as "Confirmed" since from their perspective, they've arrived but haven't left yet.

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Check-In button appears correctly | Button visible only when `status = confirmed` |
| Status transitions correctly | `confirmed` → `checked_in` via mutation |
| No-show automation skips checked-in records | Automatic - Edge function filters by `confirmed` only |
| Timestamp and admin attribution saved | `checked_in_at` and `checked_in_by` columns |
| Admin UI clearly reflects check-in | Status badge, timestamp, and admin name displayed |
| One-way transition | Cannot revert check-in via customer action |

---

## What This Creates

1. `checked_in` status in the reservation enum
2. Dedicated `checked_in_at` and `checked_in_by` columns
3. "Check In" button on admin detail page
4. Check-in attribution display (time + admin name)
5. Audit logging for check-in events
6. Automatic no-show protection for checked-in reservations

---

## What This Does NOT Create

- Completion button (already exists)
- Auto-completion logic
- Seating/table assignment
- QR scanning or GPS check-in
- Customer self check-in
- Customer visibility of checked-in status
