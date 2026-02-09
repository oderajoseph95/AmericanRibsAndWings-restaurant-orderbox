

# ISSUE R2.1 — Admin Reservation List View

## Overview

Create an admin-facing list page at `/admin/reservations` that displays all reservation records. This is a **read-only operational list** with status badges, basic filtering, pagination, and row navigation to detail view.

---

## Technical Implementation

### 1. Create Reservations Admin Page

**File:** `src/pages/admin/Reservations.tsx`

A new admin page following the established patterns from `Customers.tsx` and `Orders.tsx`:

Key features:
- Uses `@tanstack/react-query` for data fetching with `supabase.from('reservations')`
- Responsive design: Table layout for desktop, MobileCard for mobile
- Status filter dropdown (All, Pending, Confirmed, Cancelled, Completed, No Show)
- Date filter tabs (Upcoming, Today, Past)
- Default ordering: Soonest reservation first (ascending by `reservation_date` + `reservation_time`)
- Pagination with 15 items per page
- Row click navigates to `/admin/reservations/:id` (detail view in R2.2)
- Empty state with clear messaging

**Data Query:**
```typescript
const { data: reservationsData, isLoading } = useQuery({
  queryKey: ['admin-reservations', statusFilter, dateFilter, currentPage],
  queryFn: async () => {
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    
    let query = supabase
      .from('reservations')
      .select('*', { count: 'exact' })
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .range(from, to);

    // Status filter
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    
    // Date filter
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dateFilter === 'upcoming') {
      query = query.gte('reservation_date', today);
    } else if (dateFilter === 'today') {
      query = query.eq('reservation_date', today);
    } else if (dateFilter === 'past') {
      query = query.lt('reservation_date', today);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { reservations: data, totalCount: count || 0 };
  },
});
```

---

### 2. Status Badge Colors

Following the established pattern from Orders page:

```typescript
const statusColors: Record<Enums<'reservation_status'>, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  no_show: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<Enums<'reservation_status'>, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
};
```

---

### 3. Table Columns (Desktop)

| Column | Content |
|--------|---------|
| Date | `reservation_date` formatted as "Feb 14, 2025" |
| Time | `reservation_time` formatted as "7:00 PM" |
| Customer | `name` |
| Guests | `pax` with "guests" label |
| Status | Badge with status color |
| Created | `created_at` formatted as "2d ago" or date |

---

### 4. Mobile Card Layout

Each card shows:
- Date & time as header
- Customer name
- Pax count badge
- Status badge
- Created timestamp (subtle)

---

### 5. Filters UI

**Status Filter (Dropdown):**
- All
- Pending
- Confirmed
- Cancelled
- Completed
- No Show

**Date Filter (Tabs/Buttons):**
- Upcoming (default)
- Today
- Past

---

### 6. Empty State

When no reservations exist:
```tsx
<div className="text-center py-12 text-muted-foreground">
  <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
  <p className="font-medium">No reservations yet</p>
  <p className="text-sm mt-1">
    Reservations submitted by customers will appear here
  </p>
</div>
```

---

### 7. Add Route to App.tsx

**File:** `src/App.tsx`

Add the `/admin/reservations` route and import:

```tsx
// Add import
import Reservations from "./pages/admin/Reservations";

// Add route inside admin routes (around line 100)
<Route path="reservations" element={<Reservations />} />
```

---

### 8. Add Sidebar Navigation

**File:** `src/components/admin/AdminSidebar.tsx`

Add Reservations to the navigation items (positioned after Orders for operational flow):

```tsx
import { CalendarDays } from 'lucide-react';

// In navItems array, after Orders:
{ title: 'Reservations', url: '/admin/reservations', icon: CalendarDays, roles: ['owner', 'manager', 'cashier'] },
```

Note: Although sidebar changes are technically R2.5, adding basic navigation is essential for accessing this page. The sidebar entry is minimal and read-only.

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/admin/Reservations.tsx` | **Create** - New admin reservation list page |
| `src/App.tsx` | Add `/admin/reservations` route |
| `src/components/admin/AdminSidebar.tsx` | Add Reservations nav item |

---

## What This Creates

- `/admin/reservations` route (protected, admin only)
- Reservation list with date, time, name, pax, status
- Read-only status badges (no actions)
- Status filter (dropdown)
- Date filter (upcoming/today/past)
- Pagination (15 items per page)
- Row click → navigate to `/admin/reservations/:id`
- Empty state with clear messaging
- Mobile-responsive layout

---

## What This Does NOT Create

- Status editing
- Admin notes
- Notifications panel
- Customer-facing actions
- Reservation detail view (R2.2)
- Sidebar changes beyond basic nav entry

---

## Accessibility & UX

- Table is horizontally scrollable on smaller screens
- Badges have sufficient color contrast
- Row hover states indicate clickability
- Loading skeleton while fetching
- Clear filter reset option
- Page count visible in pagination

---

## Result

After implementation:
- Admins can access `/admin/reservations` from sidebar
- All reservations displayed in sortable list
- Quick status identification via badges
- Filter by status and date range
- Navigate to individual reservation details
- Answers: "What reservations do we have coming up?"

