

# Fix Admin Order Details - Show Ribs Flavors Separately from Wings

## Problem
The admin order details view shows ALL flavors with "for X wings" label, but it should:
1. Group **Ribs flavors** separately with "Ribs" header (like customer view shows)
2. Group **Wings flavors** separately with "X pcs Chicken Wings" header
3. Show which type of ribs (Half-Rack, Full-Rack, Pork Ribs Portion)

Customer view shows this correctly because Cart.tsx uses the `category` field on flavors. But the admin view doesn't have this data because the category isn't saved to the database.

## Solution
Since the `category` field isn't in the database, we need to **infer it from the bundle_components table**:
- Fetch bundle components WITH `has_flavor_selection = true` (ribs and wings components)
- Use component names to identify which is ribs vs wings
- Match flavors to their component type by comparing the flavor quantity pattern

---

## Technical Changes

### 1. Add Query for Flavor-Selectable Components
Add a second query to fetch bundle components where `has_flavor_selection = true`:

```typescript
// Fetch flavor-selectable components (ribs, wings) to categorize flavors
const { data: flavorSelectableComponents = [] } = useQuery({
  queryKey: ['bundle-flavor-components', bundleProductIds],
  queryFn: async () => {
    if (bundleProductIds.length === 0) return [];
    const { data, error } = await supabase
      .from('bundle_components')
      .select('*, component_product:products!bundle_components_component_product_id_fkey(name)')
      .in('bundle_product_id', bundleProductIds)
      .eq('has_flavor_selection', true);
    if (error) throw error;
    return data;
  },
  enabled: bundleProductIds.length > 0,
});
```

### 2. Create Helper Function to Categorize Flavors
Add a function that determines if a flavor is for ribs or wings based on the bundle components:

```typescript
// Helper to categorize flavors as ribs or wings based on bundle components
const categorizeFlavorForBundle = (
  productId: string, 
  flavorQuantity: number, 
  components: typeof flavorSelectableComponents
) => {
  const bundleComps = components.filter(c => c.bundle_product_id === productId);
  
  // Find ribs component (total_units = 1, units_per_flavor = 1)
  const ribsComponent = bundleComps.find(c => {
    const name = (c.component_product as any)?.name?.toLowerCase() || '';
    return name.includes('rib');
  });
  
  // Find wings component
  const wingsComponent = bundleComps.find(c => {
    const name = (c.component_product as any)?.name?.toLowerCase() || '';
    return name.includes('wing') || name.includes('ala carte');
  });
  
  // Determine category based on component characteristics
  if (ribsComponent && ribsComponent.total_units === 1 && flavorQuantity === 1) {
    return {
      category: 'ribs',
      componentName: (ribsComponent.component_product as any)?.name || 'Ribs'
    };
  }
  
  // Wings typically have quantity divisible by units_per_flavor (usually 3)
  if (wingsComponent && flavorQuantity > 1) {
    return {
      category: 'wings',
      componentName: (wingsComponent.component_product as any)?.name || 'Chicken Wings',
      totalWings: wingsComponent.total_units
    };
  }
  
  // Default to ribs for qty=1, wings otherwise
  return flavorQuantity === 1 
    ? { category: 'ribs', componentName: 'Ribs' }
    : { category: 'wings', componentName: 'Wings' };
};
```

### 3. Update Items Rendering Section (lines 1611-1623)
Replace the flat flavor list with grouped sections:

```tsx
{item.order_item_flavors.length > 0 && isBundle && (
  <div className="pl-4 space-y-1.5">
    {/* Ribs Section */}
    {(() => {
      const ribsFlavors = item.order_item_flavors.filter(f => 
        categorizeFlavorForBundle(item.product_id!, f.quantity, flavorSelectableComponents).category === 'ribs'
      );
      if (ribsFlavors.length === 0) return null;
      
      // Get ribs component name to show type
      const ribsComp = flavorSelectableComponents.find(c => 
        c.bundle_product_id === item.product_id && 
        (c.component_product as any)?.name?.toLowerCase().includes('rib')
      );
      const ribsType = (ribsComp?.component_product as any)?.name?.replace(/\s*\(.*\)/, '') || 'Ribs';
      
      return (
        <div className="space-y-0.5">
          <span className="text-xs font-medium text-muted-foreground">{ribsType}:</span>
          {ribsFlavors.map((f, idx) => (
            <div key={idx} className="flex justify-between text-xs text-muted-foreground ml-2">
              <span>• {f.flavor_name}</span>
              {f.surcharge_applied > 0 && (
                <span className="text-orange-500">+₱{f.surcharge_applied.toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>
      );
    })()}
    
    {/* Wings Section */}
    {(() => {
      const wingsFlavors = item.order_item_flavors.filter(f => 
        categorizeFlavorForBundle(item.product_id!, f.quantity, flavorSelectableComponents).category === 'wings'
      );
      if (wingsFlavors.length === 0) return null;
      
      const totalWings = wingsFlavors.reduce((sum, f) => sum + f.quantity, 0);
      
      return (
        <div className="space-y-0.5">
          <span className="text-xs font-medium text-muted-foreground">{totalWings} pcs Chicken Wings:</span>
          {wingsFlavors.map((f, idx) => (
            <div key={idx} className="flex justify-between text-xs text-muted-foreground ml-2">
              <span>• {f.flavor_name} (for {f.quantity} wings)</span>
              {f.surcharge_applied > 0 && (
                <span className="text-orange-500">+₱{f.surcharge_applied.toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>
      );
    })()}
  </div>
)}

{/* Non-bundle items keep original flat list */}
{item.order_item_flavors.length > 0 && !isBundle && (
  <div className="pl-4 text-xs text-muted-foreground">
    {item.order_item_flavors.map((f, idx) => (
      <div key={idx} className="flex justify-between">
        <span>{f.flavor_name} ({f.quantity} pcs)</span>
        {f.surcharge_applied > 0 && (
          <span className="text-orange-500">+₱{f.surcharge_applied.toFixed(2)}</span>
        )}
      </div>
    ))}
  </div>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/Orders.tsx` | Add flavorSelectableComponents query, add categorizeFlavorForBundle helper, update items rendering to group ribs/wings |

---

## Result
Admin order details will now show:
- **Ribs section** with component name (e.g., "Half-Rack Ribs (500g):") and flavor
- **Wings section** with total count (e.g., "12 pcs Chicken Wings:") and flavors with "for X wings" labels
- **Included items section** (already working from previous change)

This matches exactly what customers see in their cart and order summary.

---

## What This Protects
- Customer-facing pages remain unchanged
- Cart, Checkout, and BundleWizard remain unchanged
- Non-bundle products display unchanged
- Existing ARW Group Meals work correctly
- New Valentine Group Meals work correctly

