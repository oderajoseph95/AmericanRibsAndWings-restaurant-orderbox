-- Add metadata column to admin_notifications for rich notification details
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Add metadata column to driver_notifications for rich notification details
ALTER TABLE driver_notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Add action_url column for proper navigation
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE driver_notifications ADD COLUMN IF NOT EXISTS action_url text;