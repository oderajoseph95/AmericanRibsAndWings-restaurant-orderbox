
# Plan: Fix Dashboard Reservation Stats Card Date Filtering

## Problem Identified

The Reservation Stats Card is **filtering by `reservation_date`** (the date of the reservation) instead of **`created_at`** (when the booking was made), causing a mismatch with what the user expects.

### Current Data:
| Reservation | Created | Scheduled For | Status |
|-------------|---------|---------------|--------|
| ARW-RSV-1610 | Feb 9 | **Feb 17** | No Show |
| ARW-RSV-4814 | Feb 9 | **Feb 18** | Confirmed |

### Current Behavior (WRONG):
- Filter: "This Month" = Feb 1 - Feb 9
- Queries filter by `reservation_date` (Feb 17 & 18 are **outside** this range)
- Result: Shows **0** for everything

### Expected Behavior (CORRECT):
- Filter: "This Month" = Feb 1 - Feb 9  
- Should filter by `created_at` (Feb 9 is **within** this range)
- Result: Should show **1 No Show** and **2 Total Reservations**

---

## Root Cause

In `src/components/admin/ReservationStatsCard.tsx`, both the **Total Reservations** and **No Shows** queries filter by `reservation_date`:

```typescript
// Current - WRONG
.gte("reservation_date", format(dateRange.start, 'yyyy-MM-dd'))
.lte("reservation_date", format(dateRange.end, 'yyyy-MM-dd'))
```

This means if you select "Today" (Feb 9), it only shows reservations **scheduled for Feb 9**, not reservations **made on Feb 9**.

---

## Solution

Change the queries to filter by **`created_at`** instead of `reservation_date` for the date-filtered stats:

### File: `src/components/admin/ReservationStatsCard.tsx`

**1. Total Reservations Query (lines 43-54)**
```typescript
// FIX: Filter by created_at (when booking was made)
const { data: totalCount, isLoading: loadingTotal } = useQuery({
  queryKey: ["reservation-stats", "total", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
  queryFn: async () => {
    const { count, error } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", dateRange.start.toISOString())  // Changed from reservation_date
      .lte("created_at", dateRange.end.toISOString());   // Changed from reservation_date
    if (error) throw error;
    return count || 0;
  },
});
```

**2. No Shows Query (lines 85-97)**
```typescript
// FIX: Filter by created_at (when booking was made)
const { data: noShowCount, isLoading: loadingNoShow } = useQuery({
  queryKey: ["reservation-stats", "no-show", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
  queryFn: async () => {
    const { count, error } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("status", "no_show")
      .gte("created_at", dateRange.start.toISOString())  // Changed from reservation_date
      .lte("created_at", dateRange.end.toISOString());   // Changed from reservation_date
    if (error) throw error;
    return count || 0;
  },
});
```

---

## Behavior After Fix

| Stat | Filter | Logic | Expected Result |
|------|--------|-------|-----------------|
| Total Reservations | By created_at | "Bookings made in this period" | 2 (both created Feb 9) |
| Pending Approval | No filter | All pending needing action | 0 |
| Upcoming Confirmed | Today + future | Scheduled confirmations | 1 (Feb 18) |
| No Shows | By created_at | "No-shows from bookings in period" | 1 (created Feb 9) |

---

## Summary

| Before | After |
|--------|-------|
| Filters by when reservation is scheduled | Filters by when booking was made |
| "This Month" shows future-dated reservations | "This Month" shows reservations booked this month |
| Stats don't match dashboard expectations | Stats align with all other dashboard cards |

**File to modify:**
- `src/components/admin/ReservationStatsCard.tsx` - Change 2 queries from `reservation_date` to `created_at` filtering
