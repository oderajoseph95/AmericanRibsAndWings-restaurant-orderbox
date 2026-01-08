import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const FROM_EMAIL = "American Ribs & Wings <team@updates.arwfloridablanca.shop>";
const BUSINESS_NAME = "American Ribs & Wings";
const BUSINESS_ADDRESS = "Floridablanca, Pampanga";
const BUSINESS_PHONE = "+63 921 408 0286";

// CRITICAL: General notification email - ALWAYS receives admin notifications
const GENERAL_NOTIFICATION_EMAIL = "arwfloridablancapampanga@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
  flavors?: Array<{ name: string; quantity: number; surcharge?: number }>;
}

interface EmailPayload {
  type: string;
  recipientEmail?: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  totalAmount?: number;
  subtotal?: number;
  deliveryFee?: number;
  deliveryDistance?: number;
  deliveryAddress?: string;
  orderType?: string;
  paymentMethod?: string;
  pickupDate?: string;
  pickupTime?: string;
  landmark?: string;
  notes?: string;
  driverName?: string;
  driverPhone?: string;
  payoutAmount?: number;
  reason?: string;
  orderItems?: OrderItem[];
}

// Format currency
function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return "₱0.00";
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format payment method for display
function formatPaymentMethod(method: string | undefined): string {
  if (!method) return "Not specified";
  const methods: Record<string, string> = {
    cash: "Cash on Delivery/Pickup",
    gcash: "GCash",
    bank: "Bank Transfer",
  };
  return methods[method.toLowerCase()] || method;
}

// Format order type for display
function formatOrderType(type: string | undefined): string {
  if (!type) return "";
  return type === "delivery" ? "🚗 Delivery" : "🏪 Pickup";
}

// Generate HTML table for order items
function generateOrderItemsHtml(items: OrderItem[] | undefined): string {
  if (!items || items.length === 0) {
    return '<p style="color: #6b7280; font-style: italic;">Order items not available</p>';
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
      <thead>
        <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 10px; font-size: 13px; color: #374151;">Item</th>
          <th style="text-align: center; padding: 10px; font-size: 13px; color: #374151;">Qty</th>
          <th style="text-align: right; padding: 10px; font-size: 13px; color: #374151;">Price</th>
          <th style="text-align: right; padding: 10px; font-size: 13px; color: #374151;">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of items) {
    const flavorsText = item.flavors && item.flavors.length > 0
      ? `<br><span style="font-size: 11px; color: #6b7280;">Flavors: ${item.flavors.map(f => `${f.name} (${f.quantity})`).join(', ')}</span>`
      : '';
    
    html += `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 10px; font-size: 14px;">
          <strong>${item.name}</strong>${item.sku ? `<br><span style="font-size: 11px; color: #9ca3af;">SKU: ${item.sku}</span>` : ''}${flavorsText}
        </td>
        <td style="text-align: center; padding: 12px 10px; font-size: 14px;">${item.quantity}</td>
        <td style="text-align: right; padding: 12px 10px; font-size: 14px;">${formatCurrency(item.unitPrice)}</td>
        <td style="text-align: right; padding: 12px 10px; font-size: 14px; font-weight: 600;">${formatCurrency(item.lineTotal)}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  return html;
}

// Generate order summary section
function generateOrderSummaryHtml(payload: EmailPayload): string {
  const { subtotal, deliveryFee, deliveryDistance, totalAmount, paymentMethod } = payload;
  
  let html = `
    <div style="background: #f9fafb; border-radius: 8px; padding: 15px; margin-top: 15px;">
      <table style="width: 100%;">
  `;

  if (subtotal !== undefined) {
    html += `
      <tr>
        <td style="padding: 5px 0; color: #6b7280;">Subtotal:</td>
        <td style="text-align: right; padding: 5px 0;">${formatCurrency(subtotal)}</td>
      </tr>
    `;
  }

  if (deliveryFee !== undefined && deliveryFee > 0) {
    html += `
      <tr>
        <td style="padding: 5px 0; color: #6b7280;">Delivery Fee${deliveryDistance ? ` (${deliveryDistance.toFixed(1)} km)` : ''}:</td>
        <td style="text-align: right; padding: 5px 0;">${formatCurrency(deliveryFee)}</td>
      </tr>
    `;
  }

  html += `
      <tr style="border-top: 2px solid #e5e7eb;">
        <td style="padding: 10px 0 5px; font-weight: bold; font-size: 16px; color: #111827;">Total:</td>
        <td style="text-align: right; padding: 10px 0 5px; font-weight: bold; font-size: 18px; color: #ea580c;">${formatCurrency(totalAmount)}</td>
      </tr>
    </table>
    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
      <span style="color: #6b7280; font-size: 13px;">Payment Method:</span>
      <span style="font-weight: 600; margin-left: 5px;">${formatPaymentMethod(paymentMethod)}</span>
    </div>
  </div>
  `;

  return html;
}

// Generate customer info section
function generateCustomerInfoHtml(payload: EmailPayload): string {
  const { customerName, customerPhone, customerEmail, orderType, deliveryAddress, landmark, pickupDate, pickupTime, notes } = payload;
  
  let html = `
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 15px; margin: 15px 0;">
      <h3 style="margin: 0 0 10px; font-size: 14px; color: #c2410c; text-transform: uppercase; letter-spacing: 0.5px;">Customer Information</h3>
      <table style="width: 100%;">
  `;

  if (customerName) {
    html += `<tr><td style="padding: 4px 0; color: #6b7280; width: 100px;">Name:</td><td style="padding: 4px 0; font-weight: 600;">${customerName}</td></tr>`;
  }
  if (customerPhone) {
    html += `<tr><td style="padding: 4px 0; color: #6b7280;">Phone:</td><td style="padding: 4px 0;"><a href="tel:${customerPhone}" style="color: #ea580c; text-decoration: none;">${customerPhone}</a></td></tr>`;
  }
  if (customerEmail) {
    html += `<tr><td style="padding: 4px 0; color: #6b7280;">Email:</td><td style="padding: 4px 0;"><a href="mailto:${customerEmail}" style="color: #ea580c; text-decoration: none;">${customerEmail}</a></td></tr>`;
  }

  html += `</table></div>`;

  // Delivery/Pickup info
  if (orderType === 'delivery' && deliveryAddress) {
    html += `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <h3 style="margin: 0 0 10px; font-size: 14px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">🚗 Delivery Details</h3>
        <p style="margin: 0 0 8px;"><strong>Address:</strong> ${deliveryAddress}</p>
        ${landmark ? `<p style="margin: 0 0 8px;"><strong>Landmark:</strong> ${landmark}</p>` : ''}
      </div>
    `;
  } else if (orderType === 'pickup') {
    html += `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <h3 style="margin: 0 0 10px; font-size: 14px; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">🏪 Pickup Details</h3>
        ${pickupDate ? `<p style="margin: 0 0 8px;"><strong>Date:</strong> ${pickupDate}</p>` : ''}
        ${pickupTime ? `<p style="margin: 0 0 8px;"><strong>Time:</strong> ${pickupTime}</p>` : ''}
        <p style="margin: 0;"><strong>Store:</strong> ${BUSINESS_ADDRESS}</p>
      </div>
    `;
  }

  if (notes) {
    html += `
      <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 15px; margin: 15px 0;">
        <h3 style="margin: 0 0 8px; font-size: 14px; color: #854d0e;">📝 Customer Notes</h3>
        <p style="margin: 0; font-style: italic;">${notes}</p>
      </div>
    `;
  }

  return html;
}

// Fetch ALL admin emails (owners + super_owners) from the database
async function getAdminEmails(supabase: any): Promise<string[]> {
  try {
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role, is_super_owner')
      .or('role.eq.owner,is_super_owner.eq.true');
    
    if (rolesError || !adminRoles || adminRoles.length === 0) {
      console.log("No admin roles found or error:", rolesError);
      return [];
    }

    console.log(`Found ${adminRoles.length} admin roles (owner + super_owner)`);

    const uniqueUserIds = [...new Set(adminRoles.map((r: any) => r.user_id))];

    const adminEmails: string[] = [];
    for (const userId of uniqueUserIds) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (!userError && userData?.user?.email) {
        adminEmails.push(userData.user.email);
        console.log(`Admin email found: ${userData.user.email}`);
      }
    }

    return adminEmails;
  } catch (error) {
    console.error("Error fetching admin emails:", error);
    return [];
  }
}

// Log email sent
async function logEmailSent(supabase: any, payload: EmailPayload, recipients: string[], emailType: string): Promise<void> {
  try {
    await supabase.from('admin_logs').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      user_email: 'system@arwfloridablanca.shop',
      action: 'email_sent',
      entity_type: 'email',
      entity_id: payload.orderId || null,
      entity_name: `${payload.type} - ${payload.orderNumber || 'N/A'}`,
      details: `${emailType} email sent to ${recipients.join(', ')}`,
      new_values: {
        type: payload.type,
        email_type: emailType,
        recipients: recipients,
        order_number: payload.orderNumber,
        customer_name: payload.customerName,
      },
    });
  } catch (error) {
    console.error("Error logging email:", error);
  }
}

// Create admin notifications
async function createEmailNotification(supabase: any, payload: EmailPayload, recipientType: string): Promise<void> {
  try {
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'manager', 'cashier']);
    
    if (rolesError || !adminRoles) return;

    const notifications = adminRoles.map((role: any) => ({
      user_id: role.user_id,
      title: `📧 Email Sent`,
      message: `${getEmailTypeLabel(payload.type)} email sent (${recipientType})${payload.orderNumber ? ` for order #${payload.orderNumber}` : ''}`,
      type: 'email_sent',
      order_id: payload.orderId || null,
      action_url: payload.orderId ? `/admin/orders?order=${payload.orderId}` : '/admin/email-templates',
      metadata: { email_type: payload.type, recipient_type: recipientType, order_number: payload.orderNumber },
    }));

    await supabase.from('admin_notifications').insert(notifications);
  } catch (error) {
    console.error("Error creating email notifications:", error);
  }
}

function getEmailTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    new_order: 'New Order',
    order_pending: 'Order Pending',
    order_for_verification: 'Order Verification',
    order_approved: 'Order Approved',
    order_rejected: 'Order Rejected',
    order_cancelled: 'Order Cancelled',
    order_preparing: 'Order Preparing',
    order_ready_for_pickup: 'Order Ready',
    order_waiting_for_rider: 'Waiting for Rider',
    order_picked_up: 'Order Picked Up',
    order_in_transit: 'Order In Transit',
    order_delivered: 'Order Delivered',
    order_completed: 'Order Completed',
    order_returned: 'Order Returned',
    driver_assigned: 'Driver Assigned',
    payout_requested: 'Payout Requested',
    payout_approved: 'Payout Approved',
    payout_rejected: 'Payout Rejected',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

// Replace template variables
function replaceVariables(text: string, payload: EmailPayload): string {
  let result = text;
  
  result = result.replace(/\{\{order_number\}\}/g, payload.orderNumber || '');
  result = result.replace(/\{\{customer_name\}\}/g, payload.customerName || '');
  result = result.replace(/\{\{customer_phone\}\}/g, payload.customerPhone || '');
  result = result.replace(/\{\{customer_email\}\}/g, payload.customerEmail || '');
  result = result.replace(/\{\{total_amount\}\}/g, formatCurrency(payload.totalAmount));
  result = result.replace(/\{\{subtotal\}\}/g, formatCurrency(payload.subtotal));
  result = result.replace(/\{\{delivery_fee\}\}/g, formatCurrency(payload.deliveryFee));
  result = result.replace(/\{\{delivery_distance\}\}/g, payload.deliveryDistance?.toFixed(1) || '');
  result = result.replace(/\{\{delivery_address\}\}/g, payload.deliveryAddress || '');
  result = result.replace(/\{\{landmark\}\}/g, payload.landmark || '');
  result = result.replace(/\{\{order_type\}\}/g, formatOrderType(payload.orderType));
  result = result.replace(/\{\{payment_method\}\}/g, formatPaymentMethod(payload.paymentMethod));
  result = result.replace(/\{\{pickup_date\}\}/g, payload.pickupDate || '');
  result = result.replace(/\{\{pickup_time\}\}/g, payload.pickupTime || '');
  result = result.replace(/\{\{notes\}\}/g, payload.notes || '');
  result = result.replace(/\{\{driver_name\}\}/g, payload.driverName || '');
  result = result.replace(/\{\{driver_phone\}\}/g, payload.driverPhone || '');
  result = result.replace(/\{\{payout_amount\}\}/g, formatCurrency(payload.payoutAmount));
  result = result.replace(/\{\{reason\}\}/g, payload.reason || '');
  result = result.replace(/\{\{business_name\}\}/g, BUSINESS_NAME);
  result = result.replace(/\{\{business_address\}\}/g, BUSINESS_ADDRESS);
  result = result.replace(/\{\{business_phone\}\}/g, BUSINESS_PHONE);
  result = result.replace(/\{\{order_items\}\}/g, generateOrderItemsHtml(payload.orderItems));
  result = result.replace(/\{\{order_summary\}\}/g, generateOrderSummaryHtml(payload));
  result = result.replace(/\{\{customer_info\}\}/g, generateCustomerInfoHtml(payload));
  
  // Handle conditionals
  const conditionalRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, variable, content) => {
    const value = (payload as any)[variable] || (payload as any)[variable.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase())];
    return value ? content : '';
  });
  
  return result;
}

// Email styles
const baseStyles = `
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .order-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .order-number { font-size: 20px; font-weight: bold; color: #ea580c; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; margin: 10px 0; }
    .status-approved { background: #dcfce7; color: #166534; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .status-info { background: #dbeafe; color: #1e40af; }
    .status-warning { background: #fef3c7; color: #92400e; }
    .driver-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .cta-button { display: inline-block; background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
`;

function getDefaultSubject(type: string, orderNumber?: string): string {
  const subjects: Record<string, string> = {
    new_order: `🔔 Order Confirmation - #${orderNumber}`,
    order_pending: `📋 Order #${orderNumber} Received`,
    order_for_verification: `🔍 Order #${orderNumber} - Payment Verification`,
    order_approved: `✅ Order #${orderNumber} Approved!`,
    order_rejected: `❌ Order #${orderNumber} Update`,
    order_cancelled: `Order #${orderNumber} Cancelled`,
    order_preparing: `👨‍🍳 Order #${orderNumber} is Being Prepared!`,
    order_ready_for_pickup: `🍗 Order #${orderNumber} is Ready!`,
    order_waiting_for_rider: `🚗 Order #${orderNumber} Waiting for Driver`,
    order_picked_up: `📦 Order #${orderNumber} Picked Up`,
    order_in_transit: `🚗 Order #${orderNumber} is On the Way!`,
    order_delivered: `🎉 Order #${orderNumber} Delivered!`,
    order_completed: `✨ Order #${orderNumber} Completed`,
    order_returned: `↩️ Order #${orderNumber} Returned`,
    driver_assigned: `🚗 Driver Assigned - Order #${orderNumber}`,
    payout_requested: `💰 Payout Request Submitted`,
    payout_approved: `✅ Payout Approved!`,
    payout_rejected: `Payout Request Update`,
  };
  return subjects[type] || `Order #${orderNumber} Update`;
}

// Generate comprehensive customer email template
function getDefaultTemplate(payload: EmailPayload): string {
  const { type, orderNumber, customerName, driverName, driverPhone, payoutAmount, reason } = payload;

  const header = `<div class="header"><h1>${BUSINESS_NAME}</h1></div>`;
  const footer = `
    <div class="footer">
      <p>Thank you for choosing ${BUSINESS_NAME}!</p>
      <p>${BUSINESS_ADDRESS} | ${BUSINESS_PHONE}</p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 15px;">
        Questions? Reply to this email or call us at ${BUSINESS_PHONE}
      </p>
    </div>
  `;

  let content = '';

  switch (type) {
    case 'new_order':
      content = `
        <div class="content">
          <h2>Thank you for your order, ${customerName}! 🎉</h2>
          <p>We've received your order and it's being reviewed. You'll receive an update once it's confirmed.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-warning">Order Received</span>
          </div>

          ${generateCustomerInfoHtml(payload)}
          
          <h3 style="margin-top: 25px; border-bottom: 2px solid #fed7aa; padding-bottom: 10px;">📦 Order Details</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-radius: 8px; text-align: center;">
            <strong>What's next?</strong><br>
            We'll verify your order and send you a confirmation shortly.
          </p>
        </div>
      `;
      break;

    case 'order_approved':
      content = `
        <div class="content">
          <h2>Great news, ${customerName}! ✅</h2>
          <p>Your order has been <strong>approved</strong> and we're now preparing your food!</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Approved & Preparing</span>
          </div>

          <h3 style="margin-top: 25px; border-bottom: 2px solid #fed7aa; padding-bottom: 10px;">📦 Your Order</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          ${generateCustomerInfoHtml(payload)}
          
          <p style="margin-top: 20px;">We'll notify you when your order is ready${payload.orderType === 'delivery' ? ' for delivery' : ' for pickup'}!</p>
        </div>
      `;
      break;

    case 'order_rejected':
      content = `
        <div class="content">
          <h2>Order Update</h2>
          <p>Hi ${customerName},</p>
          <p>Unfortunately, we were unable to process your order at this time.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-rejected">Order Not Processed</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>

          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p>Please contact us if you have any questions. We apologize for the inconvenience.</p>
          <p><strong>Contact:</strong> ${BUSINESS_PHONE}</p>
        </div>
      `;
      break;

    case 'order_cancelled':
      content = `
        <div class="content">
          <h2>Order Cancelled</h2>
          <p>Hi ${customerName},</p>
          <p>Your order has been cancelled.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-rejected">Cancelled</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>

          ${generateOrderItemsHtml(payload.orderItems)}
          
          <p>If you didn't request this cancellation, please contact us immediately at ${BUSINESS_PHONE}.</p>
        </div>
      `;
      break;

    case 'order_preparing':
      content = `
        <div class="content">
          <h2>Your order is being prepared! 👨‍🍳</h2>
          <p>Hi ${customerName},</p>
          <p>Our kitchen team is now preparing your delicious food!</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">Preparing</span>
          </div>

          <h3>📦 What We're Making</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p>We'll update you when it's ready!</p>
        </div>
      `;
      break;

    case 'order_ready_for_pickup':
      content = `
        <div class="content">
          <h2>Your order is ready! 🍗</h2>
          <p>Hi ${customerName},</p>
          <p>Your order is ready and waiting for you!</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Ready for Pickup</span>
          </div>

          <h3>📦 Your Order</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="margin: 0 0 10px; color: #1e40af;">📍 Pickup Location</h3>
            <p style="margin: 0; font-size: 16px; font-weight: 600;">${BUSINESS_ADDRESS}</p>
            <p style="margin: 5px 0 0; color: #6b7280;">${BUSINESS_PHONE}</p>
          </div>
        </div>
      `;
      break;

    case 'driver_assigned':
      content = `
        <div class="content">
          <h2>Driver Assigned! 🚗</h2>
          <p>Hi ${customerName},</p>
          <p>A driver has been assigned to deliver your order.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
          </div>

          ${driverName ? `
          <div class="driver-box">
            <h3 style="margin-top: 0;">👤 Your Driver</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${driverName}</p>
            ${driverPhone ? `<p style="margin: 5px 0;"><strong>Contact:</strong> <a href="tel:${driverPhone}" style="color: #ea580c;">${driverPhone}</a></p>` : ''}
          </div>
          ` : ''}

          <h3>📦 Your Order</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          ${generateCustomerInfoHtml(payload)}
        </div>
      `;
      break;

    case 'order_in_transit':
      content = `
        <div class="content">
          <h2>Your order is on the way! 🚗</h2>
          <p>Hi ${customerName},</p>
          <p>Your rider is heading to you now!</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">Out for Delivery</span>
          </div>

          ${driverName ? `
          <div class="driver-box">
            <h3 style="margin-top: 0;">👤 Your Driver</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${driverName}</p>
            ${driverPhone ? `<p style="margin: 5px 0;"><strong>Contact:</strong> <a href="tel:${driverPhone}" style="color: #ea580c;">${driverPhone}</a></p>` : ''}
          </div>
          ` : ''}

          <h3>📦 What's Coming</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          ${generateCustomerInfoHtml(payload)}
          
          <p style="text-align: center; margin-top: 20px;">Please prepare the exact amount if paying cash!</p>
        </div>
      `;
      break;

    case 'order_delivered':
      content = `
        <div class="content">
          <h2>Order Delivered! 🎉</h2>
          <p>Hi ${customerName},</p>
          <p>Your order has been successfully delivered. Enjoy your meal!</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Delivered</span>
          </div>

          <h3>📦 What You Got</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p style="text-align: center; margin-top: 20px; padding: 20px; background: #fef3c7; border-radius: 8px;">
            <strong>Thank you for ordering from ${BUSINESS_NAME}!</strong><br>
            We hope you enjoy your food. See you again soon! 🍗
          </p>
        </div>
      `;
      break;

    case 'order_completed':
      content = `
        <div class="content">
          <h2>Thank You! ✨</h2>
          <p>Hi ${customerName},</p>
          <p>Your order is complete! We hope you enjoyed your meal.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Completed</span>
          </div>

          <h3>📦 Order Summary</h3>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p style="text-align: center; margin-top: 20px;">
            Thank you for choosing ${BUSINESS_NAME}! 🙏<br>
            We look forward to serving you again!
          </p>
        </div>
      `;
      break;

    case 'order_returned':
      content = `
        <div class="content">
          <h2>Order Returned ↩️</h2>
          <p>Hi ${customerName},</p>
          <p>Your order was returned to the restaurant.</p>
          
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-rejected">Returned</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>

          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          
          <p>Please contact us at ${BUSINESS_PHONE} for more information or to arrange a refund.</p>
        </div>
      `;
      break;

    case 'payout_requested':
      content = `
        <div class="content">
          <h2>Payout Requested 💰</h2>
          <p>Hi ${driverName},</p>
          <div class="order-box">
            <div class="order-number">Payout Request</div>
            <span class="status-badge status-warning">Pending Review</span>
            <p style="font-size: 24px; font-weight: bold; color: #ea580c; margin: 15px 0;">₱${payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
          <p>Your payout request has been submitted. We'll review it and process it as soon as possible.</p>
        </div>
      `;
      break;

    case 'payout_approved':
      content = `
        <div class="content">
          <h2>Payout Approved! ✅</h2>
          <p>Hi ${driverName},</p>
          <div class="order-box">
            <div class="order-number">Payout Approved</div>
            <span class="status-badge status-approved">Approved</span>
            <p style="font-size: 24px; font-weight: bold; color: #059669; margin: 15px 0;">₱${payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
          <p>Your payout has been approved and will be processed soon. Thank you for your hard work!</p>
        </div>
      `;
      break;

    case 'payout_rejected':
      content = `
        <div class="content">
          <h2>Payout Update</h2>
          <p>Hi ${driverName},</p>
          <div class="order-box">
            <div class="order-number">Payout Request</div>
            <span class="status-badge status-rejected">Not Approved</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>Please contact us if you have questions about this decision.</p>
        </div>
      `;
      break;

    default:
      content = `
        <div class="content">
          <h2>Order Update</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
          </div>
          ${generateOrderItemsHtml(payload.orderItems)}
          ${generateOrderSummaryHtml(payload)}
          <p>Please check your order status for more details.</p>
        </div>
      `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${baseStyles}
    </head>
    <body>
      <div class="container">
        ${header}
        ${content}
        ${footer}
      </div>
    </body>
    </html>
  `;
}

// Wrap custom template content
function wrapWithEmailLayout(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${baseStyles}
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${BUSINESS_NAME}</h1></div>
        <div class="content">${content}</div>
        <div class="footer">
          <p>Thank you for choosing ${BUSINESS_NAME}!</p>
          <p>${BUSINESS_ADDRESS} | ${BUSINESS_PHONE}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Admin notification subject
function getAdminNotificationSubject(type: string, orderNumber?: string, payload?: EmailPayload): string {
  const subjects: Record<string, string> = {
    new_order: `🔔 [NEW ORDER] #${orderNumber} - ${formatCurrency(payload?.totalAmount)} - ${payload?.customerName}`,
    order_pending: `📋 Order #${orderNumber} - Pending Review`,
    order_for_verification: `🔍 [VERIFY] Order #${orderNumber} - Payment Needs Verification`,
    order_approved: `✅ Order #${orderNumber} Approved`,
    order_rejected: `❌ Order #${orderNumber} Rejected`,
    order_cancelled: `🚫 Order #${orderNumber} Cancelled`,
    order_preparing: `👨‍🍳 Order #${orderNumber} Preparing`,
    order_ready_for_pickup: `🍗 Order #${orderNumber} Ready`,
    order_waiting_for_rider: `🚗 Order #${orderNumber} Needs Driver`,
    order_picked_up: `📦 Order #${orderNumber} Picked Up`,
    order_in_transit: `🚗 Order #${orderNumber} In Transit`,
    order_delivered: `🎉 Order #${orderNumber} Delivered`,
    order_completed: `✨ [COMPLETED] Order #${orderNumber}`,
    order_returned: `↩️ [RETURNED] Order #${orderNumber}`,
    payout_requested: `💰 [PAYOUT REQUEST] ${formatCurrency(payload?.payoutAmount)} - ${payload?.driverName}`,
    payout_approved: `✅ Payout Approved`,
    payout_rejected: `Payout Rejected`,
  };
  return subjects[type] || `Order #${orderNumber} Update`;
}

// Comprehensive admin notification template
function getAdminNotificationTemplate(type: string, payload: EmailPayload): string {
  const { orderNumber, customerName, customerPhone, customerEmail, totalAmount, deliveryAddress, orderType, driverName, payoutAmount, reason, subtotal, deliveryFee, deliveryDistance, paymentMethod, landmark, notes } = payload;
  
  const adminStyles = `
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .header { background: #1f2937; color: white; padding: 15px 20px; }
      .header h1 { margin: 0; font-size: 16px; font-weight: 600; }
      .content { padding: 20px; font-size: 14px; }
      .section { background: #f9fafb; border-radius: 8px; padding: 15px; margin: 15px 0; }
      .section-title { font-size: 12px; text-transform: uppercase; color: #6b7280; margin: 0 0 10px; letter-spacing: 0.5px; }
      .order-number { font-weight: bold; color: #ea580c; font-size: 18px; }
      .amount { font-size: 20px; font-weight: bold; color: #059669; }
      .cta { display: inline-block; background: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 15px; }
      .footer { background: #f9fafb; padding: 12px; text-align: center; color: #9ca3af; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 6px 0; }
      .label { color: #6b7280; width: 120px; }
    </style>
  `;

  const orderLink = `https://arwfloridablanca.shop/admin/orders`;
  let content = '';

  if (type === 'new_order' || type === 'order_for_verification') {
    // Full order details for new orders
    content = `
      <div class="content">
        <p style="margin: 0 0 15px; font-size: 16px; font-weight: 600;">
          ${type === 'new_order' ? '🚨 New Order Received!' : '🔍 Order Needs Verification'}
        </p>
        
        <div class="section">
          <p class="section-title">Order Info</p>
          <span class="order-number">Order #${orderNumber}</span><br>
          <span class="amount">${formatCurrency(totalAmount)}</span>
        </div>

        <div class="section">
          <p class="section-title">Customer</p>
          <table>
            <tr><td class="label">Name:</td><td><strong>${customerName}</strong></td></tr>
            <tr><td class="label">Phone:</td><td><a href="tel:${customerPhone}" style="color: #ea580c;">${customerPhone}</a></td></tr>
            ${customerEmail ? `<tr><td class="label">Email:</td><td>${customerEmail}</td></tr>` : ''}
          </table>
        </div>

        <div class="section">
          <p class="section-title">${orderType === 'delivery' ? '🚗 Delivery' : '🏪 Pickup'}</p>
          ${orderType === 'delivery' ? `
            <p style="margin: 0;"><strong>Address:</strong> ${deliveryAddress}</p>
            ${landmark ? `<p style="margin: 5px 0 0;"><strong>Landmark:</strong> ${landmark}</p>` : ''}
            ${deliveryDistance ? `<p style="margin: 5px 0 0;"><strong>Distance:</strong> ${deliveryDistance.toFixed(1)} km</p>` : ''}
          ` : `
            <p style="margin: 0;">Customer will pick up at store</p>
          `}
        </div>

        <div class="section">
          <p class="section-title">Order Items</p>
          ${generateOrderItemsHtml(payload.orderItems)}
        </div>

        <div class="section">
          <p class="section-title">Payment Summary</p>
          <table>
            ${subtotal ? `<tr><td class="label">Subtotal:</td><td>${formatCurrency(subtotal)}</td></tr>` : ''}
            ${deliveryFee ? `<tr><td class="label">Delivery Fee:</td><td>${formatCurrency(deliveryFee)}</td></tr>` : ''}
            <tr><td class="label"><strong>Total:</strong></td><td><strong style="color: #ea580c; font-size: 16px;">${formatCurrency(totalAmount)}</strong></td></tr>
            <tr><td class="label">Payment:</td><td>${formatPaymentMethod(paymentMethod)}</td></tr>
          </table>
        </div>

        ${notes ? `
        <div class="section" style="background: #fef3c7;">
          <p class="section-title">📝 Customer Notes</p>
          <p style="margin: 0; font-style: italic;">${notes}</p>
        </div>
        ` : ''}

        <a href="${orderLink}" class="cta">View Order in Admin →</a>
      </div>
    `;
  } else if (type === 'payout_requested') {
    content = `
      <div class="content">
        <p style="margin: 0 0 15px; font-size: 16px; font-weight: 600;">💰 New Payout Request</p>
        <div class="section">
          <p><strong>Driver:</strong> ${driverName}</p>
          <span class="amount">${formatCurrency(payoutAmount)}</span>
        </div>
        <a href="https://arwfloridablanca.shop/admin/payouts" class="cta">Review Payout →</a>
      </div>
    `;
  } else {
    // Status update with full details
    const statusMap: Record<string, string> = {
      order_approved: '✅ Approved',
      order_rejected: '❌ Rejected',
      order_cancelled: '🚫 Cancelled',
      order_preparing: '👨‍🍳 Preparing',
      order_ready_for_pickup: '🍗 Ready for Pickup',
      order_waiting_for_rider: '🚗 Waiting for Driver',
      order_picked_up: '📦 Picked Up',
      order_in_transit: '🚗 In Transit',
      order_delivered: '🎉 Delivered',
      order_completed: '✨ Completed',
      order_returned: '↩️ Returned',
    };
    
    content = `
      <div class="content">
        <p style="margin: 0 0 15px; font-size: 16px;">Order #${orderNumber} Status Updated</p>
        
        <div class="section">
          <p style="font-size: 18px; margin: 0;"><strong>${statusMap[type] || type}</strong></p>
          ${reason ? `<p style="margin: 10px 0 0; color: #dc2626;"><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>

        <div class="section">
          <p class="section-title">Customer</p>
          <table>
            <tr><td class="label">Name:</td><td><strong>${customerName}</strong></td></tr>
            <tr><td class="label">Phone:</td><td><a href="tel:${customerPhone}" style="color: #ea580c;">${customerPhone}</a></td></tr>
          </table>
        </div>

        <div class="section">
          <p class="section-title">Order Summary</p>
          <p><strong>Total:</strong> ${formatCurrency(totalAmount)}</p>
          <p><strong>Type:</strong> ${formatOrderType(orderType)}</p>
          ${deliveryAddress ? `<p><strong>Address:</strong> ${deliveryAddress}</p>` : ''}
        </div>

        ${payload.orderItems && payload.orderItems.length > 0 ? `
        <div class="section">
          <p class="section-title">Items</p>
          ${generateOrderItemsHtml(payload.orderItems)}
        </div>
        ` : ''}

        <a href="${orderLink}" class="cta">View Order Details →</a>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${adminStyles}
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>🔔 Admin Notification - ${BUSINESS_NAME}</h1></div>
        ${content}
        <div class="footer">${BUSINESS_NAME} Admin Dashboard</div>
      </div>
    </body>
    </html>
  `;
}

// MAIN HANDLER
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    console.log("Email notification request:", JSON.stringify(payload));

    const { type, recipientEmail, orderNumber } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ===== STEP 1: ALWAYS SEND ADMIN EMAILS =====
    const adminEmails = await getAdminEmails(supabase);
    console.log(`Fetched ${adminEmails.length} admin emails:`, adminEmails);
    
    const allAdminRecipients = new Set<string>([GENERAL_NOTIFICATION_EMAIL]);
    adminEmails.forEach(email => allAdminRecipients.add(email.toLowerCase()));
    
    console.log(`Sending to ${allAdminRecipients.size} admin recipients`);

    const adminSubject = getAdminNotificationSubject(type, orderNumber, payload);
    const adminHtml = getAdminNotificationTemplate(type, payload);

    let adminEmailsSent = 0;
    for (const adminEmail of allAdminRecipients) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: [adminEmail],
          subject: adminSubject,
          html: adminHtml,
        });
        console.log(`Admin email sent to ${adminEmail}`);
        adminEmailsSent++;
      } catch (adminEmailError) {
        console.error(`Failed to send to ${adminEmail}:`, adminEmailError);
      }
    }

    await logEmailSent(supabase, payload, [...allAdminRecipients], 'admin');
    await createEmailNotification(supabase, payload, 'admin');

    // ===== STEP 2: SEND CUSTOMER EMAIL =====
    let customerEmailSent = false;
    if (recipientEmail) {
      const isAdminEmail = allAdminRecipients.has(recipientEmail.toLowerCase());
      
      if (!isAdminEmail) {
        let subject: string;
        let html: string;

        try {
          const { data: template, error } = await supabase
            .from('email_templates')
            .select('subject, content, is_active')
            .eq('type', type)
            .single();

          if (!error && template && template.is_active) {
            console.log(`Using database template for ${type}`);
            subject = replaceVariables(template.subject, payload);
            html = wrapWithEmailLayout(replaceVariables(template.content, payload));
          } else {
            console.log(`Using default template for ${type}`);
            subject = getDefaultSubject(type, orderNumber);
            html = getDefaultTemplate(payload);
          }
        } catch (dbError) {
          console.error("Template fetch error:", dbError);
          subject = getDefaultSubject(type, orderNumber);
          html = getDefaultTemplate(payload);
        }

        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: [recipientEmail],
            subject,
            html,
          });
          console.log(`Customer email sent to ${recipientEmail}`);
          customerEmailSent = true;
          await logEmailSent(supabase, payload, [recipientEmail], 'customer');
        } catch (customerError) {
          console.error("Customer email failed:", customerError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      adminEmailsSent,
      customerEmailSent,
      message: `Admin: ${adminEmailsSent} sent. Customer: ${customerEmailSent ? 'sent' : 'not sent'}`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Email notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
