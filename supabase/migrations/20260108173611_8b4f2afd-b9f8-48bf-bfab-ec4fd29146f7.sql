-- Add review request tracking to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_review_requested_at timestamp with time zone;

-- Add review_request type to SMS types (for logging purposes)
-- The SMS template will be added via the sms_templates table
INSERT INTO sms_templates (name, type, content, is_active)
VALUES (
  'Review Request',
  'review_request',
  'Hi {{customer_name}}! We hope you loved your order from American Ribs & Wings. Please review us: https://g.page/r/CX7_36IAlM8XEBM/review',
  true
) ON CONFLICT DO NOTHING;