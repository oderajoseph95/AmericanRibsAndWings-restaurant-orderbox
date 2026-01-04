-- Add is_available column to flavors table (separate from is_active)
-- is_active controls if flavor appears at all
-- is_available controls if customers can select it (Out of Stock functionality)
ALTER TABLE public.flavors ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.flavors.is_available IS 'Controls whether customers can select this flavor. If false, flavor shows as "Out of Stock"';