-- 1. Fix admin_notifications RLS policy to allow admins to insert for other admins
DROP POLICY IF EXISTS "Admins can insert notifications" ON admin_notifications;

CREATE POLICY "Admins can insert notifications for any admin"
ON admin_notifications FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = admin_notifications.user_id 
    AND role IN ('owner', 'manager', 'cashier')
  )
);

-- 2. Add username and display_name columns to admin_logs
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 3. Backfill existing logs with username/display_name from user_roles
UPDATE admin_logs al
SET 
  username = ur.username,
  display_name = ur.display_name
FROM user_roles ur
WHERE al.user_id = ur.user_id
AND (al.username IS NULL OR al.display_name IS NULL);