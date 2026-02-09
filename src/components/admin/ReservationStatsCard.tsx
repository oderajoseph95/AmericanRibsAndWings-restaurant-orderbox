import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock, CheckCircle2, UserX, Loader2, ChevronRight } from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface ReservationStatsCardProps {
  dateFilter: "today" | "yesterday" | "week" | "month" | "custom";
  customDateRange?: { from: Date; to: Date } | null;
}

export function ReservationStatsCard({ dateFilter, customDateRange }: ReservationStatsCardProps) {
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday), label: "Yesterday" };
      case "week":
        return { start: startOfWeek(now), end: endOfDay(now), label: "This week" };
      case "month":
        return { start: startOfMonth(now), end: endOfDay(now), label: "This month" };
      case "custom":
        if (customDateRange) {
          return { 
            start: startOfDay(customDateRange.from), 
            end: endOfDay(customDateRange.to),
            label: `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}`
          };
        }
        return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
      default:
        return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    }
  }, [dateFilter, customDateRange]);

  // Total reservations in period (by created_at - when booking was made)
  const { data: totalCount, isLoading: loadingTotal } = useQuery({
    queryKey: ["reservation-stats", "total", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString());
      if (error) throw error;
      return count || 0;
    },
  });

  // Pending approval (NOT date-filtered - shows all pending needing action)
  const { data: pendingCount, isLoading: loadingPending } = useQuery({
    queryKey: ["reservation-stats", "pending"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
  });

  // Upcoming confirmed (today and future dates)
  const { data: upcomingCount, isLoading: loadingUpcoming } = useQuery({
    queryKey: ["reservation-stats", "upcoming"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { count, error } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("reservation_date", today);
      if (error) throw error;
      return count || 0;
    },
  });

  // No shows in period (by created_at - when booking was made)
  const { data: noShowCount, isLoading: loadingNoShow } = useQuery({
    queryKey: ["reservation-stats", "no-show", dateFilter, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "no_show")
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString());
      if (error) throw error;
      return count || 0;
    },
  });

  const isLoading = loadingTotal || loadingPending || loadingUpcoming || loadingNoShow;

  const stats = [
    {
      title: "Total Reservations",
      value: totalCount || 0,
      subtitle: dateRange.label,
      icon: <CalendarDays className="h-4 w-4" />,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      link: "/admin/reservations",
    },
    {
      title: "Pending Approval",
      value: pendingCount || 0,
      subtitle: "Need confirmation",
      icon: <Clock className="h-4 w-4" />,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
      link: "/admin/reservations?status=pending",
      pulse: (pendingCount || 0) > 0,
    },
    {
      title: "Upcoming Confirmed",
      value: upcomingCount || 0,
      subtitle: "Today & future",
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: "text-green-600",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      link: "/admin/reservations?status=confirmed",
    },
    {
      title: "No Shows",
      value: noShowCount || 0,
      subtitle: dateRange.label,
      icon: <UserX className="h-4 w-4" />,
      color: "text-red-600",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      link: "/admin/reservations?status=no_show",
    },
  ];

  const hasAnyData = stats.some((s) => s.value > 0);

  return (
    <Card className={cn("relative", !hasAnyData && !isLoading && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Reservations</CardTitle>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Link 
              to="/admin/reservations" 
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              View All <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Link
              key={stat.title}
              to={stat.link}
              className={cn(
                "rounded-lg border p-4 transition-all hover:shadow-md hover:scale-[1.02]",
                stat.bgColor,
                stat.borderColor,
                stat.pulse && "animate-pulse"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-md", stat.bgColor, stat.color)}>
                  {stat.icon}
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                  {stat.title}
                </h4>
              </div>
              <div className={cn("text-2xl font-bold tabular-nums", stat.color)}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
