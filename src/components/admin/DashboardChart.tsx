import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';

interface ChartOrder {
  id: string;
  total_amount: number | null;
  created_at: string | null;
}

interface DashboardChartProps {
  orders: ChartOrder[];
  days?: number;
}

export function DashboardChart({ orders, days = 7 }: DashboardChartProps) {
  const chartData = useMemo(() => {
    // Create array of last N days
    const dayLabels: { date: Date; label: string }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      dayLabels.push({
        date,
        label: format(date, 'MMM d'),
      });
    }

    // Aggregate orders by day
    const salesByDay: Record<string, number> = {};
    const ordersByDay: Record<string, number> = {};

    orders.forEach((order) => {
      if (!order.created_at) return;
      const day = format(new Date(order.created_at), 'MMM d');
      salesByDay[day] = (salesByDay[day] || 0) + (order.total_amount || 0);
      ordersByDay[day] = (ordersByDay[day] || 0) + 1;
    });

    return dayLabels.map(({ label }) => ({
      day: label,
      sales: salesByDay[label] || 0,
      orders: ordersByDay[label] || 0,
    }));
  }, [orders, days]);

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        No sales data for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis 
          dataKey="day" 
          fontSize={11} 
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis 
          fontSize={11} 
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `₱${value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}`}
          className="fill-muted-foreground"
        />
        <Tooltip 
          formatter={(value: number) => [`₱${value.toFixed(2)}`, 'Sales']}
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
        />
        <Bar 
          dataKey="sales" 
          fill="hsl(var(--primary))" 
          radius={[4, 4, 0, 0]} 
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
