import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REMINDER_INTERVAL_HOURS = 3;
const MAX_REMINDERS = 3;
const PRODUCTION_DOMAIN = Deno.env.get('PRODUCTION_DOMAIN') || 'https://arwfloridablanca.shop';

interface StoreHours {
  open: string;
  close: string;
  timezone?: string;
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hour: hours, minute: minutes || 0 };
}

function getPhilippinesTime(): Date {
  // Get current time in Philippines timezone (UTC+8)
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const philippinesOffset = 8 * 60 * 60000; // UTC+8
  return new Date(utcTime + philippinesOffset);
}

function getNextReminderTime(fromTime: Date, reminderIndex: number, storeHours: StoreHours): Date {
  const hoursToAdd = reminderIndex * REMINDER_INTERVAL_HOURS;
  const nextTime = new Date(fromTime.getTime() + hoursToAdd * 60 * 60 * 1000);
  
  const openTime = parseTime(storeHours.open);
  const closeTime = parseTime(storeHours.close);
  
  const hour = nextTime.getHours();
  
  // If before store opens, move to opening time
  if (hour < openTime.hour || (hour === openTime.hour && nextTime.getMinutes() < openTime.minute)) {
    nextTime.setHours(openTime.hour, openTime.minute, 0, 0);
  } 
  // If after store closes, move to next day opening
  else if (hour >= closeTime.hour || (hour === closeTime.hour && nextTime.getMinutes() >= closeTime.minute)) {
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(openTime.hour, openTime.minute, 0, 0);
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

    // Fetch store hours from settings
    const { data: storeHoursData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_hours')
      .maybeSingle();

    const storeHours: StoreHours = storeHoursData?.value as StoreHours || {
      open: '10:00',
      close: '22:00',
      timezone: 'Asia/Manila'
    };

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

    const now = getPhilippinesTime();
    const reminders = [];
    
    // Determine which channels to use
    const channels: string[] = [];
    if (checkout.customer_phone) channels.push('sms');
    if (checkout.customer_email) channels.push('email');

    if (channels.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No contact info available for recovery' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Schedule reminders (alternate between channels if both available)
    for (let i = 0; i < MAX_REMINDERS; i++) {
      const scheduledTime = getNextReminderTime(now, i, storeHours);
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
        recovery_started_at: new Date().toISOString(),
        next_reminder_scheduled_at: firstReminderTime,
      })
      .eq('id', abandoned_checkout_id);

    if (updateError) throw updateError;

    // Send admin notification about recovery queue
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['owner', 'manager']);

    if (admins && admins.length > 0) {
      const notifications = admins.map(admin => ({
        user_id: admin.user_id,
        title: '🔄 Cart Recovery Started',
        message: `${checkout.customer_name || 'Customer'} (₱${checkout.cart_total?.toLocaleString() || '0'}) - ${reminders.length} reminders queued`,
        type: 'system',
        action_url: '/admin/abandoned-checkouts',
        metadata: {
          checkout_id: abandoned_checkout_id,
          cart_total: checkout.cart_total,
          customer_name: checkout.customer_name,
          reminder_count: reminders.length,
        },
      }));

      await supabase.from('admin_notifications').insert(notifications);
    }

    console.log(`Recovery started for checkout ${abandoned_checkout_id}, ${reminders.length} reminders scheduled during store hours (${storeHours.open} - ${storeHours.close})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminders_scheduled: reminders.length,
        first_reminder_at: firstReminderTime,
        channels_used: channels,
        store_hours: storeHours,
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
