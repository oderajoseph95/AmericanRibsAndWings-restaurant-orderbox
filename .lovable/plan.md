
# Valentine Group Meals Implementation Plan

## Overview

This plan adds 4 Valentine Group Meals to the existing "Groups" category, using the **exact same architecture** as ARW Group Meals 1 & 2. No code changes are needed to the BundleWizard, Cart, Checkout, or other components - they already fully support this structure.

---

## Phase 1: Create Bundle-Only Component Products (₱0 price)

These products are **only used as bundle components** and will never appear in the menu (₱0 price is filtered out). They use existing flavor logic.

### Products to Create

| Product Name | Price | Type | Purpose |
|--------------|-------|------|---------|
| Red Wine (Bundle) | ₱0 | simple | Included item for Valentine meals |
| Bento Cake (Bundle) | ₱0 | simple | Included item for Valentine meals |
| Pork Ribs Portion (2 pcs) | ₱0 | flavored | For "Wings of Love" - uses wings flavors |

**Note:** Existing products to reuse:
- `Coleslaw Salad (150g)` - ₱99, already exists
- `Combo Fries` - ₱0, already exists
- `Java Rice` - ₱40, already exists
- `Half-Rack Ribs (500g)` - ₱549, already exists (flavor-selectable)
- `Full-Rack Ribs (1kg)` - ₱999, already exists (flavor-selectable)
- Wing Ala Carte products - already exist with correct slot configs

---

## Phase 2: Create Valentine Group Meal Products

All 4 products go in the "Groups" category (ID: `dce950f7-15f1-4fcf-8a55-04a154f93d25`)

### Product A: Forever Us - ₱2,799

| Field | Value |
|-------|-------|
| name | Forever Us |
| price | 2799.00 |
| product_type | bundle |
| category_id | dce950f7-15f1-4fcf-8a55-04a154f93d25 |
| description | Valentine's Day Special! Full rack ribs, 18 pcs wings, 8 cups java rice, fries, coleslaw, wine & cake |

### Product B: Love on the Ribs - ₱1,999

| Field | Value |
|-------|-------|
| name | Love on the Ribs |
| price | 1999.00 |
| product_type | bundle |
| category_id | dce950f7-15f1-4fcf-8a55-04a154f93d25 |
| description | Valentine's Day Special! Half rack ribs, 12 pcs wings, 4 cups java rice, fries, coleslaw, wine & cake |

### Product C: Valentine Classic - ₱1,699

| Field | Value |
|-------|-------|
| name | Valentine Classic |
| price | 1699.00 |
| product_type | bundle |
| category_id | dce950f7-15f1-4fcf-8a55-04a154f93d25 |
| description | Valentine's Day Special! Half rack ribs, 6 pcs wings, 2 cups java rice, fries, coleslaw, wine & cake |

### Product D: Wings of Love - ₱1,699

| Field | Value |
|-------|-------|
| name | Wings of Love |
| price | 1699.00 |
| product_type | bundle |
| category_id | dce950f7-15f1-4fcf-8a55-04a154f93d25 |
| description | Valentine's Day Special! 12 pcs wings, 2 pcs ribs, 2 cups java rice, fries, coleslaw, wine & cake |

---

## Phase 3: Configure Bundle Components

### Forever Us (₱2,799) - 7 Components

| Component | has_flavor_selection | total_units | units_per_flavor | quantity | required_flavors |
|-----------|---------------------|-------------|------------------|----------|------------------|
| Full-Rack Ribs (1kg) | true | 1 | 1 | 1 | 1 |
| Wing Ala Carte 4 (18 pcs) | true | 18 | 3 | 1 | 6 |
| Java Rice | false | 8 | 1 | 8 | null |
| Combo Fries | false | 1 | 1 | 1 | null |
| Coleslaw Salad (150g) | false | 1 | 1 | 1 | null |
| Red Wine (Bundle) | false | 1 | 1 | 1 | null |
| Bento Cake (Bundle) | false | 1 | 1 | 1 | null |

### Love on the Ribs (₱1,999) - 7 Components

| Component | has_flavor_selection | total_units | units_per_flavor | quantity | required_flavors |
|-----------|---------------------|-------------|------------------|----------|------------------|
| Half-Rack Ribs (500g) | true | 1 | 1 | 1 | 1 |
| Wing Ala Carte 3 (12 pcs) | true | 12 | 3 | 1 | 4 |
| Java Rice | false | 4 | 1 | 4 | null |
| Combo Fries | false | 1 | 1 | 1 | null |
| Coleslaw Salad (150g) | false | 1 | 1 | 1 | null |
| Red Wine (Bundle) | false | 1 | 1 | 1 | null |
| Bento Cake (Bundle) | false | 1 | 1 | 1 | null |

### Valentine Classic (₱1,699) - 7 Components

| Component | has_flavor_selection | total_units | units_per_flavor | quantity | required_flavors |
|-----------|---------------------|-------------|------------------|----------|------------------|
| Half-Rack Ribs (500g) | true | 1 | 1 | 1 | 1 |
| Wing Ala Carte 2 (6 pcs) | true | 6 | 3 | 1 | 2 |
| Java Rice | false | 2 | 1 | 2 | null |
| Combo Fries | false | 1 | 1 | 1 | null |
| Coleslaw Salad (150g) | false | 1 | 1 | 1 | null |
| Red Wine (Bundle) | false | 1 | 1 | 1 | null |
| Bento Cake (Bundle) | false | 1 | 1 | 1 | null |

### Wings of Love (₱1,699) - 7 Components

| Component | has_flavor_selection | total_units | units_per_flavor | quantity | required_flavors |
|-----------|---------------------|-------------|------------------|----------|------------------|
| Wing Ala Carte 3 (12 pcs) | true | 12 | 3 | 1 | 4 |
| Pork Ribs Portion (2 pcs) | true | 1 | 1 | 1 | 1 |
| Java Rice | false | 2 | 1 | 2 | null |
| Combo Fries | false | 1 | 1 | 1 | null |
| Coleslaw Salad (150g) | false | 1 | 1 | 1 | null |
| Red Wine (Bundle) | false | 1 | 1 | 1 | null |
| Bento Cake (Bundle) | false | 1 | 1 | 1 | null |

---

## Phase 4: Update BundleWizard Display Names

The BundleWizard needs a minor update to display "Red Wine" and "Bento Cake" correctly in the included items section (lines 274-280):

```typescript
// Add to displayName handling in handleConfirm():
} else if (displayName.toLowerCase().includes('wine')) {
  displayName = 'Red Wine';
} else if (displayName.toLowerCase().includes('cake')) {
  displayName = 'Bento Cake';
}

// Add to displayName handling in review step (lines 507-523):
} else if (displayName.toLowerCase().includes('wine')) {
  displayName = 'Red Wine';
} else if (displayName.toLowerCase().includes('cake')) {
  displayName = 'Bento Cake';
}
```

---

## Technical Details

### Pricing Logic (Unchanged)
- Base price is FIXED (₱1,699 / ₱1,999 / ₱2,799)
- Only SPECIAL flavors add ₱40 surcharge
- Surcharge is per DISTINCT special flavor, NOT per piece/slot
- Example: Using "#13 Vintage Garlic Butter" for ribs AND wings = +₱40 each = +₱80 total

### BundleWizard Flow (Already Works)
1. Step 1: Choose Ribs Flavor (radio select, single choice)
2. Step 2: Choose Wings Flavors (slot-based, +/- buttons)
3. Step 3: Review (shows all selections + included items)

### Display Rules (Already Work)
- Ribs: Show as single flavor selection
- Wings: Show "for X wings" format
- Included items: Show with green "Included" badge
- No quantity multipliers (×) in display

---

## Database Migration Summary

### SQL Operations Required

1. **Create component products** (Red Wine Bundle, Bento Cake Bundle, Pork Ribs Portion)
2. **Create 4 Valentine Group Meal products** in Groups category
3. **Insert bundle_components** linking each meal to its components

### No Schema Changes Needed
The existing `products`, `bundle_components`, and `flavors` tables already have all required columns.

---

## Code Changes Summary

### Files to Modify

| File | Change |
|------|--------|
| `src/components/customer/BundleWizard.tsx` | Add "wine" and "cake" display name mappings (6 lines) |

### Files NOT Changed (Already Support This)
- `src/components/customer/Cart.tsx` - Already handles bundles with includedItems
- `src/components/customer/CheckoutSheet.tsx` - Already displays bundle data correctly
- `src/components/customer/checkout/CompactOrderSummary.tsx` - Already shows inclusions
- `src/pages/Order.tsx` - Already routes bundles to BundleWizard
- All admin/order views - Already use normalized rendering

---

## Verification Checklist

After implementation, verify:

1. All 4 Valentine meals appear in "Groups" category on order page
2. Clicking each meal opens BundleWizard with correct steps
3. Ribs flavor selection works (radio buttons, single select)
4. Wings flavor selection works (slot-based, fills all slots)
5. Special flavor surcharges calculate correctly (₱40 per distinct)
6. Review step shows all selections + included items
7. Cart displays correctly with grouped flavors and inclusions
8. Checkout summary shows complete breakdown
9. Order confirmation stores correct data
10. Admin order view shows all components correctly

---

## Risk Mitigation

### What This Plan Protects
- Existing ARW Group Meals continue to work unchanged
- Rice Meals with Java Rice upgrade unaffected
- All ala carte products unaffected
- Checkout flow unchanged
- Cart persistence unchanged
- Order submission unchanged

### Why This Is Safe
- Using exact same database structure as existing bundles
- Using exact same BundleWizard component
- Only adding new products and data rows
- Minimal code change (display name mapping only)
