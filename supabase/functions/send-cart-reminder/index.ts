import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTION_DOMAIN = 'https://arwfloridablanca.shop';

interface StoreHours {
  open: string;
  close: string;
  timezone?: string;
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hour: hours, minute: minutes || 0 };
}

function getPhilippinesTime(): Date {
  // Get current time in Philippines timezone (UTC+8)
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const philippinesOffset = 8 * 60 * 60000; // UTC+8
  return new Date(utcTime + philippinesOffset);
}

function isWithinOperatingHours(storeHours: StoreHours): boolean {
  const philippinesNow = getPhilippinesTime();
  const hour = philippinesNow.getHours();
  const minute = philippinesNow.getMinutes();
  const currentMinutes = hour * 60 + minute;

  const openTime = parseTime(storeHours.open);
  const closeTime = parseTime(storeHours.close);
  
  const openMinutes = openTime.hour * 60 + openTime.minute;
  const closeMinutes = closeTime.hour * 60 + closeTime.minute;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch store hours from settings
    const { data: storeHoursData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_hours')
      .maybeSingle();

    const storeHours: StoreHours = storeHoursData?.value as StoreHours || {
      open: '10:00',
      close: '22:00',
      timezone: 'Asia/Manila'
    };

    // Check if within operating hours (Philippines time)
    if (!isWithinOperatingHours(storeHours)) {
      const philippinesNow = getPhilippinesTime();
      console.log(`Outside operating hours (${storeHours.open} - ${storeHours.close} PH time). Current PH time: ${philippinesNow.toLocaleTimeString()}`);
      return new Response(
        JSON.stringify({ 
          message: `Outside operating hours (${storeHours.open} - ${storeHours.close} PH time)`, 
          sent: 0,
          current_ph_time: philippinesNow.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();

    // Get pending reminders that are due
    const { data: dueReminders, error: fetchError } = await supabase
      .from('abandoned_checkout_reminders')
      .select(`
        *,
        abandoned_checkouts (
          id,
          customer_name,
          customer_phone,
          customer_email,
          cart_total,
          status,
          sms_attempts,
          email_attempts
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(50);

    if (fetchError) throw fetchError;

    if (!dueReminders || dueReminders.length === 0) {
      console.log('No reminders due');
      return new Response(
        JSON.stringify({ message: 'No reminders due', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${dueReminders.length} due reminders`);

    let sentCount = 0;
    let failedCount = 0;

    for (const reminder of dueReminders) {
      const checkout = reminder.abandoned_checkouts;
      
      // Skip if checkout is no longer in recovering status
      if (!checkout || checkout.status !== 'recovering') {
        await supabase
          .from('abandoned_checkout_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id);
        continue;
      }

      // Generate recovery link with UTM parameters
      const recoveryLink = `${PRODUCTION_DOMAIN}/order?recover=${checkout.id}&utm_source=recovery&utm_medium=${reminder.channel}&utm_campaign=abandoned_cart`;
      
      try {
        if (reminder.channel === 'sms' && checkout.customer_phone) {
          // Get SMS template
          const { data: template } = await supabase
            .from('sms_templates')
            .select('content')
            .eq('type', 'cart_recovery')
            .eq('is_active', true)
            .single();

          if (template) {
            const message = template.content
              .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
              .replace(/\{\{recovery_link\}\}/g, recoveryLink)
              .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`);

            // Send SMS via Semaphore
            const semaphoreApiKey = Deno.env.get('SEMAPHORE_API_KEY');
            if (semaphoreApiKey) {
              const smsResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  apikey: semaphoreApiKey,
                  number: checkout.customer_phone,
                  message: message,
                  sendername: 'ARWings',
                }),
              });

              if (smsResponse.ok) {
                sentCount++;
                await supabase
                  .from('abandoned_checkout_reminders')
                  .update({ status: 'sent', sent_at: new Date().toISOString() })
                  .eq('id', reminder.id);
                
                // Update checkout
                await supabase
                  .from('abandoned_checkouts')
                  .update({ 
                    sms_attempts: (checkout.sms_attempts || 0) + 1,
                    last_reminder_sent_at: new Date().toISOString(),
                  })
                  .eq('id', checkout.id);

                // Log SMS
                await supabase.from('sms_logs').insert({
                  recipient_phone: checkout.customer_phone,
                  message: message,
                  sms_type: 'cart_recovery',
                  status: 'sent',
                  source: 'cart_recovery',
                });
              } else {
                const errorText = await smsResponse.text();
                throw new Error(`SMS send failed: ${errorText}`);
              }
            }
          }
        } else if (reminder.channel === 'email' && checkout.customer_email) {
          // Send email via Resend
          const resendApiKey = Deno.env.get('RESEND_API_KEY');
          if (resendApiKey) {
            // Get email template
            const { data: template } = await supabase
              .from('email_templates')
              .select('subject, content')
              .eq('type', 'cart_recovery')
              .eq('is_active', true)
              .single();

            if (template) {
              const htmlContent = template.content
                .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
                .replace(/\{\{recovery_link\}\}/g, recoveryLink)
                .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`);

              const subject = template.subject
                .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
                .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`);

              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'American Ribs & Wings <noreply@arwfloridablanca.shop>',
                  to: [checkout.customer_email],
                  subject: subject,
                  html: htmlContent,
                }),
              });

              if (emailResponse.ok) {
                sentCount++;
                await supabase
                  .from('abandoned_checkout_reminders')
                  .update({ status: 'sent', sent_at: new Date().toISOString() })
                  .eq('id', reminder.id);
                
                // Update checkout
                await supabase
                  .from('abandoned_checkouts')
                  .update({ 
                    email_attempts: (checkout.email_attempts || 0) + 1,
                    last_reminder_sent_at: new Date().toISOString(),
                  })
                  .eq('id', checkout.id);

                // Log email
                await supabase.from('email_logs').insert({
                  recipient_email: checkout.customer_email,
                  email_type: 'cart_recovery',
                  email_subject: subject,
                  status: 'sent',
                  trigger_event: 'cart_recovery',
                });
              } else {
                const errorText = await emailResponse.text();
                throw new Error(`Email send failed: ${errorText}`);
              }
            }
          }
        }
      } catch (sendError: any) {
        console.error(`Failed to send reminder ${reminder.id}:`, sendError);
        failedCount++;
        await supabase
          .from('abandoned_checkout_reminders')
          .update({ status: 'failed', error_message: sendError.message })
          .eq('id', reminder.id);
      }

      // Check if all reminders for this checkout have been sent/failed
      const { count: pendingCount } = await supabase
        .from('abandoned_checkout_reminders')
        .select('*', { count: 'exact', head: true })
        .eq('abandoned_checkout_id', checkout.id)
        .eq('status', 'pending');

      // If no more pending reminders and checkout is still in recovering status, mark as expired
      if (pendingCount === 0) {
        await supabase
          .from('abandoned_checkouts')
          .update({ status: 'expired' })
          .eq('id', checkout.id)
          .eq('status', 'recovering');
        
        console.log(`Checkout ${checkout.id} marked as expired - all reminders sent without conversion`);
      }
    }

    console.log(`Sent ${sentCount} reminders, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        failed: failedCount,
        processed: dueReminders.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing reminders:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
