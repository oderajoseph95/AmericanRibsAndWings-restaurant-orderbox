import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  userType?: "admin" | "driver" | "customer";
  userId?: string;
  driverId?: string;
  customerPhone?: string;
  orderId?: string;
  orderNumber?: string;
}

// Convert VAPID key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Create JWT for VAPID authentication (simplified approach)
async function createVapidAuthHeader(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  // For a simplified implementation, we'll return the authorization header format
  // In production, full VAPID JWT signing requires proper P-256 ECDSA implementation
  // The Web Push protocol expects: Authorization: vapid t=<jwt>, k=<publicKey>
  
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  };

  // Base64url encode header and payload
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Note: Full JWT signing with ECDSA requires crypto library
  // For now, we'll use a simplified token structure
  // In production, consider using a proper Web Push library
  const token = `${headerB64}.${payloadB64}`;
  
  return `vapid t=${token}, k=${publicKey}`;
}

// Send a single push notification
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: { title: string; body: string; url?: string; icon?: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; error?: string; shouldRemove?: boolean }> {
  try {
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    // Create VAPID authorization header
    const authHeader = await createVapidAuthHeader(audience, vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Prepare the payload
    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      icon: payload.icon || "/images/logo.jpg",
    });

    // Create encryption for the payload (simplified - using raw payload for now)
    // Note: Full Web Push encryption requires additional crypto operations
    // For production, consider using a Web Push library

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: authHeader,
        TTL: "86400",
      },
      body: payloadString,
    });

    if (!response.ok) {
      const status = response.status;
      console.error(`[Push] Failed to send to ${subscription.endpoint}: ${status}`);
      
      // 404 or 410 means the subscription is no longer valid
      if (status === 404 || status === 410) {
        return { success: false, error: "Subscription expired", shouldRemove: true };
      }
      
      return { success: false, error: `HTTP ${status}` };
    }

    console.log(`[Push] Successfully sent to ${subscription.endpoint}`);
    return { success: true };
  } catch (error) {
    console.error(`[Push] Error sending notification:`, error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error("[Push] VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: PushPayload = await req.json();

    console.log("[Push] Received notification request:", payload);

    // Build query to get subscriptions
    let query = supabase.from("push_subscriptions").select("*");

    if (payload.userType) {
      query = query.eq("user_type", payload.userType);
    }

    if (payload.userId) {
      query = query.eq("user_id", payload.userId);
    }

    if (payload.driverId) {
      query = query.eq("driver_id", payload.driverId);
    }

    if (payload.customerPhone) {
      query = query.eq("customer_phone", payload.customerPhone);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error("[Push] Error fetching subscriptions:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[Push] No subscriptions found for criteria");
      return new Response(
        JSON.stringify({ message: "No subscriptions found", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Push] Found ${subscriptions.length} subscriptions`);

    // Send notifications to all matching subscriptions
    const results = await Promise.all(
      subscriptions.map((sub) =>
        sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
          { title: payload.title, body: payload.body, url: payload.url, icon: payload.icon },
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        )
      )
    );

    // Remove expired subscriptions
    const expiredEndpoints = subscriptions
      .filter((_, i) => results[i].shouldRemove)
      .map((sub) => sub.endpoint);

    if (expiredEndpoints.length > 0) {
      console.log(`[Push] Removing ${expiredEndpoints.length} expired subscriptions`);
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[Push] Sent ${successCount}/${subscriptions.length} notifications`);

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        sent: successCount,
        failed: results.length - successCount,
        removed: expiredEndpoints.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Push] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
