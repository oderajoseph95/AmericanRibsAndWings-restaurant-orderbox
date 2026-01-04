-- Create email_logs table for Resend webhook events
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id TEXT,
  recipient_email TEXT NOT NULL,
  email_type TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  event_type TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read email logs
CREATE POLICY "Allow authenticated read email_logs" ON public.email_logs
  FOR SELECT TO authenticated USING (true);

-- Allow insert from edge functions (service role)
CREATE POLICY "Allow insert email_logs" ON public.email_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Add missing email templates
INSERT INTO public.email_templates (type, name, subject, content) VALUES
('order_pending', 'Order Pending', 'Order #{{order_number}} Received - Pending Review', 
'<h2>Thank you for your order, {{customer_name}}!</h2>
<p>We have received your order <strong>#{{order_number}}</strong> and it is currently pending review.</p>
<p><strong>Order Type:</strong> {{order_type}}</p>
<p><strong>Total Amount:</strong> ₱{{total_amount}}</p>
{{#if delivery_address}}<p><strong>Delivery Address:</strong> {{delivery_address}}</p>{{/if}}
<p>We will notify you once your order has been reviewed and approved.</p>'),

('order_for_verification', 'Order For Verification', 'Order #{{order_number}} - Payment Verification', 
'<h2>Hi {{customer_name}},</h2>
<p>Your order <strong>#{{order_number}}</strong> is currently being verified.</p>
<p>We are reviewing your payment proof. This usually takes a few minutes.</p>
<p><strong>Total Amount:</strong> ₱{{total_amount}}</p>
<p>You will receive a confirmation email once verification is complete.</p>'),

('order_waiting_for_rider', 'Order Waiting for Rider', 'Order #{{order_number}} - Waiting for Rider', 
'<h2>Great news, {{customer_name}}!</h2>
<p>Your order <strong>#{{order_number}}</strong> is ready and we are assigning a rider for delivery.</p>
<p><strong>Delivery Address:</strong> {{delivery_address}}</p>
<p><strong>Total Amount:</strong> ₱{{total_amount}}</p>
<p>You will receive another notification once a rider has been assigned.</p>'),

('order_returned', 'Order Returned to Sender', 'Order #{{order_number}} - Returned to Sender', 
'<h2>Hi {{customer_name}},</h2>
<p>Unfortunately, your order <strong>#{{order_number}}</strong> could not be delivered and has been returned to sender.</p>
{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
<p>Please contact us to arrange for redelivery or a refund.</p>
<p><strong>Total Amount:</strong> ₱{{total_amount}}</p>')
ON CONFLICT (type) DO NOTHING;

-- Enable realtime for email_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_logs;