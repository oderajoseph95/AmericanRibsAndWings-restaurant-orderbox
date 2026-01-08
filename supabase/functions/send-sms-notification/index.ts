import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SEMAPHORE_API_KEY = Deno.env.get("SEMAPHORE_API_KEY");
const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsPayload {
  type: string;
  recipientPhone?: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  driverName?: string;
  driverPhone?: string;
  totalAmount?: number;
  deliveryAddress?: string;
  reason?: string;
}

// Format Philippine phone number to standard format
function formatPhilippineNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "");
  
  // Convert to standard format
  if (cleaned.startsWith("63") && cleaned.length === 12) {
    return cleaned; // Already in 639XXXXXXXXX format
  }
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "63" + cleaned.substring(1); // Convert 09XXXXXXXXX to 639XXXXXXXXX
  }
  if (cleaned.startsWith("9") && cleaned.length === 10) {
    return "63" + cleaned; // Convert 9XXXXXXXXX to 639XXXXXXXXX
  }
  
  // If starts with +63, remove the +
  if (phone.startsWith("+63")) {
    return cleaned;
  }
  
  return cleaned;
}

// Send SMS to a single recipient using Semaphore
async function sendSingleSms(phone: string, message: string): Promise<{ success: boolean; messageId?: string; network?: string; error?: string; rawResponse?: any }> {
  if (!SEMAPHORE_API_KEY) {
    console.error("SEMAPHORE_API_KEY not configured");
    return { success: false, error: "API key not configured" };
  }
  
  const formattedPhone = formatPhilippineNumber(phone);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number" };
  }
  
  console.log(`Sending SMS to ${formattedPhone}: ${message.substring(0, 50)}...`);
  
  try {
    // Don't include sendername - use Semaphore's default
    const response = await fetch(SEMAPHORE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        apikey: SEMAPHORE_API_KEY,
        number: formattedPhone,
        message: message,
      }),
    });
    
    const result = await response.json();
    console.log("Semaphore response:", JSON.stringify(result));
    
    // Semaphore returns an array with message details on success
    if (Array.isArray(result) && result.length > 0) {
      const firstResult = result[0];
      
      // Check for error in response
      if (firstResult.senderName || firstResult.error) {
        return { 
          success: false, 
          error: firstResult.senderName || firstResult.error,
          rawResponse: result 
        };
      }
      
      // Success - has message_id
      if (firstResult.message_id) {
        return { 
          success: true, 
          messageId: String(firstResult.message_id),
          network: firstResult.network,
          rawResponse: result 
        };
      }
    }
    
    // Handle explicit error response
    if (result.error) {
      return { success: false, error: result.error, rawResponse: result };
    }
    
    // If we got here, assume it worked but couldn't parse properly
    return { success: true, rawResponse: result };
  } catch (error) {
    console.error("Semaphore API error:", error);
    return { success: false, error: String(error) };
  }
}

// Get SMS template from database
async function getTemplate(supabase: any, type: string): Promise<{ content: string; is_active: boolean } | null> {
  try {
    const { data, error } = await supabase
      .from("sms_templates")
      .select("content, is_active")
      .eq("type", type)
      .maybeSingle();
    
    if (error) {
      console.error("Error fetching SMS template:", error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("Error fetching SMS template:", error);
    return null;
  }
}

// Replace template variables with actual values
function replaceVariables(content: string, payload: SmsPayload): string {
  let result = content;
  
  result = result.replace(/\{\{order_number\}\}/g, payload.orderNumber || "");
  result = result.replace(/\{\{customer_name\}\}/g, payload.customerName || "");
  result = result.replace(/\{\{driver_name\}\}/g, payload.driverName || "");
  result = result.replace(/\{\{driver_phone\}\}/g, payload.driverPhone || "");
  result = result.replace(/\{\{total_amount\}\}/g, payload.totalAmount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) || "");
  result = result.replace(/\{\{delivery_address\}\}/g, payload.deliveryAddress || "");
  result = result.replace(/\{\{reason\}\}/g, payload.reason || "");
  
  return result;
}

// Log SMS to database with full details
async function logSms(
  supabase: any, 
  phone: string, 
  message: string,
  payload: SmsPayload, 
  result: { success: boolean; messageId?: string; network?: string; error?: string; rawResponse?: any }
): Promise<void> {
  try {
    await supabase.from("sms_logs").insert({
      recipient_phone: phone,
      sms_type: payload.type,
      message: message,
      status: result.success ? "sent" : "failed",
      message_id: result.messageId || null,
      order_id: payload.orderId || null,
      network: result.network || null,
      provider: "semaphore",
      metadata: {
        customer_name: payload.customerName,
        driver_name: payload.driverName,
        error: result.error,
        raw_response: result.rawResponse,
      },
    });
  } catch (error) {
    console.error("Error logging SMS:", error);
  }
}

// Get default message if no template found - now covers all 10 types
function getDefaultMessage(type: string, payload: SmsPayload): string {
  const orderNumber = payload.orderNumber || "";
  const driverName = payload.driverName || "";
  const reason = payload.reason || "";
  
  const defaults: Record<string, string> = {
    // Original 5 types
    order_received: `American Ribs & Wings: We received your order #${orderNumber}. We are preparing your food now. Thank you!`,
    payment_verified: `American Ribs & Wings: Payment verified for order #${orderNumber}. Your order is now confirmed and being prepared!`,
    driver_assigned: `American Ribs & Wings: Your order #${orderNumber} has been assigned to ${driverName}. They will pick up your order shortly.`,
    order_out_for_delivery: `American Ribs & Wings: Your order #${orderNumber} is out for delivery! Your rider is on the way.`,
    order_delivered: `American Ribs & Wings: Your order #${orderNumber} has been delivered. Thank you for ordering! 🍗`,
    
    // New 5 types
    order_rejected: `American Ribs & Wings: Your order #${orderNumber} could not be processed.${reason ? ` Reason: ${reason}` : ""} Please contact us for assistance.`,
    order_cancelled: `American Ribs & Wings: Your order #${orderNumber} has been cancelled.${reason ? ` ${reason}` : ""} If you have questions, please contact us.`,
    order_preparing: `American Ribs & Wings: Great news! Your order #${orderNumber} is now being prepared. We'll update you when it's ready!`,
    order_ready_for_pickup: `American Ribs & Wings: Your order #${orderNumber} is ready for pickup! Please proceed to our store in Floridablanca.`,
    order_completed: `American Ribs & Wings: Thank you for your order #${orderNumber}! We hope you enjoyed your meal. See you again soon! 🍗`,
    
    // Review request - MUST be under 140 characters
    review_request: `Loved your order? Review us! g.page/r/CX7_36IAlM8XEBM/review - American Ribs & Wings`,
    
    // Test type
    test: `American Ribs & Wings: This is a test SMS. If you received this, SMS notifications are working correctly!`,
  };
  
  return defaults[type] || `American Ribs & Wings: Update for order #${orderNumber}`;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const payload: SmsPayload = await req.json();
    console.log("SMS notification request:", JSON.stringify(payload));
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get template from database
    const template = await getTemplate(supabase, payload.type);
    
    // Skip if template is inactive
    if (template && !template.is_active) {
      console.log(`SMS template "${payload.type}" is inactive, skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "template_inactive" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Get message content
    let message: string;
    if (template?.content) {
      message = replaceVariables(template.content, payload);
    } else {
      message = getDefaultMessage(payload.type, payload);
    }
    
    // Fetch admin backup settings
    let adminBackupEnabled = false;
    let adminBackupNumbers: string[] = [];
    
    try {
      const { data: backupEnabledSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sms_admin_backup_enabled")
        .maybeSingle();
      
      const { data: backupNumbersSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sms_admin_backup_numbers")
        .maybeSingle();
      
      adminBackupEnabled = backupEnabledSetting?.value === true || backupEnabledSetting?.value === "true";
      if (backupNumbersSetting?.value && Array.isArray(backupNumbersSetting.value)) {
        adminBackupNumbers = backupNumbersSetting.value as string[];
      }
    } catch (error) {
      console.error("Error fetching admin backup settings:", error);
    }
    
    // Build recipient list
    const recipients: string[] = [];
    if (payload.recipientPhone) {
      recipients.push(payload.recipientPhone);
    }
    
    // Add admin backup numbers only if enabled
    if (adminBackupEnabled && adminBackupNumbers.length > 0) {
      recipients.push(...adminBackupNumbers);
    }
    
    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients.map(r => formatPhilippineNumber(r)))].filter(Boolean);
    
    if (uniqueRecipients.length === 0) {
      console.log("No recipients to send SMS to");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_recipients" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.log(`Sending SMS to ${uniqueRecipients.length} recipients for type: ${payload.type}`);
    
    // Send SEPARATE SMS to each recipient
    const results: { phone: string; success: boolean; messageId?: string; error?: string }[] = [];
    
    for (const phone of uniqueRecipients) {
      if (!phone) continue;
      
      const result = await sendSingleSms(phone, message);
      await logSms(supabase, phone, message, payload, result);
      
      results.push({
        phone,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
      
      // Small delay between sends to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`SMS sending complete: ${successCount}/${results.length} successful`);
    
    return new Response(
      JSON.stringify({
        success: true,
        sentCount: successCount,
        totalRecipients: results.length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("SMS notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
