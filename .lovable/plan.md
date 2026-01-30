
## Investigation Summary: Order ORD-20260130-0761 Overcharge

### Finding: Customer Was Overcharged by ₱80

**Order Details:**
- Pork Ribs Strips (2 pcs): ₱299
- Fried Chicken (1 pc - Thigh & Leg): ₱159
- **Correct Subtotal: ₱458**
- **Charged Subtotal: ₱538** (₱80 overcharge)

### Root Cause Identified

The order was placed **before** today's fix was deployed. The customer had the old JavaScript code cached in their browser.

**Technical Explanation:**
1. The order-level `subtotal` was calculated using `item.lineTotal` values from the cart state
2. These `lineTotal` values can become stale or incorrect when items are modified or the cart is restored from localStorage
3. The ₱80 difference is exactly 2 x ₱40 (the Java Rice upgrade price), suggesting the cart state had incorrect surcharge calculations

**Evidence:**
- Database `order_items` table shows correct values: ₱299 + ₱159 = ₱458
- Database `orders` table shows wrong subtotal: ₱538
- This order is the **only one** with a mismatch since January 29th

### Fix Already Deployed (Earlier Today)

I implemented a fix that recalculates the subtotal from source data at the moment of order submission:

```text
calculatedSubtotal = sum of:
  - (item.quantity x item.product.price)
  - + flavor surcharges
  - + included item surcharges (e.g., Java Rice)
```

This prevents stale `lineTotal` values from causing incorrect charges.

### Recommended Action

**Refund ₱80 to the customer** for order ORD-20260130-0761:
- Customer: Angelica Dacanay (09425544743)
- Original charge: ₱607
- Correct charge: ₱527
- Refund amount: ₱80

Alternatively, update the database record:
```sql
UPDATE orders 
SET subtotal = 458.00, total_amount = 527.00
WHERE order_number = 'ORD-20260130-0761';
```

### Additional Finding: Missing Data Storage

The `includedItems` surcharges (like Java Rice upgrade) are currently not being saved to `order_items`. This makes auditing difficult. A future improvement would be to:
1. Add an `included_surcharge_total` column to `order_items`
2. Store included items in a separate table for complete audit trail
