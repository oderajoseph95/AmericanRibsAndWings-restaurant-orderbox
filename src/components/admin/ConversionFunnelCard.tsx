import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import { ArrowRight, Eye, ShoppingCart, CreditCard, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversionFunnelCardProps {
  dateFilter: "today" | "yesterday" | "week" | "month";
}

type FunnelStep = {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  color: string;
};

export function ConversionFunnelCard({ dateFilter }: ConversionFunnelCardProps) {
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
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [dateFilter]);

  const { data: funnelData } = useQuery({
    queryKey: ["conversion-funnel", dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_type, session_id")
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString());

      if (error) throw error;

      // Count unique sessions per event type
      const eventSessions: Record<string, Set<string>> = {
        page_view: new Set(),
        view_product: new Set(),
        add_to_cart: new Set(),
        checkout_start: new Set(),
        checkout_complete: new Set(),
      };

      data?.forEach((event) => {
        if (event.session_id && eventSessions[event.event_type]) {
          eventSessions[event.event_type].add(event.session_id);
        }
      });

      return {
        visits: eventSessions.page_view.size,
        viewProduct: eventSessions.view_product.size,
        addToCart: eventSessions.add_to_cart.size,
        checkoutStart: eventSessions.checkout_start.size,
        checkoutComplete: eventSessions.checkout_complete.size,
      };
    },
  });

  const steps: FunnelStep[] = [
    {
      key: "visits",
      label: "Visits",
      icon: <Eye className="h-4 w-4" />,
      count: funnelData?.visits || 0,
      color: "bg-blue-500",
    },
    {
      key: "addToCart",
      label: "Add to Cart",
      icon: <ShoppingCart className="h-4 w-4" />,
      count: funnelData?.addToCart || 0,
      color: "bg-yellow-500",
    },
    {
      key: "checkoutStart",
      label: "Checkout",
      icon: <CreditCard className="h-4 w-4" />,
      count: funnelData?.checkoutStart || 0,
      color: "bg-orange-500",
    },
    {
      key: "checkoutComplete",
      label: "Completed",
      icon: <CheckCircle className="h-4 w-4" />,
      count: funnelData?.checkoutComplete || 0,
      color: "bg-green-500",
    },
  ];

  const getConversionRate = (current: number, previous: number) => {
    if (previous === 0) return "0%";
    return `${((current / previous) * 100).toFixed(1)}%`;
  };

  const overallConversion = funnelData?.visits
    ? ((funnelData.checkoutComplete / funnelData.visits) * 100).toFixed(1)
    : "0";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Conversion Funnel</CardTitle>
          <span className="text-sm text-muted-foreground">
            {overallConversion}% overall
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          {steps.map((step, index) => (
            <div key={step.key} className="flex items-center gap-2">
              <div className="flex flex-col items-center min-w-[70px]">
                <div
                  className={cn(
                    "p-2 rounded-full text-white mb-1",
                    step.color
                  )}
                >
                  {step.icon}
                </div>
                <span className="text-lg font-bold">{step.count}</span>
                <span className="text-xs text-muted-foreground text-center">
                  {step.label}
                </span>
                {index > 0 && (
                  <span className="text-xs text-muted-foreground/70 mt-0.5">
                    {getConversionRate(step.count, steps[index - 1].count)}
                  </span>
                )}
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
