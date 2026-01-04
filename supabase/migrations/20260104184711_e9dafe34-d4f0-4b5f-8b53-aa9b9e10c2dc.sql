-- Create email_templates table for editable email content
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (admins) to read
CREATE POLICY "Allow authenticated read on email_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users (admins) to update
CREATE POLICY "Allow authenticated update on email_templates" ON public.email_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated users (admins) to insert
CREATE POLICY "Allow authenticated insert on email_templates" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates with variable placeholders
INSERT INTO public.email_templates (type, name, subject, content) VALUES
('new_order', 'New Order (Admin)', '🔔 New Order #{{order_number}} Received!', 
'<h2>New Order Received! 🎉</h2>
<p>Order #<strong>{{order_number}}</strong> has been placed.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Customer:</strong> {{customer_name}}</p>
  <p><strong>Phone:</strong> {{customer_phone}}</p>
  <p><strong>Order Type:</strong> {{order_type}}</p>
  <p><strong>Total:</strong> ₱{{total_amount}}</p>
  {{#if delivery_address}}<p><strong>Delivery Address:</strong> {{delivery_address}}</p>{{/if}}
</div>
<p>Please review and approve this order in the admin dashboard.</p>'),

('order_approved', 'Order Approved', '✅ Your Order #{{order_number}} is Approved!',
'<h2>Great news, {{customer_name}}! ✅</h2>
<p>Your order has been approved and is now being prepared.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
  <p><strong>Total:</strong> ₱{{total_amount}}</p>
</div>
<p>We''ll notify you when your order is ready!</p>'),

('order_rejected', 'Order Rejected', '❌ Order #{{order_number}} Update',
'<h2>Order Update</h2>
<p>Hi {{customer_name}},</p>
<p>Unfortunately, we were unable to process your order at this time.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
  {{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>
<p>Please contact us if you have any questions. We apologize for the inconvenience.</p>'),

('order_cancelled', 'Order Cancelled', 'Order #{{order_number}} Cancelled',
'<h2>Order Cancelled</h2>
<p>Hi {{customer_name}},</p>
<p>Your order has been cancelled.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
  {{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>
<p>If you didn''t request this cancellation, please contact us immediately.</p>'),

('order_preparing', 'Order Preparing', '👨‍🍳 Order #{{order_number}} is Being Prepared!',
'<h2>Your order is being prepared! 👨‍🍳</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
</div>
<p>Our team is now preparing your delicious order. We''ll update you when it''s ready!</p>'),

('order_ready_for_pickup', 'Order Ready', '🍗 Order #{{order_number}} is Ready!',
'<h2>Your order is ready! 🍗</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
</div>
<p>Your order is ready and waiting for you at our store.</p>
<p><strong>Store Address:</strong> {{business_address}}</p>'),

('order_picked_up', 'Order Picked Up', '📦 Order #{{order_number}} Picked Up',
'<h2>Order Picked Up! 📦</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
</div>
<p>The driver has picked up your order and will begin the delivery shortly.</p>'),

('order_in_transit', 'Order In Transit', '🚗 Order #{{order_number}} is On the Way!',
'<h2>On the Way! 🚗</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
  {{#if delivery_address}}<p><strong>Delivering to:</strong> {{delivery_address}}</p>{{/if}}
</div>
{{#if driver_name}}
<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Driver:</strong> {{driver_name}}</p>
  {{#if driver_phone}}<p><strong>Contact:</strong> {{driver_phone}}</p>{{/if}}
</div>
{{/if}}
<p>Your order is on its way! Please be ready to receive it.</p>'),

('order_delivered', 'Order Delivered', '🎉 Order #{{order_number}} Delivered!',
'<h2>Order Delivered! 🎉</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
</div>
<p>Your order has been delivered. We hope you enjoy it!</p>
<p>Thank you for choosing {{business_name}}. We''d love to serve you again!</p>'),

('order_completed', 'Order Completed', '✨ Order #{{order_number}} Completed',
'<h2>Order Completed! ✨</h2>
<p>Hi {{customer_name}},</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
  <p><strong>Total:</strong> ₱{{total_amount}}</p>
</div>
<p>Thank you for your order! We hope to see you again soon.</p>'),

('driver_assigned', 'Driver Assigned', '🚗 Driver Assigned to Order #{{order_number}}',
'<h2>Driver Assigned! 🚗</h2>
<p>Hi {{customer_name}},</p>
<p>A driver has been assigned to deliver your order.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Order #{{order_number}}</strong></p>
</div>
{{#if driver_name}}
<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <h3 style="margin-top: 0;">Your Driver</h3>
  <p><strong>Name:</strong> {{driver_name}}</p>
  {{#if driver_phone}}<p><strong>Contact:</strong> {{driver_phone}}</p>{{/if}}
</div>
{{/if}}
<p>You''ll receive another notification once your order is on the way!</p>'),

('payout_requested', 'Payout Requested (Admin)', '💰 New Payout Request',
'<h2>New Payout Request 💰</h2>
<p>A driver has requested a payout.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p><strong>Driver:</strong> {{driver_name}}</p>
  <p style="font-size: 18px; font-weight: bold; color: #ea580c;">Amount: ₱{{payout_amount}}</p>
</div>
<p>Please review and process this payout request in the admin dashboard.</p>'),

('payout_approved', 'Payout Approved', '✅ Your Payout has been Approved!',
'<h2>Payout Approved! ✅</h2>
<p>Hi {{driver_name}},</p>
<p>Your payout request has been approved and processed.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p style="font-size: 18px; font-weight: bold; color: #ea580c;">Amount: ₱{{payout_amount}}</p>
</div>
<p>The funds should be transferred to your account shortly.</p>'),

('payout_rejected', 'Payout Rejected', 'Payout Request Update',
'<h2>Payout Request Update</h2>
<p>Hi {{driver_name}},</p>
<p>Unfortunately, your payout request was not approved.</p>
<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <p style="font-size: 18px; font-weight: bold; color: #ea580c;">Amount: ₱{{payout_amount}}</p>
  {{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>
<p>Please contact support if you have any questions.</p>');