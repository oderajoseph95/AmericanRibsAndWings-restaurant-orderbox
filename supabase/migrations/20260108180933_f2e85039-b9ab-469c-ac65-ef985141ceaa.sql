-- Add store hours setting if it doesn't exist
INSERT INTO settings (key, value)
SELECT 'store_hours', '{"open": "10:00", "close": "22:00", "timezone": "Asia/Manila"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'store_hours');