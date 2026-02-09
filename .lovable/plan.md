

# ISSUE R4.6 — Reservation Analytics (Admin-Only)

## Overview

Create a read-only analytics dashboard for reservation performance at `/admin/reservations/analytics`. This dashboard will provide owners and managers with visibility into reservation patterns, no-show rates, peak times, and pax distribution - all using reservation records only (no sales or payment data).

---

## Current State Analysis

### Existing Infrastructure
- **Reservation Status Enum**: `pending`, `confirmed`, `cancelled`, `cancelled_by_customer`, `completed`, `no_show`
- **Reservations Table**: Contains `pax`, `reservation_date`, `reservation_time`, `status`, `created_at`
- **Reports Page Pattern**: `src/pages/admin/Reports.tsx` provides excellent template with date filters, tabs, cards, and recharts
- **RPC Pattern**: `get_funnel_counts` shows how to create server-side aggregation functions
- **Role-Based Access**: Reports page already restricts access to owner/manager roles
- **Admin Sidebar**: Easy to add new navigation item

### Key Architectural Decisions
1. **Server-side Aggregation**: Use PostgreSQL RPC function to bypass 1000 row limit and ensure accuracy
2. **Follow Reports.tsx Pattern**: Reuse existing UI patterns for consistency
3. **No New Route in Sidebar**: Link from Reservations list page to reduce sidebar clutter
4. **Read-Only**: No actions, just metrics display

---

## Technical Implementation

### 1. Database Changes - Create RPC Function

Create `get_reservation_analytics` function that aggregates reservation data server-side:

```sql
CREATE OR REPLACE FUNCTION get_reservation_analytics(
  start_date DATE,
  end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- Core counts
    'total', (SELECT COUNT(*) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'pending', (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND reservation_date >= start_date AND reservation_date <= end_date),
    'confirmed', (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled_by_customer', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled_by_customer' AND reservation_date >= start_date AND reservation_date <= end_date),
    'completed', (SELECT COUNT(*) FROM reservations WHERE status = 'completed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'no_show', (SELECT COUNT(*) FROM reservations WHERE status = 'no_show' AND reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Pax stats
    'total_pax', (SELECT COALESCE(SUM(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'avg_pax', (SELECT COALESCE(AVG(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'min_pax', (SELECT COALESCE(MIN(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'max_pax', (SELECT COALESCE(MAX(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Pax distribution buckets
    'pax_1_2', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 1 AND 2 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_3_4', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 3 AND 4 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_5_6', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 5 AND 6 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_7_plus', (SELECT COUNT(*) FROM reservations WHERE pax >= 7 AND reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Day of week distribution (0 = Sunday, 6 = Saturday)
    'day_distribution', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          EXTRACT(DOW FROM reservation_date)::int as day_of_week,
          COUNT(*) as count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY EXTRACT(DOW FROM reservation_date)
        ORDER BY day_of_week
      ) t
    ),
    
    -- Hourly distribution
    'hour_distribution', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          EXTRACT(HOUR FROM reservation_time)::int as hour,
          COUNT(*) as count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY EXTRACT(HOUR FROM reservation_time)
        ORDER BY hour
      ) t
    ),
    
    -- Daily trend
    'daily_trend', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          reservation_date::text as date,
          COUNT(*) as count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY reservation_date
        ORDER BY reservation_date
      ) t
    )
  ) INTO result;
  
  RETURN result;
END;
$$;
```

### 2. Route Changes

Add new route in `App.tsx`:
```tsx
<Route path="reservations/analytics" element={<ReservationAnalytics />} />
```

**Note**: Route is nested under admin, resulting in `/admin/reservations/analytics`

### 3. Create New Page: `src/pages/admin/ReservationAnalytics.tsx`

New analytics page following the Reports.tsx pattern:

**Features:**
- Date range filter (last 30 days default, custom date picker)
- Status multi-select filter
- Summary cards (Total, Confirmed, No-Show, Completion Rate)
- Status breakdown pie chart
- Peak days bar chart (Mon-Sun)
- Peak hours bar chart (hourly buckets)
- Pax distribution pie chart
- Daily trend line chart

**Role-Based Access:**
- Owner: Full access
- Manager: View-only (same content)
- Cashier/Employee/Driver: Denied (redirect to access denied)

### 4. Add Link from Reservations List

Update `src/pages/admin/Reservations.tsx` to add an "Analytics" button in the header area that links to `/admin/reservations/analytics`.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Create `get_reservation_analytics` RPC function |
| `src/pages/admin/ReservationAnalytics.tsx` | CREATE | New analytics dashboard page |
| `src/App.tsx` | MODIFY | Add route for `/admin/reservations/analytics` |
| `src/pages/admin/Reservations.tsx` | MODIFY | Add "Analytics" button in header |

---

## UI Components Structure

### Summary Cards Row (4 cards)
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Total           │ │ Confirmed       │ │ No-Show         │ │ Completion Rate │
│ Reservations    │ │                 │ │                 │ │                 │
│                 │ │                 │ │                 │ │                 │
│      42         │ │      35         │ │      3          │ │     83.3%       │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Derived Rates Card
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Key Rates                                                                   │
│                                                                             │
│  No-Show Rate: 8.5%    Confirmation Rate: 83%    Cancellation Rate: 12%     │
│  (no_show/confirmed)   (confirmed/total)         (cancelled*/total)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Breakdown Pie Chart
```
┌─────────────────────────────────────────┐
│ Reservations by Status                  │
│                                         │
│        [Pie Chart showing:              │
│         - Pending (yellow)              │
│         - Confirmed (green)             │
│         - Completed (emerald)           │
│         - Cancelled (red)               │
│         - Cancelled by Customer (orange)│
│         - No-Show (gray)]               │
└─────────────────────────────────────────┘
```

### Peak Days Bar Chart
```
┌─────────────────────────────────────────┐
│ Reservations by Day of Week             │
│                                         │
│ Mon ████████████ 15                     │
│ Tue █████████ 12                        │
│ Wed ██████ 8                            │
│ Thu ████████ 10                         │
│ Fri ███████████████ 18                  │
│ Sat ████████████████████ 25             │
│ Sun █████████████ 16                    │
└─────────────────────────────────────────┘
```

### Peak Hours Bar Chart
```
┌─────────────────────────────────────────┐
│ Reservations by Time Slot               │
│                                         │
│ [Bar chart showing hourly distribution] │
│                                         │
└─────────────────────────────────────────┘
```

### Pax Distribution
```
┌─────────────────────────────────────────┐
│ Party Size Distribution                 │
│                                         │
│  1-2: 25%   3-4: 45%   5-6: 20%  7+: 10%│
│                                         │
│       [Horizontal bar or pie chart]     │
└─────────────────────────────────────────┘
```

### Daily Trend
```
┌─────────────────────────────────────────┐
│ Reservation Volume Over Time            │
│                                         │
│ [Line chart showing daily reservation   │
│  count over selected date range]        │
│                                         │
└─────────────────────────────────────────┘
```

---

## Metrics Calculations

| Metric | Formula |
|--------|---------|
| Total Reservations | COUNT(*) |
| No-Show Rate | (no_show / confirmed) * 100 |
| Confirmation Rate | (confirmed / total) * 100 |
| Cancellation Rate | ((cancelled + cancelled_by_customer) / total) * 100 |
| Completion Rate | (completed / (confirmed - cancelled*)) * 100 |
| Average Pax | AVG(pax) |

---

## Filter Controls

### Date Range Selector
- Default: Last 30 days
- Quick presets: 7 days, 14 days, 30 days
- Custom date picker for specific range

### Status Filter (Optional, Multi-Select)
- All statuses (default)
- Specific status selection

---

## Access Control Implementation

```typescript
// In ReservationAnalytics.tsx
const { role } = useAuth();

// Only owner and manager can access
if (role !== 'owner' && role !== 'manager') {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
      <ShieldX className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-2xl font-bold">Access Denied</h2>
      <p className="text-muted-foreground max-w-md">
        You don't have permission to view reservation analytics.
      </p>
    </div>
  );
}
```

---

## Performance Considerations

1. **Server-Side Aggregation**: All calculations done in PostgreSQL via RPC function
2. **Indexed Queries**: Uses existing indexes on `reservation_date` and `status`
3. **No Heavy Client Processing**: Chart data pre-aggregated server-side
4. **No Pagination Needed**: Aggregated data only, not raw records

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Metrics match raw reservation data | Server-side RPC aggregation |
| No-show rate is accurate | `no_show / confirmed * 100` |
| Filters work correctly | Date range + status filters |
| Access is role-restricted | Owner/Manager only |
| UI is stable and readable | Following Reports.tsx pattern |
| Read-only display | No action buttons |
| No sales/payment data | Only reservation table used |

---

## What This Creates

1. `get_reservation_analytics` RPC function (server-side aggregation)
2. `/admin/reservations/analytics` page with full dashboard
3. Navigation link from Reservations list page
4. Role-based access control (owner/manager only)

---

## What This Does NOT Create

- Sales or revenue metrics
- Customer PII beyond aggregates
- Comparison to previous periods (V2)
- Data exports (V2)
- Predictions or forecasting
- Any write/edit capabilities

