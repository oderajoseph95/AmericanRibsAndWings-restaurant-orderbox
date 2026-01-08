import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Operating hours for reminders (12 PM to 7 PM)
const OPERATING_START_HOUR = 12;
const OPERATING_END_HOUR = 19;
const REMINDER_INTERVAL_HOURS = 3;
const MAX_REMINDERS = 3;

function getNextReminderTime(fromTime: Date, reminderIndex: number): Date {
  const hoursToAdd = reminderIndex * REMINDER_INTERVAL_HOURS;
  const nextTime = new Date(fromTime.getTime() + hoursToAdd * 60 * 60 * 1000);
  
  // Adjust to operating hours
  const hour = nextTime.getHours();
  
  if (hour < OPERATING_START_HOUR) {
    // Before operating hours - move to 12 PM same day
    nextTime.setHours(OPERATING_START_HOUR, 0, 0, 0);
  } else if (hour >= OPERATING_END_HOUR) {
    // After operating hours - move to 12 PM next day
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(OPERATING_START_HOUR, 0, 0, 0);
  }
  
  return nextTime;
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

    const body = await req.json();
    const { abandoned_checkout_id } = body;

    if (!abandoned_checkout_id) {
      return new Response(
        JSON.stringify({ error: 'abandoned_checkout_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the abandoned checkout
    const { data: checkout, error: fetchError } = await supabase
      .from('abandoned_checkouts')
      .select('*')
      .eq('id', abandoned_checkout_id)
      .single();

    if (fetchError || !checkout) {
      return new Response(
        JSON.stringify({ error: 'Abandoned checkout not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (checkout.status === 'recovering' || checkout.status === 'recovered') {
      return new Response(
        JSON.stringify({ error: 'Recovery already in progress or completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const reminders = [];
    
    // Determine which channels to use
    const channels: string[] = [];
    if (checkout.customer_phone) channels.push('sms');
    if (checkout.customer_email) channels.push('email');

    // Schedule reminders (alternate between channels if both available)
    for (let i = 0; i < MAX_REMINDERS; i++) {
      const scheduledTime = getNextReminderTime(now, i);
      const channel = channels.length > 1 
        ? channels[i % channels.length] 
        : channels[0];
      
      reminders.push({
        abandoned_checkout_id,
        scheduled_for: scheduledTime.toISOString(),
        channel,
        status: 'pending',
      });
    }

    // Insert reminders
    const { error: reminderError } = await supabase
      .from('abandoned_checkout_reminders')
      .insert(reminders);

    if (reminderError) throw reminderError;

    // Update checkout status
    const firstReminderTime = reminders[0]?.scheduled_for;
    const { error: updateError } = await supabase
      .from('abandoned_checkouts')
      .update({
        status: 'recovering',
        recovery_started_at: now.toISOString(),
        next_reminder_scheduled_at: firstReminderTime,
      })
      .eq('id', abandoned_checkout_id);

    if (updateError) throw updateError;

    console.log(`Recovery started for checkout ${abandoned_checkout_id}, ${reminders.length} reminders scheduled`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminders_scheduled: reminders.length,
        first_reminder_at: firstReminderTime,
        channels_used: channels,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error starting recovery:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
