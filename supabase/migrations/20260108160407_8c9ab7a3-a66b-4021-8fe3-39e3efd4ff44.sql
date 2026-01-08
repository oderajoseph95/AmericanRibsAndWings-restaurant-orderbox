-- Create abandoned_checkouts table for tracking abandoned orders
CREATE TABLE public.abandoned_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Customer info (from checkout form)
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  
  -- Cart data (JSON)
  cart_items JSONB NOT NULL,
  cart_total NUMERIC(10,2) NOT NULL,
  
  -- Checkout progress
  order_type TEXT, -- 'pickup' or 'delivery'
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_barangay TEXT,
  last_section TEXT, -- which accordion section they were on
  
  -- Recovery status
  status TEXT DEFAULT 'abandoned', -- 'abandoned', 'recovering', 'recovered', 'expired'
  recovery_started_at TIMESTAMPTZ,
  recovery_completed_at TIMESTAMPTZ,
  converted_order_id UUID REFERENCES orders(id),
  
  -- Recovery attempts
  email_attempts INTEGER DEFAULT 0,
  sms_attempts INTEGER DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  next_reminder_scheduled_at TIMESTAMPTZ,
  
  -- Session tracking
  session_id TEXT,
  device_info TEXT
);

-- Create abandoned_checkout_reminders table for tracking scheduled reminders
CREATE TABLE public.abandoned_checkout_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  abandoned_checkout_id UUID REFERENCES abandoned_checkouts(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL, -- 'email' or 'sms'
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.abandoned_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_checkout_reminders ENABLE ROW LEVEL SECURITY;

-- Admin can manage abandoned checkouts
CREATE POLICY "Admins can manage abandoned checkouts" ON public.abandoned_checkouts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Admin can manage reminders
CREATE POLICY "Admins can manage reminders" ON public.abandoned_checkout_reminders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Anonymous insert for abandoned checkouts (needed for customer-side saving)
CREATE POLICY "Anyone can insert abandoned checkouts" ON public.abandoned_checkouts
  FOR INSERT WITH CHECK (true);

-- Create indexes for efficient queries
CREATE INDEX idx_abandoned_checkouts_status ON public.abandoned_checkouts(status);
CREATE INDEX idx_abandoned_checkouts_next_reminder ON public.abandoned_checkouts(next_reminder_scheduled_at);
CREATE INDEX idx_abandoned_checkouts_phone ON public.abandoned_checkouts(customer_phone);
CREATE INDEX idx_abandoned_checkout_reminders_status ON public.abandoned_checkout_reminders(status, scheduled_for);

-- Create trigger for updated_at
CREATE TRIGGER update_abandoned_checkouts_updated_at
  BEFORE UPDATE ON public.abandoned_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add cart_recovery SMS template
INSERT INTO sms_templates (name, type, content, is_active) VALUES
('Cart Recovery', 'cart_recovery', 'Hi {{customer_name}}! You left items in your cart at American Ribs & Wings. Complete your order now: {{recovery_link}} - Total: ₱{{cart_total}}', true)
ON CONFLICT DO NOTHING;

-- Add cart_recovery email template
INSERT INTO email_templates (name, type, subject, content, is_active) VALUES
('Cart Recovery Email', 'cart_recovery', 'Complete Your Order at American Ribs & Wings! 🍖', 
'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #b91c1c;">Hi {{customer_name}}! 👋</h1>
  <p>You left some delicious items in your cart at American Ribs & Wings.</p>
  <p><strong>Your cart total:</strong> ₱{{cart_total}}</p>
  <p>Click below to complete your order:</p>
  <a href="{{recovery_link}}" style="display: inline-block; background: #b91c1c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Complete My Order</a>
  <p style="color: #666; font-size: 14px;">This link will expire in 72 hours.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">American Ribs And Wings - Floridablanca, Pampanga</p>
</div>', 
true)
ON CONFLICT DO NOTHING;