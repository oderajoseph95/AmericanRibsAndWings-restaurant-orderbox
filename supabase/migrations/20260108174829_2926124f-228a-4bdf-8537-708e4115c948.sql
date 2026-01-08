-- Add SMS settings with proper JSON format
INSERT INTO public.settings (key, value) VALUES 
  ('sms_admin_backup_enabled', '"true"'::jsonb),
  ('sms_admin_backup_numbers', '["+639214080286","+639569669710"]'::jsonb)
ON CONFLICT (key) DO NOTHING;