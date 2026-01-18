-- Fix ARW 1: Change Full-Rack to Half-Rack Ribs
UPDATE bundle_components 
SET component_product_id = 'f65f0cb3-32b9-4538-b7f9-a6da25de06c4'
WHERE bundle_product_id = '41fa9daa-9338-4079-a50a-3391c18c6fe4'
  AND component_product_id = 'bbd2c003-1796-44c9-aee2-fc3ae57087d2';

-- Fix ARW 2: Change Java Rice from 4 to 8
UPDATE bundle_components 
SET quantity = 8, total_units = 8
WHERE bundle_product_id = '54d63d8b-8179-47e9-9c56-7ea6a4f34cb3'
  AND component_product_id = '48770d33-6dcb-4e4c-ab0e-97760e5244ba';