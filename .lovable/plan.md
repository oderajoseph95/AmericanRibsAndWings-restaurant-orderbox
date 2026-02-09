
# Plan: Link Reservations to Customer Profiles

## Problem Analysis

Currently, reservations are **NOT linked** to customer profiles even though the `create_reservation` function creates a customer. There are two issues:

### Issue 1: No `customer_id` Column in Reservations
The `reservations` table doesn't have a `customer_id` column to link to customers.

### Issue 2: Phone Format Mismatch
- **Reservations** store phones as: `639762074276` (international format)
- **Customers** store phones as: `09164936064` (local format)

The `create_reservation` function tries to match by phone, but the format mismatch means matches fail!

### Current Data State
```
reservations.phone: 639214080286
customers.phone:    09164936064
                    ^^ Different format = no match!
```

---

## Solution

### Part 1: Add `customer_id` Column to Reservations

Add a foreign key to link reservations directly to customers:

```sql
ALTER TABLE reservations
ADD COLUMN customer_id UUID REFERENCES customers(id);
```

### Part 2: Normalize Phone Numbers in Database

Create a helper function to normalize phones for comparison:

```sql
CREATE OR REPLACE FUNCTION normalize_phone_for_match(phone TEXT) RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digits
  phone := regexp_replace(phone, '[^0-9]', '', 'g');
  
  -- Convert 09XXXXXXXXX to 639XXXXXXXXX
  IF phone ~ '^09[0-9]{9}$' THEN
    RETURN '63' || substring(phone from 2);
  END IF;
  
  -- Already in 63 format or other
  RETURN phone;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Part 3: Update `create_reservation` Function

Update the customer matching logic to normalize phones before comparison AND set `customer_id`:

```sql
-- Match customer by normalized phone OR email
SELECT id INTO v_customer_id
FROM customers
WHERE (p_email IS NOT NULL AND p_email != '' AND email = p_email)
   OR (normalize_phone_for_match(phone) = normalize_phone_for_match(p_phone))
LIMIT 1;

-- ...create or update customer...

-- Insert reservation WITH customer_id
INSERT INTO reservations (
  reservation_code, name, phone, email, pax,
  reservation_date, reservation_time, notes,
  status, preorder_items, idempotency_hash, 
  customer_id  -- NEW!
) VALUES (..., v_customer_id);
```

### Part 4: Backfill Existing Reservations

Link existing reservations to matching customers:

```sql
UPDATE reservations r
SET customer_id = c.id
FROM customers c
WHERE r.customer_id IS NULL
  AND (
    (r.email IS NOT NULL AND r.email = c.email)
    OR (normalize_phone_for_match(r.phone) = normalize_phone_for_match(c.phone))
  );
```

### Part 5: Update Customer Details Sheet

In `src/pages/admin/Customers.tsx`, add a "Recent Reservations" section:

```tsx
// Fetch reservations for selected customer
const { data: customerReservations = [] } = useQuery({
  queryKey: ['customer-reservations', selectedCustomer?.id],
  queryFn: async () => {
    if (!selectedCustomer) return [];
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('customer_id', selectedCustomer.id)
      .order('reservation_date', { ascending: false })
      .limit(10);
    if (error) return [];
    return data;
  },
  enabled: !!selectedCustomer,
});

// In the SheetContent, add:
<div>
  <h4 className="font-medium mb-3 flex items-center gap-2">
    <CalendarDays className="h-4 w-4" />
    Reservations ({customerReservations.length})
  </h4>
  {customerReservations.length === 0 ? (
    <p className="text-sm text-muted-foreground">No reservations</p>
  ) : (
    <div className="space-y-2">
      {customerReservations.map((res) => (
        <div key={res.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <p className="font-mono text-sm">{res.reservation_code}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(res.reservation_date), 'MMM d, yyyy')} at {res.reservation_time}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm">{res.pax} guests</p>
            <Badge variant="outline" className="text-xs capitalize">
              {res.status?.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## Data Flow After Fix

```
┌──────────────────────────────────────────────────────────────┐
│                    Customer makes reservation                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Customer submits: phone = "09171234567"                  │
│                                                              │
│  2. Frontend normalizes: phone = "639171234567"              │
│                                                              │
│  3. create_reservation() runs:                               │
│     ├─ Normalize for matching: 639171234567                  │
│     ├─ Look for existing customer by email OR phone          │
│     ├─ Create or update customer record                      │
│     ├─ Create reservation with customer_id link              │
│     └─ Return reservation code                               │
│                                                              │
│  4. Customer Detail Sheet shows:                             │
│     ├─ Recent Orders (from orders table)                     │
│     └─ Recent Reservations (from reservations table)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Customer Details Sheet Preview

```
┌─────────────────────────────────────────┐
│ Maria Santos                      [X]   │
├─────────────────────────────────────────┤
│ Phone: 09171234567                      │
│ Email: maria@email.com                  │
│ Total Orders: 5                         │
│ Total Spent: ₱4,500.00                  │
│ Customer Since: January 15, 2026        │
├─────────────────────────────────────────┤
│ 📍 Delivery Addresses                   │
│ ┌─────────────────────────────────────┐ │
│ │ 123 Main St, Floridablanca          │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ 📦 Recent Orders                        │
│ ┌─────────────────────────────────────┐ │
│ │ ORD-1234  Feb 5  ₱650  delivered    │ │
│ │ ORD-1189  Jan 28 ₱420  completed    │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ 📅 Reservations (2)              NEW!   │
│ ┌─────────────────────────────────────┐ │
│ │ ARW-RSV-4814  Feb 17 6PM  4 guests  │ │
│ │ confirmed                           │ │
│ ├─────────────────────────────────────┤ │
│ │ ARW-RSV-1234  Feb 10 7PM  2 guests  │ │
│ │ completed                           │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| Database Migration | **Create** | Add `customer_id` column, phone normalize function, update `create_reservation`, backfill data |
| `src/pages/admin/Customers.tsx` | **Modify** | Add reservations query and display section |

---

## Summary

| Before | After |
|--------|-------|
| Reservations have no link to customers | Reservations linked via `customer_id` |
| Phone format mismatch breaks matching | Normalized phone comparison works |
| Customer sheet shows only orders | Shows both orders AND reservations |
| Cannot see customer's reservation history | Full customer history visible |

This gives admins a complete 360° view of each customer's activity - both orders and reservations in one place!
