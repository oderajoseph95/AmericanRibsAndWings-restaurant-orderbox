-- Create reservation_notifications table for audit trail
CREATE TABLE public.reservation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('automatic', 'manual')),
  message_type text NOT NULL,
  error_message text,
  sent_by_admin_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Index for efficient lookup by reservation
CREATE INDEX idx_reservation_notifications_reservation_id 
  ON public.reservation_notifications(reservation_id);

-- Index for chronological ordering
CREATE INDEX idx_reservation_notifications_created_at 
  ON public.reservation_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.reservation_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view reservation notifications"
  ON public.reservation_notifications FOR SELECT
  USING (is_admin(auth.uid()));

-- Admins can insert logs
CREATE POLICY "Admins can insert reservation notifications"
  ON public.reservation_notifications FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Allow service role / edge functions to insert (for automatic sends)
CREATE POLICY "Service role can insert reservation notifications"
  ON public.reservation_notifications FOR INSERT
  WITH CHECK (true);