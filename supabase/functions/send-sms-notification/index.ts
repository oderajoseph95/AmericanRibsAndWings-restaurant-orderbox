import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SEMAPHORE_API_KEY = Deno.env.get("SEMAPHORE_API_KEY");
const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";
const SEMAPHORE_SENDER_NAME = "ARWFLORIDA"; // Sender ID (must be approved by Semaphore)

// Admin backup numbers - ALWAYS receive copies of all SMS
const ADMIN_BACKUP_NUMBERS = [
  "+639214080286",
  "+639569669710"
];

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
async function sendSingleSms(phone: string, message: string): Promise<{ success: boolean; messageId?: string; network?: string; error?: string }> {
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
    const response = await fetch(SEMAPHORE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        apikey: SEMAPHORE_API_KEY,
        number: formattedPhone,
        message: message,
        sendername: SEMAPHORE_SENDER_NAME,
      }),
    });
    
    const result = await response.json();
    console.log("Semaphore response:", JSON.stringify(result));
    
    // Semaphore returns an array with message details
    if (Array.isArray(result) && result.length > 0 && result[0].message_id) {
      return { 
        success: true, 
        messageId: result[0].message_id,
        network: result[0].network 
      };
    }
    
    // Handle error response
    if (result.error) {
      return { success: false, error: result.error };
    }
    
    return { success: true, messageId: result[0]?.message_id };
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
  
  return result;
}

// Log SMS to database
async function logSms(
  supabase: any, 
  phone: string, 
  payload: SmsPayload, 
  result: { success: boolean; messageId?: string; network?: string; error?: string }
): Promise<void> {
  try {
    await supabase.from("sms_logs").insert({
      recipient_phone: phone,
      sms_type: payload.type,
      message: `SMS for order #${payload.orderNumber || "N/A"}`,
      status: result.success ? "sent" : "failed",
      message_id: result.messageId || null,
      order_id: payload.orderId || null,
      network: result.network || null,
      metadata: {
        customer_name: payload.customerName,
        driver_name: payload.driverName,
        error: result.error,
      },
    });
  } catch (error) {
    console.error("Error logging SMS:", error);
  }
}

// Get default message if no template found
function getDefaultMessage(type: string, orderNumber?: string): string {
  const defaults: Record<string, string> = {
    order_received: `American Ribs & Wings Floridablanca: We received your order #${orderNumber}. We are preparing your food now. Thank you!`,
    payment_verified: `American Ribs & Wings Floridablanca: Payment verified for order #${orderNumber}. Your order is now confirmed.`,
    driver_assigned: `American Ribs & Wings Floridablanca: Your order #${orderNumber} has been assigned to a rider. ETA will be shared shortly.`,
    order_out_for_delivery: `American Ribs & Wings Floridablanca: Your order #${orderNumber} is out for delivery. Please prepare to receive your order.`,
    order_delivered: `American Ribs & Wings Floridablanca: Your order #${orderNumber} has been delivered. Thank you for ordering!`,
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
      message = getDefaultMessage(payload.type, payload.orderNumber);
    }
    
    // Build recipient list: customer + admin backups
    const recipients: string[] = [...ADMIN_BACKUP_NUMBERS];
    if (payload.recipientPhone) {
      // Add customer phone at the beginning
      recipients.unshift(payload.recipientPhone);
    }
    
    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients.map(r => formatPhilippineNumber(r)))];
    
    console.log(`Sending SMS to ${uniqueRecipients.length} recipients for type: ${payload.type}`);
    
    // Send SEPARATE SMS to each recipient
    const results: { phone: string; success: boolean; messageId?: string }[] = [];
    
    for (const phone of uniqueRecipients) {
      if (!phone) continue;
      
      const result = await sendSingleSms(phone, message);
      await logSms(supabase, phone, payload, result);
      
      results.push({
        phone,
        success: result.success,
        messageId: result.messageId,
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
