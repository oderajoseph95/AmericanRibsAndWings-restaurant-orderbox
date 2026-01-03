-- Homepage sections configuration table
CREATE TABLE public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text UNIQUE NOT NULL,
  title text,
  content jsonb DEFAULT '{}',
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

-- RLS policies for homepage_sections
CREATE POLICY "Public can view visible sections"
ON public.homepage_sections FOR SELECT
USING (is_visible = true);

CREATE POLICY "Admins can view all sections"
ON public.homepage_sections FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert sections"
ON public.homepage_sections FOR INSERT
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can update sections"
ON public.homepage_sections FOR UPDATE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can delete sections"
ON public.homepage_sections FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_homepage_sections_updated_at
BEFORE UPDATE ON public.homepage_sections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Gallery images table
CREATE TABLE public.gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  image_url text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for gallery_images
CREATE POLICY "Public can view active gallery images"
ON public.gallery_images FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can view all gallery images"
ON public.gallery_images FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert gallery images"
ON public.gallery_images FOR INSERT
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can update gallery images"
ON public.gallery_images FOR UPDATE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can delete gallery images"
ON public.gallery_images FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Videos table
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  video_url text NOT NULL,
  thumbnail_url text,
  video_type text DEFAULT 'youtube',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- RLS policies for videos
CREATE POLICY "Public can view active videos"
ON public.videos FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can view all videos"
ON public.videos FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert videos"
ON public.videos FOR INSERT
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can update videos"
ON public.videos FOR UPDATE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner/Manager can delete videos"
ON public.videos FOR DELETE
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Create storage buckets for gallery and videos
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery', 'gallery', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);

-- Storage policies for gallery bucket
CREATE POLICY "Gallery images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

CREATE POLICY "Admins can upload gallery images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'gallery' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update gallery images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'gallery' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete gallery images"
ON storage.objects FOR DELETE
USING (bucket_id = 'gallery' AND is_admin(auth.uid()));

-- Storage policies for videos bucket
CREATE POLICY "Videos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Admins can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'videos' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'videos' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'videos' AND is_admin(auth.uid()));

-- Insert default homepage sections
INSERT INTO public.homepage_sections (section_key, title, content, is_visible, sort_order) VALUES
('hero', 'Hero', '{
  "badge": "Now Open for Orders",
  "headline": "American Ribs",
  "headlineAccent": "& Wings",
  "tagline": "Authentic American BBQ crafted with passion. Smoky ribs, crispy wings, and flavors that''ll make you come back for more.",
  "primaryCta": "Order Now",
  "primaryCtaLink": "/order",
  "secondaryCta": "View Menu",
  "secondaryCtaLink": "#menu",
  "address": "123 Main Street, City",
  "hours": "10AM - 10PM Daily",
  "phone": "(123) 456-7890"
}', true, 1),
('featured_menu', 'Featured Menu', '{}', true, 2),
('category_showcase', 'Category Showcase', '{}', true, 3),
('videos', 'Videos', '{"title": "See What We''re Cooking", "subtitle": "Watch our latest videos"}', true, 4),
('gallery', 'Gallery', '{"title": "Our Gallery", "subtitle": "A taste of what awaits you"}', true, 5),
('about', 'About', '{
  "title": "Our Story",
  "story": "Started in 2020, we''ve been serving up authentic American BBQ with a passion for quality and flavor. Our secret recipes have been perfected over generations.",
  "yearsInBusiness": "4+",
  "menuItems": "50+",
  "happyCustomers": "10K+",
  "features": [
    {"title": "Fresh Ingredients", "description": "We source only the finest, freshest ingredients for our dishes."},
    {"title": "Secret Recipes", "description": "Our recipes have been passed down through generations."},
    {"title": "Fast Service", "description": "Quick preparation without compromising on quality."}
  ]
}', true, 6),
('location', 'Location', '{
  "title": "Find Us",
  "address": "123 Main Street, City, State 12345",
  "phone": "(123) 456-7890",
  "email": "info@restaurant.com",
  "hours": {
    "weekdays": "10:00 AM - 10:00 PM",
    "weekends": "11:00 AM - 11:00 PM"
  },
  "mapEmbedUrl": "",
  "socialLinks": {
    "facebook": "",
    "instagram": "",
    "twitter": ""
  }
}', true, 7),
('footer', 'Footer', '{
  "copyright": "© 2024 American Ribs & Wings. All rights reserved.",
  "links": []
}', true, 8);