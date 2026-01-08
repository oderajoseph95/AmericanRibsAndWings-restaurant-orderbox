import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Operating hours for reminders (12 PM to 7 PM)
const OPERATING_START_HOUR = 12;
const OPERATING_END_HOUR = 19;

function isWithinOperatingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= OPERATING_START_HOUR && hour < OPERATING_END_HOUR;
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

    // Check if within operating hours
    if (!isWithinOperatingHours()) {
      console.log('Outside operating hours (12 PM - 7 PM), skipping reminders');
      return new Response(
        JSON.stringify({ message: 'Outside operating hours', sent: 0 }),
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
          status
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

      // Generate recovery link
      const recoveryLink = `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/order?recover=${checkout.id}`;
      
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
              .replace(/\{\{cart_total\}\}/g, checkout.cart_total?.toLocaleString() || '0');

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
              } else {
                throw new Error('SMS send failed');
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
                .replace(/\{\{cart_total\}\}/g, checkout.cart_total?.toLocaleString() || '0');

              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'American Ribs & Wings <noreply@resend.dev>',
                  to: [checkout.customer_email],
                  subject: template.subject,
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
              } else {
                throw new Error('Email send failed');
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
