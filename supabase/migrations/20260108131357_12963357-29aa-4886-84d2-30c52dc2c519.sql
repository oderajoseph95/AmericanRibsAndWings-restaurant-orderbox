-- Add new columns to email_logs for better tracking
ALTER TABLE public.email_logs
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS order_number TEXT,
ADD COLUMN IF NOT EXISTS email_subject TEXT,
ADD COLUMN IF NOT EXISTS trigger_event TEXT,
ADD COLUMN IF NOT EXISTS recipient_type TEXT DEFAULT 'customer',
ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_email_logs_trigger_event ON public.email_logs(trigger_event);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient_type ON public.email_logs(recipient_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_is_test ON public.email_logs(is_test);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);