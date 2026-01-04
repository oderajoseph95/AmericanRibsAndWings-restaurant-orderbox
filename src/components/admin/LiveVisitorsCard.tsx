import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, ShoppingCart, Home, Package, Menu } from "lucide-react";

type VisitorSession = {
  id: string;
  session_id: string;
  page_path: string | null;
  last_seen_at: string | null;
};

// Map page paths to friendly names and icons
const getPageInfo = (path: string | null): { label: string; icon: React.ReactNode } => {
  if (!path) return { label: "Browsing", icon: <Eye className="h-3 w-3" /> };
  
  const lowerPath = path.toLowerCase();
  if (lowerPath === "/" || lowerPath === "/index") {
    return { label: "Homepage", icon: <Home className="h-3 w-3" /> };
  }
  if (lowerPath.includes("/order") && !lowerPath.includes("/my-orders")) {
    return { label: "Ordering", icon: <ShoppingCart className="h-3 w-3" /> };
  }
  if (lowerPath.includes("/checkout") || lowerPath.includes("/cart")) {
    return { label: "Checking out", icon: <ShoppingCart className="h-3 w-3 text-green-500" /> };
  }
  if (lowerPath.includes("/thank-you") || lowerPath.includes("/tracking")) {
    return { label: "Tracking order", icon: <Package className="h-3 w-3" /> };
  }
  if (lowerPath.includes("/my-orders")) {
    return { label: "Viewing orders", icon: <Package className="h-3 w-3" /> };
  }
  if (lowerPath.includes("/#menu") || lowerPath.includes("/menu")) {
    return { label: "Viewing menu", icon: <Menu className="h-3 w-3" /> };
  }
  return { label: "Browsing", icon: <Eye className="h-3 w-3" /> };
};

export function LiveVisitorsCard() {
  const [liveCount, setLiveCount] = useState(0);
  const [visitors, setVisitors] = useState<VisitorSession[]>([]);

  const fetchLiveVisitors = useCallback(async () => {
    // Consider visitors active if seen in last 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    
    const { data, count, error } = await supabase
      .from("visitor_sessions")
      .select("*", { count: "exact" })
      .gte("last_seen_at", thirtySecondsAgo)
      .order("last_seen_at", { ascending: false })
      .limit(10);

    if (!error) {
      setLiveCount(count || 0);
      setVisitors(data || []);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchLiveVisitors();

    // Subscribe to realtime changes for instant updates
    const channel = supabase
      .channel("live-visitors-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        () => fetchLiveVisitors()
      )
      .subscribe();

    // Fallback polling every 15s
    const interval = setInterval(fetchLiveVisitors, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchLiveVisitors]);

  // Group visitors by page
  const pageGroups = visitors.reduce((acc, visitor) => {
    const info = getPageInfo(visitor.page_path);
    const key = info.label;
    if (!acc[key]) {
      acc[key] = { count: 0, icon: info.icon };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, { count: number; icon: React.ReactNode }>);

  const sortedPages = Object.entries(pageGroups)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 h-full">
      <CardContent className="pt-4 pb-3 h-full flex flex-col">
        {/* Header Row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-full bg-primary/10">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{liveCount}</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Live visitors</p>
          </div>
        </div>

        {/* Activity Feed */}
        {liveCount > 0 && sortedPages.length > 0 && (
          <div className="mt-auto pt-2 border-t border-primary/10 space-y-1">
            {sortedPages.map(([label, { count, icon }]) => (
              <div 
                key={label} 
                className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse"
                style={{ animationDuration: "2s" }}
              >
                {icon}
                <span className="truncate">
                  {count} {label.toLowerCase()}
                </span>
              </div>
            ))}
            {liveCount > visitors.length && (
              <div className="text-xs text-muted-foreground/60">
                +{liveCount - visitors.length} more...
              </div>
            )}
          </div>
        )}

        {liveCount === 0 && (
          <div className="mt-auto pt-2 text-xs text-muted-foreground/60">
            No active visitors right now
          </div>
        )}
      </CardContent>
    </Card>
  );
}
