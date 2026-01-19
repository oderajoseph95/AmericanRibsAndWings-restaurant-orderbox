-- Insert checkout page SEO entry
INSERT INTO public.page_seo (page_path, title, description)
VALUES (
  '/checkout',
  'Checkout Food | American Ribs & Wings',
  'Complete your order at American Ribs & Wings Floridablanca. Fast checkout for pickup and delivery.'
)
ON CONFLICT (page_path) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description;