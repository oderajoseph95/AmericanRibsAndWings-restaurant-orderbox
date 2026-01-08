-- Add 5 new SMS templates to match all email events
INSERT INTO public.sms_templates (type, name, content, is_active) VALUES
('order_rejected', 'Order Rejected', 'American Ribs & Wings: Your order #{{order_number}} could not be processed. {{reason}} Please contact us for assistance.', true),
('order_cancelled', 'Order Cancelled', 'American Ribs & Wings: Your order #{{order_number}} has been cancelled. {{reason}} If you have questions, please contact us.', true),
('order_preparing', 'Order Preparing', 'American Ribs & Wings: Great news! Your order #{{order_number}} is now being prepared. We''ll update you when it''s ready!', true),
('order_ready_for_pickup', 'Order Ready for Pickup', 'American Ribs & Wings: Your order #{{order_number}} is ready for pickup! Please proceed to our store in Floridablanca.', true),
('order_completed', 'Order Completed', 'American Ribs & Wings: Thank you for your order #{{order_number}}! We hope you enjoyed your meal. See you again soon! 🍗', true)
ON CONFLICT (type) DO NOTHING;