-- Create sales_pop_config table for admin-managed configuration
CREATE TABLE public.sales_pop_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_pop_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (for frontend)
CREATE POLICY "Anyone can read sales pop config" ON public.sales_pop_config
  FOR SELECT USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage sales pop config" ON public.sales_pop_config
  FOR ALL USING (is_admin(auth.uid()));

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_pop_config;

-- Insert default configuration values
INSERT INTO public.sales_pop_config (key, value) VALUES
  ('enabled', 'true'),
  ('initial_delay_seconds', '10'),
  ('display_duration_seconds', '6'),
  ('interval_seconds', '30'),
  ('min_minutes_ago', '10'),
  ('max_minutes_ago', '30'),
  ('pages', '["/", "/order"]'),
  ('custom_names', '[]'),
  ('locations', '["Floridablanca", "Lubao", "Porac", "Guagua", "Angeles City", "San Fernando", "Mabalacat", "Mexico", "Apalit", "Macabebe"]');

-- Add trigger for updated_at
CREATE TRIGGER update_sales_pop_config_updated_at
  BEFORE UPDATE ON public.sales_pop_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();