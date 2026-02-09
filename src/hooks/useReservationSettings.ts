import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Default values for fallback
export const DEFAULT_RESERVATION_SETTINGS = {
  store_open: '11:00',
  store_close: '21:00',
  max_pax_per_slot: 40,
  slot_duration_minutes: 30,
  reminders_enabled: true,
  cancellation_cutoff_hours: 2,
  no_show_grace_minutes: 30,
  // 6 reminder intervals: 12h, 6h, 3h, 1h, 30min, 15min
  reminder_intervals: [
    { hours: 12, type: '12h' },
    { hours: 6, type: '6h' },
    { hours: 3, type: '3h' },
    { hours: 1, type: '1h' },
    { minutes: 30, type: '30min' },
    { minutes: 15, type: '15min' },
  ],
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
