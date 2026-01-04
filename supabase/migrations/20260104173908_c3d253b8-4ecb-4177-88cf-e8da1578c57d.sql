-- Create driver_notifications table
CREATE TABLE public.driver_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;

-- Drivers can view their own notifications
CREATE POLICY "Drivers can view own notifications" ON public.driver_notifications
  FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

-- Drivers can update their own notifications (mark as read)
CREATE POLICY "Drivers can update own notifications" ON public.driver_notifications
  FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));

-- Allow inserts from authenticated users (admins creating notifications)
CREATE POLICY "Authenticated users can insert driver notifications" ON public.driver_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime for driver_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications;