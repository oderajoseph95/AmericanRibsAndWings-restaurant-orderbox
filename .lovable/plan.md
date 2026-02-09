
# ISSUE R5.2 — Reservation Completion Control (Admin)

## Overview

Add explicit completion tracking for reservations, mirroring the check-in implementation from R5.1. This ensures reservations close cleanly with full audit attribution when staff marks service as concluded.

---

## Current State Analysis

### Already Implemented
- "Mark Completed" button exists for `checked_in` status
- Status transitions to `completed` via existing mutation
- Customer tracking page shows "Completed" status
- Check-in tracking pattern already established in R5.1

### Missing for R5.2
- `completed_at` and `completed_by` database columns
- Completion timestamp/admin tracking in the mutation
- Completion attribution display in admin detail
- Query for completion admin name
- Audit logging for `reservation_completed` action
- Timeline entry for completion event

---

## Technical Implementation

### 1. Database Migration

Add dedicated columns for completion tracking (mirroring check-in):

```sql
-- Add dedicated columns for completion tracking
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);
```

### 2. Update Status Mutation

Modify the mutation in `ReservationDetail.tsx` to track completion:

```typescript
// Track completion with dedicated columns
if (newStatus === 'completed') {
  updateData.completed_at = new Date().toISOString();
  updateData.completed_by = user?.id || null;
}
```

### 3. Update Audit Logging

Add `reservation_completed` action type:

```typescript
const actionType = newStatus === 'checked_in' 
  ? 'reservation_checked_in' 
  : newStatus === 'completed'
    ? 'reservation_completed'
    : 'status_change';
```

### 4. Add Timeline Entry

Log completion to `reservation_notifications` table:

```typescript
if (newStatus === 'completed' && reservation) {
  await supabase.from('reservation_notifications').insert({
    reservation_id: reservation.id,
    channel: 'system',
    recipient: 'internal',
    status: 'sent',
    trigger_type: 'manual',
    message_type: 'completed',
  });
}
```

### 5. Add Completion Admin Query

Query the admin who completed the reservation:

```typescript
const { data: completedByAdmin } = useQuery({
  queryKey: ['completed-by-admin', reservation?.completed_by],
  queryFn: async () => {
    if (!reservation?.completed_by) return null;
    
    const { data, error } = await supabase
      .from('user_roles')
      .select('display_name, username')
      .eq('user_id', reservation.completed_by)
      .maybeSingle();
    
    if (error) throw error;
    return data?.display_name || data?.username || 'Admin';
  },
  enabled: !!reservation?.completed_by,
});
```

### 6. Add Completion Attribution Display

Display completion info in the summary section (after check-in attribution):

```typescript
{/* Completion Attribution */}
{reservation.completed_at && (
  <div className="flex items-center gap-3">
    <CheckCircle className="h-4 w-4 text-emerald-600" />
    <div>
      <p className="text-sm text-muted-foreground">Completed</p>
      <p className="font-medium">
        {format(new Date(reservation.completed_at), 'h:mm a')}
        {completedByAdmin && ` by ${completedByAdmin}`}
      </p>
    </div>
  </div>
)}
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Add `completed_at` and `completed_by` columns |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Add completion tracking to mutation, add query for admin name, add attribution display |

---

## UI Changes

### Admin Reservation Detail - Summary Section

After a reservation is completed, the summary will show:

```
┌──────────────────────────────────────────────────────────────┐
│ Reservation Summary                                          │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ ✓ Checked In           ✓ Completed                     │  │
│ │ 7:12 PM by Joseph      8:34 PM by Maria                │  │
│ └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Status Badge

Completed reservations will show:
- Badge: "Completed" (emerald green styling) - already implemented

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Completion button appears correctly | Already exists for `checked_in` status |
| Status transitions correctly | Already works, just adding dedicated tracking |
| Completed reservations are terminal | Already enforced by action card visibility |
| Timestamps and admin attribution saved | New `completed_at` and `completed_by` columns |
| No automation modifies completed records | process-no-shows only queries `confirmed` status |
| Audit logging | `reservation_completed` action type |

---

## System Interactions

Completed reservations are automatically:
- **Excluded from**: No-show automation (already filters by `confirmed` only)
- **Excluded from**: Reminder jobs (already only schedules for `confirmed`)
- **Included in**: Analytics (already counted in `get_reservation_analytics`)

---

## What This Creates

1. `completed_at` and `completed_by` columns in reservations table
2. Completion tracking in the status mutation
3. Completion attribution display (time + admin name)
4. Audit logging with `reservation_completed` action
5. Timeline entry for completion event

---

## What This Does NOT Create

- Auto-completion after time
- Feedback collection
- Ratings
- Table assignment release
- Staff performance tracking
