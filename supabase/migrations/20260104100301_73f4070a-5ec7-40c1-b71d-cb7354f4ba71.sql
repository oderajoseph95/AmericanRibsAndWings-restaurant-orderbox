-- Allow drivers to insert logs for their own actions
CREATE POLICY "Drivers can insert logs"
ON public.admin_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM drivers
    WHERE drivers.user_id = auth.uid()
  )
);

-- Add 'return' to the delivery_photo_type enum for return-to-sender photos
ALTER TYPE public.delivery_photo_type ADD VALUE IF NOT EXISTS 'return';