-- Step 1: Normalize notification types
-- Convert email_sent to email
UPDATE admin_notifications SET type = 'email' WHERE type = 'email_sent';
-- Convert any order-related types to 'order'
UPDATE admin_notifications SET type = 'order' WHERE type IN ('order_update', 'new_order', 'order_status');
-- Convert any driver-related types to 'driver'  
UPDATE admin_notifications SET type = 'driver' WHERE type IN ('driver_update', 'driver_status', 'payout');

-- Step 2: Delete incomplete backfill and recreate comprehensively
-- First delete order notifications that were created by previous incomplete backfill
DELETE FROM admin_notifications 
WHERE type = 'order' 
AND created_at > NOW() - INTERVAL '1 hour'
AND metadata->>'event' IS NOT NULL;

-- Step 3: Create comprehensive order notifications for ALL orders (last 60 days)
-- This creates one notification per order per admin
INSERT INTO admin_notifications (user_id, title, message, type, order_id, metadata, action_url, created_at, is_read)
SELECT 
  ur.user_id,
  CASE 
    WHEN o.status = 'pending' THEN '🆕 New Order Received'
    WHEN o.status = 'for_verification' THEN '📋 Payment Needs Verification'
    WHEN o.status = 'approved' THEN '✅ Order Approved'
    WHEN o.status = 'preparing' THEN '👨‍🍳 Order Being Prepared'
    WHEN o.status = 'ready_for_pickup' THEN '🍕 Order Ready for Pickup'
    WHEN o.status = 'waiting_for_rider' THEN '🚴 Waiting for Driver'
    WHEN o.status = 'picked_up' THEN '📦 Driver Picked Up Order'
    WHEN o.status = 'in_transit' THEN '🚗 Order Out for Delivery'
    WHEN o.status = 'delivered' THEN '✅ Order Delivered'
    WHEN o.status = 'completed' THEN '✅ Order Completed'
    WHEN o.status = 'rejected' THEN '❌ Order Rejected'
    WHEN o.status = 'cancelled' THEN '🚫 Order Cancelled'
    ELSE '📦 Order Update'
  END as title,
  CONCAT('Order #', o.order_number, ' from ', COALESCE(c.name, 'Customer'), ' - ₱', ROUND(o.total_amount::numeric, 2)) as message,
  'order' as type,
  o.id as order_id,
  jsonb_build_object(
    'order_number', o.order_number,
    'event', o.status,
    'total_amount', o.total_amount,
    'order_type', o.order_type,
    'customer_name', c.name,
    'customer_phone', c.phone
  ) as metadata,
  CONCAT('/admin/orders?orderId=', o.id) as action_url,
  COALESCE(o.status_changed_at, o.updated_at, o.created_at) as created_at,
  true as is_read -- Mark historical as read
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
CROSS JOIN user_roles ur
WHERE ur.role IN ('owner', 'manager', 'cashier')
  AND o.created_at > NOW() - INTERVAL '60 days'
  AND NOT EXISTS (
    SELECT 1 FROM admin_notifications an 
    WHERE an.order_id = o.id 
    AND an.user_id = ur.user_id
    AND an.type = 'order'
  );

-- Step 4: Create NEW ORDER notifications (these should show as unread)
-- For orders created in last 24 hours, mark as unread
UPDATE admin_notifications 
SET is_read = false 
WHERE type = 'order' 
AND created_at > NOW() - INTERVAL '24 hours'
AND metadata->>'event' = 'pending';