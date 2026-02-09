import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SEMAPHORE_API_KEY = Deno.env.get("SEMAPHORE_API_KEY");
const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Philippines timezone offset (+8)
const PH_TIMEZONE = "Asia/Manila";

interface Reminder {
  id: string;
  reservation_id: string;
  reminder_type: string;
  scheduled_for: string;
  status: string;
}

interface Reservation {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  pax: number;
  reservation_date: string;
  reservation_time: string;
  status: string;
  confirmation_code: string | null;
  reservation_code: string;
}

// Format Philippine phone number to standard format
function formatPhilippineNumber(phone: string): string {
  if (!phone) return "";
  
  let cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.startsWith("63") && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "63" + cleaned.substring(1);
  }
  if (cleaned.startsWith("9") && cleaned.length === 10) {
    return "63" + cleaned;
  }
  if (phone.startsWith("+63")) {
    return cleaned;
  }
  
  return cleaned;
}

// Format date for display (e.g., "Feb 10")
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

// Format time for display (e.g., "2:30 PM")
function formatTime(timeStr: string): string {
  try {
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

// Send SMS via Semaphore
async function sendSms(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!SEMAPHORE_API_KEY) {
    console.error("SEMAPHORE_API_KEY not configured");
    return { success: false, error: "API key not configured" };
  }
  
  const formattedPhone = formatPhilippineNumber(phone);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number" };
  }
  
  console.log(`Sending reminder SMS to ${formattedPhone}`);
  
  try {
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
    
    if (Array.isArray(result) && result.length > 0) {
      const firstResult = result[0];
      if (firstResult.message_id) {
        return { success: true };
      }
      if (firstResult.error) {
        return { success: false, error: firstResult.error };
      }
    }
    
    if (result.error) {
      return { success: false, error: result.error };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Semaphore API error:", error);
    return { success: false, error: String(error) };
  }
}

// Log notification to reservation_notifications table
async function logNotification(
  supabase: any,
  reservationId: string,
  channel: "sms" | "email",
  recipient: string,
  status: "sent" | "failed",
  messageType: string,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from("reservation_notifications").insert({
      reservation_id: reservationId,
      channel,
      recipient,
      status,
      trigger_type: "automatic",
      message_type: messageType,
      error_message: errorMessage || null,
    });
  } catch (error) {
    console.error("Error logging notification:", error);
  }
}

// Log SMS to sms_logs table
async function logSms(
  supabase: any,
  phone: string,
  message: string,
  smsType: string,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await supabase.from("sms_logs").insert({
      recipient_phone: phone,
      sms_type: smsType,
      message: message,
      status: success ? "sent" : "failed",
      provider: "semaphore",
      metadata: error ? { error } : null,
    });
  } catch (err) {
    console.error("Error logging SMS:", err);
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log("=== Reservation Reminder Processor Started ===");
    
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Query for due reminders (status = pending AND scheduled_for <= now)
    const now = new Date().toISOString();
    const { data: dueReminders, error: queryError } = await supabase
      .from("reservation_reminders")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(50);
    
    if (queryError) {
      console.error("Error querying reminders:", queryError);
      throw queryError;
    }
    
    if (!dueReminders || dueReminders.length === 0) {
      console.log("No due reminders found");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No due reminders" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.log(`Found ${dueReminders.length} due reminders to process`);
    
    // Fetch admin backup numbers from settings
    let adminBackupNumbers: string[] = [];
    try {
      const { data: backupSettings } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "sms_admin_backup_numbers")
        .maybeSingle();
      
      if (backupSettings?.value && Array.isArray(backupSettings.value)) {
        adminBackupNumbers = backupSettings.value as string[];
      }
    } catch (error) {
      console.error("Error fetching admin backup numbers:", error);
      // Default fallback
      adminBackupNumbers = ["+639214080286", "+639569669710"];
    }
    
    const results: { reminderId: string; success: boolean; error?: string }[] = [];
    
    for (const reminder of dueReminders as Reminder[]) {
      try {
        console.log(`Processing reminder ${reminder.id} (${reminder.reminder_type}) for reservation ${reminder.reservation_id}`);
        
        // Fetch reservation details
        const { data: reservation, error: resError } = await supabase
          .from("reservations")
          .select("*")
          .eq("id", reminder.reservation_id)
          .maybeSingle();
        
        if (resError || !reservation) {
          console.error(`Reservation not found for reminder ${reminder.id}`);
          await supabase
            .from("reservation_reminders")
            .update({ status: "failed", error_message: "Reservation not found", sent_at: now })
            .eq("id", reminder.id);
          results.push({ reminderId: reminder.id, success: false, error: "Reservation not found" });
          continue;
        }
        
        const res = reservation as Reservation;
        
        // Check if reservation is still confirmed
        if (res.status !== "confirmed") {
          console.log(`Reservation ${res.id} is no longer confirmed (status: ${res.status}). Cancelling reminder.`);
          await supabase
            .from("reservation_reminders")
            .update({ status: "cancelled", sent_at: now })
            .eq("id", reminder.id);
          results.push({ reminderId: reminder.id, success: true, error: "Reservation no longer confirmed" });
          continue;
        }
        
        // Build reminder message
        const code = res.confirmation_code || res.reservation_code;
        const dateFormatted = formatDateShort(res.reservation_date);
        const timeFormatted = formatTime(res.reservation_time);
        const messageType = `reservation_reminder_${reminder.reminder_type}`;
        
        // Determine if it's today or a specific date
        const today = new Date();
        const resDate = new Date(res.reservation_date);
        const isToday = today.toDateString() === resDate.toDateString();
        const dateText = isToday ? "today" : `on ${dateFormatted}`;
        
        const smsMessage = `ARW Reminder 🍽️

Hi ${res.name},
Reminder for your reservation ${dateText} at ${timeFormatted} for ${res.pax} guests.

Code: ${code}
📍 American Ribs & Wings – Floridablanca

See you soon!`;

        // Send SMS to customer
        console.log(`Sending reminder SMS to customer: ${res.phone}`);
        const customerSmsResult = await sendSms(res.phone, smsMessage);
        await logSms(supabase, res.phone, smsMessage, messageType, customerSmsResult.success, customerSmsResult.error);
        await logNotification(
          supabase,
          res.id,
          "sms",
          res.phone,
          customerSmsResult.success ? "sent" : "failed",
          messageType,
          customerSmsResult.error
        );
        
        // Send SMS to admin backup numbers (silent copies)
        for (const adminPhone of adminBackupNumbers) {
          if (adminPhone && adminPhone !== res.phone) {
            const adminMessage = `[REMINDER COPY] ${res.name} - ${dateFormatted} ${timeFormatted} - ${res.pax} pax - Code: ${code}`;
            console.log(`Sending reminder SMS copy to admin: ${adminPhone}`);
            const adminSmsResult = await sendSms(adminPhone, adminMessage);
            await logSms(supabase, adminPhone, adminMessage, `${messageType}_admin_copy`, adminSmsResult.success, adminSmsResult.error);
            await logNotification(
              supabase,
              res.id,
              "sms",
              adminPhone,
              adminSmsResult.success ? "sent" : "failed",
              `${messageType}_admin_copy`,
              adminSmsResult.error
            );
            
            // Small delay between sends
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Send email to customer if they have an email
        if (res.email) {
          console.log(`Sending reminder email to: ${res.email}`);
          try {
            // Call the email notification edge function
            const emailPayload = {
              type: "reservation_reminder",
              recipientEmail: res.email,
              reservationId: res.id,
              reservationCode: code,
              customerName: res.name,
              customerPhone: res.phone,
              reservationDate: dateFormatted,
              reservationTime: timeFormatted,
              pax: res.pax,
              reminderType: reminder.reminder_type,
            };
            
            const { data: emailResult, error: emailError } = await supabase.functions.invoke(
              "send-email-notification",
              { body: emailPayload }
            );
            
            const emailSuccess = !emailError && emailResult?.success !== false;
            await logNotification(
              supabase,
              res.id,
              "email",
              res.email,
              emailSuccess ? "sent" : "failed",
              messageType,
              emailError?.message || emailResult?.error
            );
            
            if (!emailSuccess) {
              console.error(`Failed to send reminder email: ${emailError?.message || emailResult?.error}`);
            }
          } catch (emailErr) {
            console.error("Email notification error:", emailErr);
            await logNotification(
              supabase,
              res.id,
              "email",
              res.email,
              "failed",
              messageType,
              String(emailErr)
            );
          }
        }
        
        // Update reminder status to sent
        await supabase
          .from("reservation_reminders")
          .update({ 
            status: customerSmsResult.success ? "sent" : "failed", 
            sent_at: now,
            error_message: customerSmsResult.error || null
          })
          .eq("id", reminder.id);
        
        results.push({ 
          reminderId: reminder.id, 
          success: customerSmsResult.success,
          error: customerSmsResult.error
        });
        
        // Small delay between processing reminders
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (reminderError) {
        console.error(`Error processing reminder ${reminder.id}:`, reminderError);
        await supabase
          .from("reservation_reminders")
          .update({ 
            status: "failed", 
            sent_at: now,
            error_message: String(reminderError)
          })
          .eq("id", reminder.id);
        results.push({ reminderId: reminder.id, success: false, error: String(reminderError) });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`=== Reminder processing complete: ${successCount}/${results.length} successful ===`);
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful: successCount,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Reservation reminder error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
