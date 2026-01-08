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

    // Super Owner email constant
    const SUPER_OWNER_EMAIL = "oderajoseph168@gmail.com";

    // Check if caller is super owner for certain actions
    const isSuperOwner = user.email === SUPER_OWNER_EMAIL;

    // Action: Get emails and usernames for multiple user IDs
    if (action === "get-user-data") {
      const { userIds } = params as { userIds: string[] };
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return new Response(
          JSON.stringify({ users: {} }),
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
          JSON.stringify({ error: "Failed to fetch user data" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch usernames, display names, and roles from user_roles
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("user_id, username, display_name, is_super_owner, role")
        .in("user_id", userIds);

      const usernameMap: Record<string, { username: string | null; display_name: string | null; is_super_owner: boolean; role: string | null }> = {};
      for (const role of roleData || []) {
        usernameMap[role.user_id] = { 
          username: role.username, 
          display_name: role.display_name,
          is_super_owner: role.is_super_owner || false,
          role: role.role
        };
      }

      // Fetch driver names for users with driver role
      const driverUserIds = (roleData || []).filter(r => r.role === 'driver').map(r => r.user_id);
      const driverNameMap: Record<string, string> = {};
      
      if (driverUserIds.length > 0) {
        const { data: driversData } = await adminClient
          .from("drivers")
          .select("user_id, name")
          .in("user_id", driverUserIds);

        for (const driver of driversData || []) {
          driverNameMap[driver.user_id] = driver.name;
        }
      }

      // Create a map of user_id -> user data
      // Only super owner can see emails
      // For drivers, use driver.name; for others, use display_name
      const userDataMap: Record<string, { email: string | null; username: string | null; display_name: string | null; is_super_owner: boolean }> = {};
      for (const u of users) {
        if (userIds.includes(u.id)) {
          const isDriver = usernameMap[u.id]?.role === 'driver';
          const displayName = isDriver 
            ? (driverNameMap[u.id] || usernameMap[u.id]?.display_name || null)
            : (usernameMap[u.id]?.display_name || null);

          userDataMap[u.id] = {
            email: isSuperOwner ? (u.email || "No email") : null,
            username: usernameMap[u.id]?.username || null,
            display_name: displayName,
            is_super_owner: usernameMap[u.id]?.is_super_owner || false,
          };
        }
      }

      return new Response(
        JSON.stringify({ users: userDataMap, callerIsSuperOwner: isSuperOwner }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Get emails for multiple user IDs (legacy)
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

    // Action: Generate usernames for all users without one
    if (action === "generate-usernames") {
      // Only super owner can do this
      if (!isSuperOwner) {
        return new Response(
          JSON.stringify({ error: "Only super owner can generate usernames" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get all users without usernames
      const { data: rolesWithoutUsernames, error: fetchError } = await adminClient
        .from("user_roles")
        .select("id, user_id, role")
        .is("username", null);

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch users" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adjectives = ["swift", "blazing", "cosmic", "golden", "silver", "royal", "stellar", "prime", "ace", "alpha", "bold", "brave", "quick", "sharp", "wise"];
      const generated: { user_id: string; username: string }[] = [];

      for (const roleEntry of rolesWithoutUsernames || []) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const num = Math.floor(Math.random() * 900 + 100);
        const username = `${roleEntry.role}_${adj}_${num}`.toLowerCase();

        const { error: updateError } = await adminClient
          .from("user_roles")
          .update({ username })
          .eq("id", roleEntry.id);

        if (!updateError) {
          generated.push({ user_id: roleEntry.user_id, username });
        }
      }

      // Also mark super owner
      const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const superOwnerUser = users.find(u => u.email === SUPER_OWNER_EMAIL);
      if (superOwnerUser) {
        await adminClient
          .from("user_roles")
          .update({ is_super_owner: true })
          .eq("user_id", superOwnerUser.id);
      }

      return new Response(
        JSON.stringify({ success: true, generated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Update username
    if (action === "update-username") {
      const { userId, newUsername } = params as { userId: string; newUsername: string };

      // Only super owner can update usernames
      if (!isSuperOwner) {
        return new Response(
          JSON.stringify({ error: "Only super owner can update usernames" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!userId || !newUsername) {
        return new Response(
          JSON.stringify({ error: "userId and newUsername are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate username format (alphanumeric and underscores only)
      const usernameRegex = /^[a-z0-9_]{3,30}$/;
      const cleanUsername = newUsername.toLowerCase().trim();
      if (!usernameRegex.test(cleanUsername)) {
        return new Response(
          JSON.stringify({ error: "Username must be 3-30 characters, lowercase, alphanumeric and underscores only" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if username is already taken
      const { data: existing } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("username", cleanUsername)
        .neq("user_id", userId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Username is already taken" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get old username for logging
      const { data: oldData } = await adminClient
        .from("user_roles")
        .select("username")
        .eq("user_id", userId)
        .single();

      const oldUsername = oldData?.username;

      // Update username
      const { error: updateError } = await adminClient
        .from("user_roles")
        .update({ username: cleanUsername })
        .eq("user_id", userId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update username" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the change
      await adminClient.from("admin_logs").insert({
        user_id: user.id,
        user_email: user.email || "super_owner",
        action: "update",
        entity_type: "username",
        entity_id: userId,
        entity_name: cleanUsername,
        old_values: { username: oldUsername },
        new_values: { username: cleanUsername },
        details: `Changed username from ${oldUsername} to ${cleanUsername}`
      });

      return new Response(
        JSON.stringify({ success: true, oldUsername, newUsername: cleanUsername }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Update display name
    if (action === "update-display-name") {
      const { userId, newDisplayName } = params as { userId: string; newDisplayName: string };

      // Only super owner can update display names
      if (!isSuperOwner) {
        return new Response(
          JSON.stringify({ error: "Only super owner can update display names" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanDisplayName = (newDisplayName || "").trim();

      // Get old display name for logging
      const { data: oldData } = await adminClient
        .from("user_roles")
        .select("display_name")
        .eq("user_id", userId)
        .single();

      const oldDisplayName = oldData?.display_name;

      // Update display name
      const { error: updateError } = await adminClient
        .from("user_roles")
        .update({ display_name: cleanDisplayName || null })
        .eq("user_id", userId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update display name" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the change
      await adminClient.from("admin_logs").insert({
        user_id: user.id,
        user_email: user.email || "super_owner",
        action: "update",
        entity_type: "display_name",
        entity_id: userId,
        entity_name: cleanDisplayName,
        old_values: { display_name: oldDisplayName },
        new_values: { display_name: cleanDisplayName },
        details: `Changed display name from "${oldDisplayName || 'none'}" to "${cleanDisplayName || 'none'}"`
      });

      return new Response(
        JSON.stringify({ success: true, oldDisplayName, newDisplayName: cleanDisplayName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Update user email
    if (action === "update-email") {
      // Only super owner can update emails
      if (!isSuperOwner) {
        return new Response(
          JSON.stringify({ error: "Only super owner can update user emails" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
