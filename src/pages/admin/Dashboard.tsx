import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ShoppingCart, DollarSign, Clock, AlertTriangle, Loader2, TrendingUp, 
  MapPin, Activity, Calendar, ChevronRight, Users, Truck, Package, Award, XCircle
} from 'lucide-react';
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format } from 'date-fns';
import { Link } from 'react-router-dom';
import { DashboardChart } from '@/components/admin/DashboardChart';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { LiveVisitorsCard } from '@/components/admin/LiveVisitorsCard';
import { ConversionFunnelCard } from '@/components/admin/ConversionFunnelCard';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type OrderStatus = Database['public']['Enums']['order_status'];

// Valid sales statuses (post-approval)
const SALES_STATUSES: OrderStatus[] = [
  'approved', 'preparing', 'ready_for_pickup', 'waiting_for_rider',
  'picked_up', 'in_transit', 'delivered', 'completed'
];

type DateFilter = 'today' | 'yesterday' | 'week' | 'month';

export default function Dashboard() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [lastUpdate, setLastUpdate] = useState(new Date());

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
      default:
        return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
    }
  }, [dateFilter]);

  // Setup realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Invalidate all dashboard queries on any order change
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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

  // Low stock alerts
  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('current_stock, low_stock_threshold, is_enabled')
        .eq('is_enabled', true);

      if (error) throw error;
      return data?.filter(s => s.current_stock <= s.low_stock_threshold).length || 0;
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

  if (loadingStats) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingOrders = globalCounts?.pendingOrders || 0;
  const awaitingVerification = globalCounts?.awaitingVerification || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with live indicator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Live</span>
            </div>
          </div>
          <p className="text-muted-foreground mt-1">
            Last updated: {format(lastUpdate, 'h:mm:ss a')}
          </p>
        </div>

        {/* Date filter buttons */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
          {(['today', 'yesterday', 'week', 'month'] as DateFilter[]).map((filter) => (
            <Button
              key={filter}
              variant={dateFilter === filter ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDateFilter(filter)}
              className="capitalize"
            >
              {filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : filter}
            </Button>
          ))}
        </div>
      </div>


      {/* Live Visitors & Conversion Funnel */}
      <div className="grid gap-4 md:grid-cols-3">
        <LiveVisitorsCard />
        <div className="md:col-span-2">
          <ConversionFunnelCard dateFilter={dateFilter} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground">Items need restocking</p>
          </CardContent>
        </Card>
      </div>

      {/* Cancelled/Refund Stats - only show if there are any */}
      {((periodStats?.cancelledCount || 0) + (periodStats?.rejectedCount || 0)) > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <XCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{periodStats?.cancelledCount || 0}</div>
              <p className="text-xs text-muted-foreground">Orders cancelled</p>
            </CardContent>
          </Card>

          <Card className="border-red-500/20 bg-red-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{periodStats?.rejectedCount || 0}</div>
              <p className="text-xs text-muted-foreground">Orders rejected</p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Refunds Issued</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{periodStats?.refundedCount || 0}</div>
              <p className="text-xs text-muted-foreground">Orders refunded</p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
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
      )}

      {/* Delivery Metrics - Only show if there are delivery orders */}
      {(periodStats?.deliveryCount || 0) > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Distance Covered</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(periodStats?.totalDeliveryDistance || 0).toFixed(1)} km</div>
              <p className="text-xs text-muted-foreground">
                {periodStats?.deliveryCount} deliveries
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Delivery Distance</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(periodStats?.avgDeliveryDistance || 0).toFixed(1)} km</div>
              <p className="text-xs text-muted-foreground">Per delivery order</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Delivery Fees Collected</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₱{(periodStats?.totalDeliveryFees || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">From {periodStats?.deliveryCount} orders</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Order Type Breakdown */}
      {(periodStats?.salesOrderCount || 0) > 0 && (
        <Card>
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
      )}

      {/* Driver & Customer Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        {driverStats?.topDriverName && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Top Driver Today</CardTitle>
              <Award className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold truncate">{driverStats.topDriverName}</div>
              <p className="text-xs text-muted-foreground">
                ₱{driverStats.topDriverEarnings.toFixed(2)} earned
              </p>
            </CardContent>
          </Card>
        )}
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

        {lowStockCount > 0 && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-400">
                    {lowStockCount} item{lowStockCount > 1 ? 's' : ''} running low
                  </p>
                  <p className="text-sm text-muted-foreground">Check inventory levels</p>
                </div>
                <Link to="/admin/stock">
                  <Button size="sm" variant="outline">
                    View <ChevronRight className="h-4 w-4 ml-1" />
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
            <Calendar className="h-4 w-4 text-muted-foreground" />
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

      {/* Top Sellers */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Top Sellers ({dateRange.label})</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

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
