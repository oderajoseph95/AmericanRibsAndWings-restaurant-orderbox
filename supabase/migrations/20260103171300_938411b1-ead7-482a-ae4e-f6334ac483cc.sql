-- Create storage bucket for payment QR codes
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr-codes', 'payment-qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view payment QR codes (they need to be visible to all customers)
CREATE POLICY "Anyone can view payment QR codes"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-qr-codes');

-- Only owners can upload/update/delete payment QR codes
CREATE POLICY "Owners can manage payment QR codes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-qr-codes' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can update payment QR codes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'payment-qr-codes' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can delete payment QR codes"
ON storage.objects FOR DELETE
USING (bucket_id = 'payment-qr-codes' AND public.has_role(auth.uid(), 'owner'));