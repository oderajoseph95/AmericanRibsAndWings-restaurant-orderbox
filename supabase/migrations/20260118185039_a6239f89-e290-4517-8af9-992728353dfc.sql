-- ONLY affects Rice Meal category bundles (ID: 478497f4-e44f-4377-9121-cf3129bda314)
-- This will NOT affect GROUP MEAL ARW 1 or 2 (they're in "Groups" category)
-- Sets fries to auto-included (no flavor selection required)
UPDATE bundle_components bc
SET has_flavor_selection = false
FROM products p
WHERE bc.bundle_product_id = p.id
  AND p.category_id = '478497f4-e44f-4377-9121-cf3129bda314'
  AND bc.component_product_id = '192a10f6-e085-494b-908c-549419e3c9ab';