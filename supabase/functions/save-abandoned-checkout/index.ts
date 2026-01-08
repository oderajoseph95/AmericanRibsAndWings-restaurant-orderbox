import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      customer_name,
      customer_phone,
      customer_email,
      cart_items,
      cart_total,
      order_type,
      delivery_address,
      delivery_city,
      delivery_barangay,
      last_section,
      session_id,
      device_info,
    } = body;

    // Validate required fields
    if (!cart_items || !cart_total) {
      return new Response(
        JSON.stringify({ error: 'Cart items and total are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Must have at least one contact method
    if (!customer_phone && !customer_email) {
      return new Response(
        JSON.stringify({ error: 'Phone or email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing abandoned checkout with same phone/session
    const { data: existing } = await supabase
      .from('abandoned_checkouts')
      .select('id')
      .eq('status', 'abandoned')
      .or(`customer_phone.eq.${customer_phone},session_id.eq.${session_id}`)
      .limit(1)
      .single();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('abandoned_checkouts')
        .update({
          customer_name,
          customer_phone,
          customer_email,
          cart_items,
          cart_total,
          order_type,
          delivery_address,
          delivery_city,
          delivery_barangay,
          last_section,
          device_info,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, id: data.id, updated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new abandoned checkout
    const { data, error } = await supabase
      .from('abandoned_checkouts')
      .insert({
        customer_name,
        customer_phone,
        customer_email,
        cart_items,
        cart_total,
        order_type,
        delivery_address,
        delivery_city,
        delivery_barangay,
        last_section,
        session_id,
        device_info,
        status: 'abandoned',
      })
      .select()
      .single();

    if (error) throw error;

    console.log('Abandoned checkout saved:', data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id, created: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error saving abandoned checkout:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
