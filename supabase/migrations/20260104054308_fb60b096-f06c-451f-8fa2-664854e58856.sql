-- Add rejection_reason column to driver_payouts
ALTER TABLE public.driver_payouts ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Create admin_logs table for audit trail
CREATE TABLE public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_name text,
  old_values jsonb,
  new_values jsonb,
  details text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view logs" ON public.admin_logs
FOR SELECT USING (is_admin(auth.uid()));

-- Only admins can insert logs
CREATE POLICY "Admins can insert logs" ON public.admin_logs
FOR INSERT WITH CHECK (is_admin(auth.uid()));