-- Create sms_templates table
CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL UNIQUE,
  name text NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_templates
CREATE POLICY "Admins can view all sms_templates" ON public.sms_templates
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert sms_templates" ON public.sms_templates
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can update sms_templates" ON public.sms_templates
  FOR UPDATE USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can delete sms_templates" ON public.sms_templates
  FOR DELETE USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Create sms_logs table
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text NOT NULL,
  sms_type text,
  message text NOT NULL,
  status text DEFAULT 'queued',
  message_id text,
  order_id uuid REFERENCES public.orders(id),
  network text,
  provider text DEFAULT 'semaphore',
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_logs
CREATE POLICY "Admins can view all sms_logs" ON public.sms_logs
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Allow insert sms_logs" ON public.sms_logs
  FOR INSERT WITH CHECK (true);

-- Seed default SMS templates
INSERT INTO public.sms_templates (type, name, content) VALUES
('order_received', 'Order Received', 'American Ribs & Wings Floridablanca: We received your order #{{order_number}}. We are preparing your food now. Thank you!'),
('payment_verified', 'Payment Verified', 'American Ribs & Wings Floridablanca: Payment verified for order #{{order_number}}. Your order is now confirmed.'),
('driver_assigned', 'Driver Assigned', 'American Ribs & Wings Floridablanca: Your order #{{order_number}} has been assigned to rider {{driver_name}}. ETA will be shared shortly.'),
('order_out_for_delivery', 'Out for Delivery', 'American Ribs & Wings Floridablanca: Your order #{{order_number}} is out for delivery. Please prepare to receive your order.'),
('order_delivered', 'Order Delivered', 'American Ribs & Wings Floridablanca: Your order #{{order_number}} has been delivered. Thank you for ordering!');