-- Backfill admin notifications for all recent orders (last 60 days)
-- This creates notifications for ALL admins for each order's current status

-- First, let's create notifications for orders based on their current status
INSERT INTO admin_notifications (user_id, title, message, type, order_id, metadata, action_url, created_at)
SELECT 
  ur.user_id,
  CASE 
    WHEN o.status = 'delivered' THEN '✅ Order Delivered'
    WHEN o.status = 'completed' THEN '✅ Order Completed'
    WHEN o.status = 'in_transit' THEN '🚗 Order In Transit'
    WHEN o.status = 'picked_up' THEN '📦 Order Picked Up'
    WHEN o.status = 'waiting_for_rider' THEN '🚴 Waiting for Rider'
    WHEN o.status = 'ready_for_pickup' THEN '🍕 Order Ready for Pickup'
    WHEN o.status = 'preparing' THEN '👨‍🍳 Order Being Prepared'
    WHEN o.status = 'approved' THEN '✅ Order Approved'
    WHEN o.status = 'for_verification' THEN '📋 Order Needs Verification'
    WHEN o.status = 'pending' THEN '🆕 New Order Received'
    WHEN o.status = 'rejected' THEN '❌ Order Rejected'
    WHEN o.status = 'cancelled' THEN '🚫 Order Cancelled'
    ELSE '📦 Order Update'
  END as title,
  CONCAT('Order #', o.order_number, ' - ₱', ROUND(o.total_amount::numeric, 2)) as message,
  'order' as type,
  o.id as order_id,
  jsonb_build_object(
    'order_number', o.order_number,
    'event', o.status,
    'total_amount', o.total_amount,
    'order_type', o.order_type,
    'customer_name', c.name
  ) as metadata,
  CONCAT('/admin/orders?orderId=', o.id) as action_url,
  COALESCE(o.status_changed_at, o.updated_at, o.created_at) as created_at
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

-- Create driver-related notifications (for driver assignments and deliveries)
INSERT INTO admin_notifications (user_id, title, message, type, order_id, metadata, action_url, created_at)
SELECT 
  ur.user_id,
  CASE 
    WHEN o.status = 'picked_up' THEN '🚗 Driver Picked Up Order'
    WHEN o.status = 'in_transit' THEN '🚗 Delivery In Progress'
    WHEN o.status = 'delivered' THEN '✅ Order Delivered by Driver'
    ELSE '🚴 Driver Assigned'
  END as title,
  CONCAT('Order #', o.order_number, ' - Driver: ', COALESCE(d.name, 'Assigned')) as message,
  'driver' as type,
  o.id as order_id,
  jsonb_build_object(
    'order_number', o.order_number,
    'driver_name', d.name,
    'driver_id', o.driver_id,
    'status', o.status
  ) as metadata,
  CONCAT('/admin/orders?orderId=', o.id) as action_url,
  COALESCE(o.status_changed_at, o.updated_at) as created_at
FROM orders o
LEFT JOIN drivers d ON o.driver_id = d.id
CROSS JOIN user_roles ur
WHERE ur.role IN ('owner', 'manager', 'cashier')
  AND o.driver_id IS NOT NULL
  AND o.order_type = 'delivery'
  AND o.created_at > NOW() - INTERVAL '60 days'
  AND NOT EXISTS (
    SELECT 1 FROM admin_notifications an 
    WHERE an.order_id = o.id 
    AND an.user_id = ur.user_id
    AND an.type = 'driver'
  );

-- Create payout notifications
INSERT INTO admin_notifications (user_id, title, message, type, metadata, action_url, created_at)
SELECT 
  ur.user_id,
  CASE 
    WHEN dp.status = 'pending' THEN '💰 New Payout Request'
    WHEN dp.status = 'approved' THEN '✅ Payout Approved'
    WHEN dp.status = 'rejected' THEN '❌ Payout Rejected'
    ELSE '💰 Payout Update'
  END as title,
  CONCAT('Driver payout request: ₱', ROUND(dp.amount::numeric, 2)) as message,
  'driver' as type,
  jsonb_build_object(
    'payout_id', dp.id,
    'driver_id', dp.driver_id,
    'driver_name', d.name,
    'amount', dp.amount,
    'status', dp.status
  ) as metadata,
  '/admin/payouts' as action_url,
  dp.created_at as created_at
FROM driver_payouts dp
LEFT JOIN drivers d ON dp.driver_id = d.id
CROSS JOIN user_roles ur
WHERE ur.role IN ('owner', 'manager', 'cashier')
  AND dp.created_at > NOW() - INTERVAL '60 days'
  AND NOT EXISTS (
    SELECT 1 FROM admin_notifications an 
    WHERE an.user_id = ur.user_id
    AND an.type = 'driver'
    AND (an.metadata->>'payout_id')::text = dp.id::text
  );