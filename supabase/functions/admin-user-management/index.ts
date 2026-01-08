import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get the authorization header to verify the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a client with the user's token to verify their identity
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the calling user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is an owner
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only owners can perform this action" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();

    // Action: Get emails for multiple user IDs
    if (action === "get-emails") {
      const { userIds } = params as { userIds: string[] };
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return new Response(
          JSON.stringify({ emails: {} }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch all users and filter by requested IDs
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({
        perPage: 1000
      });

      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch user emails" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create a map of user_id -> email
      const emailMap: Record<string, string> = {};
      for (const u of users) {
        if (userIds.includes(u.id)) {
          emailMap[u.id] = u.email || "No email";
        }
      }

      return new Response(
        JSON.stringify({ emails: emailMap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Update user email
    if (action === "update-email") {
      const { userId, newEmail } = params as { userId: string; newEmail: string };

      if (!userId || !newEmail) {
        return new Response(
          JSON.stringify({ error: "userId and newEmail are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return new Response(
          JSON.stringify({ error: "Invalid email format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent editing own email
      if (userId === user.id) {
        return new Response(
          JSON.stringify({ error: "You cannot change your own email from here" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the old email first for logging
      const { data: { user: targetUser }, error: getUserError } = await adminClient.auth.admin.getUserById(userId);
      
      if (getUserError || !targetUser) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const oldEmail = targetUser.email;

      // Check if new email is already in use
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const emailInUse = existingUsers?.some(u => u.email?.toLowerCase() === newEmail.toLowerCase() && u.id !== userId);
      
      if (emailInUse) {
        return new Response(
          JSON.stringify({ error: "This email is already in use by another account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update the email (password remains unchanged)
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        email: newEmail,
        email_confirm: true // Auto-confirm the new email
      });

      if (updateError) {
        console.error("Error updating email:", updateError);
        return new Response(
          JSON.stringify({ error: updateError.message || "Failed to update email" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the change to admin_logs
      await adminClient.from("admin_logs").insert({
        user_id: user.id,
        user_email: user.email || "owner",
        action: "update",
        entity_type: "user_email",
        entity_id: userId,
        entity_name: newEmail,
        old_values: { email: oldEmail },
        new_values: { email: newEmail },
        details: `Changed email from ${oldEmail} to ${newEmail}`
      });

      return new Response(
        JSON.stringify({ success: true, oldEmail, newEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Edge function error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
