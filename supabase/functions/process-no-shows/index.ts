import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Reservation {
  id: string;
  reservation_code: string;
  name: string;
  phone: string;
  pax: number;
  reservation_date: string;
  reservation_time: string;
}

interface ProcessResult {
  reservation_id: string;
  reservation_code: string;
  success: boolean;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch grace period from settings
    const { data: settingsData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "reservation_settings")
      .maybeSingle();

    const gracePeriodMinutes = (settingsData?.value as { no_show_grace_minutes?: number })?.no_show_grace_minutes || 30;

    // Query confirmed reservations past grace period
    // SINGLE CODE SYSTEM: Only fetch reservation_code (no confirmation_code)
    const { data: eligibleReservations, error: queryError } = await supabase
      .from("reservations")
      .select("id, reservation_code, name, phone, pax, reservation_date, reservation_time")
      .eq("status", "confirmed")
      .returns<Reservation[]>();

    if (queryError) {
      console.error("Error querying reservations:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query reservations", details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!eligibleReservations || eligibleReservations.length === 0) {
      console.log("No confirmed reservations to process");
      return new Response(
        JSON.stringify({ processed: 0, successful: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current time in Asia/Manila
    const nowManila = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const now = new Date(nowManila);

    // Filter reservations past grace period
    const pastGraceReservations = eligibleReservations.filter((r) => {
      // Parse reservation date and time
      const [year, month, day] = r.reservation_date.split("-").map(Number);
      const timeParts = r.reservation_time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      
      if (!timeParts) {
        console.error(`Invalid time format for reservation ${r.reservation_code}: ${r.reservation_time}`);
        return false;
      }

      const hours = parseInt(timeParts[1], 10);
      const minutes = parseInt(timeParts[2], 10);

      // Create reservation datetime in Manila timezone
      const reservationDateTime = new Date(year, month - 1, day, hours, minutes, 0);
      
      // Add grace period
      const graceEndTime = new Date(reservationDateTime.getTime() + gracePeriodMinutes * 60 * 1000);

      // Check if current time is past grace period
      return now > graceEndTime;
    });

    if (pastGraceReservations.length === 0) {
      console.log("No reservations past grace period");
      return new Response(
        JSON.stringify({ processed: 0, successful: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${pastGraceReservations.length} reservations past grace period`);

    // Get all admin user IDs for notifications
    const { data: adminUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["owner", "manager", "cashier"]);

    const results: ProcessResult[] = [];

    // Process each reservation
    for (const reservation of pastGraceReservations) {
      try {
        // 1. Update reservation status to no_show
        const { error: updateError } = await supabase
          .from("reservations")
          .update({
            status: "no_show",
            status_changed_at: new Date().toISOString(),
            status_changed_by: "system_no_show_job",
          })
          .eq("id", reservation.id)
          .eq("status", "confirmed"); // Double-check status for idempotency

        if (updateError) {
          console.error(`Failed to update reservation ${reservation.reservation_code}:`, updateError);
          results.push({
            reservation_id: reservation.id,
            reservation_code: reservation.reservation_code,
            success: false,
            error: updateError.message,
          });
          continue;
        }

        // 2. Cancel any pending reminders
        await supabase
          .from("reservation_reminders")
          .update({ status: "cancelled" })
          .eq("reservation_id", reservation.id)
          .eq("status", "pending");

        // 3. Log to reservation_notifications for audit
        await supabase.from("reservation_notifications").insert({
          reservation_id: reservation.id,
          channel: "system",
          recipient: "internal",
          status: "sent",
          trigger_type: "automatic",
          message_type: "no_show_auto_closure",
        });

        // 4. Create admin notifications
        if (adminUsers && adminUsers.length > 0) {
          // Format date for display
          const dateObj = new Date(reservation.reservation_date);
          const formattedDate = dateObj.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          // Format time for display
          const formattedTime = reservation.reservation_time.substring(0, 5);

          const adminNotifications = adminUsers.map((admin) => ({
            user_id: admin.user_id,
            title: "Reservation marked as No-Show",
            message: `${reservation.name} - ${formattedDate} at ${formattedTime} - ${reservation.pax} guests`,
            type: "reservation",
            metadata: {
              reservation_code: reservation.reservation_code,
              customer_name: reservation.name,
              action_url: `/admin/reservations/${reservation.id}`,
            },
          }));

          await supabase.from("admin_notifications").insert(adminNotifications);
        }

        console.log(`Successfully marked reservation ${reservation.reservation_code} as no_show`);
        results.push({
          reservation_id: reservation.id,
          reservation_code: reservation.reservation_code,
          success: true,
        });
      } catch (err) {
        console.error(`Error processing reservation ${reservation.reservation_code}:`, err);
        results.push({
          reservation_id: reservation.id,
          reservation_code: reservation.reservation_code,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`Processed ${results.length} reservations, ${successCount} successful`);

    return new Response(
      JSON.stringify({
        processed: results.length,
        successful: successCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in process-no-shows:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
