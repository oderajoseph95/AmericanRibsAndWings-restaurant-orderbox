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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loginInput = username.trim().toLowerCase();
    const isEmail = loginInput.includes('@');

    let email: string;
    let roleData: { user_id: string; role: string } | null = null;

    if (isEmail) {
      // Email login - only allowed for Super Owners
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      
      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(
          JSON.stringify({ error: "Invalid email or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const foundUser = listData?.users?.find(u => u.email?.toLowerCase() === loginInput);
      
      if (!foundUser) {
        return new Response(
          JSON.stringify({ error: "Invalid email or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is a super owner (only super owners can login via email)
      const { data: roleCheck, error: roleCheckError } = await adminClient
        .from("user_roles")
        .select("user_id, role, is_super_owner")
        .eq("user_id", foundUser.id)
        .maybeSingle();

      if (roleCheckError || !roleCheck) {
        console.error("Error checking role:", roleCheckError);
        return new Response(
          JSON.stringify({ error: "Invalid email or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!roleCheck.is_super_owner) {
        return new Response(
          JSON.stringify({ error: "Email login is only available for Super Owners. Please use your username instead." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      email = foundUser.email!;
      roleData = { user_id: roleCheck.user_id, role: roleCheck.role };
    } else {
      // Username login - existing logic for all admin roles
      const { data: usernameRoleData, error: roleError } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .eq("username", loginInput)
        .maybeSingle();

      if (roleError) {
        console.error("Error looking up username:", roleError);
        return new Response(
          JSON.stringify({ error: "Invalid username or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!usernameRoleData) {
        return new Response(
          JSON.stringify({ error: "Invalid username or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get email from auth.users using admin API
      const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(usernameRoleData.user_id);

      if (userError || !userData?.user?.email) {
        console.error("Error fetching user email:", userError);
        return new Response(
          JSON.stringify({ error: "Invalid username or password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      email = userData.user.email;
      roleData = usernameRoleData;
    }

    // Now authenticate with email and password using a regular client
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid username or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the session
    return new Response(
      JSON.stringify({
        session: authData.session,
        user: authData.user,
        role: roleData.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
