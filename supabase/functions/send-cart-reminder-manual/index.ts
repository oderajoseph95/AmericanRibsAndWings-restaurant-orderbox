import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCTION_DOMAIN = Deno.env.get('PRODUCTION_DOMAIN') || 'https://arwfloridablanca.shop';
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const FROM_EMAIL = "American Ribs & Wings <team@updates.arwfloridablanca.shop>";

interface ManualReminderRequest {
  abandoned_checkout_id: string;
  channel: 'email' | 'sms';
  reminder_id?: string; // Optional - to update existing reminder
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

    const { abandoned_checkout_id, channel, reminder_id }: ManualReminderRequest = await req.json();

    if (!abandoned_checkout_id || !channel) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: abandoned_checkout_id and channel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the abandoned checkout
    const { data: checkout, error: checkoutError } = await supabase
      .from('abandoned_checkouts')
      .select('*')
      .eq('id', abandoned_checkout_id)
      .single();

    if (checkoutError || !checkout) {
      return new Response(
        JSON.stringify({ error: 'Checkout not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate recovery link with UTM parameters
    const recoveryLink = `${PRODUCTION_DOMAIN}/order?recover=${checkout.id}&utm_source=recovery&utm_medium=${channel}&utm_campaign=abandoned_cart_manual`;

    let success = false;
    let errorMessage = '';

    if (channel === 'sms') {
      if (!checkout.customer_phone) {
        return new Response(
          JSON.stringify({ error: 'Customer has no phone number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get SMS template
      const { data: template } = await supabase
        .from('sms_templates')
        .select('content')
        .eq('type', 'cart_recovery')
        .eq('is_active', true)
        .single();

      const defaultMessage = `Hi ${checkout.customer_name || 'there'}! You left items worth ₱${checkout.cart_total?.toLocaleString() || '0'} in your cart. Complete your order here: ${recoveryLink} - ARW`;
      
      const message = template
        ? template.content
            .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
            .replace(/\{\{recovery_link\}\}/g, recoveryLink)
            .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`)
        : defaultMessage;

      // Send SMS via Semaphore
      const semaphoreApiKey = Deno.env.get('SEMAPHORE_API_KEY');
      if (!semaphoreApiKey) {
        return new Response(
          JSON.stringify({ error: 'SMS service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Format phone number
      let phone = checkout.customer_phone.replace(/[\s\-\(\)]/g, '');
      if (phone.startsWith('09')) {
        phone = '63' + phone.substring(1);
      } else if (phone.startsWith('+63')) {
        phone = phone.substring(1);
      }

      const smsResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          apikey: semaphoreApiKey,
          number: phone,
          message: message,
          sendername: 'ARWings',
        }),
      });

      if (smsResponse.ok) {
        success = true;

        // Update checkout SMS attempts
        await supabase
          .from('abandoned_checkouts')
          .update({
            sms_attempts: (checkout.sms_attempts || 0) + 1,
            last_reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', checkout.id);

        // Log SMS
        await supabase.from('sms_logs').insert({
          recipient_phone: phone,
          message: message,
          sms_type: 'cart_recovery',
          status: 'sent',
          source: 'cart_recovery_manual',
        });

        // Log event
        await supabase.from('abandoned_checkout_events').insert({
          abandoned_checkout_id: checkout.id,
          event_type: 'reminder_sent',
          channel: 'sms',
          metadata: { manual: true, attempt: (checkout.sms_attempts || 0) + 1 },
        });
      } else {
        const errorText = await smsResponse.text();
        errorMessage = `SMS send failed: ${errorText}`;
        console.error(errorMessage);
      }
    } else if (channel === 'email') {
      if (!checkout.customer_email) {
        return new Response(
          JSON.stringify({ error: 'Customer has no email address' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get email template
      const { data: template } = await supabase
        .from('email_templates')
        .select('subject, content')
        .eq('type', 'cart_recovery')
        .eq('is_active', true)
        .single();

      const defaultSubject = `Don't forget your cart at American Ribs & Wings!`;
      const defaultContent = `
        <h1>Hi ${checkout.customer_name || 'there'}!</h1>
        <p>You left items worth <strong>₱${checkout.cart_total?.toLocaleString() || '0'}</strong> in your cart.</p>
        <p>Complete your order now before they're gone!</p>
        <a href="${recoveryLink}" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;margin:16px 0;">Complete Your Order</a>
        <p>Thanks,<br>American Ribs & Wings</p>
      `;

      const htmlContent = template
        ? template.content
            .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
            .replace(/\{\{recovery_link\}\}/g, recoveryLink)
            .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`)
        : defaultContent;

      const subject = template
        ? template.subject
            .replace(/\{\{customer_name\}\}/g, checkout.customer_name || 'there')
            .replace(/\{\{cart_total\}\}/g, `₱${checkout.cart_total?.toLocaleString() || '0'}`)
        : defaultSubject;

      // Send email via Resend (using SDK like send-email-notification)
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({ error: 'Email service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Debug: Log the exact FROM_EMAIL being used
      console.log('FROM_EMAIL constant:', FROM_EMAIL);
      console.log('FROM_EMAIL type:', typeof FROM_EMAIL);
      
      try {
        const emailPayload = {
          from: FROM_EMAIL,
          to: [checkout.customer_email],
          subject: subject,
          html: htmlContent,
        };
        console.log('Email payload being sent:', JSON.stringify(emailPayload, null, 2));
        
        const emailResponse = await resend.emails.send(emailPayload);

        if (emailResponse.data) {
          success = true;

          // Update checkout email attempts
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
            trigger_event: 'cart_recovery_manual',
          });

          // Log event
          await supabase.from('abandoned_checkout_events').insert({
            abandoned_checkout_id: checkout.id,
            event_type: 'reminder_sent',
            channel: 'email',
            metadata: { manual: true, attempt: (checkout.email_attempts || 0) + 1 },
          });
        } else if (emailResponse.error) {
          const errorMsg = JSON.stringify(emailResponse.error);
          // Check if it's a domain verification error
          if (errorMsg.includes('not verified') || errorMsg.includes('validation_error')) {
            errorMessage = `Email send failed: Domain verification error. The email domain is not verified in Resend. Please verify your domain at https://resend.com/domains. Error: ${errorMsg}`;
          } else {
            errorMessage = `Email send failed: ${errorMsg}`;
          }
          console.error(errorMessage);
        }
      } catch (emailError: any) {
        const errorMsg = emailError.message || JSON.stringify(emailError);
        // Check if it's a domain verification error
        if (errorMsg.includes('not verified') || errorMsg.includes('validation_error')) {
          errorMessage = `Email send failed: Domain verification error. The email domain is not verified in Resend. Please verify your domain at https://resend.com/domains. Error: ${errorMsg}`;
        } else {
          errorMessage = `Email send failed: ${errorMsg}`;
        }
        console.error(errorMessage);
      }
    }

    // If a reminder_id was provided, update that reminder's status
    if (reminder_id && success) {
      await supabase
        .from('abandoned_checkout_reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', reminder_id);
    }

    if (success) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${channel.toUpperCase()} sent successfully`,
          channel,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error sending manual reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
