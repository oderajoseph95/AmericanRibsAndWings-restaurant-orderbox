import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    // For bounce/complaint events
    bounce?: {
      message: string;
    };
  };
  created_at: string;
}

serve(async (req: Request): Promise<Response> => {
  console.log("Resend webhook received");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const event: ResendWebhookEvent = await req.json();
    console.log("Webhook event:", JSON.stringify(event, null, 2));

    // Initialize Supabase client with service role key for database writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Map Resend event types to our status
    const eventTypeToStatus: Record<string, string> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.opened": "opened",
      "email.clicked": "clicked",
    };

    const status = eventTypeToStatus[event.type] || event.type;
    const recipientEmail = event.data.to?.[0] || "unknown";

    // Insert log entry
    const { error: insertError } = await supabase
      .from("email_logs")
      .insert({
        email_id: event.data.email_id,
        recipient_email: recipientEmail,
        status: status,
        event_type: event.type,
        event_data: event.data,
      });

    if (insertError) {
      console.error("Failed to log email event:", insertError);
    } else {
      console.log(`Email event logged: ${event.type} for ${recipientEmail}`);
    }

    // For bounced or complained emails, create an admin notification
    if (event.type === "email.bounced" || event.type === "email.complained") {
      console.log(`Email ${event.type} detected - notifying admins`);
      
      // Fetch admin user IDs to create notifications
      const { data: adminUsers, error: usersError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["owner", "manager"]);

      if (!usersError && adminUsers) {
        for (const admin of adminUsers) {
          await supabase.from("admin_notifications").insert({
            user_id: admin.user_id,
            title: event.type === "email.bounced" ? "Email Bounced ❌" : "Email Complaint ⚠️",
            message: `Email to ${recipientEmail} ${event.type === "email.bounced" ? "bounced" : "received a complaint"}. Please verify the email address.`,
            type: "system",
            metadata: { email_id: event.data.email_id, recipient: recipientEmail },
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
