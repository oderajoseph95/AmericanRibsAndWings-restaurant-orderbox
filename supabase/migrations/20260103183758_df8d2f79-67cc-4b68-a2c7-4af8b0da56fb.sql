-- Create page_seo table for SEO management
CREATE TABLE public.page_seo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  og_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_seo ENABLE ROW LEVEL SECURITY;

-- Public can view SEO data (needed for meta tags)
CREATE POLICY "Public can view page SEO"
ON public.page_seo
FOR SELECT
USING (true);

-- Admins can manage SEO
CREATE POLICY "Admins can view all page SEO"
ON public.page_seo
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert page SEO"
ON public.page_seo
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can update page SEO"
ON public.page_seo
FOR UPDATE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can delete page SEO"
ON public.page_seo
FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_page_seo_updated_at
BEFORE UPDATE ON public.page_seo
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default SEO entries for main pages
INSERT INTO public.page_seo (page_path, title, description) VALUES
('/', 'American Ribs & Wings - Floridablanca | Best BBQ in Pampanga', 'Savor authentic American-style BBQ ribs and wings in Floridablanca, Pampanga. All you can eat, outdoor seating, free Wi-Fi. Order online for pickup or delivery!'),
('/order', 'Order Online | American Ribs & Wings Floridablanca', 'Order delicious BBQ ribs, wings, and more online from American Ribs & Wings Floridablanca. Fast pickup and delivery available!'),
('/my-orders', 'My Orders | American Ribs & Wings', 'Track and view your order history at American Ribs & Wings Floridablanca.'),
('/order-tracking', 'Track Your Order | American Ribs & Wings', 'Track your order status in real-time at American Ribs & Wings Floridablanca.');