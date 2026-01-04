-- Create driver_availability enum if not exists
DO $$ BEGIN
  CREATE TYPE public.driver_availability AS ENUM (
    'offline',
    'online', 
    'busy',
    'unavailable'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add availability_status column to drivers table if not exists
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS availability_status public.driver_availability DEFAULT 'offline';

-- Drop existing policy if exists and recreate
DROP POLICY IF EXISTS "Drivers can update own availability" ON public.drivers;

-- Add RLS policy for drivers to update their own availability and profile
CREATE POLICY "Drivers can update own availability"
ON public.drivers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());