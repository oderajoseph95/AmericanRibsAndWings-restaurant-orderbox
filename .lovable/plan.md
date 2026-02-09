

# ISSUE R2.3 — Reservation Status Management (Admin)

## Overview

Add admin-controlled status transitions to the reservation detail page. This enables the reservation lifecycle from `pending` through to `completed` or terminal states. No notifications, no notes, no editing - just state control.

---

## Gap Analysis

| Requirement | Current State | Action |
|-------------|---------------|--------|
| Status change controls | Not present | Add status action buttons |
| Allowed transitions only | Not enforced | Implement transition rules |
| Status persistence | Works via `updated_at` | Keep |
| `status_changed_at` column | Missing | Add via migration |
| `status_changed_by` column | Missing | Add via migration |
| Admin logging | Exists (`logAdminAction`) | Reuse pattern |
| No notifications | N/A | Ensure NOT added |

---

## Technical Implementation

### 1. Database Migration - Add Status Change Tracking

Add columns to track when and who changed the status:

```sql
-- Add status_changed_at to track when status was last changed
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Add status_changed_by to track who changed the status (admin user ID)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS status_changed_by UUID;
```

---

### 2. Status Transition Rules

Define strict allowed transitions (enforced in UI):

```typescript
const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled'],   // Note: 'cancelled' maps to 'rejected' per UI
  confirmed: ['completed', 'no_show'],
  cancelled: [],  // Terminal state
  completed: [],  // Terminal state
  no_show: [],    // Terminal state
};
```

Note: The database enum uses `cancelled` but the requirements say `rejected`. These are the same status.

---

### 3. Update ReservationDetail.tsx

**Changes:**

A. Add imports:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Check, X, CheckCircle, UserX, Loader2 } from 'lucide-react';
```

B. Add status mutation:
```typescript
const queryClient = useQueryClient();

const updateStatusMutation = useMutation({
  mutationFn: async ({ newStatus }: { newStatus: ReservationStatus }) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('reservations')
      .update({ 
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        status_changed_by: user?.id || null,
      })
      .eq('id', id);
    
    if (error) throw error;

    // Log admin action
    await logAdminAction({
      action: 'status_change',
      entityType: 'reservation',
      entityId: id,
      entityName: reservation?.reservation_code,
      oldValues: { status: reservation?.status },
      newValues: { status: newStatus },
      details: `Changed reservation status from ${reservation?.status} to ${newStatus}`,
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-reservation', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-reservations'] });
    toast.success('Reservation status updated');
  },
  onError: (error) => {
    toast.error('Failed to update status: ' + error.message);
  },
});
```

C. Add Status Actions Card (after Pre-Order Selections card):
```tsx
{/* Status Actions */}
{reservation.status !== 'completed' && 
 reservation.status !== 'cancelled' && 
 reservation.status !== 'no_show' && (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Actions</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-3">
        {reservation.status === 'pending' && (
          <>
            <Button
              onClick={() => updateStatusMutation.mutate({ newStatus: 'confirmed' })}
              disabled={updateStatusMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Confirm Reservation
            </Button>
            <Button
              variant="destructive"
              onClick={() => updateStatusMutation.mutate({ newStatus: 'cancelled' })}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          </>
        )}
        {reservation.status === 'confirmed' && (
          <>
            <Button
              onClick={() => updateStatusMutation.mutate({ newStatus: 'completed' })}
              disabled={updateStatusMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark Completed
            </Button>
            <Button
              variant="outline"
              onClick={() => updateStatusMutation.mutate({ newStatus: 'no_show' })}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              Mark No-Show
            </Button>
          </>
        )}
      </div>
    </CardContent>
  </Card>
)}
```

D. Update Metadata section to show status change info:
```tsx
{/* Metadata */}
<div className="text-sm text-muted-foreground space-y-1">
  <p>Created {formatCreatedAt(reservation.created_at || '')}</p>
  {reservation.status_changed_at && (
    <p>Status changed {formatCreatedAt(reservation.status_changed_at)}</p>
  )}
</div>
```

---

## Files to Modify

| File | Change |
|------|--------|
| **Database** | Add `status_changed_at` and `status_changed_by` columns |
| `src/pages/admin/ReservationDetail.tsx` | Add status mutation and action buttons |

---

## Status Transition Flow (Visual)

```text
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
     ┌──────────────┐          ┌──────────────┐
     │  confirmed   │          │  cancelled   │
     └──────┬───────┘          │  (rejected)  │
            │                  └──────────────┘
   ┌────────┼────────┐               TERMINAL
   ▼                 ▼
┌──────────┐  ┌──────────────┐
│completed │  │   no_show    │
└──────────┘  └──────────────┘
   TERMINAL        TERMINAL
```

---

## Button Display Rules

| Current Status | Available Actions |
|----------------|-------------------|
| `pending` | [Confirm Reservation] [Reject] |
| `confirmed` | [Mark Completed] [Mark No-Show] |
| `cancelled` | No actions (terminal) |
| `completed` | No actions (terminal) |
| `no_show` | No actions (terminal) |

---

## What This Creates

- Status change buttons on `/admin/reservations/:id`
- Strict transition enforcement (UI-level)
- `status_changed_at` timestamp tracking
- `status_changed_by` admin user ID tracking
- Admin action logging via `logAdminAction`
- Loading states during mutation
- Error handling with toast messages
- Query invalidation for list/detail refresh

---

## What This Does NOT Create

- Notifications (no SMS, no email, no push)
- Admin notes
- Reservation data editing
- Capacity logic
- Customer-facing status updates
- Undo functionality

---

## Error Handling

- Mutation errors show toast with error message
- Button disabled during pending mutation
- Failed updates do not change UI state
- Retry is possible by clicking button again

---

## Audit Trail

Each status change logs:
- Action: `status_change`
- Entity type: `reservation`
- Entity ID: reservation UUID
- Entity name: reservation code
- Old values: `{ status: "pending" }`
- New values: `{ status: "confirmed" }`
- Details: Human-readable description

---

## Result

After implementation:
- Admins see action buttons based on current status
- Clicking a button changes status and persists
- Status change timestamp is recorded
- Admin who changed it is recorded
- UI updates immediately after success
- Errors are visible and retryable
- No notifications are sent
- Answers: "What is the current state and what can I do next?"

