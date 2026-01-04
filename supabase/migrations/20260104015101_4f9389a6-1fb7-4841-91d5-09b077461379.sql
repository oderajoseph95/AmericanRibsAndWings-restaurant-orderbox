-- Allow public to read payment-related settings (QR codes, account info)
CREATE POLICY "Public can view payment settings" 
ON public.settings 
FOR SELECT 
USING (
  key IN (
    'gcash_qr_url', 'gcash_account_name', 'gcash_number',
    'bank_qr_url', 'bank_name', 'bank_account_name', 'bank_account_number'
  )
);