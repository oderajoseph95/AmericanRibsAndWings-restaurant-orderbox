import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import { Eye, ShoppingCart, CreditCard, CheckCircle, TrendingDown, Sparkles } from "lucide-react";
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
      icon: <Eye className="h-5 w-5" />,
      count: funnelData?.visits || 0,
      color: "text-sky-600",
      bgGradient: "from-sky-500 to-blue-600",
    },
    {
      key: "addToCart",
      label: "Add to Cart",
      icon: <ShoppingCart className="h-5 w-5" />,
      count: funnelData?.addToCart || 0,
      color: "text-amber-600",
      bgGradient: "from-amber-500 to-orange-600",
    },
    {
      key: "checkoutStart",
      label: "Checkout",
      icon: <CreditCard className="h-5 w-5" />,
      count: funnelData?.checkoutStart || 0,
      color: "text-purple-600",
      bgGradient: "from-purple-500 to-indigo-600",
    },
    {
      key: "checkoutComplete",
      label: "Completed",
      icon: <CheckCircle className="h-5 w-5" />,
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

  const maxCount = Math.max(...steps.map(s => s.count), 1);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-medium">Conversion Funnel</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
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
      <CardContent className="pb-5">
        <TooltipProvider>
          <div className="space-y-4">
            {/* Funnel Steps */}
            <div className="flex items-stretch justify-between gap-3">
              {steps.map((step, index) => {
                const conversionFromPrev = index > 0 ? getConversionRate(step.count, steps[index - 1].count) : 100;
                const dropOff = index > 0 ? getDropOff(step.count, steps[index - 1].count) : 0;
                const barHeight = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 8) : 8;
                
                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center group">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-105">
                          {/* Icon with gradient background */}
                          <div className={cn(
                            "p-3 rounded-xl bg-gradient-to-br text-white shadow-lg mb-2 transition-all duration-300",
                            step.bgGradient,
                            "group-hover:shadow-xl group-hover:-translate-y-0.5"
                          )}>
                            {step.icon}
                          </div>
                          
                          {/* Count */}
                          <span className="text-2xl font-bold tabular-nums">{step.count}</span>
                          
                          {/* Label */}
                          <span className="text-xs text-muted-foreground text-center mt-0.5 leading-tight">
                            {step.label}
                          </span>
                          
                          {/* Conversion Rate Badge */}
                          {index > 0 && (
                            <div className={cn(
                              "mt-2 px-2 py-0.5 rounded-full text-xs font-semibold",
                              conversionFromPrev >= 50 
                                ? "bg-emerald-500/10 text-emerald-600"
                                : conversionFromPrev >= 20
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-red-500/10 text-red-600"
                            )}>
                              {conversionFromPrev.toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-center">
                        <p className="font-semibold">{step.count} {step.label.toLowerCase()}</p>
                        {index > 0 && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {conversionFromPrev.toFixed(1)}% from {steps[index - 1].label.toLowerCase()}
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
            <div className="flex items-end justify-between gap-3 h-16 px-2">
              {steps.map((step, index) => {
                const barHeight = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 5) : 5;
                
                return (
                  <div key={`bar-${step.key}`} className="flex-1 flex flex-col items-center">
                    <div className="w-full flex justify-center">
                      <div 
                        className={cn(
                          "w-10 rounded-t-lg bg-gradient-to-t transition-all duration-500 ease-out",
                          step.bgGradient,
                          "opacity-80 hover:opacity-100"
                        )}
                        style={{ height: `${barHeight}%`, minHeight: '4px' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Drop-off indicators */}
            <div className="flex justify-between gap-3 pt-2 border-t border-dashed">
              {steps.map((step, index) => {
                const dropOff = index > 0 ? getDropOff(step.count, steps[index - 1].count) : 0;
                const dropOffPercent = index > 0 && steps[index - 1].count > 0 
                  ? ((dropOff / steps[index - 1].count) * 100).toFixed(0)
                  : 0;
                
                return (
                  <div key={`drop-${step.key}`} className="flex-1 text-center">
                    {index > 0 && dropOff > 0 ? (
                      <div className="flex flex-col items-center">
                        <TrendingDown className="h-3 w-3 text-red-500 mb-0.5" />
                        <span className="text-xs text-red-500 font-medium">-{dropOff}</span>
                        <span className="text-[10px] text-muted-foreground">({dropOffPercent}% left)</span>
                      </div>
                    ) : index === 0 ? (
                      <span className="text-xs text-muted-foreground">Entry</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
