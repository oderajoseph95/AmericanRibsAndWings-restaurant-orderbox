
# Plan: Fix Reservation Stats Card to Update with Dashboard Filters and Realtime

## Problem Identified

The Reservation Stats Card is not updating with the dashboard because of **TWO bugs**:

### Bug 1: Query Keys Not Included in Refresh Logic
The reservation stats queries use `['reservation-stats', ...]` query keys, but the Dashboard's refresh functions only target `['dashboard', ...]` queries:

```typescript
// Current refresh logic - MISSES reservation-stats!
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  queryClient.invalidateQueries({ queryKey: ['conversion-funnel'] }),
  queryClient.invalidateQueries({ queryKey: ['live-visitors'] }),
]);
```

### Bug 2: No Realtime Subscription for Reservations
The realtime subscription only listens to the `orders` table:
```typescript
.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, ...)
```

When reservations are created, confirmed, or marked as no-show, the stats card doesn't update.

---

## Solution

### Fix 1: Add `reservation-stats` to All Refresh Logic

**File: `src/pages/admin/Dashboard.tsx`**

**1.1. Update `refreshAllData` function (around line 54-61)**
```typescript
const refreshAllData = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['conversion-funnel'] }),
    queryClient.invalidateQueries({ queryKey: ['live-visitors'] }),
    queryClient.invalidateQueries({ queryKey: ['reservation-stats'] }), // ADD THIS
    queryClient.invalidateQueries({ queryKey: ['today-reservations-alert'] }), // ADD THIS
  ]);
  setLastUpdate(new Date());
};
```

**1.2. Update auto-refresh interval (around line 86)**
```typescript
// Add reservation stats to auto-refresh
queryClient.refetchQueries({ 
  queryKey: ['dashboard'],
  type: 'active',
});
queryClient.refetchQueries({ 
  queryKey: ['reservation-stats'],  // ADD THIS
  type: 'active',
});
```

### Fix 2: Add Realtime Subscription for Reservations Table

**File: `src/pages/admin/Dashboard.tsx`**

Add a second channel subscription for the `reservations` table:

```typescript
// Setup realtime subscription for orders
const ordersChannel = supabase
  .channel('dashboard-orders-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
    // ... existing logic
  })
  .subscribe();

// ADD: Setup realtime subscription for reservations
const reservationsChannel = supabase
  .channel('dashboard-reservations-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
    queryClient.refetchQueries({ 
      queryKey: ['reservation-stats'],
      type: 'active',
    });
    queryClient.refetchQueries({ 
      queryKey: ['today-reservations-alert'],
      type: 'active',
    });
    setLastUpdate(new Date());
  })
  .subscribe();

return () => {
  supabase.removeChannel(ordersChannel);
  supabase.removeChannel(reservationsChannel);
};
```

---

## Also Verify: Date Filtering Logic

The current no_show in the database has `reservation_date: 2026-02-17`, but today is Feb 9. The "This Month" filter shows Feb 1 - Feb 9 (today), so the no_show from Feb 17 correctly won't appear until that date arrives.

This is **correct behavior** - the card filters by reservation_date, not created_at. Once Feb 17 passes (or if a no_show has a reservation_date within the selected range), it will display correctly.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/Dashboard.tsx` | Add `reservation-stats` to refresh logic + add reservations realtime channel |

---

## Summary

| Issue | Fix |
|-------|-----|
| Reservation stats not refreshing on manual/auto refresh | Add `reservation-stats` query key to `refreshAllData` and auto-refresh |
| Reservation stats not updating in realtime | Add realtime subscription for `reservations` table |
| No show showing 0 when there's 1 | Correct behavior - that no_show is scheduled for Feb 17, outside current filter range |

After this fix:
- Manual refresh button will refresh reservation stats
- 30-second auto-refresh will include reservation stats
- Creating/updating/deleting reservations will trigger instant stat updates
- All cards on the dashboard will stay synchronized with the selected date filter
