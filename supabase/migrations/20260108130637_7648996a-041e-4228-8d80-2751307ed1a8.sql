-- Step 1: Rename existing templates to have _admin suffix (these are for admin notifications)
UPDATE public.email_templates SET type = 'new_order_admin', name = 'New Order Alert (Admin)' WHERE type = 'new_order';
UPDATE public.email_templates SET type = 'order_pending_admin', name = 'Order Pending (Admin)' WHERE type = 'order_pending';
UPDATE public.email_templates SET type = 'order_for_verification_admin', name = 'Payment Verification (Admin)' WHERE type = 'order_for_verification';
UPDATE public.email_templates SET type = 'order_approved_admin', name = 'Order Approved (Admin)' WHERE type = 'order_approved';
UPDATE public.email_templates SET type = 'order_rejected_admin', name = 'Order Rejected (Admin)' WHERE type = 'order_rejected';
UPDATE public.email_templates SET type = 'order_cancelled_admin', name = 'Order Cancelled (Admin)' WHERE type = 'order_cancelled';
UPDATE public.email_templates SET type = 'order_preparing_admin', name = 'Order Preparing (Admin)' WHERE type = 'order_preparing';
UPDATE public.email_templates SET type = 'order_ready_for_pickup_admin', name = 'Order Ready (Admin)' WHERE type = 'order_ready_for_pickup';
UPDATE public.email_templates SET type = 'order_waiting_for_rider_admin', name = 'Waiting for Driver (Admin)' WHERE type = 'order_waiting_for_rider';
UPDATE public.email_templates SET type = 'order_picked_up_admin', name = 'Order Picked Up (Admin)' WHERE type = 'order_picked_up';
UPDATE public.email_templates SET type = 'order_in_transit_admin', name = 'Order In Transit (Admin)' WHERE type = 'order_in_transit';
UPDATE public.email_templates SET type = 'order_delivered_admin', name = 'Order Delivered (Admin)' WHERE type = 'order_delivered';
UPDATE public.email_templates SET type = 'order_completed_admin', name = 'Order Completed (Admin)' WHERE type = 'order_completed';
UPDATE public.email_templates SET type = 'order_returned_admin', name = 'Order Returned (Admin)' WHERE type = 'order_returned';
UPDATE public.email_templates SET type = 'driver_assigned_admin', name = 'Driver Assigned (Admin)' WHERE type = 'driver_assigned';
UPDATE public.email_templates SET type = 'payout_requested_admin', name = 'Payout Requested (Admin)' WHERE type = 'payout_requested';
UPDATE public.email_templates SET type = 'payout_approved_admin', name = 'Payout Approved (Admin)' WHERE type = 'payout_approved';
UPDATE public.email_templates SET type = 'payout_rejected_admin', name = 'Payout Rejected (Admin)' WHERE type = 'payout_rejected';

-- Step 2: Insert all customer-facing templates with comprehensive HTML content

-- 1. New Order Confirmation (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'new_order_customer',
  'Order Confirmation (Customer)',
  'Thank you for your order! #{{order_number}}',
  '<h2 style="color: #ea580c; margin-bottom: 15px;">Thank you for your order, {{customer_name}}! 🎉</h2>
<p style="font-size: 16px; margin-bottom: 20px;">We''ve received your order and it''s being reviewed. You''ll receive an update once it''s confirmed.</p>

<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #ea580c;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #fef3c7; color: #92400e;">Order Received</span>
</div>

{{customer_info}}

<h3 style="margin-top: 25px; border-bottom: 2px solid #fed7aa; padding-bottom: 10px;">📦 Order Details</h3>
{{order_items}}

{{order_summary}}

<div style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-radius: 8px; text-align: center;">
  <strong>What''s next?</strong><br>
  We''ll verify your order and send you a confirmation shortly.
</div>',
  true
);

-- 2. Order Approved (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_approved_customer',
  'Order Approved (Customer)',
  '✅ Great news! Order #{{order_number}} Approved!',
  '<h2 style="color: #16a34a; margin-bottom: 15px;">Great news, {{customer_name}}! ✅</h2>
<p style="font-size: 16px; margin-bottom: 20px;">Your order has been <strong>approved</strong> and we''re now preparing your food!</p>

<div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #166534;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dcfce7; color: #166534;">Approved & Preparing</span>
</div>

<h3 style="margin-top: 25px; border-bottom: 2px solid #fed7aa; padding-bottom: 10px;">📦 Your Order</h3>
{{order_items}}

{{order_summary}}

{{customer_info}}

<p style="margin-top: 20px; text-align: center;">We''ll notify you when your order is ready!</p>',
  true
);

-- 3. Order Rejected (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_rejected_customer',
  'Order Rejected (Customer)',
  'Order #{{order_number}} Update',
  '<h2 style="color: #dc2626; margin-bottom: 15px;">Order Update</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Unfortunately, we were unable to process your order at this time.</p>

<div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #991b1b;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #fee2e2; color: #991b1b;">Order Not Processed</span>
  {{#if reason}}<p style="margin-top: 15px;"><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>

{{order_items}}
{{order_summary}}

<p style="margin-top: 20px;">Please contact us if you have any questions. We apologize for the inconvenience.</p>
<p><strong>Contact:</strong> {{business_phone}}</p>',
  true
);

-- 4. Order Cancelled (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_cancelled_customer',
  'Order Cancelled (Customer)',
  'Order #{{order_number}} Cancelled',
  '<h2 style="color: #dc2626; margin-bottom: 15px;">Order Cancelled</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your order has been cancelled.</p>

<div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #991b1b;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #fee2e2; color: #991b1b;">Cancelled</span>
  {{#if reason}}<p style="margin-top: 15px;"><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>

{{order_items}}

<p style="margin-top: 20px;">If you didn''t request this cancellation, please contact us immediately at {{business_phone}}.</p>',
  true
);

-- 5. Order Preparing (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_preparing_customer',
  'Your Order is Being Prepared (Customer)',
  '👨‍🍳 Order #{{order_number}} is Being Prepared!',
  '<h2 style="color: #ea580c; margin-bottom: 15px;">Your order is being prepared! 👨‍🍳</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Our kitchen team is now preparing your delicious food!</p>

<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #ea580c;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dbeafe; color: #1e40af;">Preparing</span>
</div>

<h3>📦 What We''re Making</h3>
{{order_items}}
{{order_summary}}

<p style="margin-top: 20px; text-align: center;">We''ll update you when it''s ready!</p>',
  true
);

-- 6. Order Ready for Pickup (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_ready_for_pickup_customer',
  'Order Ready for Pickup (Customer)',
  '🍗 Order #{{order_number}} is Ready!',
  '<h2 style="color: #16a34a; margin-bottom: 15px;">Your order is ready! 🍗</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your order is ready and waiting for you!</p>

<div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #166534;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dcfce7; color: #166534;">Ready for Pickup</span>
</div>

<h3>📦 Your Order</h3>
{{order_items}}
{{order_summary}}

<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
  <h3 style="margin: 0 0 10px; color: #1e40af;">📍 Pickup Location</h3>
  <p style="margin: 0; font-size: 16px; font-weight: 600;">{{business_address}}</p>
  <p style="margin: 5px 0 0; color: #6b7280;">{{business_phone}}</p>
</div>',
  true
);

-- 7. Driver Assigned (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'driver_assigned_customer',
  'Driver Assigned (Customer)',
  '🚗 Driver Assigned - Order #{{order_number}}',
  '<h2 style="color: #7c3aed; margin-bottom: 15px;">Driver Assigned! 🚗</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">A driver has been assigned to deliver your order.</p>

<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #ea580c;">Order #{{order_number}}</div>
</div>

{{#if driver_name}}
<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <h3 style="margin-top: 0;">👤 Your Driver</h3>
  <p style="margin: 5px 0;"><strong>Name:</strong> {{driver_name}}</p>
  {{#if driver_phone}}<p style="margin: 5px 0;"><strong>Contact:</strong> <a href="tel:{{driver_phone}}" style="color: #ea580c;">{{driver_phone}}</a></p>{{/if}}
</div>
{{/if}}

<h3>📦 Your Order</h3>
{{order_items}}
{{order_summary}}
{{customer_info}}',
  true
);

-- 8. Order In Transit (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_in_transit_customer',
  'Order On The Way (Customer)',
  '🚗 Order #{{order_number}} is On the Way!',
  '<h2 style="color: #2563eb; margin-bottom: 15px;">Your order is on the way! 🚗</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your rider is heading to you now!</p>

<div style="background: #dbeafe; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #1e40af;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dbeafe; color: #1e40af;">Out for Delivery</span>
</div>

{{#if driver_name}}
<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <h3 style="margin-top: 0;">👤 Your Driver</h3>
  <p style="margin: 5px 0;"><strong>Name:</strong> {{driver_name}}</p>
  {{#if driver_phone}}<p style="margin: 5px 0;"><strong>Contact:</strong> <a href="tel:{{driver_phone}}" style="color: #ea580c;">{{driver_phone}}</a></p>{{/if}}
</div>
{{/if}}

<h3>📦 What''s Coming</h3>
{{order_items}}
{{order_summary}}
{{customer_info}}

<p style="text-align: center; margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px;">Please prepare the exact amount if paying cash!</p>',
  true
);

-- 9. Order Delivered (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_delivered_customer',
  'Order Delivered (Customer)',
  '🎉 Order #{{order_number}} Delivered!',
  '<h2 style="color: #16a34a; margin-bottom: 15px;">Order Delivered! 🎉</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your order has been successfully delivered. Enjoy your meal!</p>

<div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #166534;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dcfce7; color: #166534;">Delivered</span>
</div>

<h3>📦 What You Got</h3>
{{order_items}}
{{order_summary}}

<p style="text-align: center; margin-top: 20px; padding: 20px; background: #fef3c7; border-radius: 8px;">
  <strong>Thank you for ordering from {{business_name}}!</strong><br>
  We hope you enjoy your food. See you again soon! 🍗
</p>',
  true
);

-- 10. Order Completed (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_completed_customer',
  'Order Completed (Customer)',
  '✨ Order #{{order_number}} Completed',
  '<h2 style="color: #16a34a; margin-bottom: 15px;">Thank You! ✨</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your order is complete! We hope you enjoyed your meal.</p>

<div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #166534;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #dcfce7; color: #166534;">Completed</span>
</div>

<h3>📦 Order Summary</h3>
{{order_items}}
{{order_summary}}

<p style="text-align: center; margin-top: 20px;">
  Thank you for choosing {{business_name}}! 🙏<br>
  We look forward to serving you again!
</p>',
  true
);

-- 11. Order Returned (Customer)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'order_returned_customer',
  'Order Returned (Customer)',
  '↩️ Order #{{order_number}} Returned',
  '<h2 style="color: #d97706; margin-bottom: 15px;">Order Returned ↩️</h2>
<p style="font-size: 16px;">Hi {{customer_name}},</p>
<p style="margin-bottom: 20px;">Your order was returned to the restaurant.</p>

<div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #92400e;">Order #{{order_number}}</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #fef3c7; color: #92400e;">Returned</span>
  {{#if reason}}<p style="margin-top: 15px;"><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>

{{order_items}}
{{order_summary}}

<p style="margin-top: 20px;">Please contact us at {{business_phone}} for more information or to arrange a refund.</p>',
  true
);

-- 12. Payout Requested (Driver) - Customer email but for driver
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'payout_requested_customer',
  'Payout Request Submitted (Driver)',
  '💰 Payout Request Submitted',
  '<h2 style="color: #ea580c; margin-bottom: 15px;">Payout Requested 💰</h2>
<p style="font-size: 16px;">Hi {{driver_name}},</p>

<div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #ea580c;">Payout Request</div>
  <span style="display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-top: 10px; background: #fef3c7; color: #92400e;">Pending Review</span>
  <p style="font-size: 24px; font-weight: bold; color: #ea580c; margin: 15px 0;">{{payout_amount}}</p>
</div>

<p>Your payout request has been submitted. We''ll review it and process it as soon as possible.</p>',
  true
);

-- 13. Payout Approved (Driver)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'payout_approved_customer',
  'Payout Approved (Driver)',
  '✅ Payout Approved!',
  '<h2 style="color: #16a34a; margin-bottom: 15px;">Payout Approved! ✅</h2>
<p style="font-size: 16px;">Hi {{driver_name}},</p>

<div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #166534;">Payout Approved</div>
  <p style="font-size: 24px; font-weight: bold; color: #16a34a; margin: 15px 0;">{{payout_amount}}</p>
</div>

<p>Your payout has been approved and is being processed. You should receive the funds shortly.</p>',
  true
);

-- 14. Payout Rejected (Driver)
INSERT INTO public.email_templates (type, name, subject, content, is_active) VALUES (
  'payout_rejected_customer',
  'Payout Request Update (Driver)',
  'Payout Request Update',
  '<h2 style="color: #dc2626; margin-bottom: 15px;">Payout Update</h2>
<p style="font-size: 16px;">Hi {{driver_name}},</p>

<div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0;">
  <div style="font-size: 20px; font-weight: bold; color: #991b1b;">Payout Request</div>
  <p style="font-size: 24px; font-weight: bold; color: #dc2626; margin: 15px 0;">{{payout_amount}}</p>
  {{#if reason}}<p style="margin-top: 15px;"><strong>Reason:</strong> {{reason}}</p>{{/if}}
</div>

<p>Unfortunately, your payout request could not be processed at this time. Please contact support if you have questions.</p>',
  true
);