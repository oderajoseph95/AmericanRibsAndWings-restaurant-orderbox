-- Create abandoned checkout events table for timeline tracking
CREATE TABLE IF NOT EXISTS public.abandoned_checkout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  abandoned_checkout_id uuid REFERENCES public.abandoned_checkouts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_checkout_events_checkout_id ON public.abandoned_checkout_events(abandoned_checkout_id);

-- Enable RLS
ALTER TABLE public.abandoned_checkout_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert events (for customer-side tracking)
CREATE POLICY "Anyone can insert checkout events"
ON public.abandoned_checkout_events
FOR INSERT
WITH CHECK (true);

-- Only admins can view events
CREATE POLICY "Admins can view checkout events"
ON public.abandoned_checkout_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'manager', 'cashier')
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_checkout_events;