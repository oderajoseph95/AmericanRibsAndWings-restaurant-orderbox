import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, name, phone, employee_id, date_hired } = await req.json();

    console.log('Creating employee auth user:', { email, name, phone });

    // Validate required fields
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the authorization header to verify admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create a client with the user's token to verify they're an admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user
    const { data: { user: adminUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !adminUser) {
      console.error('Failed to get admin user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Admin user verified:', adminUser.id);

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the caller has owner or manager role
    const { data: roleData, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', adminUser.id)
      .single();

    if (roleError || !roleData) {
      console.error('Failed to get admin role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Permission denied: No role found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['owner', 'manager'].includes(roleData.role)) {
      console.error('User is not owner or manager:', roleData.role);
      return new Response(
        JSON.stringify({ error: 'Permission denied: Only owner or manager can create employees' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Admin has permission:', roleData.role);

    // Create the auth user using admin API (doesn't switch session)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for employees
    });

    if (authError) {
      console.error('Failed to create auth user:', authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user created:', authData.user.id);

    // Create employee record
    const { data: employeeData, error: employeeError } = await adminClient
      .from('employees')
      .insert({
        user_id: authData.user.id,
        name,
        email,
        phone: phone || null,
        employee_id: employee_id || null,
        date_hired: date_hired || null,
      })
      .select()
      .single();

    if (employeeError) {
      console.error('Failed to create employee record:', employeeError);
      // Clean up: delete the auth user if employee creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create employee record: ' + employeeError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee record created:', employeeData.id);

    // Assign employee role
    const { error: roleInsertError } = await adminClient
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'employee',
      });

    if (roleInsertError) {
      console.error('Failed to assign employee role:', roleInsertError);
      // Clean up: delete employee record and auth user
      await adminClient.from('employees').delete().eq('id', employeeData.id);
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: 'Failed to assign employee role: ' + roleInsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee role assigned successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        employee: employeeData,
        user_id: authData.user.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
