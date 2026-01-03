-- Make payment-proofs bucket public so images can be viewed
UPDATE storage.buckets SET public = true WHERE id = 'payment-proofs';

-- Add RLS policy for viewing payment proof files (public read for anyone with the URL)
CREATE POLICY "Anyone can view payment proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-proofs');