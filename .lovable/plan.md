

# Plan: Extend Pickup/Delivery Dates + Admin Order Editing

## Overview

This plan addresses two requests:
1. **Extend pickup/delivery date window to 30 days** (currently 3 days)
2. **Add admin ability to edit orders** (pickup/delivery date, time, line items, customer info)

---

## Part 1: Extend Pickup/Delivery Date Window to 30 Days

### Current State
In `src/components/customer/CheckoutSheet.tsx`, date selection is limited by this logic:

**Line 1129 (Pickup Date Calendar):**
```typescript
disabled={date => isBefore(date, startOfDay(new Date())) || isBefore(addDays(new Date(), 3), date)}
```

**Line 1313 (Delivery Date Calendar):**
```typescript
disabled={date => isBefore(date, startOfDay(new Date())) || isBefore(addDays(new Date(), 3), date)}
```

Both currently limit to **today + 3 days**.

### Solution
Change `addDays(new Date(), 3)` to `addDays(new Date(), 30)` in both locations.

### Files to Modify
| File | Change |
|------|--------|
| `src/components/customer/CheckoutSheet.tsx` | Update 2 calendar `disabled` props from 3 to 30 days |

---

## Part 2: Admin Order Editing Capability

### Current State
The admin order detail panel (`src/pages/admin/Orders.tsx`) currently displays order information in **read-only mode**:
- Pickup/delivery date/time shown as formatted text
- Line items shown as a list
- Customer info shown as text
- No inline editing capability

### Solution
Create a comprehensive **Order Edit Dialog** component that allows admins to:
1. Edit pickup date and time (for pickup orders)
2. Edit delivery date and time (for delivery orders)
3. Edit line items (quantity, remove items)
4. Edit customer information (name, phone, email)
5. Edit internal notes (already exists)
6. Edit delivery address (for delivery orders)

### Implementation Approach

#### A. Create New Component: `OrderEditDialog.tsx`

New file: `src/components/admin/OrderEditDialog.tsx`

**Features:**
- Modal dialog triggered by "Edit Order" button in order detail sheet
- Tabs or sections for different editable areas:
  - **Schedule Tab**: Date/time pickers for pickup or delivery
  - **Items Tab**: List of line items with quantity adjustment and remove option
  - **Customer Tab**: Editable name, phone, email fields
  - **Delivery Tab** (if delivery order): Editable address

**Schedule Editing:**
- Date picker allowing today to 30 days in future
- Time picker using same slot generation logic as checkout
- Different fields based on order type (pickup vs delivery)

**Line Items Editing:**
- Display each item with current quantity
- +/- buttons to adjust quantity
- Remove button with confirmation
- Auto-recalculate subtotal and total when items change

**Customer Info Editing:**
- Editable fields for name, phone, email
- Phone validation (Philippine format)
- Update linked customer record

#### B. Add Edit Button to Order Detail Sheet

In `src/pages/admin/Orders.tsx`, add an "Edit Order" button at the top of the order detail sheet that opens the edit dialog.

**Placement:** Near the order header, visible for all active orders

#### C. Add Edit Mutations

Create mutations for:
1. `updateOrderSchedule` - Update pickup_date, pickup_time, delivery_date, delivery_time
2. `updateOrderItems` - Update item quantities, remove items, recalculate totals
3. `updateOrderCustomer` - Update customer name, phone, email

#### D. Logging & Audit Trail

All edits will be logged via `logAdminAction()` with:
- Old values
- New values
- Details of what was changed

---

## Technical Details

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/customer/CheckoutSheet.tsx` | MODIFY | Change date limit from 3 to 30 days in 2 locations |
| `src/components/admin/OrderEditDialog.tsx` | CREATE | New comprehensive order editing dialog |
| `src/pages/admin/Orders.tsx` | MODIFY | Add Edit button and integrate OrderEditDialog |

### OrderEditDialog Component Structure

```typescript
interface OrderEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  orderItems: OrderItem[];
  onSuccess: () => void;
}

// Sections/Tabs:
// 1. Schedule - pickup/delivery date & time
// 2. Items - line items with quantity edit
// 3. Customer - name, phone, email
// 4. Delivery - address (if delivery order)
```

### Database Updates

**For Schedule Changes:**
```sql
UPDATE orders SET 
  pickup_date = ?, pickup_time = ? -- or delivery_date, delivery_time
WHERE id = ?
```

**For Line Item Changes:**
```sql
-- Update quantity
UPDATE order_items SET quantity = ?, subtotal = ?, line_total = ? WHERE id = ?

-- Delete item
DELETE FROM order_items WHERE id = ?

-- Recalculate order totals
UPDATE orders SET subtotal = ?, total_amount = ? WHERE id = ?
```

**For Customer Changes:**
```sql
UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?
```

### UI/UX Design

**Edit Button Location:**
- In the order detail sheet header, next to the status badge
- Icon: Pencil (Edit) icon
- Label: "Edit Order"

**Dialog Layout:**
```
┌─────────────────────────────────────────────────┐
│  Edit Order #ORD-20260209-ABC123                │
├─────────────────────────────────────────────────┤
│  [Schedule] [Items] [Customer] [Delivery?]      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Schedule Tab Content:                          │
│  ┌─────────────────────────────────────────┐   │
│  │ Pickup/Delivery Date:  [Date Picker]    │   │
│  │ Pickup/Delivery Time:  [Time Select]    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│              [Cancel]  [Save Changes]           │
└─────────────────────────────────────────────────┘
```

**Items Tab Layout:**
```
┌─────────────────────────────────────────────────┐
│  Line Items                                     │
├─────────────────────────────────────────────────┤
│  Babyback Ribs (1 Slab)         ₱649           │
│  [-] 2 [+]  Subtotal: ₱1,298    [Remove]       │
│                                                 │
│  Chicken Wings (6pcs)            ₱199          │
│  [-] 1 [+]  Subtotal: ₱199      [Remove]       │
├─────────────────────────────────────────────────┤
│  New Subtotal: ₱1,497                          │
│  Delivery Fee: ₱60                             │
│  New Total: ₱1,557                             │
└─────────────────────────────────────────────────┘
```

### Time Slot Generation

Reuse existing time slot generation functions from checkout:
- Pickup: 11 AM - 9 PM (15-min intervals)
- Delivery: 12 PM - 8 PM (15-min intervals)

For admin editing, we can allow past times on the selected date (flexibility for corrections).

### Validation Rules

1. **Date Range**: Today to 30 days in future
2. **Time Slots**: Within operating hours
3. **Quantity**: Minimum 1, maximum reasonable limit
4. **Phone**: Philippine format validation
5. **Email**: Standard email validation

### Notifications After Edit

When significant changes are made (date/time changes), optionally:
- Send customer notification about updated schedule
- Log the change for audit purposes

---

## Safety & Backwards Compatibility

1. **No database schema changes required** - All fields already exist in orders and order_items tables
2. **Existing checkout flow unchanged** - Only extending date range
3. **Existing order display unchanged** - Only adding edit capability
4. **All changes logged** - Full audit trail via admin_logs

---

## Acceptance Criteria

### Part 1: Extended Date Range
- Customers can select pickup dates up to 30 days in the future
- Customers can select delivery dates up to 30 days in the future
- Today remains the minimum date

### Part 2: Admin Order Editing
- Admin can click "Edit Order" button on any order
- Admin can change pickup/delivery date and time
- Admin can adjust line item quantities
- Admin can remove line items (with confirmation)
- Admin can edit customer name, phone, email
- Admin can edit delivery address (for delivery orders)
- All changes are logged with old/new values
- Totals auto-recalculate when items change
- Toast notifications confirm successful saves

