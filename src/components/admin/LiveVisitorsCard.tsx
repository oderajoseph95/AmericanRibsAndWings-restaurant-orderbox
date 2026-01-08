import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, ShoppingCart, Home, Package, CreditCard, User, MapPin, FileText } from "lucide-react";

type ActivityItem = {
  type: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  detail?: string;
};

type LocationCount = {
  barangay: string;
  count: number;
};

export function LiveVisitorsCard() {
  const [liveCount, setLiveCount] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [topLocation, setTopLocation] = useState<LocationCount | null>(null);

  const fetchLiveData = useCallback(async () => {
    // Last 5 minutes window (like Google Analytics)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // Fetch visitor sessions (for count and page paths)
    const { data: sessions, count, error: sessionsError } = await supabase
      .from("visitor_sessions")
      .select("session_id, page_path", { count: "exact" })
      .gte("last_seen_at", fiveMinutesAgo);

    if (sessionsError) {
      console.error("Error fetching sessions:", sessionsError);
      return;
    }

    setLiveCount(count || 0);

    // Fetch recent analytics events for detailed activities
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select("event_type, event_data, session_id, page_path")
      .gte("created_at", fiveMinutesAgo)
      .order("created_at", { ascending: false });

    if (eventsError) {
      console.error("Error fetching events:", eventsError);
      return;
    }

    // Process activities
    const activityMap: Record<string, ActivityItem> = {};
    const productViews: Record<string, number> = {};
    const checkoutStages: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};

    // Group page views from sessions
    const pageGroups: Record<string, number> = {};
    sessions?.forEach(session => {
      const path = session.page_path?.toLowerCase() || "/";
      
      if (path === "/" || path === "/index") {
        pageGroups["homepage"] = (pageGroups["homepage"] || 0) + 1;
      } else if (path.includes("/order") && !path.includes("/my-orders") && !path.includes("/tracking")) {
        pageGroups["ordering"] = (pageGroups["ordering"] || 0) + 1;
      } else if (path.includes("/my-orders")) {
        pageGroups["my-orders"] = (pageGroups["my-orders"] || 0) + 1;
      } else if (path.includes("/tracking") || path.includes("/thank-you")) {
        pageGroups["tracking"] = (pageGroups["tracking"] || 0) + 1;
      }
    });

    // Process events for details
    const uniqueSessions = new Set<string>();
    events?.forEach(event => {
      if (!event.session_id) return;
      
      const eventData = event.event_data as Record<string, any> || {};
      
      // Track product views
      if (event.event_type === "view_product" && eventData.product_name) {
        const productName = eventData.product_name;
        productViews[productName] = (productViews[productName] || 0) + 1;
      }
      
      // Track checkout stages
      if (event.event_type === "checkout_stage" && eventData.stage) {
        const stage = eventData.stage;
        checkoutStages[stage] = (checkoutStages[stage] || 0) + 1;
      }

      // Track checkout start
      if (event.event_type === "checkout_start") {
        uniqueSessions.add(event.session_id);
      }

      // Extract location from delivery address events
      if (event.event_type === "checkout_stage" && eventData.barangay) {
        const barangay = eventData.barangay;
        locationCounts[barangay] = (locationCounts[barangay] || 0) + 1;
      }
    });

    // Build activity list
    const activityList: ActivityItem[] = [];

    // Add page-based activities
    if (pageGroups["homepage"] > 0) {
      activityList.push({
        type: "homepage",
        label: "on homepage",
        count: pageGroups["homepage"],
        icon: <Home className="h-3 w-3 text-blue-500" />
      });
    }

    // Add product views (top 2 products)
    const topProducts = Object.entries(productViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    
    topProducts.forEach(([productName, viewCount]) => {
      activityList.push({
        type: "view_product",
        label: `viewing ${productName}`,
        count: viewCount,
        icon: <FileText className="h-3 w-3 text-orange-500" />
      });
    });

    if (pageGroups["ordering"] > 0) {
      activityList.push({
        type: "ordering",
        label: "browsing menu",
        count: pageGroups["ordering"],
        icon: <ShoppingCart className="h-3 w-3 text-amber-500" />
      });
    }

    // Add checkout activities with stages
    if (uniqueSessions.size > 0) {
      const stageLabels: Record<string, string> = {
        "delivery-address": "entering address",
        "customer-info": "adding info",
        "payment": "at payment"
      };
      
      const checkoutCount = uniqueSessions.size;
      const stageDetails = Object.entries(checkoutStages)
        .filter(([stage]) => stageLabels[stage])
        .map(([stage, count]) => `${count} ${stageLabels[stage]}`)
        .slice(0, 2);

      activityList.push({
        type: "checkout",
        label: "checking out",
        count: checkoutCount,
        icon: <CreditCard className="h-3 w-3 text-green-500" />,
        detail: stageDetails.length > 0 ? stageDetails.join(", ") : undefined
      });
    }

    if (pageGroups["tracking"] > 0) {
      activityList.push({
        type: "tracking",
        label: "tracking order",
        count: pageGroups["tracking"],
        icon: <Package className="h-3 w-3 text-purple-500" />
      });
    }

    if (pageGroups["my-orders"] > 0) {
      activityList.push({
        type: "my-orders",
        label: "viewing orders",
        count: pageGroups["my-orders"],
        icon: <User className="h-3 w-3 text-indigo-500" />
      });
    }

    setActivities(activityList.slice(0, 5));

    // Get top location
    const topLoc = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)[0];
    
    if (topLoc) {
      setTopLocation({ barangay: topLoc[0], count: topLoc[1] });
    } else {
      setTopLocation(null);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchLiveData();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("live-visitors-realtime-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        () => fetchLiveData()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "analytics_events" },
        () => fetchLiveData()
      )
      .subscribe();

    // Polling every 30s as fallback
    const interval = setInterval(fetchLiveData, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchLiveData]);

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 h-full">
      <CardContent className="pt-4 pb-3 h-full flex flex-col">
        {/* Header Row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-full bg-primary/10">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{liveCount}</span>
              {liveCount > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Active in last 5 min</p>
          </div>
        </div>

        {/* Activity Feed */}
        {liveCount > 0 && activities.length > 0 && (
          <div className="flex-1 space-y-1.5 border-t border-primary/10 pt-2">
            {activities.map((activity, index) => (
              <div 
                key={`${activity.type}-${index}`} 
                className="flex items-start gap-2 text-xs"
              >
                <span className="mt-0.5">{activity.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{activity.count}</span>
                    {" "}{activity.label}
                  </span>
                  {activity.detail && (
                    <div className="text-[10px] text-muted-foreground/70 truncate pl-0.5">
                      └ {activity.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top Location */}
        {topLocation && (
          <div className="mt-auto pt-2 border-t border-primary/10">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="truncate">
                Top: <span className="font-medium text-foreground">{topLocation.barangay}</span> ({topLocation.count})
              </span>
            </div>
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
