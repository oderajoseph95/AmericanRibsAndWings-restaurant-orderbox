-- Add DELETE policies for products, categories, and flavors (Owner only)

-- Products: Owner can permanently delete products
CREATE POLICY "Owner can permanently delete products"
ON public.products
FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role));

-- Categories: Owner can permanently delete categories  
CREATE POLICY "Owner can permanently delete categories"
ON public.categories
FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role));

-- Flavors: Owner can permanently delete flavors
CREATE POLICY "Owner can permanently delete flavors"
ON public.flavors
FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role));