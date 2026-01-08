import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface StoreHours {
  open: string;
  close: string;
  timezone?: string;
}

export function DashboardCommandHeader() {
  const { displayName } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch store hours setting
  const { data: storeHoursData } = useQuery({
    queryKey: ["settings", "store_hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "store_hours")
        .maybeSingle();
      if (error) throw error;
      
      // Safely cast the JSON value
      const value = data?.value;
      if (value && typeof value === 'object' && !Array.isArray(value) && 'open' in value && 'close' in value) {
        return value as unknown as StoreHours;
      }
      return null;
    },
    staleTime: 60000, // Cache for 1 minute
  });

  // Default store hours if not set
  const storeHours: StoreHours = storeHoursData || {
    open: "10:00",
    close: "22:00",
  };

  // Calculate if store is open
  const isStoreOpen = useMemo(() => {
    const now = currentTime;
    const [openHour, openMin] = storeHours.open.split(":").map(Number);
    const [closeHour, closeMin] = storeHours.close.split(":").map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }, [currentTime, storeHours]);

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, [currentTime]);

  // Format store hours for display
  const formatStoreTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, min, 0);
    return format(date, "h:mm a");
  };

  // Context line (non-numeric, encouraging)
  const contextLine = useMemo(() => {
    const hour = currentTime.getHours();
    if (hour < 11) return "Ready to start the day!";
    if (hour < 14) return "Lunch rush is here!";
    if (hour < 17) return "Afternoon is going well.";
    if (hour < 20) return "Dinner service in full swing!";
    return "Wrapping up for the day.";
  }, [currentTime]);

  const firstName = displayName?.split(" ")[0] || "there";

  return (
    <div className="hidden md:flex flex-col items-end gap-1 text-right">
      {/* Greeting */}
      <div>
        <span className="text-sm text-muted-foreground">{greeting}, </span>
        <span className="text-sm font-medium text-foreground">{firstName}</span>
      </div>

      {/* Live Clock */}
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {format(currentTime, "h:mm:ss")}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          {format(currentTime, "a")}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {format(currentTime, "EEEE, MMM d")}
      </span>

      {/* Store Status */}
      <div className="flex items-center gap-2 mt-1">
        <Badge
          variant="outline"
          className={
            isStoreOpen
              ? "bg-green-500/10 text-green-600 border-green-500/30"
              : "bg-red-500/10 text-red-600 border-red-500/30"
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
              isStoreOpen ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {isStoreOpen ? "Store Open" : "Store Closed"}
        </Badge>
      </div>
      <span className="text-xs text-muted-foreground">
        Hours: {formatStoreTime(storeHours.open)} – {formatStoreTime(storeHours.close)}
      </span>

      {/* Context Line */}
      <span className="text-xs text-muted-foreground/70 italic mt-0.5">
        {contextLine}
      </span>
    </div>
  );
}
