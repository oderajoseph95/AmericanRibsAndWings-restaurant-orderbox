import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";

export function LiveVisitorsCard() {
  const [liveCount, setLiveCount] = useState(0);

  const fetchLiveCount = useCallback(async () => {
    // Consider visitors active if seen in last 30 seconds (since we ping every 10s)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    
    const { count, error } = await supabase
      .from("visitor_sessions")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", thirtySecondsAgo);

    if (!error) {
      setLiveCount(count || 0);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchLiveCount();

    // Subscribe to realtime changes for instant updates
    const channel = supabase
      .channel("live-visitors-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        () => fetchLiveCount()
      )
      .subscribe();

    // Fallback polling every 15s in case realtime misses something
    const interval = setInterval(fetchLiveCount, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchLiveCount]);

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 h-full">
      <CardContent className="pt-6 h-full flex flex-col justify-center">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Eye className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">Live Visitors</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-4xl font-bold">{liveCount}</span>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Active on site now</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
