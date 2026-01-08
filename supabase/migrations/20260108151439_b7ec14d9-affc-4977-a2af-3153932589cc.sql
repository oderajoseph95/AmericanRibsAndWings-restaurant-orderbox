-- Create menu_images table for storing menu display images
CREATE TABLE IF NOT EXISTS public.menu_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.menu_images ENABLE ROW LEVEL SECURITY;

-- Public can view active menu images
CREATE POLICY "Public can view active menu images"
  ON public.menu_images FOR SELECT
  USING (is_active = true);

-- Admins can view all menu images
CREATE POLICY "Admins can view all menu images"
  ON public.menu_images FOR SELECT
  USING (is_admin(auth.uid()));

-- Owner/Manager can insert menu images
CREATE POLICY "Owner/Manager can insert menu images"
  ON public.menu_images FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Owner/Manager can update menu images
CREATE POLICY "Owner/Manager can update menu images"
  ON public.menu_images FOR UPDATE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Owner/Manager can delete menu images
CREATE POLICY "Owner/Manager can delete menu images"
  ON public.menu_images FOR DELETE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Add updated_at trigger
CREATE TRIGGER update_menu_images_updated_at
  BEFORE UPDATE ON public.menu_images
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for menu images
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for menu images bucket
CREATE POLICY "Public can view menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Admins can upload menu images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update menu images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-images' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete menu images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'menu-images' AND is_admin(auth.uid()));