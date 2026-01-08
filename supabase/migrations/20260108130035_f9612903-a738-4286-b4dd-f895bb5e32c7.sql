-- Update all email templates with comprehensive HTML content

-- 1. new_order (Customer confirmation)
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #ea580c;">Thank you for your order, {{customer_name}}!</h2>
  <p>We''ve received your order and it''s being reviewed.</p>
  
  <div style="background: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px; color: #ea580c;">Order #{{order_number}}</strong>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151; border-bottom: 2px solid #ea580c; padding-bottom: 8px;">Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p style="margin-top: 24px;">We''ll notify you when your order is confirmed!</p>
  <p style="color: #6b7280; font-size: 14px;">If you have any questions, please contact us.</p>
</div>
', subject = 'Order Confirmed - #{{order_number}}', updated_at = now()
WHERE type = 'new_order';

-- 2. order_pending
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #f59e0b;">Order Pending Review</h2>
  <p>Hi {{customer_name}}, your order <strong>#{{order_number}}</strong> is pending review.</p>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>We''ll notify you once your order is approved.</p>
</div>
', subject = 'Order Pending - #{{order_number}}', updated_at = now()
WHERE type = 'order_pending';

-- 3. order_for_verification
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #3b82f6;">Payment Verification Required</h2>
  <p>Hi {{customer_name}}, your order <strong>#{{order_number}}</strong> requires payment verification.</p>
  
  <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Payment Method:</strong> {{payment_method}}<br>
    <strong>Amount:</strong> {{total_amount}}
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Please ensure your payment proof is uploaded. We''ll verify and confirm shortly.</p>
</div>
', subject = 'Payment Verification - Order #{{order_number}}', updated_at = now()
WHERE type = 'order_for_verification';

-- 4. order_approved
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Great news, {{customer_name}}! 🎉</h2>
  <p>Your order has been <strong style="color: #16a34a;">approved</strong> and we''re now preparing your food!</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #16a34a;">✓ Approved & Preparing</span>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p style="margin-top: 24px;">We''ll notify you when your order is ready!</p>
</div>
', subject = 'Order Approved! - #{{order_number}}', updated_at = now()
WHERE type = 'order_approved';

-- 5. order_rejected
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Order Not Approved</h2>
  <p>Hi {{customer_name}}, we''re sorry but your order <strong>#{{order_number}}</strong> could not be approved.</p>
  
  {{#if reason}}
  <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Reason:</strong> {{reason}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Please contact us if you have any questions or would like to place a new order.</p>
</div>
', subject = 'Order Update - #{{order_number}}', updated_at = now()
WHERE type = 'order_rejected';

-- 6. order_cancelled
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #6b7280;">Order Cancelled</h2>
  <p>Hi {{customer_name}}, your order <strong>#{{order_number}}</strong> has been cancelled.</p>
  
  {{#if reason}}
  <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Reason:</strong> {{reason}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Cancelled Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>We hope to serve you again soon!</p>
</div>
', subject = 'Order Cancelled - #{{order_number}}', updated_at = now()
WHERE type = 'order_cancelled';

-- 7. order_preparing
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #ea580c;">Your Order is Being Prepared! 👨‍🍳</h2>
  <p>Hi {{customer_name}}, we''re now preparing your delicious order!</p>
  
  <div style="background: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #ea580c;">🔥 Now Cooking</span>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">What We''re Making</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>We''ll notify you when it''s ready!</p>
</div>
', subject = 'Preparing Your Order - #{{order_number}}', updated_at = now()
WHERE type = 'order_preparing';

-- 8. order_ready_for_pickup
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Your Order is Ready! 🎉</h2>
  <p>Hi {{customer_name}}, your order is ready for pickup!</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #16a34a;">✓ Ready for Pickup</span>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p><strong>Please pick up your order at your earliest convenience!</strong></p>
</div>
', subject = 'Order Ready for Pickup - #{{order_number}}', updated_at = now()
WHERE type = 'order_ready_for_pickup';

-- 9. order_waiting_for_rider
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #8b5cf6;">Finding Your Rider 🛵</h2>
  <p>Hi {{customer_name}}, your order is ready and we''re assigning a rider!</p>
  
  <div style="background: #f3e8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #8b5cf6;">⏳ Waiting for Rider</span>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>We''ll notify you once a rider is assigned!</p>
</div>
', subject = 'Finding Your Rider - Order #{{order_number}}', updated_at = now()
WHERE type = 'order_waiting_for_rider';

-- 10. order_picked_up
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0891b2;">Order Picked Up! 📦</h2>
  <p>Hi {{customer_name}}, your order has been picked up by the rider!</p>
  
  <div style="background: #cffafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #0891b2;">✓ Picked Up</span>
  </div>
  
  {{#if driver_name}}
  <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Your Driver:</strong> {{driver_name}}<br>
    {{#if driver_phone}}<strong>Contact:</strong> {{driver_phone}}{{/if}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
</div>
', subject = 'Order Picked Up - #{{order_number}}', updated_at = now()
WHERE type = 'order_picked_up';

-- 11. order_in_transit
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0891b2;">Your Order is On the Way! 🚗</h2>
  <p>Hi {{customer_name}}, your order is on its way to you!</p>
  
  <div style="background: #cffafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #0891b2;">🛵 In Transit</span>
  </div>
  
  {{#if driver_name}}
  <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Your Driver:</strong> {{driver_name}}<br>
    {{#if driver_phone}}<strong>Contact:</strong> {{driver_phone}}{{/if}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p><strong>Please be ready to receive your order!</strong></p>
</div>
', subject = 'Order On the Way - #{{order_number}}', updated_at = now()
WHERE type = 'order_in_transit';

-- 12. order_delivered
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Order Delivered! 🎉</h2>
  <p>Hi {{customer_name}}, your order has been delivered!</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #16a34a;">✓ Delivered Successfully</span>
  </div>
  
  {{#if driver_name}}
  <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Delivered by:</strong> {{driver_name}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Thank you for ordering with us! We hope you enjoy your meal! 😋</p>
</div>
', subject = 'Order Delivered - #{{order_number}}', updated_at = now()
WHERE type = 'order_delivered';

-- 13. order_completed
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Order Complete! ✅</h2>
  <p>Hi {{customer_name}}, your order has been completed!</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong><br>
    <span style="color: #16a34a;">✓ Completed</span>
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Order Summary</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Thank you for your order! We hope to see you again soon! 🙏</p>
</div>
', subject = 'Order Complete - #{{order_number}}', updated_at = now()
WHERE type = 'order_completed';

-- 14. order_returned
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Order Returned</h2>
  <p>Hi {{customer_name}}, unfortunately your order <strong>#{{order_number}}</strong> was returned.</p>
  
  {{#if reason}}
  <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Reason:</strong> {{reason}}
  </div>
  {{/if}}
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Order Details</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Please contact us to arrange a new delivery or refund.</p>
</div>
', subject = 'Order Returned - #{{order_number}}', updated_at = now()
WHERE type = 'order_returned';

-- 15. driver_assigned
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Driver Assigned! 🛵</h2>
  <p>Hi {{customer_name}}, a driver has been assigned to deliver your order!</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 18px;">Order #{{order_number}}</strong>
  </div>
  
  <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
    <h3 style="margin-top: 0; color: #16a34a;">Your Driver</h3>
    <p style="margin: 8px 0;"><strong>Name:</strong> {{driver_name}}</p>
    {{#if driver_phone}}<p style="margin: 8px 0;"><strong>Contact:</strong> {{driver_phone}}</p>{{/if}}
  </div>
  
  {{customer_info}}
  
  <h3 style="color: #374151;">Your Order</h3>
  {{order_items}}
  
  {{order_summary}}
  
  <p>Your driver will pick up your order and deliver it to you soon!</p>
</div>
', subject = 'Driver Assigned - Order #{{order_number}}', updated_at = now()
WHERE type = 'driver_assigned';

-- 16. payout_requested
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #8b5cf6;">Payout Request Received</h2>
  <p>Your payout request has been submitted and is being processed.</p>
  
  <div style="background: #f3e8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 24px; color: #8b5cf6;">{{payout_amount}}</strong><br>
    <span>Payout Amount</span>
  </div>
  
  <p>We''ll notify you once your payout has been processed.</p>
</div>
', subject = 'Payout Request Received', updated_at = now()
WHERE type = 'payout_requested';

-- 17. payout_approved
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Payout Approved! 💰</h2>
  <p>Great news! Your payout has been approved and processed.</p>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 24px; color: #16a34a;">{{payout_amount}}</strong><br>
    <span style="color: #16a34a;">✓ Approved & Processed</span>
  </div>
  
  <p>The funds should reflect in your account shortly.</p>
</div>
', subject = 'Payout Approved!', updated_at = now()
WHERE type = 'payout_approved';

-- 18. payout_rejected
UPDATE email_templates SET content = '
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Payout Request Declined</h2>
  <p>We''re sorry, but your payout request could not be processed.</p>
  
  <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 24px;">{{payout_amount}}</strong><br>
    <span style="color: #dc2626;">✗ Not Approved</span>
  </div>
  
  {{#if reason}}
  <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <strong>Reason:</strong> {{reason}}
  </div>
  {{/if}}
  
  <p>Please contact admin for more information.</p>
</div>
', subject = 'Payout Request Update', updated_at = now()
WHERE type = 'payout_rejected';