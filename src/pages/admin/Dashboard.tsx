import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ShoppingCart, DollarSign, Clock, Loader2, TrendingUp, 
  MapPin, Activity, Calendar as CalendarIcon, ChevronRight, Users, Truck, Package, Award, XCircle, RefreshCw, ShoppingBag, RotateCcw,
  Mail, MessageSquare, Timer, UserCheck
} from 'lucide-react';
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format, differenceInMinutes } from 'date-fns';
import { Link } from 'react-router-dom';
import { DashboardChart } from '@/components/admin/DashboardChart';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { LiveVisitorsCard } from '@/components/admin/LiveVisitorsCard';
import { ConversionFunnelCard } from '@/components/admin/ConversionFunnelCard';
import { ProductAnalyticsCard } from '@/components/admin/ProductAnalyticsCard';
import { ReservationStatsCard } from '@/components/admin/ReservationStatsCard';
import { DashboardCommandHeader } from '@/components/admin/DashboardCommandHeader';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Database } from '@/integrations/supabase/types';

type OrderStatus = Database['public']['Enums']['order_status'];

// Valid sales statuses (post-approval)
const SALES_STATUSES: OrderStatus[] = [
  'approved', 'preparing', 'ready_for_pickup', 'waiting_for_rider',
  'picked_up', 'in_transit', 'delivered', 'completed'
];

type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

interface CustomDateRange {
  from: Date;
  to: Date;
}

export default function Dashboard() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Refresh all dashboard data
  const refreshAllData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['conversion-funnel'] }),
      queryClient.invalidateQueries({ queryKey: ['live-visitors'] }),
    ]);
    setLastUpdate(new Date());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAllData();
    toast.success('Dashboard refreshed');
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Track tab visibility to pause updates when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Auto-refresh every 30 seconds (only when tab is visible)
  useEffect(() => {
    if (!isTabVisible) return; // Skip if tab is hidden - prevents work loss
    
    const interval = setInterval(() => {
      // Use refetchQueries instead of invalidateQueries to update in background without clearing cache
      queryClient.refetchQueries({ 
        queryKey: ['dashboard'],
        type: 'active', // Only refetch currently mounted queries
      });
      setLastUpdate(new Date());
    }, 30000); // 30 seconds instead of 10

    return () => clearInterval(interval);
  }, [queryClient, isTabVisible]);

  // Calculate date range based on filter
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday), label: 'Yesterday' };
      case 'week':
        return { start: startOfWeek(now), end: endOfDay(now), label: 'This Week' };
      case 'month':
        return { start: startOfMonth(now), end: endOfDay(now), label: 'This Month' };
      case 'custom':
        if (customDateRange) {
          return {
            start: startOfDay(customDateRange.from),
            end: endOfDay(customDateRange.to),
            label: `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}`
          };
        }
        return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
      default:
        return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
    }
  }, [dateFilter, customDateRange]);

  // Setup realtime subscription - use refetch instead of invalidate to prevent work loss
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Only refetch specific active queries, don't invalidate all (prevents work loss)
          queryClient.refetchQueries({ 
            queryKey: ['dashboard', 'period-stats'],
            type: 'active',
          });
          queryClient.refetchQueries({ 
            queryKey: ['dashboard', 'global-counts'],
            type: 'active',
          });
          queryClient.refetchQueries({ 
            queryKey: ['dashboard', 'recent-orders'],
            type: 'active',
          });
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filtered sales and order stats
  const { data: periodStats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard', 'period-stats', dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, total_amount, status, order_type, delivery_distance_km, delivery_fee, is_refunded, refund_amount')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (error) throw error;

      const salesOrders = data?.filter(o => o.status && SALES_STATUSES.includes(o.status)) || [];
      const deliveryOrders = salesOrders.filter(o => o.order_type === 'delivery');
      
      const totalSales = salesOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const totalDeliveryDistance = deliveryOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);
      const totalDeliveryFees = deliveryOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
      const avgDeliveryDistance = deliveryOrders.length > 0 ? totalDeliveryDistance / deliveryOrders.length : 0;
      
      const pendingCount = data?.filter(o => o.status === 'pending').length || 0;
      const forVerificationCount = data?.filter(o => o.status === 'for_verification').length || 0;
      
      // Cancelled/Rejected stats
      const cancelledOrders = data?.filter(o => o.status === 'cancelled') || [];
      const rejectedOrders = data?.filter(o => o.status === 'rejected') || [];
      const refundedOrders = data?.filter(o => o.is_refunded === true) || [];
      const totalRefunds = refundedOrders.reduce((sum, o) => sum + Number(o.refund_amount || 0), 0);
      
      // Order type breakdown
      const pickupCount = salesOrders.filter(o => o.order_type === 'pickup').length;
      const dineInCount = salesOrders.filter(o => o.order_type === 'dine_in').length;

      // Net sales = sales - refunds
      const netSales = totalSales - totalRefunds;

      return {
        totalSales,
        netSales,
        salesOrderCount: salesOrders.length,
        pendingCount,
        forVerificationCount,
        allOrdersCount: data?.length || 0,
        deliveryCount: deliveryOrders.length,
        pickupCount,
        dineInCount,
        totalDeliveryDistance,
        avgDeliveryDistance,
        totalDeliveryFees,
        cancelledCount: cancelledOrders.length,
        rejectedCount: rejectedOrders.length,
        refundedCount: refundedOrders.length,
        totalRefunds,
      };
    },
  });

  // Overall pending/verification counts (not filtered by date)
  const { data: globalCounts } = useQuery({
    queryKey: ['dashboard', 'global-counts'],
    queryFn: async () => {
      const [pendingRes, verificationRes] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'for_verification'),
      ]);
      
      return {
        pendingOrders: pendingRes.count || 0,
        awaitingVerification: verificationRes.count || 0,
      };
    },
  });

  // At-risk carts stats (NOT filtered by date - shows all active at-risk carts)
  const { data: atRiskCartsStats } = useQuery({
    queryKey: ['dashboard', 'at-risk-carts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abandoned_checkouts')
        .select('id, cart_total, status')
        .in('status', ['abandoned', 'recovering']); // Active at-risk carts regardless of date

      if (error) throw error;
      
      const abandoned = data?.filter(c => c.status === 'abandoned') || [];
      const recovering = data?.filter(c => c.status === 'recovering') || [];
      
      const atRiskValue = data?.reduce((sum, c) => sum + (c.cart_total || 0), 0) || 0;
      const recoveringValue = recovering.reduce((sum, c) => sum + (c.cart_total || 0), 0);
      
      return {
        abandonedCount: abandoned.length,
        recoveringCount: recovering.length,
        atRiskValue,
        recoveringValue,
        totalAtRisk: (abandoned.length || 0) + (recovering.length || 0),
      };
    },
  });

  // Recovery stats for the period (filtered by date for historical tracking)
  const { data: recoveryStats } = useQuery({
    queryKey: ['dashboard', 'recovery-stats', dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abandoned_checkouts')
        .select('id, cart_total, status')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (error) throw error;
      
      const recovered = data?.filter(c => c.status === 'recovered') || [];
      const expired = data?.filter(c => c.status === 'expired') || [];
      
      const recoveredRevenue = recovered.reduce((sum, c) => sum + (c.cart_total || 0), 0);
      const totalAttempted = recovered.length + expired.length;
      const recoveryRate = totalAttempted > 0 ? (recovered.length / totalAttempted * 100) : 0;
      
      return {
        recoveredCount: recovered.length,
        expiredCount: expired.length,
        recoveredRevenue,
        recoveryRate,
      };
    },
  });

  // Driver stats
  const { data: driverStats } = useQuery({
    queryKey: ['dashboard', 'driver-stats'],
    queryFn: async () => {
      const { data: drivers, error } = await supabase
        .from('drivers')
        .select('id, is_active, availability_status');
      if (error) throw error;

      // Fetch today's driver earnings
      const { data: todayEarnings, error: earningsErr } = await supabase
        .from('driver_earnings')
        .select('driver_id, delivery_fee, status')
        .gte('created_at', startOfDay(new Date()).toISOString());
      if (earningsErr) throw earningsErr;

      const onlineCount = drivers?.filter(d => d.availability_status === 'online').length || 0;
      const busyCount = drivers?.filter(d => d.availability_status === 'busy').length || 0;
      const inProgressCount = todayEarnings?.filter(e => e.status === 'pending').length || 0;
      const todayDeliveries = todayEarnings?.length || 0;
      const todayDriverEarnings = todayEarnings?.reduce((sum, e) => sum + Number(e.delivery_fee), 0) || 0;

      // Find top driver today
      const driverEarningsMap: Record<string, number> = {};
      todayEarnings?.forEach(e => {
        driverEarningsMap[e.driver_id] = (driverEarningsMap[e.driver_id] || 0) + Number(e.delivery_fee);
      });
      const topDriverId = Object.entries(driverEarningsMap).sort((a, b) => b[1] - a[1])[0]?.[0];
      
      let topDriverName = null;
      if (topDriverId) {
        const topDriver = drivers?.find(d => d.id === topDriverId);
        if (topDriver) {
          const { data: driverData } = await supabase.from('drivers').select('name').eq('id', topDriverId).single();
          topDriverName = driverData?.name;
        }
      }

      return {
        total: drivers?.length || 0,
        active: drivers?.filter(d => d.is_active).length || 0,
        online: onlineCount,
        busy: busyCount,
        inProgress: inProgressCount,
        todayDeliveries,
        todayEarnings: todayDriverEarnings,
        topDriverName,
        topDriverEarnings: topDriverId ? driverEarningsMap[topDriverId] : 0,
      };
    },
  });

  // Customer stats
  const { data: customerStats } = useQuery({
    queryKey: ['dashboard', 'customer-stats'],
    queryFn: async () => {
      // New customers today
      const { count: newToday, error: newErr } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay(new Date()).toISOString());
      if (newErr) throw newErr;

      // Total customers
      const { count: total, error: totalErr } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      if (totalErr) throw totalErr;

      return {
        newToday: newToday || 0,
        total: total || 0,
      };
    },
  });

  // Last 7 days orders for chart
  const { data: chartOrders = [] } = useQuery({
    queryKey: ['dashboard', 'chart-orders'],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7);
      const { data, error } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, status')
        .gte('created_at', startOfDay(sevenDaysAgo).toISOString())
        .in('status', SALES_STATUSES);

      if (error) throw error;
      return data || [];
    },
  });

  // Recent orders for activity feed
  const { data: recentOrders = [] } = useQuery({
    queryKey: ['dashboard', 'recent-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, status_changed_at, updated_at, created_at, total_amount')
        .order('status_changed_at', { ascending: false, nullsFirst: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  // Top 5 selling products for the period
  const { data: topProducts = [] } = useQuery({
    queryKey: ['dashboard', 'top-products', dateFilter],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .in('status', SALES_STATUSES);

      if (error) throw error;
      if (!orders?.length) return [];

      const orderIds = orders.map(o => o.id);

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('product_name, quantity, line_total')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      items?.forEach((item) => {
        const key = item.product_name;
        if (!productMap[key]) {
          productMap[key] = { name: key, qty: 0, revenue: 0 };
        }
        productMap[key].qty += item.quantity;
        productMap[key].revenue += item.line_total || 0;
      });

      return Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue) // Sort by revenue (top sellers)
        .slice(0, 5);
    },
  });

  // Communication stats (emails and SMS sent)
  const { data: commStats } = useQuery({
    queryKey: ['dashboard', 'communication-stats', dateFilter, customDateRange],
    queryFn: async () => {
      const [emailRes, smsRes] = await Promise.all([
        supabase.from('email_logs')
          .select('*', { count: 'exact', head: true })
          .in('status', ['sent', 'delivered'])
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString()),
        supabase.from('sms_logs')
          .select('*', { count: 'exact', head: true })
          .in('status', ['sent', 'delivered'])
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString()),
      ]);
      
      return {
        emailsSent: emailRes.count || 0,
        smsSent: smsRes.count || 0,
      };
    },
  });

  // Order handling time stats
  const { data: handlingStats } = useQuery({
    queryKey: ['dashboard', 'handling-stats', dateFilter, customDateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('created_at, status_changed_at')
        .in('status', ['delivered', 'completed'])
        .not('status_changed_at', 'is', null)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
      
      if (!data?.length) return { avgHandlingMinutes: 0, orderCount: 0 };
      
      const handlingTimes = data
        .filter(o => o.created_at && o.status_changed_at)
        .map(o => differenceInMinutes(new Date(o.status_changed_at!), new Date(o.created_at!)));
      
      const validTimes = handlingTimes.filter(t => t > 0 && t < 10080); // Filter out invalid (>7 days)
      const avgMinutes = validTimes.length > 0 
        ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length 
        : 0;
      
      return { 
        avgHandlingMinutes: Math.round(avgMinutes),
        orderCount: validTimes.length
      };
    },
  });

  // Repeat customers count
  const { data: repeatCustomerStats } = useQuery({
    queryKey: ['dashboard', 'repeat-customers', dateFilter, customDateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, total_orders')
        .gte('total_orders', 2);
      
      return {
        repeatCount: data?.length || 0,
      };
    },
  });

  // Random loading messages for engaging UX
  const loadingMessages = [
    "Crunching the numbers...",
    "Pulling up your data...",
    "Almost there...",
    "Counting those orders...",
    "Fetching sales data...",
    "Loading your dashboard...",
    "Brewing fresh stats...",
    "Gathering insights...",
  ];
  const getRandomLoadingMessage = () => 
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  const pendingOrders = globalCounts?.pendingOrders || 0;
  const awaitingVerification = globalCounts?.awaitingVerification || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with live indicator and command header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left side: Title & controls */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">Live</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 w-8"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Last updated: {format(lastUpdate, 'h:mm:ss a')}
            </p>

            {/* Date filter buttons - scrollable on mobile */}
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto w-fit max-w-full">
              {(['today', 'yesterday', 'week', 'month'] as const).map((filter) => (
                <Button
                  key={filter}
                  variant={dateFilter === filter ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDateFilter(filter)}
                  className="capitalize whitespace-nowrap text-xs sm:text-sm"
                >
                  {filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : filter}
                </Button>
              ))}
              
              {/* Custom Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={dateFilter === 'custom' ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-1.5 whitespace-nowrap text-xs sm:text-sm"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateFilter === 'custom' && customDateRange
                      ? `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}`
                      : 'Custom'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={customDateRange?.from}
                    selected={customDateRange ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setCustomDateRange({ from: range.from, to: range.to });
                        setDateFilter('custom');
                      } else if (range?.from) {
                        setCustomDateRange({ from: range.from, to: range.from });
                      }
                    }}
                    numberOfMonths={2}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Right side: Command header (desktop only) */}
          <DashboardCommandHeader />
        </div>
      </div>


      {/* Live Visitors & Conversion Funnel */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-1">
          <LiveVisitorsCard />
        </div>
        <div className="lg:col-span-2">
          <ConversionFunnelCard dateFilter={dateFilter} customDateRange={customDateRange} />
        </div>
      </div>

      {/* Reservation Stats */}
      <ReservationStatsCard dateFilter={dateFilter} customDateRange={customDateRange} />

      {/* Product Analytics */}
      <ProductAnalyticsCard dateFilter={dateFilter} customDateRange={customDateRange} />

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 relative">
        {/* Loading overlay */}
        {loadingStats && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{getRandomLoadingMessage()}</span>
            </div>
          </div>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{dateRange.label}'s Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{(periodStats?.totalSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              {periodStats?.salesOrderCount || 0} completed orders
            </p>
            {(periodStats?.totalRefunds || 0) > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Net: ₱{(periodStats?.netSales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders}</div>
            <p className="text-xs text-muted-foreground">
              {periodStats?.allOrdersCount || 0} orders {dateRange.label.toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Verification</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{awaitingVerification}</div>
            <p className="text-xs text-muted-foreground">Payment proofs to review</p>
          </CardContent>
        </Card>

        {/* Cart At Risk Card - Shows combined value of abandoned + recovering */}
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cart At Risk</CardTitle>
            <ShoppingBag className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">₱{(atRiskCartsStats?.atRiskValue || 0).toLocaleString('en-PH')}</div>
            <p className="text-xs text-muted-foreground">
              {atRiskCartsStats?.totalAtRisk || 0} cart{(atRiskCartsStats?.totalAtRisk || 0) !== 1 ? 's' : ''} at risk
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cart Recovery Stats - always visible */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={cn("border-green-500/20 bg-green-500/5", (recoveryStats?.recoveredCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recovered Carts</CardTitle>
            <RotateCcw className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{recoveryStats?.recoveredCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              ₱{(recoveryStats?.recoveredRevenue || 0).toLocaleString('en-PH')} recovered
            </p>
          </CardContent>
        </Card>

        <Card className={cn("border-red-500/20 bg-red-500/5", (recoveryStats?.expiredCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed Recovery</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{recoveryStats?.expiredCount || 0}</div>
            <p className="text-xs text-muted-foreground">Reminders exhausted</p>
          </CardContent>
        </Card>

        <Card className={cn("border-blue-500/20 bg-blue-500/5", ((recoveryStats?.recoveredCount || 0) + (recoveryStats?.expiredCount || 0)) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recovery Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{(recoveryStats?.recoveryRate || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Of attempted recoveries</p>
          </CardContent>
        </Card>
      </div>

      {/* Cancelled/Refund Stats - always visible */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={cn("border-orange-500/20 bg-orange-500/5", (periodStats?.cancelledCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{periodStats?.cancelledCount || 0}</div>
            <p className="text-xs text-muted-foreground">Orders cancelled</p>
          </CardContent>
        </Card>

        <Card className={cn("border-red-500/20 bg-red-500/5", (periodStats?.rejectedCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{periodStats?.rejectedCount || 0}</div>
            <p className="text-xs text-muted-foreground">Orders rejected</p>
          </CardContent>
        </Card>

        <Card className={cn("border-blue-500/20 bg-blue-500/5", (periodStats?.refundedCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Refunds Issued</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{periodStats?.refundedCount || 0}</div>
            <p className="text-xs text-muted-foreground">Orders refunded</p>
          </CardContent>
        </Card>

        <Card className={cn("border-purple-500/20 bg-purple-500/5", (periodStats?.totalRefunds || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">₱{(periodStats?.totalRefunds || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Amount refunded</p>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Metrics - always visible */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={cn((periodStats?.deliveryCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Distance Covered</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(periodStats?.totalDeliveryDistance || 0).toFixed(1)} km</div>
            <p className="text-xs text-muted-foreground">
              {periodStats?.deliveryCount || 0} deliveries
            </p>
          </CardContent>
        </Card>

        <Card className={cn((periodStats?.deliveryCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Delivery Distance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(periodStats?.avgDeliveryDistance || 0).toFixed(1)} km</div>
            <p className="text-xs text-muted-foreground">Per delivery order</p>
          </CardContent>
        </Card>

        <Card className={cn((periodStats?.deliveryCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Delivery Fees Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{(periodStats?.totalDeliveryFees || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">From {periodStats?.deliveryCount || 0} orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Order Type Breakdown - always visible */}
      <Card className={cn((periodStats?.salesOrderCount || 0) === 0 && "opacity-60")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Order Breakdown ({dateRange.label})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                Delivery
              </Badge>
              <span className="font-semibold">{periodStats?.deliveryCount || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                Pickup
              </Badge>
              <span className="font-semibold">{periodStats?.pickupCount || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                Dine-in
              </Badge>
              <span className="font-semibold">{periodStats?.dineInCount || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Driver & Customer Stats - Row 2 of 4 cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Drivers Online</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{driverStats?.online || 0}</div>
            <p className="text-xs text-muted-foreground">
              {driverStats?.busy || 0} busy, {driverStats?.inProgress || 0} in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Deliveries</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{driverStats?.todayDeliveries || 0}</div>
            <p className="text-xs text-muted-foreground">
              ₱{(driverStats?.todayEarnings || 0).toFixed(2)} in fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customerStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {customerStats?.newToday || 0} new today
            </p>
          </CardContent>
        </Card>

        {/* Carts in Recovery - 8th card */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Carts in Recovery</CardTitle>
            <RotateCcw className={cn("h-4 w-4 text-blue-500", (atRiskCartsStats?.recoveringCount || 0) > 0 && "animate-spin")} style={{ animationDuration: '3s' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{atRiskCartsStats?.recoveringCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              ₱{(atRiskCartsStats?.recoveringValue || 0).toLocaleString('en-PH')} value
            </p>
            <Link to="/admin/abandoned-checkouts" className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pendingOrders > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-orange-700 dark:text-orange-400">
                    {pendingOrders} pending order{pendingOrders > 1 ? 's' : ''} need attention
                  </p>
                  <p className="text-sm text-muted-foreground">Review and process orders</p>
                </div>
                <Link to="/admin/orders">
                  <Button size="sm" variant="outline">
                    View <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {awaitingVerification > 0 && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-700 dark:text-blue-400">
                    {awaitingVerification} payment{awaitingVerification > 1 ? 's' : ''} awaiting verification
                  </p>
                  <p className="text-sm text-muted-foreground">Review payment proofs</p>
                </div>
                <Link to="/admin/orders?status=for_verification">
                  <Button size="sm" variant="outline">
                    Review <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {(atRiskCartsStats?.totalAtRisk || 0) > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-orange-700 dark:text-orange-400">
                      {atRiskCartsStats?.totalAtRisk} cart{(atRiskCartsStats?.totalAtRisk || 0) !== 1 ? 's' : ''} worth ₱{(atRiskCartsStats?.atRiskValue || 0).toLocaleString('en-PH')}
                    </p>
                    {(atRiskCartsStats?.recoveringCount || 0) > 0 && (
                      <Badge className="bg-blue-500 text-white animate-pulse border-0">
                        {atRiskCartsStats?.recoveringCount} Recovering
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {atRiskCartsStats?.abandonedCount || 0} recoverable, {atRiskCartsStats?.recoveringCount || 0} in progress
                  </p>
                </div>
                <Link to="/admin/abandoned-checkouts">
                  <Button size="sm" variant="outline">
                    Recover <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts and Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sales Trend</CardTitle>
              <p className="text-sm text-muted-foreground">Last 7 days performance</p>
            </div>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <DashboardChart orders={chartOrders} days={7} />
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ActivityFeed orders={recentOrders} limit={5} />
          </CardContent>
        </Card>
      </div>

      {/* Communication & Performance Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className={cn((commStats?.emailsSent || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{commStats?.emailsSent || 0}</div>
            <p className="text-xs text-muted-foreground">{dateRange.label}</p>
          </CardContent>
        </Card>

        <Card className={cn((commStats?.smsSent || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SMS Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{commStats?.smsSent || 0}</div>
            <p className="text-xs text-muted-foreground">{dateRange.label}</p>
          </CardContent>
        </Card>

        <Card className={cn((handlingStats?.orderCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Handling Time</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(handlingStats?.avgHandlingMinutes || 0) > 0 
                ? `${Math.floor((handlingStats?.avgHandlingMinutes || 0) / 60)}h ${(handlingStats?.avgHandlingMinutes || 0) % 60}m`
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Order to completion ({handlingStats?.orderCount || 0} orders)
            </p>
          </CardContent>
        </Card>

        <Card className={cn((repeatCustomerStats?.repeatCount || 0) === 0 && "opacity-60")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Repeat Customers</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repeatCustomerStats?.repeatCount || 0}</div>
            <p className="text-xs text-muted-foreground">Ordered 2+ times</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Sellers - always visible */}
      <Card className={cn(topProducts.length === 0 && "opacity-60")}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Top Sellers ({dateRange.label})</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-5">
                      #{index + 1}
                    </span>
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">₱{product.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">{product.qty} sold</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No sales data for this period</p>
          )}
        </CardContent>
      </Card>

      {/* Getting Started - Only show if no orders */}
      {(periodStats?.allOrdersCount || 0) === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>✅ Database schema created with all tables</p>
            <p>✅ Authentication system ready</p>
            <p>✅ All triggers configured</p>
            <p>⏳ Add your first admin user via Settings</p>
            <p>⏳ Import products from CSV</p>
            <p>⏳ Configure flavors and rules</p>
            <p className="text-xs mt-4">
              Your role: <span className="font-semibold capitalize text-foreground">{role}</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
