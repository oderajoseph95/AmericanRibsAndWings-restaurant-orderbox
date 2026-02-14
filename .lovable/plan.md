

# Fix Reservation Sorting and Filtering for "Upcoming" View

## Problem

The "Upcoming" tab currently shows all reservations from today onward regardless of status. This means completed, no-show, and cancelled reservations from earlier today (e.g., 11:00 AM) still appear at the top, pushing truly upcoming ones down. "Upcoming" should only show reservations that are still actionable.

## Solution

Modify the query in `src/pages/admin/Reservations.tsx` to exclude terminal statuses when the "Upcoming" filter is active.

### Changes to `src/pages/admin/Reservations.tsx`

**When `dateFilter === 'upcoming'` and `statusFilter === 'all'`:**
- Automatically exclude terminal statuses: `completed`, `no_show`, `cancelled`, `cancelled_by_customer`
- This ensures only `pending`, `confirmed`, and `checked_in` reservations appear in the upcoming view
- If the admin explicitly selects a specific status filter (e.g., "Completed"), it will still work as expected and override this behavior

### Technical Detail

In the query builder (around line 82), add a condition:

```typescript
if (dateFilter === 'upcoming') {
  query = query.gte('reservation_date', today);
  // When showing upcoming with no specific status filter,
  // exclude terminal statuses
  if (statusFilter === 'all') {
    query = query.in('status', ['pending', 'confirmed', 'checked_in']);
  }
}
```

This is a single-line addition to the existing query logic. No other files need to change.

