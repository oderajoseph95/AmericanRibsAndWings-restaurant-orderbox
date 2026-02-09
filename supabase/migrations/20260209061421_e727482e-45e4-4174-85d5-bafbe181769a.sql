-- ============================================
-- ISSUE R4.1: Automated Reservation Reminder Engine
-- ============================================

-- Step 1: Enable pg_cron extension (required for scheduled jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

-- Step 2: Create reservation_reminders table
CREATE TABLE public.reservation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '3h', 'immediate')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  error_message text,
  
  -- Unique constraint to prevent duplicate reminders per reservation+type
  CONSTRAINT unique_reservation_reminder UNIQUE (reservation_id, reminder_type)
);

-- Create indexes for efficient querying
CREATE INDEX idx_reservation_reminders_due 
  ON public.reservation_reminders(status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_reservation_reminders_reservation_id 
  ON public.reservation_reminders(reservation_id);

-- Step 3: Enable Row Level Security
ALTER TABLE public.reservation_reminders ENABLE ROW LEVEL SECURITY;

-- Admins can view all reminders
CREATE POLICY "Admins can view reservation reminders"
  ON public.reservation_reminders FOR SELECT
  USING (is_admin(auth.uid()));

-- Admins can insert reminders
CREATE POLICY "Admins can insert reservation reminders"
  ON public.reservation_reminders FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Admins can update reminders
CREATE POLICY "Admins can update reservation reminders"
  ON public.reservation_reminders FOR UPDATE
  USING (is_admin(auth.uid()));

-- Admins can delete reminders
CREATE POLICY "Admins can delete reservation reminders"
  ON public.reservation_reminders FOR DELETE
  USING (is_admin(auth.uid()));

-- Service role bypass for edge function (uses service_role key)
-- Note: The edge function uses service_role key which bypasses RLS

-- Step 4: Create the cron job to run every 15 minutes
-- This calls the send-reservation-reminder edge function
SELECT cron.schedule(
  'send-reservation-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://saxwbdwmuzkmxztagfot.supabase.co/functions/v1/send-reservation-reminder',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNheHdiZHdtdXprbXh6dGFnZm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjM0NDUsImV4cCI6MjA4Mjc5OTQ0NX0.cMcSJxeh3DcPYQtrDxC8x4VwMLApABa_nu_MCBZh9OA"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);