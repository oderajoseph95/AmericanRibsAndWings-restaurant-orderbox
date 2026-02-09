import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Default values for fallback
export const DEFAULT_RESERVATION_SETTINGS = {
  store_open: '11:00',
  store_close: '21:00',
  max_pax_per_slot: 40,
  slot_duration_minutes: 30,
  reminder_first_hours: 24,
  reminder_second_hours: 3,
  reminders_enabled: true,
  cancellation_cutoff_hours: 2,
  no_show_grace_minutes: 30,
};

export type ReservationSettingsType = typeof DEFAULT_RESERVATION_SETTINGS;

export function useReservationSettings() {
  return useQuery({
    queryKey: ['reservation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'reservation_settings')
        .maybeSingle();

      if (error) throw error;
      
      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_RESERVATION_SETTINGS, ...(data?.value as Partial<ReservationSettingsType> || {}) };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
