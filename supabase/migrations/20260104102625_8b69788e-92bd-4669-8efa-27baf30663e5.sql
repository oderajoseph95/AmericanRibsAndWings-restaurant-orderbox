-- Add storage policy for admins to upload to driver-photos bucket
CREATE POLICY "Admins can upload driver photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-photos'
  AND is_admin(auth.uid())
);