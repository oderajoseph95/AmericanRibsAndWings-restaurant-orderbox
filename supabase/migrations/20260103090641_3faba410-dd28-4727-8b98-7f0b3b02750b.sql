-- Add sort_order column to flavors table
ALTER TABLE public.flavors ADD COLUMN sort_order integer DEFAULT 0;