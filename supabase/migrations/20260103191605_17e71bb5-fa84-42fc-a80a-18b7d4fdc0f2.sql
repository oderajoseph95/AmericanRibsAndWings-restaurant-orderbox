-- Add image_url column to categories table for category images
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS image_url TEXT;