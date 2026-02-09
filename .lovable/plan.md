

# Fix Admin Order Details to Show Bundle Inclusions

## Problem
The admin order details view is missing the "Included in this meal" section that shows bundle components like Coleslaw, Fries, Red Wine, Bento Cake, and Java Rice. The customer view shows these correctly, but the admin doesn't see them.

## Root Cause
1. The `order_items` query doesn't join the `products` table to get `product_type`
2. The admin view doesn't fetch `bundle_components` for bundle products
3. The items rendering section (lines 1572-1600) only shows flavors, not included items

## Solution
Update the admin Orders page to:
1. Fetch product info with order items to identify bundles
2. Fetch bundle components for any bundle products
3. Display included items (components with `has_flavor_selection = false`) with green "Included" badges

---

## Technical Changes

### 1. Update OrderItem Type
Add product relationship to include `product_type`:
```typescript
type OrderItem = Tables<'order_items'> & {
  order_item_flavors: Tables<'order_item_flavors'>[];
  products: { product_type: string | null } | null;
};
```

### 2. Update Order Items Query (lines 240-252)
Add products join to get product_type:
```typescript
const { data: orderItems = [] } = useQuery({
  queryKey: ['order-items', selectedOrder?.id],
  queryFn: async () => {
    if (!selectedOrder) return [];
    const { data, error } = await supabase
      .from('order_items')
      .select('*, order_item_flavors(*), products(product_type)')
      .eq('order_id', selectedOrder.id);
    if (error) throw error;
    return data as OrderItem[];
  },
  enabled: !!selectedOrder,
});
```

### 3. Add Bundle Components Query (after order items query)
Fetch included components for any bundle products:
```typescript
const bundleProductIds = orderItems
  .filter(item => item.products?.product_type === 'bundle' && item.product_id)
  .map(item => item.product_id!);

const { data: bundleComponents = [] } = useQuery({
  queryKey: ['bundle-components', bundleProductIds],
  queryFn: async () => {
    if (bundleProductIds.length === 0) return [];
    const { data, error } = await supabase
      .from('bundle_components')
      .select('*, component_product:products!bundle_components_component_product_id_fkey(name)')
      .in('bundle_product_id', bundleProductIds)
      .eq('has_flavor_selection', false);
    if (error) throw error;
    return data;
  },
  enabled: bundleProductIds.length > 0,
});
```

### 4. Update Items Rendering (lines 1572-1600)
Add included items section after flavors for bundle products:
```tsx
{orderItems.map((item) => {
  const isBundle = item.products?.product_type === 'bundle';
  const itemInclusions = isBundle 
    ? bundleComponents.filter(bc => bc.bundle_product_id === item.product_id)
    : [];
    
  return (
    <div key={item.id} className="space-y-1 p-2 bg-muted rounded">
      {/* Existing: Product name and price */}
      <div className="flex justify-between text-sm">
        <span>{item.quantity}x {item.product_name}</span>
        <span>₱{item.line_total?.toFixed(2)}</span>
      </div>
      
      {/* Existing: Flavor selections */}
      {item.order_item_flavors.length > 0 && (
        <div className="pl-4 text-xs text-muted-foreground">
          {item.order_item_flavors.map((f, idx) => (...))}
        </div>
      )}
      
      {/* NEW: Included items for bundles */}
      {isBundle && itemInclusions.length > 0 && (
        <div className="pl-4 space-y-0.5 mt-1">
          <span className="text-xs font-medium text-green-600">Included in this meal:</span>
          {itemInclusions.map((incl, idx) => {
            let displayName = incl.component_product?.name || '';
            // Apply same display name mappings as BundleWizard
            if (displayName.toLowerCase().includes('java rice')) {
              displayName = `${incl.quantity} cups Java Rice`;
            } else if (displayName.toLowerCase().includes('coleslaw')) {
              displayName = 'Coleslaw';
            } else if (displayName.toLowerCase().includes('fries')) {
              displayName = 'Fries';
            } else if (displayName.toLowerCase().includes('wine')) {
              displayName = 'Red Wine';
            } else if (displayName.toLowerCase().includes('cake')) {
              displayName = 'Bento Cake';
            }
            return (
              <div key={idx} className="flex justify-between text-xs text-green-600">
                <span>• {displayName}</span>
                <span className="text-[10px] border border-green-500/30 bg-green-500/10 px-1 rounded">
                  Included
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
})}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/Orders.tsx` | Update OrderItem type, add products join, add bundle components query, update items rendering |

---

## Result
Admin order details will now show:
- Product name and price
- Flavor selections (wings and ribs)
- **NEW**: "Included in this meal" section with green "Included" badges for bundle components

This matches exactly what customers see in their order summary.

---

## No Other Files Affected
- Customer-facing pages remain unchanged
- Cart, Checkout, and BundleWizard remain unchanged
- Driver view is not affected
- Email/SMS notifications are not affected

