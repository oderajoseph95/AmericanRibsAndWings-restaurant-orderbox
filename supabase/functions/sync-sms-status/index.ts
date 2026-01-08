import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SEMAPHORE_API_KEY = Deno.env.get("SEMAPHORE_API_KEY");
const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Semaphore status to our internal status
function mapSemaphoreStatus(status: string): string {
  const normalizedStatus = status?.toLowerCase() || "";
  switch (normalizedStatus) {
    case "sent":
      return "delivered";
    case "pending":
    case "queued":
      return "sent";
    case "failed":
    case "refunded":
      return "failed";
    default:
      return "sent";
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SEMAPHORE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "SEMAPHORE_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { messageId, syncAll } = await req.json();

    // Single message lookup
    if (messageId) {
      console.log(`Fetching status for message ID: ${messageId}`);
      
      const response = await fetch(
        `${SEMAPHORE_API_URL}/${messageId}?apikey=${SEMAPHORE_API_KEY}`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Semaphore API error: ${response.status}` }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      const data = await response.json();
      console.log("Semaphore response:", JSON.stringify(data));
      
      // Data could be a single object or array
      const messageData = Array.isArray(data) ? data[0] : data;
      
      if (messageData?.status) {
        const { error } = await supabase
          .from("sms_logs")
          .update({
            semaphore_status: messageData.status,
            status: mapSemaphoreStatus(messageData.status),
            source: messageData.source || null,
            updated_at: new Date().toISOString(),
          })
          .eq("message_id", String(messageId));

        if (error) {
          console.error("Database update error:", error);
        }

        return new Response(
          JSON.stringify({ success: true, data: messageData }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: "Message not found", data }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Bulk sync: Get all messages needing sync from last 48 hours
    if (syncAll) {
      const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data: pendingLogs, error: fetchError } = await supabase
        .from("sms_logs")
        .select("id, message_id, semaphore_status")
        .not("message_id", "is", null)
        .gte("created_at", cutoffTime)
        .or("semaphore_status.is.null,semaphore_status.eq.Pending,semaphore_status.eq.Queued")
        .limit(50); // Limit to avoid rate limiting

      if (fetchError) {
        console.error("Error fetching pending logs:", fetchError);
        return new Response(
          JSON.stringify({ success: false, error: fetchError.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log(`Found ${pendingLogs?.length || 0} messages to sync`);

      let synced = 0;
      let failed = 0;
      const results: { messageId: string; status: string; error?: string }[] = [];

      for (const log of pendingLogs || []) {
        if (!log.message_id) continue;

        try {
          const response = await fetch(
            `${SEMAPHORE_API_URL}/${log.message_id}?apikey=${SEMAPHORE_API_KEY}`,
            { method: "GET" }
          );

          if (response.ok) {
            const data = await response.json();
            const messageData = Array.isArray(data) ? data[0] : data;

            if (messageData?.status) {
              await supabase
                .from("sms_logs")
                .update({
                  semaphore_status: messageData.status,
                  status: mapSemaphoreStatus(messageData.status),
                  source: messageData.source || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", log.id);

              synced++;
              results.push({ messageId: log.message_id, status: messageData.status });
            }
          } else {
            failed++;
            results.push({ messageId: log.message_id, status: "error", error: `HTTP ${response.status}` });
          }
        } catch (err) {
          failed++;
          results.push({ messageId: log.message_id, status: "error", error: String(err) });
        }

        // Rate limit: Semaphore allows 30 requests/minute for retrieval
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }

      console.log(`Sync complete: ${synced} synced, ${failed} failed`);

      return new Response(
        JSON.stringify({ success: true, synced, failed, total: pendingLogs?.length || 0, results }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Missing messageId or syncAll parameter" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Sync SMS status error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
