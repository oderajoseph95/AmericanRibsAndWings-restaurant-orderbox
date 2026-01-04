import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const FROM_EMAIL = "American Ribs & Wings <team@updates.arwfloridablanca.shop>";
const BUSINESS_NAME = "American Ribs & Wings";
const BUSINESS_ADDRESS = "Floridablanca, Pampanga";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  type: string;
  recipientEmail: string;
  ccEmails?: string[]; // Additional CC emails (optional override)
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  totalAmount?: number;
  deliveryAddress?: string;
  orderType?: string;
  driverName?: string;
  driverPhone?: string;
  payoutAmount?: number;
  reason?: string;
}

// Fetch ALL owner emails from the database
async function getOwnerEmails(supabase: any): Promise<string[]> {
  try {
    // Get all users with 'owner' role
    const { data: ownerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'owner');
    
    if (rolesError || !ownerRoles || ownerRoles.length === 0) {
      console.log("No owner roles found or error:", rolesError);
      return [];
    }

    console.log(`Found ${ownerRoles.length} owner roles`);

    // Fetch email for each owner using admin API
    const ownerEmails: string[] = [];
    for (const owner of ownerRoles) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(owner.user_id);
      if (!userError && userData?.user?.email) {
        ownerEmails.push(userData.user.email);
        console.log(`Owner email found: ${userData.user.email}`);
      }
    }

    return ownerEmails;
  } catch (error) {
    console.error("Error fetching owner emails:", error);
    return [];
  }
}

// Log email sent to admin_logs table
async function logEmailSent(supabase: any, payload: EmailPayload, recipients: string[], ccEmails: string[]): Promise<void> {
  try {
    const { error } = await supabase.from('admin_logs').insert({
      user_id: '00000000-0000-0000-0000-000000000000', // System user
      user_email: 'system@arwfloridablanca.shop',
      action: 'email_sent',
      entity_type: 'email',
      entity_id: payload.orderId || null,
      entity_name: `${payload.type} - ${payload.orderNumber || 'N/A'}`,
      details: `Email sent to ${recipients.join(', ')}${ccEmails.length > 0 ? ` (CC: ${ccEmails.join(', ')})` : ''}`,
      new_values: {
        type: payload.type,
        recipient: recipients[0],
        cc: ccEmails,
        order_number: payload.orderNumber,
        customer_name: payload.customerName,
      },
    });
    
    if (error) {
      console.error("Error logging email:", error);
    } else {
      console.log("Email logged to admin_logs");
    }
  } catch (error) {
    console.error("Error logging email:", error);
  }
}

// Create admin notifications for email sent
async function createEmailNotification(supabase: any, payload: EmailPayload, recipients: string[]): Promise<void> {
  try {
    // Get all admin user IDs (owner, manager, cashier)
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'manager', 'cashier']);
    
    if (rolesError || !adminRoles) {
      console.error("Error fetching admin roles:", rolesError);
      return;
    }

    // Create notification for each admin
    const notifications = adminRoles.map((role: any) => ({
      user_id: role.user_id,
      title: `📧 Email Sent`,
      message: `${getEmailTypeLabel(payload.type)} email sent to ${recipients[0]}${payload.orderNumber ? ` for order #${payload.orderNumber}` : ''}`,
      type: 'email_sent',
      order_id: payload.orderId || null,
      action_url: payload.orderId ? `/admin/orders?order=${payload.orderId}` : '/admin/email-templates',
      metadata: {
        email_type: payload.type,
        recipient: recipients[0],
        order_number: payload.orderNumber,
      },
    }));

    const { error } = await supabase.from('admin_notifications').insert(notifications);
    if (error) {
      console.error("Error creating email notifications:", error);
    } else {
      console.log(`Created ${notifications.length} email notifications`);
    }
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

// Replace template variables with actual values
function replaceVariables(text: string, payload: EmailPayload): string {
  let result = text;
  
  // Replace simple variables
  result = result.replace(/\{\{order_number\}\}/g, payload.orderNumber || '');
  result = result.replace(/\{\{customer_name\}\}/g, payload.customerName || '');
  result = result.replace(/\{\{customer_phone\}\}/g, payload.customerPhone || '');
  result = result.replace(/\{\{customer_email\}\}/g, payload.customerEmail || '');
  result = result.replace(/\{\{total_amount\}\}/g, payload.totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00');
  result = result.replace(/\{\{delivery_address\}\}/g, payload.deliveryAddress || '');
  result = result.replace(/\{\{order_type\}\}/g, payload.orderType === 'delivery' ? 'Delivery' : 'Pickup');
  result = result.replace(/\{\{driver_name\}\}/g, payload.driverName || '');
  result = result.replace(/\{\{driver_phone\}\}/g, payload.driverPhone || '');
  result = result.replace(/\{\{payout_amount\}\}/g, payload.payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || '0.00');
  result = result.replace(/\{\{reason\}\}/g, payload.reason || '');
  result = result.replace(/\{\{business_name\}\}/g, BUSINESS_NAME);
  result = result.replace(/\{\{business_address\}\}/g, BUSINESS_ADDRESS);
  
  // Handle conditionals {{#if variable}}content{{/if}}
  const conditionalRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, variable, content) => {
    const value = (payload as any)[variable] || (payload as any)[variable.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase())];
    return value ? content : '';
  });
  
  return result;
}

function getDefaultSubject(type: string, orderNumber?: string): string {
  const subjects: Record<string, string> = {
    new_order: `🔔 New Order #${orderNumber} Received!`,
    order_pending: `📋 Order #${orderNumber} Received - Pending Review`,
    order_for_verification: `🔍 Order #${orderNumber} - Payment Verification`,
    order_approved: `✅ Your Order #${orderNumber} is Approved!`,
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
    driver_assigned: `🚗 Driver Assigned to Order #${orderNumber}`,
    payout_requested: `💰 New Payout Request`,
    payout_approved: `✅ Your Payout has been Approved!`,
    payout_rejected: `Payout Request Update`,
  };
  return subjects[type] || `Order #${orderNumber} Update`;
}

function getDefaultTemplate(payload: EmailPayload): string {
  const { type, orderNumber, customerName, totalAmount, deliveryAddress, orderType, driverName, driverPhone, payoutAmount, reason } = payload;
  
  const baseStyles = `
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: white; padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; }
      .content { padding: 30px; }
      .order-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .order-number { font-size: 20px; font-weight: bold; color: #ea580c; }
      .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
      .detail-label { color: #6b7280; }
      .detail-value { font-weight: 600; color: #111827; }
      .total-row { font-size: 18px; font-weight: bold; color: #ea580c; padding-top: 15px; }
      .cta-button { display: inline-block; background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
      .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
      .status-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; }
      .status-approved { background: #dcfce7; color: #166534; }
      .status-rejected { background: #fee2e2; color: #991b1b; }
      .status-info { background: #dbeafe; color: #1e40af; }
      .status-warning { background: #fef3c7; color: #92400e; }
      .driver-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    </style>
  `;

  const header = `
    <div class="header">
      <h1>${BUSINESS_NAME}</h1>
    </div>
  `;

  const footer = `
    <div class="footer">
      <p>Thank you for choosing ${BUSINESS_NAME}!</p>
      <p>${BUSINESS_ADDRESS}</p>
    </div>
  `;

  let content = '';

  switch (type) {
    case 'new_order':
      content = `
        <div class="content">
          <h2>New Order Received! 🎉</h2>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <div class="detail-row">
              <span class="detail-label">Customer:</span>
              <span class="detail-value">${customerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Order Type:</span>
              <span class="detail-value">${orderType === 'delivery' ? '🚗 Delivery' : '🏪 Pickup'}</span>
            </div>
            ${deliveryAddress ? `
            <div class="detail-row">
              <span class="detail-label">Delivery Address:</span>
              <span class="detail-value">${deliveryAddress}</span>
            </div>
            ` : ''}
            <div class="total-row">
              <span>Total: ₱${totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <p>Please review and approve this order in the admin dashboard.</p>
        </div>
      `;
      break;

    case 'order_pending':
      content = `
        <div class="content">
          <h2>Order Received! 📋</h2>
          <p>Hi ${customerName},</p>
          <p>Thank you for your order! We've received it and it's pending review.</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-warning">Pending Review</span>
            <div class="total-row">Total: ₱${totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>We'll notify you once your order is confirmed!</p>
        </div>
      `;
      break;

    case 'order_for_verification':
      content = `
        <div class="content">
          <h2>Payment Verification 🔍</h2>
          <p>Hi ${customerName},</p>
          <p>Your order is being verified. We're reviewing your payment proof.</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">Verifying Payment</span>
            <div class="total-row">Total: ₱${totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>This usually takes just a few minutes. We'll update you shortly!</p>
        </div>
      `;
      break;

    case 'order_approved':
      content = `
        <div class="content">
          <h2>Great news, ${customerName}! ✅</h2>
          <p>Your order has been approved and is now being prepared.</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Approved</span>
            <div class="total-row">Total: ₱${totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>We'll notify you when your order is ready${orderType === 'delivery' ? ' for delivery' : ' for pickup'}!</p>
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
            <span class="status-badge status-rejected">Rejected</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>Please contact us if you have any questions. We apologize for the inconvenience.</p>
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
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>If you didn't request this cancellation, please contact us immediately.</p>
        </div>
      `;
      break;

    case 'order_preparing':
      content = `
        <div class="content">
          <h2>Your order is being prepared! 👨‍🍳</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">Preparing</span>
          </div>
          <p>Our team is now preparing your delicious order. We'll update you when it's ready!</p>
        </div>
      `;
      break;

    case 'order_ready_for_pickup':
      content = `
        <div class="content">
          <h2>Your order is ready! 🍗</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Ready for Pickup</span>
          </div>
          <p>Your order is ready and waiting for you at our store.</p>
          <p><strong>Store Address:</strong> ${BUSINESS_ADDRESS}</p>
        </div>
      `;
      break;

    case 'order_waiting_for_rider':
      content = `
        <div class="content">
          <h2>Waiting for Driver 🚗</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-warning">Waiting for Driver</span>
          </div>
          <p>Your order is ready and we're assigning a driver to deliver it to you. We'll notify you once a driver picks it up!</p>
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
            <h3 style="margin-top: 0;">Your Driver</h3>
            <p><strong>Name:</strong> ${driverName}</p>
            ${driverPhone ? `<p><strong>Contact:</strong> ${driverPhone}</p>` : ''}
          </div>
          ` : ''}
          <p>You'll receive another notification once your order is on the way!</p>
        </div>
      `;
      break;

    case 'order_picked_up':
      content = `
        <div class="content">
          <h2>Order Picked Up! 📦</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">Picked Up</span>
          </div>
          <p>The driver has picked up your order and will begin the delivery shortly.</p>
          ${driverName ? `
          <div class="driver-box">
            <p><strong>Driver:</strong> ${driverName}</p>
            ${driverPhone ? `<p><strong>Contact:</strong> ${driverPhone}</p>` : ''}
          </div>
          ` : ''}
        </div>
      `;
      break;

    case 'order_in_transit':
      content = `
        <div class="content">
          <h2>On the Way! 🚗</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-info">In Transit</span>
            ${deliveryAddress ? `<p><strong>Delivering to:</strong> ${deliveryAddress}</p>` : ''}
          </div>
          ${driverName ? `
          <div class="driver-box">
            <p><strong>Driver:</strong> ${driverName}</p>
            ${driverPhone ? `<p><strong>Contact:</strong> ${driverPhone}</p>` : ''}
          </div>
          ` : ''}
          <p>Your order is on its way! Please be ready to receive it.</p>
        </div>
      `;
      break;

    case 'order_delivered':
      content = `
        <div class="content">
          <h2>Order Delivered! 🎉</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Delivered</span>
          </div>
          <p>Your order has been delivered. We hope you enjoy it!</p>
          <p>Thank you for choosing ${BUSINESS_NAME}. We'd love to serve you again!</p>
        </div>
      `;
      break;

    case 'order_completed':
      content = `
        <div class="content">
          <h2>Order Completed! ✨</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-approved">Completed</span>
            <div class="total-row">Total: ₱${totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>Thank you for your order! We hope to see you again soon.</p>
        </div>
      `;
      break;

    case 'order_returned':
      content = `
        <div class="content">
          <h2>Order Returned ↩️</h2>
          <p>Hi ${customerName},</p>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
            <span class="status-badge status-warning">Returned</span>
            ${reason ? `<p style="margin-top: 15px;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>Unfortunately, your order was returned to the restaurant. Please contact us for more information.</p>
        </div>
      `;
      break;

    case 'payout_requested':
      content = `
        <div class="content">
          <h2>New Payout Request 💰</h2>
          <p>A driver has requested a payout.</p>
          <div class="order-box">
            <p><strong>Driver:</strong> ${driverName}</p>
            <div class="total-row">Amount: ₱${payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>Please review and process this payout request in the admin dashboard.</p>
        </div>
      `;
      break;

    case 'payout_approved':
      content = `
        <div class="content">
          <h2>Payout Approved! ✅</h2>
          <p>Hi ${driverName},</p>
          <p>Your payout request has been approved and processed.</p>
          <div class="order-box">
            <div class="total-row">Amount: ₱${payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
          <p>The funds should be transferred to your account shortly.</p>
        </div>
      `;
      break;

    case 'payout_rejected':
      content = `
        <div class="content">
          <h2>Payout Request Update</h2>
          <p>Hi ${driverName},</p>
          <p>Unfortunately, your payout request was not approved.</p>
          <div class="order-box">
            <div class="total-row">Amount: ₱${payoutAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          <p>Please contact support if you have any questions.</p>
        </div>
      `;
      break;

    default:
      content = `
        <div class="content">
          <h2>Order Update</h2>
          <div class="order-box">
            <div class="order-number">Order #${orderNumber}</div>
          </div>
          <p>There has been an update to your order. Please check the order tracking page for details.</p>
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

// Wrap custom content with email wrapper
function wrapWithEmailLayout(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${BUSINESS_NAME}</h1>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>Thank you for choosing ${BUSINESS_NAME}!</p>
          <p>${BUSINESS_ADDRESS}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    console.log("Email notification request:", payload);

    const { type, recipientEmail, orderNumber } = payload;

    if (!recipientEmail) {
      throw new Error("Recipient email is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL owner emails from database
    const ownerEmails = await getOwnerEmails(supabase);
    console.log(`Fetched ${ownerEmails.length} owner emails from database:`, ownerEmails);

    // Combine with any additional CC emails passed in payload
    const allCcEmails = [...new Set([...ownerEmails, ...(payload.ccEmails || [])])];
    
    let subject: string;
    let html: string;

    // Try to fetch template from database
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
        console.log(`Using default template for ${type} (no active db template found)`);
        subject = getDefaultSubject(type, orderNumber);
        html = getDefaultTemplate(payload);
      }
    } catch (dbError) {
      console.error("Error fetching template from database:", dbError);
      // Fallback to default templates
      subject = getDefaultSubject(type, orderNumber);
      html = getDefaultTemplate(payload);
    }

    console.log(`Sending ${type} email to ${recipientEmail}${allCcEmails.length > 0 ? ` (CC: ${allCcEmails.join(', ')})` : ''}`);

    // Build email options with automatic CC to all owners
    const emailOptions: any = {
      from: FROM_EMAIL,
      to: [recipientEmail],
      subject,
      html,
    };

    // Add CC - filter out the main recipient to avoid duplicates
    const ccList = allCcEmails.filter(email => email !== recipientEmail);
    if (ccList.length > 0) {
      emailOptions.cc = ccList;
    }

    const emailResponse = await resend.emails.send(emailOptions);

    console.log("Email sent successfully:", emailResponse);

    // Log email to admin_logs and create notifications
    await logEmailSent(supabase, payload, [recipientEmail], ccList);
    await createEmailNotification(supabase, payload, [recipientEmail]);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
