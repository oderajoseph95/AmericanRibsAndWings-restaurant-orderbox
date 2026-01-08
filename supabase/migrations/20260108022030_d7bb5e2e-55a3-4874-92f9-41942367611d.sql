-- Add SEO columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- Generate slugs for existing products (based on product name + partial id for uniqueness)
UPDATE products 
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')) || '-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL;