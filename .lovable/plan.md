

# Plan: Dashboard Reservation Alert + Customer Integration + Final Module Review

## Overview

This plan addresses three requirements:
1. **Dashboard Alert Banner** - "Reservations Today" at the top of the dashboard
2. **Customer List Integration** - Add reservation customers to the customers table
3. **Final Module Review** - Comprehensive check of the reservation system

---

## Part 1: Dashboard "Reservations Today" Alert Banner

### Problem
Admins can miss today's reservations because the stats card isn't immediately visible enough.

### Solution
Add a **prominent alert banner** at the very top of the dashboard (before all other content) that shows:
- Today's confirmed reservation count and total guests
- Names and times of upcoming reservations
- Attention-grabbing animation for pending reservations

### Visual Design

```
+-----------------------------------------------------------------------+
|  🔔 RESERVATIONS TODAY                                          View > |
+-----------------------------------------------------------------------+
|                                                                       |
|  3 confirmed reservations | 12 total guests                           |
|                                                                       |
|  12:30 PM - John (4)  •  2:00 PM - Maria (6)  •  5:30 PM - Carlo (2)  |
|                                                                       |
|  ⚠️ 2 pending need confirmation                                       |
+-----------------------------------------------------------------------+
```

### Implementation

**New Component: `src/components/admin/TodayReservationsAlert.tsx`**

Features:
- Query for today's confirmed + pending reservations
- Display count, total pax, and upcoming guest names with times
- Pulse animation when pending count > 0
- Collapsible (remembers state in localStorage)
- Clickable to navigate to `/admin/reservations?filter=today`
- Color scheme: Primary blue for confirmed, amber for pending alerts

**Dashboard Integration:**

Add immediately after the header section (before LiveVisitorsCard):

```tsx
{/* Today's Reservations Alert */}
<TodayReservationsAlert />

{/* Live Visitors & Conversion Funnel */}
<div className="grid gap-4...">
```

### Query Structure

```typescript
// Fetch today's reservations with details
const { data: todayReservations } = useQuery({
  queryKey: ['today-reservations-alert'],
  queryFn: async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('reservations')
      .select('id, name, pax, reservation_time, status')
      .eq('reservation_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('reservation_time', { ascending: true });
    if (error) throw error;
    return data;
  },
  refetchInterval: 60000, // Refresh every minute
});
```

---

## Part 2: Add Reservation Customers to Customer List

### Problem
When a customer makes a reservation, they are NOT added to the `customers` table. This means:
- Admin cannot see reservation history in customer details
- No customer profile is created for future orders
- We already have their name, phone, and email

### Solution
Modify the `create_reservation` RPC function to:
1. Check if customer exists (by phone or email)
2. If exists, update name and link reservation (optional future: add customer_id to reservations)
3. If not, create new customer record

### Pattern Reference
This matches how `create_checkout_customer` works:

```sql
-- Check if customer with same email or phone exists
SELECT id INTO v_customer_id
FROM customers
WHERE (p_email IS NOT NULL AND email = p_email)
   OR (p_phone IS NOT NULL AND phone = p_phone)
LIMIT 1;

-- If existing customer found, update name and return
IF v_customer_id IS NOT NULL THEN
  UPDATE customers
  SET name = trim(p_name),
      email = COALESCE(NULLIF(trim(p_email), ''), email),
      phone = COALESCE(NULLIF(trim(p_phone), ''), phone)
  WHERE id = v_customer_id;
  RETURN v_customer_id;
END IF;

-- Create new customer
INSERT INTO customers (name, email, phone) VALUES (...);
```

### Database Migration

**Update `create_reservation` function:**

Add this block before the INSERT into reservations:

```sql
-- ========== CUSTOMER UPSERT ==========
DECLARE
  v_customer_id UUID;
BEGIN
  -- Check if customer exists by phone or email
  SELECT id INTO v_customer_id
  FROM customers
  WHERE (p_email IS NOT NULL AND p_email != '' AND email = p_email)
     OR (phone = p_phone)
  LIMIT 1;
  
  IF v_customer_id IS NOT NULL THEN
    -- Update existing customer
    UPDATE customers
    SET name = COALESCE(TRIM(p_name), name),
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        updated_at = now()
    WHERE id = v_customer_id;
  ELSE
    -- Create new customer
    INSERT INTO customers (name, phone, email)
    VALUES (
      TRIM(p_name),
      TRIM(p_phone),
      NULLIF(TRIM(p_email), '')
    )
    RETURNING id INTO v_customer_id;
  END IF;
END;
-- ========== END CUSTOMER UPSERT ==========
```

### Future Enhancement (Optional)
Add `customer_id` column to reservations table to link reservations to customers. For now, we can match by phone number when viewing customer details.

---

## Part 3: Final Module Review

### Review Checklist

| Component | Status | Notes |
|-----------|--------|-------|
| **ReservationForm.tsx** | OK | Submits via RPC, passes all data to confirmation |
| **ReservationConfirmation.tsx** | OK | Shows code, details, PDF download, tracking link |
| **ReservationTicket.tsx** | OK | Generates PDF with QR code |
| **ReservationTracking.tsx** | OK | Uses reservation_code only, customer can cancel |
| **Reservations.tsx (admin list)** | OK | Filters work, pagination works |
| **ReservationDetail.tsx** | FIXED | No longer generates duplicate code |
| **ReservationStatsCard.tsx** | OK | Shows 4 metrics, respects date filter |
| **ReservationSettings.tsx** | OK | Admin can configure settings |
| **ReservationAnalytics.tsx** | EXISTS | Analytics page available |
| **Email notifications** | FIXED | Subject functions updated |
| **SMS notifications** | OK | Uses reservation_code |
| **process-no-shows** | FIXED | Uses reservation_code only |
| **send-reservation-reminder** | FIXED | Uses reservation_code only |

### Items Previously Fixed
1. Single code system (removed confirmation_code generation)
2. Email subject functions (added new_reservation, reservation_confirmed)
3. Admin email templates for confirmations/cancellations
4. Reservation tracking page uses single code

### Remaining Items to Implement
1. **TodayReservationsAlert** component (Part 1)
2. **Customer upsert in create_reservation** (Part 2)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/TodayReservationsAlert.tsx` | **Create** | Alert banner for today's reservations |
| `src/pages/admin/Dashboard.tsx` | Modify | Add TodayReservationsAlert at top |
| Database migration | **Create** | Update create_reservation to upsert customers |

---

## Technical Implementation Details

### TodayReservationsAlert Component

```tsx
// Key features:
// 1. Fetch today's pending + confirmed reservations
// 2. Calculate total guests
// 3. Show upcoming names/times in a horizontal scroll
// 4. Pulse animation on pending count badge
// 5. Collapsible with localStorage persistence
// 6. Auto-refresh every minute
```

### Attention-Grabbing UX
- **Pulse animation** on pending badge (already used in ReservationStatsCard)
- **Color coding**: Blue border for normal, amber/orange for pending attention
- **Sound option** (future): Could add notification sound for new pending
- **Sticky positioning** (optional): Keep visible as user scrolls

### Database Migration SQL

```sql
-- Update create_reservation to add customers
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_name text, 
  p_phone text, 
  p_email text DEFAULT NULL,
  p_pax integer,
  p_reservation_date date,
  p_reservation_time time,
  p_notes text DEFAULT NULL,
  p_preorder_items jsonb DEFAULT NULL
)
RETURNS TABLE(id uuid, reservation_code text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_hash TEXT;
  v_existing_id UUID;
  v_customer_id UUID;
  -- ... existing declarations
BEGIN
  -- ... existing validation ...
  
  -- ========== NEW: CUSTOMER UPSERT ==========
  SELECT customers.id INTO v_customer_id
  FROM customers
  WHERE (p_email IS NOT NULL AND p_email != '' AND customers.email = p_email)
     OR (customers.phone = p_phone)
  LIMIT 1;
  
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET name = COALESCE(TRIM(p_name), customers.name),
        email = COALESCE(NULLIF(TRIM(p_email), ''), customers.email),
        updated_at = now()
    WHERE customers.id = v_customer_id;
  ELSE
    INSERT INTO customers (name, phone, email)
    VALUES (TRIM(p_name), TRIM(p_phone), NULLIF(TRIM(p_email), ''))
    RETURNING customers.id INTO v_customer_id;
  END IF;
  -- ========== END CUSTOMER UPSERT ==========
  
  -- ... rest of existing function ...
END;
$$;
```

---

## Summary

| Task | Priority | Complexity |
|------|----------|------------|
| TodayReservationsAlert banner | High | Medium |
| Customer upsert migration | High | Low |
| Final review verification | Medium | Done |

This plan ensures:
1. Admins never miss today's reservations with prominent dashboard alert
2. Reservation customers are captured in the customer list for future marketing and history
3. The reservation module is comprehensively reviewed and confirmed working

