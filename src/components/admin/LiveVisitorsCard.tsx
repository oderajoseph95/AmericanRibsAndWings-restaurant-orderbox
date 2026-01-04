import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";

export function LiveVisitorsCard() {
  const { data: liveCount = 0 } = useQuery({
    queryKey: ["live-visitors"],
    queryFn: async () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      
      const { count, error } = await supabase
        .from("visitor_sessions")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .gte("last_seen_at", oneMinuteAgo);

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 10000,
  });

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
