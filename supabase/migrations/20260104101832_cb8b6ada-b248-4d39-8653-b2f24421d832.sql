-- Drop the restrictive admin policy and recreate as permissive
DROP POLICY IF EXISTS "Admins can insert delivery photos" ON public.delivery_photos;

-- Create as PERMISSIVE policy (default behavior, explicitly stated)
CREATE POLICY "Admins can insert delivery photos"
ON public.delivery_photos
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));