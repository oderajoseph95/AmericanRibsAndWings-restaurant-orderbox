-- Create sitemap_logs table to store generation history and XML content
CREATE TABLE public.sitemap_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  triggered_by TEXT,
  total_urls INTEGER NOT NULL DEFAULT 0,
  product_urls INTEGER NOT NULL DEFAULT 0,
  category_urls INTEGER NOT NULL DEFAULT 0,
  static_urls INTEGER NOT NULL DEFAULT 0,
  sitemap_content TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sitemap_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins (owner, manager) to read sitemap logs
CREATE POLICY "Admins can read sitemap logs" ON public.sitemap_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'manager')
    )
  );

-- Allow edge functions (service role) to insert logs - uses anon for edge functions
CREATE POLICY "Service role can insert sitemap logs" ON public.sitemap_logs
  FOR INSERT
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_sitemap_logs_generated_at ON public.sitemap_logs(generated_at DESC);
CREATE INDEX idx_sitemap_logs_success ON public.sitemap_logs(success) WHERE success = true;