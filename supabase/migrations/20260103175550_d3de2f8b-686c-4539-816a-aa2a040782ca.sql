-- Drop existing SELECT policies on customers and recreate with explicit auth checks
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Customers can view own customer record" ON public.customers;

-- Recreate with explicit authentication requirement
CREATE POLICY "Authenticated admins can view all customers" 
ON public.customers FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND is_admin(auth.uid())
);

CREATE POLICY "Authenticated customers can view own record" 
ON public.customers FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND user_id = auth.uid()
);