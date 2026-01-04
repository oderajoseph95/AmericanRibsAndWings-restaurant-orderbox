import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Download, Loader2, TrendingUp, ShoppingCart, Users, DollarSign, ShieldX, MapPin, Truck, Clock, Award, UserCheck, XCircle, RotateCcw } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { Tables, Database } from '@/integrations/supabase/types';
import { Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type OrderStatus = Database['public']['Enums']['order_status'];

// Valid sales statuses (post-approval)
const SALES_STATUSES: OrderStatus[] = [
  'approved', 'preparing', 'ready_for_pickup', 'waiting_for_rider',
  'picked_up', 'in_transit', 'delivered', 'completed'
];

type OrderWithItems = Tables<'orders'> & {
  order_items: (Tables<'order_items'> & {
    order_item_flavors: Tables<'order_item_flavors'>[];
  })[];
};

const COLORS = ['hsl(8, 72%, 45%)', 'hsl(40, 85%, 55%)', 'hsl(142, 76%, 36%)', 'hsl(217, 91%, 60%)', 'hsl(162, 63%, 41%)'];

export default function Reports() {
  const { role } = useAuth();
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Cashiers cannot access reports
  if (role === 'cashier') {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to view reports. Please contact an owner or manager if you need access.
        </p>
      </div>
    );
  }

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['reports-orders', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, order_item_flavors(*))')
        .gte('created_at', startOfDay(new Date(dateFrom)).toISOString())
        .lte('created_at', endOfDay(new Date(dateTo)).toISOString())
        .in('status', SALES_STATUSES);
      if (error) throw error;
      return data as OrderWithItems[];
    },
  });

  // Fetch cancelled/rejected orders with refund data
  const { data: cancelledOrders = [] } = useQuery({
    queryKey: ['reports-cancelled-orders', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name, phone)')
        .gte('created_at', startOfDay(new Date(dateFrom)).toISOString())
        .lte('created_at', endOfDay(new Date(dateTo)).toISOString())
        .in('status', ['cancelled', 'rejected'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch drivers data
  const { data: driversData = [] } = useQuery({
    queryKey: ['reports-drivers', dateFrom, dateTo],
    queryFn: async () => {
      const { data: drivers, error } = await supabase
        .from('drivers')
        .select('id, name, is_active');
      if (error) throw error;

      // Fetch earnings for each driver in the period
      const { data: earnings, error: earningsErr } = await supabase
        .from('driver_earnings')
        .select('driver_id, delivery_fee, distance_km, status, created_at')
        .gte('created_at', startOfDay(new Date(dateFrom)).toISOString())
        .lte('created_at', endOfDay(new Date(dateTo)).toISOString());
      if (earningsErr) throw earningsErr;

      return drivers?.map(driver => {
        const driverEarnings = earnings?.filter(e => e.driver_id === driver.id) || [];
        return {
          ...driver,
          deliveries: driverEarnings.length,
          totalEarnings: driverEarnings.reduce((sum, e) => sum + Number(e.delivery_fee), 0),
          totalDistance: driverEarnings.reduce((sum, e) => sum + Number(e.distance_km || 0), 0),
        };
      }).sort((a, b) => b.totalEarnings - a.totalEarnings) || [];
    },
  });

  // Fetch customers data
  const { data: customersData = [] } = useQuery({
    queryKey: ['reports-customers', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, total_orders, total_spent, created_at')
        .order('total_spent', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Summary stats
  const stats = useMemo(() => {
    const totalSales = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const uniqueCustomers = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size;

    // Delivery stats
    const deliveryOrders = orders.filter(o => o.order_type === 'delivery');
    const totalDeliveryDistance = deliveryOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);
    const totalDeliveryFees = deliveryOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
    const avgDeliveryDistance = deliveryOrders.length > 0 ? totalDeliveryDistance / deliveryOrders.length : 0;

    return { 
      totalSales, 
      totalOrders, 
      avgOrderValue, 
      uniqueCustomers,
      deliveryOrders: deliveryOrders.length,
      totalDeliveryDistance,
      totalDeliveryFees,
      avgDeliveryDistance,
    };
  }, [orders]);

  // Daily sales chart data
  const dailySalesData = useMemo(() => {
    const byDay: Record<string, number> = {};
    orders.forEach((order) => {
      const day = format(new Date(order.created_at!), 'MMM d');
      byDay[day] = (byDay[day] || 0) + (order.total_amount || 0);
    });
    return Object.entries(byDay).map(([day, total]) => ({ day, total }));
  }, [orders]);

  // Top products
  const topProducts = useMemo(() => {
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    orders.forEach((order) => {
      order.order_items.forEach((item) => {
        const key = item.product_name;
        if (!productMap[key]) {
          productMap[key] = { name: key, qty: 0, revenue: 0 };
        }
        productMap[key].qty += item.quantity;
        productMap[key].revenue += item.line_total || 0;
      });
    });
    return Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [orders]);

  // Flavor popularity
  const flavorStats = useMemo(() => {
    const flavorMap: Record<string, { name: string; count: number; surcharge: number }> = {};
    orders.forEach((order) => {
      order.order_items.forEach((item) => {
        item.order_item_flavors.forEach((flavor) => {
          const key = flavor.flavor_name;
          if (!flavorMap[key]) {
            flavorMap[key] = { name: key, count: 0, surcharge: 0 };
          }
          flavorMap[key].count += flavor.quantity || 1;
          flavorMap[key].surcharge += flavor.surcharge_applied || 0;
        });
      });
    });
    return Object.values(flavorMap).sort((a, b) => b.count - a.count);
  }, [orders]);

  // Order frequency by hour
  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;
    orders.forEach((order) => {
      const hour = new Date(order.created_at!).getHours();
      hours[hour]++;
    });
    return Object.entries(hours).map(([hour, count]) => ({
      hour: `${hour.padStart(2, '0')}:00`,
      count,
    }));
  }, [orders]);

  // Order frequency by day of week
  const dayOfWeekData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    orders.forEach((order) => {
      const day = new Date(order.created_at!).getDay();
      dayCounts[day]++;
    });
    return days.map((name, i) => ({ day: name, orders: dayCounts[i] }));
  }, [orders]);

  // Customer stats
  const customerStats = useMemo(() => {
    const customerOrders: Record<string, number> = {};
    orders.forEach((order) => {
      if (order.customer_id) {
        customerOrders[order.customer_id] = (customerOrders[order.customer_id] || 0) + 1;
      }
    });
    const repeatCustomers = Object.values(customerOrders).filter(count => count > 1).length;
    const totalCustomers = Object.keys(customerOrders).length;
    return {
      total: totalCustomers,
      repeat: repeatCustomers,
      repeatRate: totalCustomers > 0 ? (repeatCustomers / totalCustomers * 100).toFixed(1) : '0',
    };
  }, [orders]);

  // Cancelled/Refund stats - now using real data
  const refundStats = useMemo(() => {
    const cancelled = cancelledOrders.filter(o => o.status === 'cancelled');
    const rejected = cancelledOrders.filter(o => o.status === 'rejected');
    const refunded = cancelledOrders.filter(o => o.is_refunded === true);
    const totalRefundAmount = refunded.reduce((sum, o) => sum + Number(o.refund_amount || 0), 0);
    const totalCancelledValue = cancelledOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    return {
      cancelledCount: cancelled.length,
      rejectedCount: rejected.length,
      totalCancelled: cancelledOrders.length,
      refundedCount: refunded.length,
      totalRefundAmount,
      totalCancelledValue,
      refundRate: cancelledOrders.length > 0 
        ? ((refunded.length / cancelledOrders.length) * 100).toFixed(1) 
        : '0',
    };
  }, [cancelledOrders]);

  // Order type distribution
  const orderTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    orders.forEach((order) => {
      const type = order.order_type || 'dine_in';
      types[type] = (types[type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({
      name: name.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()),
      value,
    }));
  }, [orders]);

  // Delivery distance breakdown
  const deliveryDistanceData = useMemo(() => {
    const deliveryOrders = orders.filter(o => o.order_type === 'delivery' && o.delivery_distance_km);
    const ranges = [
      { label: '0-2 km', min: 0, max: 2, count: 0, revenue: 0 },
      { label: '2-5 km', min: 2, max: 5, count: 0, revenue: 0 },
      { label: '5-10 km', min: 5, max: 10, count: 0, revenue: 0 },
      { label: '10+ km', min: 10, max: Infinity, count: 0, revenue: 0 },
    ];
    
    deliveryOrders.forEach((order) => {
      const distance = order.delivery_distance_km || 0;
      const range = ranges.find(r => distance >= r.min && distance < r.max);
      if (range) {
        range.count++;
        range.revenue += order.delivery_fee || 0;
      }
    });
    
    return ranges.filter(r => r.count > 0);
  }, [orders]);

  const exportCSV = () => {
    const headers = ['Order #', 'Date', 'Customer', 'Type', 'Items', 'Total', 'Status'];
    const rows = orders.map((o) => [
      o.order_number,
      format(new Date(o.created_at!), 'yyyy-MM-dd HH:mm'),
      o.customer_id || 'Walk-in',
      o.order_type,
      o.order_items.length,
      o.total_amount,
      o.status,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Sales analytics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="date-from" className="text-sm">From</Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="date-to" className="text-sm">To</Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₱{stats.totalSales.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOrders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₱{stats.avgOrderValue.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.uniqueCustomers}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="sales" className="space-y-6">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="flavors">Flavors</TabsTrigger>
              <TabsTrigger value="delivery">Delivery</TabsTrigger>
              <TabsTrigger value="frequency">Order Frequency</TabsTrigger>
              <TabsTrigger value="refunds">
                Refunds
                {refundStats.totalCancelled > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-orange-500/20 text-orange-600 rounded-full">
                    {refundStats.totalCancelled}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="drivers">Drivers</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
            </TabsList>

            {/* Sales Tab */}
            <TabsContent value="sales" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Daily Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dailySalesData.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">No data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dailySalesData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip formatter={(value) => [`₱${value}`, 'Sales']} />
                          <Bar dataKey="total" fill="hsl(8, 72%, 45%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Order Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {orderTypeData.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">No data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={orderTypeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} (${(percent * 100).toFixed(0)}%)`
                            }
                            labelLine={false}
                          >
                            {orderTypeData.map((_, index) => (
                              <Cell key={index} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products">
              <Card>
                <CardHeader>
                  <CardTitle>Top Selling Products</CardTitle>
                  <CardDescription>Based on revenue in selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  {topProducts.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No data</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center">Qty Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topProducts.map((product, index) => (
                          <TableRow key={product.name}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{product.name}</TableCell>
                            <TableCell className="text-center">{product.qty}</TableCell>
                            <TableCell className="text-right">
                              ₱{product.revenue.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Flavors Tab */}
            <TabsContent value="flavors">
              <Card>
                <CardHeader>
                  <CardTitle>Flavor Popularity</CardTitle>
                  <CardDescription>Most ordered flavors and surcharge revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  {flavorStats.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No flavor data</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Flavor</TableHead>
                          <TableHead className="text-center">Times Ordered</TableHead>
                          <TableHead className="text-right">Surcharge Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flavorStats.map((flavor, index) => (
                          <TableRow key={flavor.name}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{flavor.name}</TableCell>
                            <TableCell className="text-center">{flavor.count}</TableCell>
                            <TableCell className="text-right">
                              ₱{flavor.surcharge.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Delivery Tab */}
            <TabsContent value="delivery">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Delivery Orders</CardTitle>
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.deliveryOrders}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalDeliveryDistance.toFixed(1)} km</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Avg Distance</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgDeliveryDistance.toFixed(1)} km</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Delivery Fees</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₱{stats.totalDeliveryFees.toFixed(2)}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Delivery Distance Breakdown</CardTitle>
                  <CardDescription>Orders by delivery distance range</CardDescription>
                </CardHeader>
                <CardContent>
                  {deliveryDistanceData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No delivery orders in this period</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={deliveryDistanceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip 
                          formatter={(value, name) => [
                            name === 'count' ? `${value} orders` : `₱${value}`,
                            name === 'count' ? 'Orders' : 'Delivery Fees'
                          ]} 
                        />
                        <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="count" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Order Frequency Tab */}
            <TabsContent value="frequency">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Orders by Hour
                    </CardTitle>
                    <CardDescription>Distribution of orders throughout the day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {hourlyData.every(d => d.count === 0) ? (
                      <p className="text-center py-8 text-muted-foreground">No data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={hourlyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" fontSize={10} angle={-45} textAnchor="end" height={60} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="Orders" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Orders by Day of Week
                    </CardTitle>
                    <CardDescription>Which days are busiest</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {dayOfWeekData.every(d => d.orders === 0) ? (
                      <p className="text-center py-8 text-muted-foreground">No data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dayOfWeekData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="orders" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="Orders" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Refunds Tab */}
            <TabsContent value="refunds">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <Card className="border-orange-500/20 bg-orange-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Cancelled Orders</CardTitle>
                    <XCircle className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{refundStats.cancelledCount}</div>
                  </CardContent>
                </Card>
                <Card className="border-red-500/20 bg-red-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Rejected Orders</CardTitle>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{refundStats.rejectedCount}</div>
                  </CardContent>
                </Card>
                <Card className="border-blue-500/20 bg-blue-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Refunds Processed</CardTitle>
                    <RotateCcw className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{refundStats.refundedCount}</div>
                    <p className="text-xs text-muted-foreground">{refundStats.refundRate}% of cancelled</p>
                  </CardContent>
                </Card>
                <Card className="border-purple-500/20 bg-purple-500/5">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Refunded</CardTitle>
                    <DollarSign className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">₱{refundStats.totalRefundAmount.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Lost value: ₱{refundStats.totalCancelledValue.toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    Cancelled & Rejected Orders
                  </CardTitle>
                  <CardDescription>Orders that were cancelled or rejected in selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  {cancelledOrders.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No cancelled or rejected orders in this period</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Order Value</TableHead>
                          <TableHead>Refunded</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cancelledOrders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                            <TableCell>{(order.customers as any)?.name || 'Walk-in'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                order.status === 'cancelled' 
                                  ? 'bg-orange-100 text-orange-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {order.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
                              </span>
                            </TableCell>
                            <TableCell>₱{Number(order.total_amount || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              {order.is_refunded ? (
                                <span className="text-green-600 font-medium">₱{Number(order.refund_amount || 0).toFixed(2)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={order.refund_reason || ''}>
                              {order.refund_reason || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {order.created_at && format(new Date(order.created_at), 'MMM d, h:mm a')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Drivers Tab */}
            <TabsContent value="drivers">
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Drivers</CardTitle>
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{driversData.length}</div>
                    <p className="text-xs text-muted-foreground">{driversData.filter(d => d.is_active).length} active</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{driversData.reduce((sum, d) => sum + d.deliveries, 0)}</div>
                    <p className="text-xs text-muted-foreground">In selected period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Driver Earnings</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₱{driversData.reduce((sum, d) => sum + d.totalEarnings, 0).toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Total delivery fees</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Top Drivers
                  </CardTitle>
                  <CardDescription>Ranked by earnings in selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  {driversData.filter(d => d.deliveries > 0).length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No delivery data in this period</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="text-center">Deliveries</TableHead>
                          <TableHead className="text-center">Distance</TableHead>
                          <TableHead className="text-right">Earnings</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {driversData.filter(d => d.deliveries > 0).slice(0, 10).map((driver, index) => (
                          <TableRow key={driver.id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{driver.name}</TableCell>
                            <TableCell className="text-center">{driver.deliveries}</TableCell>
                            <TableCell className="text-center">{driver.totalDistance.toFixed(1)} km</TableCell>
                            <TableCell className="text-right font-medium">₱{driver.totalEarnings.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Customers Tab */}
            <TabsContent value="customers">
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{customerStats.total}</div>
                    <p className="text-xs text-muted-foreground">In selected period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Repeat Customers</CardTitle>
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{customerStats.repeat}</div>
                    <p className="text-xs text-muted-foreground">{customerStats.repeatRate}% of total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₱{stats.avgOrderValue.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Per order</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Top Customers
                  </CardTitle>
                  <CardDescription>By total lifetime spend</CardDescription>
                </CardHeader>
                <CardContent>
                  {customersData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No customer data</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-center">Total Orders</TableHead>
                          <TableHead className="text-right">Total Spent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customersData.slice(0, 10).map((customer, index) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{customer.name}</TableCell>
                            <TableCell className="text-center">{customer.total_orders || 0}</TableCell>
                            <TableCell className="text-right font-medium">₱{Number(customer.total_spent || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
