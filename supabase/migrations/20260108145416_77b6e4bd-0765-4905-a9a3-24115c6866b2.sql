-- Add featured product columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS featured_sort_order integer DEFAULT 0;

-- Create index for efficient featured products query
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products (is_featured, featured_sort_order) WHERE is_featured = true;