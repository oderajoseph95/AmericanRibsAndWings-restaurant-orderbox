import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ShoppingCart, DollarSign, Clock, AlertTriangle, Loader2, TrendingUp } from 'lucide-react';
import { startOfDay, endOfDay } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { role } = useAuth();
  const today = new Date();

  // Today's sales and order count (approved + completed)
  const { data: todayStats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard-today-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('total_amount, status')
        .gte('created_at', startOfDay(today).toISOString())
        .lte('created_at', endOfDay(today).toISOString());
      
      if (error) throw error;
      
      const approvedOrCompleted = data?.filter(o => o.status === 'approved' || o.status === 'completed') || [];
      const totalSales = approvedOrCompleted.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const pendingCount = data?.filter(o => o.status === 'pending').length || 0;
      
      return {
        totalSales,
        orderCount: approvedOrCompleted.length,
        pendingCount,
        allOrdersToday: data?.length || 0,
      };
    },
  });

  // Pending orders count
  const { data: pendingOrders = 0 } = useQuery({
    queryKey: ['dashboard-pending'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Awaiting verification count
  const { data: awaitingVerification = 0 } = useQuery({
    queryKey: ['dashboard-verification'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'for_verification');
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Low stock alerts
  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('current_stock, low_stock_threshold, is_enabled')
        .eq('is_enabled', true);
      
      if (error) throw error;
      
      return data?.filter(s => s.current_stock <= s.low_stock_threshold).length || 0;
    },
  });

  // Top 5 selling products today
  const { data: topProducts = [] } = useQuery({
    queryKey: ['dashboard-top-products'],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id')
        .gte('created_at', startOfDay(today).toISOString())
        .lte('created_at', endOfDay(today).toISOString())
        .in('status', ['approved', 'completed']);
      
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
        .sort((a, b) => b.revenue - a.revenue)
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here's your store overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{(todayStats?.totalSales || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {todayStats?.orderCount || 0} completed orders
            </p>
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
              {todayStats?.allOrdersToday || 0} orders today
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

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
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
                  <Button size="sm" variant="outline">View Orders</Button>
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
                  <Button size="sm" variant="outline">Review</Button>
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
                  <Button size="sm" variant="outline">View Stock</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Sellers Today */}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Top Sellers Today</CardTitle>
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
                    <p className="font-semibold">₱{product.revenue.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{product.qty} sold</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
          <p className="text-xs mt-4">Your role: <span className="font-semibold capitalize text-foreground">{role}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
