import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, ShoppingCart, TrendingUp, Tag, Loader2 } from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { Json } from "@/integrations/supabase/types";

interface ProductAnalyticsCardProps {
  dateFilter: "today" | "yesterday" | "week" | "month" | "custom";
  customDateRange?: { from: Date; to: Date } | null;
}

type AnalyticsItem = {
  id?: string;
  name: string;
  count: number;
};

export function ProductAnalyticsCard({ dateFilter, customDateRange }: ProductAnalyticsCardProps) {
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "week":
        return { start: startOfWeek(now), end: endOfDay(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfDay(now) };
      case "custom":
        if (customDateRange) {
          return { 
            start: startOfDay(customDateRange.from), 
            end: endOfDay(customDateRange.to) 
          };
        }
        return { start: startOfDay(now), end: endOfDay(now) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [dateFilter, customDateRange]);

  // Top Viewed Products - using RPC for accurate counts (bypasses 1000 row limit)
  const { data: topViewed, isLoading: loadingViewed } = useQuery({
    queryKey: ["product-analytics", "top-viewed", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_viewed_products", {
        start_date: dateRange.start.toISOString(),
        end_date: dateRange.end.toISOString(),
        limit_count: 5,
      });

      if (error) throw error;
      return ((data as any[]) || []).map((item: any) => ({
        id: item.id,
        name: item.name || "Unknown",
        count: Number(item.count) || 0,
      }));
    },
  });

  // Most Added to Cart - using RPC for accurate counts
  const { data: topAddedToCart, isLoading: loadingCart } = useQuery({
    queryKey: ["product-analytics", "top-added-cart", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_added_to_cart", {
        start_date: dateRange.start.toISOString(),
        end_date: dateRange.end.toISOString(),
        limit_count: 5,
      });

      if (error) throw error;
      return ((data as any[]) || []).map((item: any) => ({
        id: item.id,
        name: item.name || "Unknown",
        count: Number(item.count) || 0,
      }));
    },
  });

  // Top Categories - using RPC for accurate counts
  const { data: topCategories, isLoading: loadingCategories } = useQuery({
    queryKey: ["product-analytics", "top-categories", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_categories", {
        start_date: dateRange.start.toISOString(),
        end_date: dateRange.end.toISOString(),
        limit_count: 5,
      });

      if (error) throw error;
      return ((data as any[]) || []).map((item: any) => ({
        name: item.name || "Unknown",
        count: Number(item.count) || 0,
      }));
    },
  });

  // Most Purchased (from completed orders)
  const { data: topPurchased, isLoading: loadingPurchased } = useQuery({
    queryKey: ["product-analytics", "top-purchased", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      // Get completed orders in date range
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString())
        .in("status", ["approved", "preparing", "ready_for_pickup", "waiting_for_rider", "picked_up", "in_transit", "delivered", "completed"]);

      if (ordersError) throw ordersError;
      if (!orders?.length) return [];

      const orderIds = orders.map((o) => o.id);

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("product_name, quantity")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;

      const counts: Record<string, AnalyticsItem> = {};
      items?.forEach((item) => {
        const key = item.product_name;
        if (!counts[key]) counts[key] = { name: key, count: 0 };
        counts[key].count += item.quantity;
      });

      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
    },
  });

  const isLoading = loadingViewed || loadingCart || loadingCategories || loadingPurchased;

  const sections = [
    {
      title: "Top Viewed",
      icon: <Eye className="h-4 w-4" />,
      data: topViewed || [],
      color: "text-sky-600",
      bgColor: "bg-sky-500/10",
      borderColor: "border-sky-500/20",
    },
    {
      title: "Most Added to Cart",
      icon: <ShoppingCart className="h-4 w-4" />,
      data: topAddedToCart || [],
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      title: "Most Purchased",
      icon: <TrendingUp className="h-4 w-4" />,
      data: topPurchased || [],
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      title: "Top Categories",
      icon: <Tag className="h-4 w-4" />,
      data: topCategories || [],
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
    },
  ];

  const hasAnyData = sections.some((s) => s.data.length > 0);

  return (
    <Card className={cn("relative", !hasAnyData && !isLoading && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Product Analytics</CardTitle>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sections.map((section) => (
            <div
              key={section.title}
              className={cn(
                "rounded-lg border p-3",
                section.bgColor,
                section.borderColor
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("p-1.5 rounded-md", section.bgColor, section.color)}>
                  {section.icon}
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.title}
                </h4>
              </div>
              <div className="space-y-2">
                {section.data.length > 0 ? (
                  section.data.map((item, index) => (
                    <div key={item.name + index} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-xs font-medium text-muted-foreground w-4 flex-shrink-0">
                          {index + 1}.
                        </span>
                        <span className="text-xs font-medium truncate" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <span className={cn("text-xs font-bold tabular-nums", section.color)}>
                        {item.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No data</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
