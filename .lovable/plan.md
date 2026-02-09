

# Plan: Add Reservation Stats Cards to Admin Dashboard

## Overview

Add a new **ReservationStatsCard** component to the admin dashboard, placed above the ProductAnalyticsCard. This card will display 4 key reservation metrics that update based on the existing date filters (today, yesterday, week, month, custom).

## Card Design

Based on the reservation lifecycle and what's most actionable for admins, I recommend these 4 cards:

| Card | Metric | Color | Why It Matters |
|------|--------|-------|----------------|
| **Total Reservations** | Count of all reservations in period | Blue | Overall volume indicator |
| **Pending Approval** | Status = `pending` | Orange | Action required - needs admin confirmation |
| **Upcoming Confirmed** | Status = `confirmed` with future date | Green | Today's and upcoming confirmed bookings |
| **No Shows** | Status = `no_show` in period | Red | Track reliability/losses |

## Technical Implementation

### New Component: `src/components/admin/ReservationStatsCard.tsx`

```
+-----------+-----------+-----------+-----------+
| Total     | Pending   | Upcoming  | No Shows  |
| Reserv.   | Approval  | Confirmed |           |
|-----------|-----------|-----------|-----------|
|    12     |     3     |     5     |     2     |
| This week | Need conf | Next 7d   | This week |
+-----------+-----------+-----------+-----------+
```

**Props:**
- `dateFilter: "today" | "yesterday" | "week" | "month" | "custom"`
- `customDateRange?: { from: Date; to: Date } | null`

**Queries:**
1. **Total Reservations** - Count all reservations created in the date range
2. **Pending Approval** - Count where `status = 'pending'` (NOT date-filtered - shows all pending)
3. **Upcoming Confirmed** - Count where `status = 'confirmed'` AND `reservation_date >= today`
4. **No Shows** - Count where `status = 'no_show'` in the date range

### Dashboard Integration

**File:** `src/pages/admin/Dashboard.tsx`

1. Import the new component (around line 18)
2. Add it between the ConversionFunnelCard section and ProductAnalyticsCard (around line 607):

```tsx
{/* Reservation Stats */}
<ReservationStatsCard dateFilter={dateFilter} customDateRange={customDateRange} />

{/* Product Analytics */}
<ProductAnalyticsCard dateFilter={dateFilter} customDateRange={customDateRange} />
```

### Component Structure

```tsx
// Grid layout matching the existing 4-card rows
<Card>
  <CardHeader>
    <CardTitle>Reservations</CardTitle>
    <Link to="/admin/reservations">View All</Link>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 4 stat boxes */}
    </div>
  </CardContent>
</Card>
```

### Query Logic

```typescript
// Total reservations for period
const { data: totalCount } = useQuery({
  queryKey: ['reservation-stats', 'total', dateFilter, ...],
  queryFn: async () => {
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', dateRange.start.toISOString())
      .lte('created_at', dateRange.end.toISOString());
    return count || 0;
  }
});

// Pending approval (NOT date filtered - shows all pending)
const { data: pendingCount } = useQuery({
  queryKey: ['reservation-stats', 'pending'],
  queryFn: async () => {
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    return count || 0;
  }
});

// Upcoming confirmed (future dates only)
const { data: upcomingCount } = useQuery({
  queryKey: ['reservation-stats', 'upcoming'],
  queryFn: async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('reservation_date', today);
    return count || 0;
  }
});

// No shows in period
const { data: noShowCount } = useQuery({
  queryKey: ['reservation-stats', 'no-show', dateFilter, ...],
  queryFn: async () => {
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'no_show')
      .gte('created_at', dateRange.start.toISOString())
      .lte('created_at', dateRange.end.toISOString());
    return count || 0;
  }
});
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/ReservationStatsCard.tsx` | **Create** | New component with 4 reservation stat boxes |
| `src/pages/admin/Dashboard.tsx` | **Modify** | Import and add ReservationStatsCard above ProductAnalyticsCard |

---

## Visual Design

The card will follow the existing ProductAnalyticsCard pattern with:
- Single Card container with header + content
- 4-column grid (2 cols on mobile, 4 on desktop)
- Each stat box with:
  - Icon + Title
  - Large count number
  - Subtitle with context
- Color coding:
  - Total: `bg-blue-500/10 text-blue-600`
  - Pending: `bg-orange-500/10 text-orange-600` (with pulse if > 0)
  - Upcoming: `bg-green-500/10 text-green-600`
  - No Shows: `bg-red-500/10 text-red-600`

---

## Additional Features

1. **Link to Reservations Page** - Header will include a "View All" link to `/admin/reservations`
2. **Pending Pulse** - If pending > 0, show a subtle pulse animation to draw attention
3. **Click Actions** - Each card is clickable, linking to filtered reservation views:
   - Pending → `/admin/reservations?status=pending`
   - Upcoming → `/admin/reservations?filter=upcoming`
   - No Shows → `/admin/reservations?status=no_show`

