

# ISSUE R2.2 — Admin Reservation Detail View

## Overview

Create a read-only admin detail page at `/admin/reservations/:id` that displays full reservation context before any actions are taken. This is a pure inspection surface with no editing capabilities.

---

## Technical Implementation

### 1. Create ReservationDetail Admin Page

**File:** `src/pages/admin/ReservationDetail.tsx`

A new admin page following established patterns with these characteristics:

**Data Fetching:**
```typescript
const { id } = useParams<{ id: string }>();

const { data: reservation, isLoading, error } = useQuery({
  queryKey: ['admin-reservation', id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },
  enabled: !!id,
});
```

**Component Structure:**
- Header with back navigation
- Reservation summary section
- Customer information section
- Pre-order selections section (if any)
- Metadata section (created at)

---

### 2. Page Sections

**A. Header**
- "Back to Reservations" button → navigates to `/admin/reservations`
- Page title: "Reservation Details"
- Status badge (read-only, using same colors from R2.1)

**B. Reservation Summary Card**
| Field | Display |
|-------|---------|
| Reservation Code | Shown prominently (read-only reference) |
| Date | Formatted as "February 14, 2025" |
| Time | Formatted as "7:00 PM" |
| Party Size | "4 guests" |
| Status | Badge (pending/confirmed/cancelled/completed/no_show) |

**C. Customer Information Card**
| Field | Display |
|-------|---------|
| Name | Full name |
| Phone | Phone number |
| Email | Email (if present) or "Not provided" |
| Notes | Customer notes (if any) or "No notes" |

**D. Pre-Order Selections Card**
- Header: "Pre-order Selections"
- Subtext: "(Not paid - for reference only)"
- If `preorder_items` exists and has items:
  - List each item with name and quantity
  - No prices displayed
  - No totals
- If no pre-orders:
  - Show: "No pre-orders selected"

**E. Metadata Section (subtle)**
| Field | Display |
|-------|---------|
| Created | "Created 2 days ago" or full date |
| Last Updated | If different from created |

---

### 3. Status Badge Colors

Reusing the same status colors from `Reservations.tsx`:

```typescript
const statusColors: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  no_show: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};
```

---

### 4. Pre-Order Items Display

The `preorder_items` field is a JSONB column. Expected structure based on R1.3:

```typescript
interface PreorderItem {
  productId: string;
  productName: string;
  quantity: number;
}

// Parse and display
const preorderItems = reservation.preorder_items as PreorderItem[] | null;
```

Display as a simple list:
```
- 2x Baby Back Ribs
- 1x Buffalo Wings
- 3x Combo Platter
```

No pricing. No modification controls.

---

### 5. Error & Loading States

**Loading State:**
- Skeleton cards matching the layout

**Not Found (404):**
```tsx
<div className="text-center py-12">
  <CalendarDays className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
  <h2 className="text-xl font-semibold mb-2">Reservation not found</h2>
  <p className="text-muted-foreground mb-4">
    The reservation you're looking for doesn't exist or has been removed.
  </p>
  <Button asChild>
    <Link to="/admin/reservations">Back to Reservations</Link>
  </Button>
</div>
```

---

### 6. Add Route to App.tsx

**File:** `src/App.tsx`

Add the detail route inside the admin routes:

```tsx
// Add import
import ReservationDetail from "./pages/admin/ReservationDetail";

// Add route after reservations list route (around line 95)
<Route path="reservations/:id" element={<ReservationDetail />} />
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/admin/ReservationDetail.tsx` | **Create** - New admin reservation detail page |
| `src/App.tsx` | Add `/admin/reservations/:id` route |

---

## Layout Structure

```
┌─────────────────────────────────────────────────┐
│ ← Back to Reservations          [Status Badge] │
│ Reservation Details                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ RESERVATION SUMMARY                             │
├─────────────────────────────────────────────────┤
│ Code: ARW-RSV-4832                              │
│ Date: February 14, 2025                         │
│ Time: 7:00 PM                                   │
│ Party Size: 4 guests                            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ CUSTOMER INFORMATION                            │
├─────────────────────────────────────────────────┤
│ Name: Juan Dela Cruz                            │
│ Phone: 09171234567                              │
│ Email: juan@example.com                         │
│ Notes: "Window seat if possible"                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ PRE-ORDER SELECTIONS                            │
│ (Not paid - for reference only)                 │
├─────────────────────────────────────────────────┤
│ • 2x Baby Back Ribs                             │
│ • 1x Buffalo Wings                              │
│ • 3x Combo Platter                              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Created 2 days ago                              │
└─────────────────────────────────────────────────┘
```

---

## What This Creates

- `/admin/reservations/:id` route (protected, admin only)
- Full reservation context on one page
- Read-only display of all reservation data
- Pre-order selections listed (no prices)
- Status badge visible but not editable
- Back navigation to reservation list
- Deep linking support
- 404 handling for invalid IDs

---

## What This Does NOT Create

- Status editing (R2.3)
- Admin notes (R2.4)
- Notifications
- Editing reservation data
- Customer communication
- Payments or confirmation
- Any action buttons beyond navigation

---

## Result

After implementation:
- Admin clicks row in `/admin/reservations`
- Navigates to `/admin/reservations/:id`
- Sees full reservation context
- Can review customer info and pre-orders
- Has clear back navigation
- Status is visible but immutable
- Answers: "What exactly did this customer request?"

