

# Fix Product Share Links to Use Readable Slugs

## Overview

Currently, when sharing a product, the URL uses the UUID like `/product/36525d2c-f59c-4cb0-bacf-ddbb2e603929`. The user wants readable URLs like `/product/valentine-classic`.

The `slug` column already exists in the products table, and the routing/sharing code already supports it. The issue is:
1. Some products (including the new Valentine meals) don't have slugs set
2. The admin product create/update doesn't generate slugs

## Solution

### Phase 1: Database - Backfill Missing Slugs

Run a one-time SQL update to generate slugs for all products that currently don't have one:

```sql
UPDATE products
SET slug = CONCAT(
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')),
  '-',
  LEFT(id::text, 8)
)
WHERE slug IS NULL;
```

This generates slugs in the format `valentine-classic-36525d2c` (matching existing products).

### Phase 2: Admin Products Page - Auto-Generate Slugs

Update `src/pages/admin/Products.tsx` to automatically generate slugs:

**On Create (lines 150-161):**
Add slug generation using the inserted product's ID:

```typescript
const generatedSlug = generateSlug(product.name) + '-' + crypto.randomUUID().substring(0, 8);
const { data, error } = await supabase.from('products').insert({
  name: product.name,
  slug: generatedSlug,  // Add this
  ...otherFields
}).select().single();
```

**On Update (lines 134-149):**
Regenerate slug when name changes:

```typescript
if (editingProduct) {
  const updatedFields = { ...product };
  // Regenerate slug if name changed
  if (product.name !== editingProduct.name) {
    updatedFields.slug = generateSlug(product.name) + '-' + editingProduct.id.substring(0, 8);
  }
  const { error } = await supabase
    .from('products')
    .update(updatedFields)
    .eq('id', editingProduct.id);
}
```

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| Database (SQL Migration) | Backfill slugs for 7 products with NULL slugs |
| `src/pages/admin/Products.tsx` | Add slug generation on insert and update |

### What This Changes

- Product share links will now be like `/product/valentine-classic-36525d2c`
- Admin creating new products will auto-generate slugs
- Admin renaming products will update the slug

### What This Protects

- Customer checkout flow is unchanged
- Cart behavior is unchanged
- Product detail modal behavior is unchanged (already supports slug OR id lookup)
- Existing products with slugs are unchanged
- All existing share links with IDs still work (fallback lookup by ID)

---

## Result

After implementation:
- Sharing "Valentine Classic" will copy: `https://arwfloridablanca.shop/product/valentine-classic-36525d2c`
- Sharing "Forever Us" will copy: `https://arwfloridablanca.shop/product/forever-us-b81db119`
- Old UUID links still work (backward compatible)

