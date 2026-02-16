

# Fix: FlavorModal Shows Wrong Flavors for Fries Products

## Problem

The `FlavorModal` component (line 92) hardcodes `flavor_category === 'wings'` when filtering available flavors. This means when a customer orders **Potato Fries 100g** or **Potato Fries 200g**, they see wing/rib sauces (like Hot Buffalo, Garlic Parmesan) instead of the actual fries flavors (Cheddar Explosion, Pizza Indulgence, Savory Truffle, Smoked BBQ).

The database has 4 fries flavors properly categorized as `flavor_category: 'fries'`, but the modal never shows them.

## Solution

Use the same `getFlavorCategory` logic from `BundleWizard` to determine which flavor category to show based on the product name. If the product name contains "fries" or "fry", show fries flavors. Otherwise default to wings.

### Changes to `src/components/customer/FlavorModal.tsx`

**Replace the hardcoded filter (line 90-93):**

```typescript
// Before (broken):
const availableFlavors = useMemo(() => {
  return flavors.filter((f) => f.is_active && (f as any).flavor_category === 'wings');
}, [flavors]);

// After (fixed):
const availableFlavors = useMemo(() => {
  const lower = product.name.toLowerCase();
  let category = 'wings'; // default
  if (lower.includes('fries') || lower.includes('fry')) category = 'fries';
  if (lower.includes('drink') || lower.includes('beverage')) category = 'drinks';
  return flavors.filter((f) => f.is_active && (f as any).flavor_category === category);
}, [flavors, product.name]);
```

This is a 3-line change to one file. No other files need modification.

### Result

- **Potato Fries 100g/200g**: Will show Cheddar Explosion, Pizza Indulgence, Savory Truffle, Smoked BBQ
- **Combo Fries**: Will show fries flavors
- **Wings/Ribs products**: Continue showing wing sauces as before
- **Drinks products**: Would show drink flavors if any are added

