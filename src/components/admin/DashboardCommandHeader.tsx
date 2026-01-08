import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface StoreHours {
  open: string;
  close: string;
  timezone?: string;
}

export function DashboardCommandHeader() {
  const { displayName } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch store hours
  const { data: storeHours } = useQuery({
    queryKey: ["store-hours-command"],
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
  });

  const { isStoreOpen, greeting, contextLine } = useMemo(() => {
    const hour = currentTime.getHours();
    
    // Determine greeting based on time
    let greeting = "Good morning";
    if (hour >= 12 && hour < 17) greeting = "Good afternoon";
    else if (hour >= 17) greeting = "Good evening";

    // Check if store is open
    let isStoreOpen = true;
    if (storeHours) {
      const [openH, openM] = storeHours.open.split(":").map(Number);
      const [closeH, closeM] = storeHours.close.split(":").map(Number);
      const currentMinutes = hour * 60 + currentTime.getMinutes();
      const openMinutes = openH * 60 + (openM || 0);
      const closeMinutes = closeH * 60 + (closeM || 0);
      isStoreOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }

    // Contextual line based on time of day (non-numeric)
    let contextLine = "Ready to start the day!";
    if (hour >= 11 && hour < 14) contextLine = "Lunch rush is here!";
    else if (hour >= 14 && hour < 17) contextLine = "Afternoon flow, keep it steady";
    else if (hour >= 17 && hour < 20) contextLine = "Dinner time – stay sharp!";
    else if (hour >= 20) contextLine = "Wrapping up the day";
    else if (hour < 10) contextLine = "Early start – prep time!";

    return { isStoreOpen, greeting, contextLine };
  }, [currentTime, storeHours]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const formatStoreHours = (hours: StoreHours) => {
    const formatTime12 = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 || 12;
      return `${displayHour}:${(m || 0).toString().padStart(2, "0")} ${period}`;
    };
    return `${formatTime12(hours.open)} – ${formatTime12(hours.close)}`;
  };

  const firstName = displayName?.split(" ")[0] || "Admin";

  return (
    <Card className="hidden md:flex flex-col items-end justify-center p-6 bg-gradient-to-br from-card via-card to-primary/5 border-primary/10 min-w-[280px] max-w-[320px]">
      {/* Greeting */}
      <div className="text-right mb-4">
        <p className="text-sm text-muted-foreground">{greeting},</p>
        <p className="text-2xl font-bold text-foreground">{firstName}</p>
      </div>

      {/* Live Clock - Much Bigger */}
      <div className="text-right mb-4">
        <p className="text-4xl font-bold tabular-nums text-foreground tracking-tight">
          {formatTime(currentTime)}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatDate(currentTime)}
        </p>
      </div>

      {/* Store Status - More Prominent */}
      <div className="text-right mb-3">
        <Badge 
          variant={isStoreOpen ? "default" : "secondary"}
          className={`text-sm px-3 py-1 ${
            isStoreOpen 
              ? "bg-green-500/20 text-green-600 border-green-500/30 dark:bg-green-500/10 dark:text-green-400" 
              : "bg-red-500/20 text-red-600 border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
          }`}
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
            isStoreOpen ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`} />
          {isStoreOpen ? "Store Open" : "Store Closed"}
        </Badge>
        {storeHours && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Hours: {formatStoreHours(storeHours)}
          </p>
        )}
      </div>

      {/* Context Line */}
      <p className="text-xs text-muted-foreground/80 italic text-right">
        {contextLine}
      </p>
    </Card>
  );
}
