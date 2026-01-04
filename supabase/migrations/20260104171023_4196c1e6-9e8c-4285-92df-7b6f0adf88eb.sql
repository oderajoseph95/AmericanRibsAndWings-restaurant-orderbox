-- Create push subscriptions table for browser push notifications
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_phone text,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_type text NOT NULL CHECK (user_type IN ('admin', 'driver', 'customer')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (
  (auth.uid() = user_id) OR
  (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()))
);

CREATE POLICY "Users can create their own subscriptions"
ON public.push_subscriptions
FOR INSERT
WITH CHECK (
  (auth.uid() = user_id) OR
  (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())) OR
  (user_type = 'customer' AND customer_phone IS NOT NULL)
);

CREATE POLICY "Users can delete their own subscriptions"
ON public.push_subscriptions
FOR DELETE
USING (
  (auth.uid() = user_id) OR
  (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())) OR
  (user_type = 'customer' AND customer_phone IS NOT NULL)
);

-- Policy: Admins can view all subscriptions (for sending notifications)
CREATE POLICY "Admins can view all subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('owner', 'manager')
  )
);