-- Admin notifications table
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info',
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for admin_notifications
CREATE POLICY "Admins can view their notifications"
ON public.admin_notifications FOR SELECT
USING (user_id = auth.uid() AND is_admin(auth.uid()));

CREATE POLICY "Admins can update their notifications"
ON public.admin_notifications FOR UPDATE
USING (user_id = auth.uid() AND is_admin(auth.uid()));

CREATE POLICY "Admins can insert notifications"
ON public.admin_notifications FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "System can insert notifications for admins"
ON public.admin_notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Owner can delete notifications"
ON public.admin_notifications FOR DELETE
USING (has_role(auth.uid(), 'owner'));

-- Visitor sessions table for live tracking
CREATE TABLE public.visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  page_path text,
  user_agent text,
  is_active boolean DEFAULT true,
  last_seen_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for visitor_sessions
CREATE POLICY "Anyone can insert visitor sessions"
ON public.visitor_sessions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update their session"
ON public.visitor_sessions FOR UPDATE
USING (true);

CREATE POLICY "Admins can view all sessions"
ON public.visitor_sessions FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner can delete sessions"
ON public.visitor_sessions FOR DELETE
USING (has_role(auth.uid(), 'owner'));

-- Analytics events table
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  page_path text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Policies for analytics_events
CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view all events"
ON public.analytics_events FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Owner can delete events"
ON public.analytics_events FOR DELETE
USING (has_role(auth.uid(), 'owner'));

-- Enable realtime for admin notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions;