-- Fix delivery_photos INSERT policies - change from RESTRICTIVE to PERMISSIVE
-- The issue is that RESTRICTIVE policies require ALL to pass, but we want ANY to pass

-- Drop the existing RESTRICTIVE insert policies
DROP POLICY IF EXISTS "Admins can insert delivery photos" ON public.delivery_photos;
DROP POLICY IF EXISTS "Drivers can insert delivery photos" ON public.delivery_photos;

-- Recreate as PERMISSIVE policies (using PERMISSIVE explicitly)
CREATE POLICY "Admins can insert delivery photos" 
ON public.delivery_photos 
FOR INSERT 
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Drivers can insert delivery photos" 
ON public.delivery_photos 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM drivers
    WHERE drivers.id = delivery_photos.driver_id 
    AND drivers.user_id = auth.uid()
  )
  OR driver_id IS NULL -- Allow admin uploads where driver_id is null
);