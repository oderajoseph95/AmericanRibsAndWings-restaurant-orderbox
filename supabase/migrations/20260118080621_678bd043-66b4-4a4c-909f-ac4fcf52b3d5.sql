
-- 1. Create 1L Juice product for bundles (simple, ₱0, internal)
INSERT INTO products (name, price, product_type, is_active, description)
VALUES ('1L Juice (Bundle)', 0, 'simple', true, 'Included drink for group meals');

-- 2. Delete any existing bundle components for these group meals (cleanup)
DELETE FROM bundle_components WHERE bundle_product_id IN (
  '41fa9daa-9338-4079-a50a-3391c18c6fe4',
  '54d63d8b-8179-47e9-9c56-7ea6a4f34cb3'
);

-- 3. Insert bundle components for GROUP MEAL ARW 1 (₱1,399)
-- Wings: 12 pcs, 4 flavor slots (3 pcs per flavor)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('41fa9daa-9338-4079-a50a-3391c18c6fe4', '72638a8d-c8f6-45df-abc9-20bce6f14ac4', 1, true, 12, 3);

-- Full Rack Ribs: 1 flavor selection
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('41fa9daa-9338-4079-a50a-3391c18c6fe4', 'bbd2c003-1796-44c9-aee2-fc3ae57087d2', 1, true, 1, 1);

-- Fries (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('41fa9daa-9338-4079-a50a-3391c18c6fe4', '192a10f6-e085-494b-908c-549419e3c9ab', 1, false, 1, 1);

-- Java Rice 4 cups (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('41fa9daa-9338-4079-a50a-3391c18c6fe4', '48770d33-6dcb-4e4c-ab0e-97760e5244ba', 4, false, 4, 1);

-- Coleslaw (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('41fa9daa-9338-4079-a50a-3391c18c6fe4', '2c03cc85-1674-4f2e-b1af-d3f8851dcb16', 1, false, 1, 1);

-- 1L Juice (included, no flavor selection) - use subquery to get newly created product
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
SELECT '41fa9daa-9338-4079-a50a-3391c18c6fe4', id, 1, false, 1, 1 
FROM products WHERE name = '1L Juice (Bundle)' LIMIT 1;

-- 4. Insert bundle components for GROUP MEAL ARW 2 (₱2,499)
-- Wings: 24 pcs, 8 flavor slots (3 pcs per flavor)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', '82bf2555-09cc-4535-9a66-7e69ef75f196', 1, true, 24, 3);

-- Half Rack Ribs: 1 flavor selection
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', 'f65f0cb3-32b9-4538-b7f9-a6da25de06c4', 1, true, 1, 1);

-- Fries (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', '192a10f6-e085-494b-908c-549419e3c9ab', 1, false, 1, 1);

-- Java Rice 4 cups (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', '48770d33-6dcb-4e4c-ab0e-97760e5244ba', 4, false, 4, 1);

-- Coleslaw (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
VALUES ('54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', '2c03cc85-1674-4f2e-b1af-d3f8851dcb16', 1, false, 1, 1);

-- 1L Juice (included, no flavor selection)
INSERT INTO bundle_components (bundle_product_id, component_product_id, quantity, has_flavor_selection, total_units, units_per_flavor)
SELECT '54d63d8b-8179-47e9-9c56-7ea6a4f34cb3', id, 1, false, 1, 1 
FROM products WHERE name = '1L Juice (Bundle)' LIMIT 1;
