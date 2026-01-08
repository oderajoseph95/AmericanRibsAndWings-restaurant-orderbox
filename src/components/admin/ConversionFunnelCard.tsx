import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import { Eye, ShoppingCart, CreditCard, CheckCircle, TrendingDown, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
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
  bgGradient: string;
  isNegative?: boolean;
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

  // Fetch analytics events
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

  // Fetch abandoned checkouts
  const { data: abandonedData } = useQuery({
    queryKey: ["abandoned-checkouts-funnel", dateFilter],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("abandoned_checkouts")
        .select("*", { count: "exact", head: true })
        .eq("status", "abandoned")
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString());

      if (error) throw error;

      // Also get total value
      const { data: valueData } = await supabase
        .from("abandoned_checkouts")
        .select("cart_total")
        .eq("status", "abandoned")
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString());

      const totalValue = valueData?.reduce((sum, item) => sum + (item.cart_total || 0), 0) || 0;

      return {
        count: count || 0,
        totalValue,
      };
    },
  });

  const steps: FunnelStep[] = [
    {
      key: "visits",
      label: "Visits",
      icon: <Eye className="h-4 w-4" />,
      count: funnelData?.visits || 0,
      color: "text-sky-600",
      bgGradient: "from-sky-500 to-blue-600",
    },
    {
      key: "addToCart",
      label: "Add to Cart",
      icon: <ShoppingCart className="h-4 w-4" />,
      count: funnelData?.addToCart || 0,
      color: "text-amber-600",
      bgGradient: "from-amber-500 to-orange-600",
    },
    {
      key: "checkoutStart",
      label: "Checkout",
      icon: <CreditCard className="h-4 w-4" />,
      count: funnelData?.checkoutStart || 0,
      color: "text-purple-600",
      bgGradient: "from-purple-500 to-indigo-600",
    },
    {
      key: "abandoned",
      label: "Abandoned",
      icon: <AlertTriangle className="h-4 w-4" />,
      count: abandonedData?.count || 0,
      color: "text-red-600",
      bgGradient: "from-red-500 to-rose-600",
      isNegative: true,
    },
    {
      key: "checkoutComplete",
      label: "Completed",
      icon: <CheckCircle className="h-4 w-4" />,
      count: funnelData?.checkoutComplete || 0,
      color: "text-emerald-600",
      bgGradient: "from-emerald-500 to-green-600",
    },
  ];

  const getConversionRate = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return (current / previous) * 100;
  };

  const getDropOff = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return previous - current;
  };

  const overallConversion = funnelData?.visits
    ? ((funnelData.checkoutComplete / funnelData.visits) * 100).toFixed(1)
    : "0";

  const abandonmentRate = funnelData?.checkoutStart && funnelData.checkoutStart > 0
    ? (((abandonedData?.count || 0) / funnelData.checkoutStart) * 100).toFixed(0)
    : "0";

  const maxCount = Math.max(...steps.filter(s => !s.isNegative).map(s => s.count), 1);

  return (
    <Card className="h-full overflow-hidden relative">
      {/* Subtle AI glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
      
      <CardHeader className="pb-2 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium">Conversion Funnel</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-bold px-3 py-1 rounded-full",
              Number(overallConversion) > 5 
                ? "bg-emerald-500/10 text-emerald-600" 
                : Number(overallConversion) > 0 
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-muted text-muted-foreground"
            )}>
              {overallConversion}% conversion
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 relative">
        <TooltipProvider>
          <div className="space-y-3">
            {/* Funnel Steps */}
            <div className="flex items-stretch justify-between gap-2">
              {steps.map((step, index) => {
                const prevStep = step.isNegative 
                  ? steps.find(s => s.key === "checkoutStart")
                  : steps[index - 1];
                const conversionFromPrev = prevStep 
                  ? getConversionRate(step.count, prevStep.count) 
                  : 100;
                const dropOff = prevStep ? getDropOff(step.count, prevStep.count) : 0;
                
                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center group">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-105">
                          {/* Icon with gradient background */}
                          <div className={cn(
                            "p-2.5 rounded-xl bg-gradient-to-br text-white shadow-lg mb-1.5 transition-all duration-300",
                            step.bgGradient,
                            "group-hover:shadow-xl group-hover:-translate-y-0.5",
                            step.isNegative && "ring-2 ring-red-200 dark:ring-red-900/50"
                          )}>
                            {step.icon}
                          </div>
                          
                          {/* Count */}
                          <span className={cn(
                            "text-xl font-bold tabular-nums",
                            step.isNegative && "text-red-600"
                          )}>{step.count}</span>
                          
                          {/* Label */}
                          <span className={cn(
                            "text-[10px] text-muted-foreground text-center leading-tight",
                            step.isNegative && "text-red-500"
                          )}>
                            {step.label}
                          </span>
                          
                          {/* Conversion/Rate Badge */}
                          {index > 0 && !step.isNegative && (
                            <div className={cn(
                              "mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                              conversionFromPrev >= 50 
                                ? "bg-emerald-500/10 text-emerald-600"
                                : conversionFromPrev >= 20
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-red-500/10 text-red-600"
                            )}>
                              {conversionFromPrev.toFixed(0)}%
                            </div>
                          )}
                          {step.isNegative && step.count > 0 && (
                            <div className="mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-600">
                              {abandonmentRate}% lost
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-center max-w-[200px]">
                        <p className="font-semibold">{step.count} {step.label.toLowerCase()}</p>
                        {step.isNegative && abandonedData && abandonedData.totalValue > 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            ₱{abandonedData.totalValue.toLocaleString()} recoverable
                          </p>
                        )}
                        {!step.isNegative && index > 0 && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {conversionFromPrev.toFixed(1)}% from {prevStep?.label.toLowerCase()}
                            </p>
                            {dropOff > 0 && (
                              <p className="text-xs text-red-500 flex items-center justify-center gap-1 mt-1">
                                <TrendingDown className="h-3 w-3" />
                                {dropOff} dropped off
                              </p>
                            )}
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>

            {/* Progress Bars */}
            <div className="flex items-end justify-between gap-2 h-12 px-1">
              {steps.map((step) => {
                const barHeight = step.isNegative 
                  ? 0 // Don't show bar for abandoned (it's a negative metric)
                  : maxCount > 0 ? Math.max((step.count / maxCount) * 100, 5) : 5;
                
                return (
                  <div key={`bar-${step.key}`} className="flex-1 flex flex-col items-center justify-end h-full">
                    {step.isNegative ? (
                      // Show recovery icon for abandoned
                      <div className="flex items-center justify-center h-full">
                        {step.count > 0 && (
                          <RefreshCw className="h-4 w-4 text-red-400 animate-spin" style={{ animationDuration: '3s' }} />
                        )}
                      </div>
                    ) : (
                      <div className="w-full flex justify-center h-full items-end">
                        <div 
                          className={cn(
                            "w-8 rounded-t-lg bg-gradient-to-t transition-all duration-500 ease-out",
                            step.bgGradient,
                            "opacity-80 hover:opacity-100"
                          )}
                          style={{ height: `${barHeight}%`, minHeight: step.count > 0 ? '4px' : '0' }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Recovery insight - only show if there are abandoned carts */}
            {abandonedData && abandonedData.count > 0 && abandonedData.totalValue > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-200/50 dark:border-red-900/50">
                <RefreshCw className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  <span className="font-semibold">{abandonedData.count} abandoned</span>
                  {" "}carts worth{" "}
                  <span className="font-semibold">₱{abandonedData.totalValue.toLocaleString()}</span>
                  {" "}recoverable
                </p>
              </div>
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
