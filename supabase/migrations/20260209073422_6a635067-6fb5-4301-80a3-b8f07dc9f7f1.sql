-- Add RLS policy for admins to update order_items
CREATE POLICY "Admins can update order_items" 
ON public.order_items 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Add RLS policy for admins to delete order_items  
CREATE POLICY "Admins can delete order_items"
ON public.order_items
FOR DELETE
USING (is_admin(auth.uid()));