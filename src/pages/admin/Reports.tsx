import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Loader2, TrendingUp, ShoppingCart, Users, DollarSign } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

type OrderWithItems = Tables<'orders'> & {
  order_items: (Tables<'order_items'> & {
    order_item_flavors: Tables<'order_item_flavors'>[];
  })[];
};

const COLORS = ['hsl(8, 72%, 45%)', 'hsl(40, 85%, 55%)', 'hsl(142, 76%, 36%)', 'hsl(217, 91%, 60%)', 'hsl(162, 63%, 41%)'];

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['reports-orders', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, order_item_flavors(*))')
        .gte('created_at', startOfDay(new Date(dateFrom)).toISOString())
        .lte('created_at', endOfDay(new Date(dateTo)).toISOString())
        .in('status', ['approved', 'completed']);
      if (error) throw error;
      return data as OrderWithItems[];
    },
  });

  // Summary stats
  const stats = useMemo(() => {
    const totalSales = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const uniqueCustomers = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size;

    return { totalSales, totalOrders, avgOrderValue, uniqueCustomers };
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
            <TabsList>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="flavors">Flavors</TabsTrigger>
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
          </Tabs>
        </>
      )}
    </div>
  );
}
