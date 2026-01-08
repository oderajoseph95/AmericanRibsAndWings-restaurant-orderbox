import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

interface StoreHours {
  open: string;
  close: string;
  timezone?: string;
}

interface StoreStatus {
  isOpen: boolean;
  isLoading: boolean;
  opensAt: string | null;
  closesAt: string | null;
  storeHours: StoreHours | null;
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hour: hours, minute: minutes || 0 };
}

function formatTime12h(timeStr: string): string {
  const { hour, minute } = parseTime(timeStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function useStoreStatus(): StoreStatus {
  const { data: storeHours, isLoading } = useQuery({
    queryKey: ["store-hours-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "store_hours")
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return null;
      const value = data.value as unknown as StoreHours;
      if (typeof value.open !== 'string' || typeof value.close !== 'string') return null;
      return value;
    },
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000, // Refetch every minute to keep status accurate
  });

  const status = useMemo(() => {
    if (!storeHours) {
      return {
        isOpen: true, // Default to open if no hours configured
        opensAt: null,
        closesAt: null,
      };
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const openTime = parseTime(storeHours.open);
    const closeTime = parseTime(storeHours.close);
    
    const openTimeMinutes = openTime.hour * 60 + openTime.minute;
    const closeTimeMinutes = closeTime.hour * 60 + closeTime.minute;

    // Handle normal hours (e.g., 10:00 - 22:00)
    const isOpen = currentTimeMinutes >= openTimeMinutes && currentTimeMinutes < closeTimeMinutes;

    return {
      isOpen,
      opensAt: formatTime12h(storeHours.open),
      closesAt: formatTime12h(storeHours.close),
    };
  }, [storeHours]);

  return {
    isOpen: status.isOpen,
    isLoading,
    opensAt: status.opensAt,
    closesAt: status.closesAt,
    storeHours: storeHours || null,
  };
}
