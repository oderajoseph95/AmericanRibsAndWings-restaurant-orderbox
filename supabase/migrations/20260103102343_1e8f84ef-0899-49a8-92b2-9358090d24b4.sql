-- Add public SELECT policies for menu browsing (anonymous users)

-- Products: Public can view active, non-archived products
CREATE POLICY "Public can view active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true AND archived_at IS NULL);

-- Categories: Public can view active, non-archived categories
CREATE POLICY "Public can view active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = true AND archived_at IS NULL);

-- Flavors: Public can view active, non-archived flavors
CREATE POLICY "Public can view active flavors"
ON public.flavors
FOR SELECT
TO anon, authenticated
USING (is_active = true AND archived_at IS NULL);

-- Bundle components: Public can view (needed to show bundle contents)
CREATE POLICY "Public can view bundle components"
ON public.bundle_components
FOR SELECT
TO anon, authenticated
USING (true);

-- Product flavor rules: Public can view (needed for flavor selection UI)
CREATE POLICY "Public can view product flavor rules"
ON public.product_flavor_rules
FOR SELECT
TO anon, authenticated
USING (true);

-- Customers: Public can insert (create customer on checkout)
CREATE POLICY "Public can create customers"
ON public.customers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Orders: Public can insert with pending status
CREATE POLICY "Public can create pending orders"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending');

-- Order items: Public can insert
CREATE POLICY "Public can create order items"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Order item flavors: Public can insert
CREATE POLICY "Public can create order item flavors"
ON public.order_item_flavors
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Payment proofs: Public can insert
CREATE POLICY "Public can upload payment proofs"
ON public.payment_proofs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Storage: Allow public uploads to payment-proofs bucket
CREATE POLICY "Public can upload payment proofs"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-proofs');

-- Storage: Allow public to read their uploaded proofs
CREATE POLICY "Public can view payment proofs"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'payment-proofs');