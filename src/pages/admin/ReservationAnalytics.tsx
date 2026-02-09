import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  Users,
  UserX,
  CheckCircle,
  Loader2,
  ShieldX,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DateRangeSelector } from '@/components/admin/DateRangeSelector';

interface DateRange {
  from: Date;
  to: Date;
}

interface AnalyticsData {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  cancelled_by_customer: number;
  completed: number;
  no_show: number;
  total_pax: number;
  avg_pax: number;
  min_pax: number;
  max_pax: number;
  pax_1_2: number;
  pax_3_4: number;
  pax_5_6: number;
  pax_7_plus: number;
  day_distribution: { day_of_week: number; count: number }[];
  hour_distribution: { hour: number; count: number }[];
  daily_trend: { date: string; count: number }[];
}

const COLORS = [
  'hsl(48, 96%, 53%)',   // pending - yellow
  'hsl(142, 76%, 36%)',  // confirmed - green
  'hsl(0, 84%, 60%)',    // cancelled - red
  'hsl(25, 95%, 53%)',   // cancelled_by_customer - orange
  'hsl(160, 84%, 39%)',  // completed - emerald
  'hsl(220, 9%, 46%)',   // no_show - gray
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ReservationAnalytics() {
  const { role } = useAuth();
  const [dateRange, setDateRange] = useState<number | 'custom'>(30);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'custom' && customRange) {
      return {
        startDate: format(customRange.from, 'yyyy-MM-dd'),
        endDate: format(customRange.to, 'yyyy-MM-dd'),
      };
    }
    const days = typeof dateRange === 'number' ? dateRange : 30;
    return {
      startDate: format(subDays(new Date(), days), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    };
  }, [dateRange, customRange]);

  // Fetch analytics data - must be before any early returns
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['reservation-analytics', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_reservation_analytics', {
        start_date: startDate,
        end_date: endDate,
      });
      if (error) throw error;
      return data as unknown as AnalyticsData;
    },
    enabled: role === 'owner' || role === 'manager',
  });

  // Derived metrics - must be before any early returns
  const metrics = useMemo(() => {
    if (!analytics) return null;
    
    const confirmedTotal = analytics.confirmed + analytics.completed + analytics.no_show;
    const noShowRate = confirmedTotal > 0 ? (analytics.no_show / confirmedTotal) * 100 : 0;
    const confirmationRate = analytics.total > 0 ? (confirmedTotal / analytics.total) * 100 : 0;
    const cancellationRate = analytics.total > 0 
      ? ((analytics.cancelled + analytics.cancelled_by_customer) / analytics.total) * 100 
      : 0;
    const completionRate = confirmedTotal > 0 
      ? (analytics.completed / confirmedTotal) * 100 
      : 0;

    return { noShowRate, confirmationRate, cancellationRate, completionRate };
  }, [analytics]);

  // Status breakdown for pie chart - must be before any early returns
  const statusData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Pending', value: analytics.pending },
      { name: 'Confirmed', value: analytics.confirmed },
      { name: 'Cancelled', value: analytics.cancelled },
      { name: 'Cancelled by Customer', value: analytics.cancelled_by_customer },
      { name: 'Completed', value: analytics.completed },
      { name: 'No Show', value: analytics.no_show },
    ].filter(d => d.value > 0);
  }, [analytics]);

  // Pax distribution for pie chart - must be before any early returns
  const paxData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: '1-2 guests', value: analytics.pax_1_2 },
      { name: '3-4 guests', value: analytics.pax_3_4 },
      { name: '5-6 guests', value: analytics.pax_5_6 },
      { name: '7+ guests', value: analytics.pax_7_plus },
    ].filter(d => d.value > 0);
  }, [analytics]);

  // Day of week data - fill in missing days - must be before any early returns
  const dayOfWeekData = useMemo(() => {
    if (!analytics) return [];
    const dayMap = new Map(analytics.day_distribution.map(d => [d.day_of_week, d.count]));
    return DAY_NAMES.map((name, i) => ({
      day: name,
      count: dayMap.get(i) || 0,
    }));
  }, [analytics]);

  // Hourly distribution - fill gaps and format - must be before any early returns
  const hourlyData = useMemo(() => {
    if (!analytics) return [];
    const hourMap = new Map(analytics.hour_distribution.map(d => [d.hour, d.count]));
    // Only show operating hours (e.g., 9 AM to 10 PM)
    const hours: { hour: string; count: number }[] = [];
    for (let i = 9; i <= 22; i++) {
      hours.push({
        hour: `${i.toString().padStart(2, '0')}:00`,
        count: hourMap.get(i) || 0,
      });
    }
    return hours;
  }, [analytics]);

  // Daily trend data - must be before any early returns
  const trendData = useMemo(() => {
    if (!analytics) return [];
    return analytics.daily_trend.map(d => ({
      date: format(new Date(d.date), 'MMM d'),
      count: d.count,
    }));
  }, [analytics]);

  const handleDateRangeChange = (days: number | 'custom', range?: DateRange) => {
    setDateRange(days);
    if (range) {
      setCustomRange(range);
    }
  };

  // Access control - only owner and manager (after all hooks)
  if (role !== 'owner' && role !== 'manager') {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to view reservation analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/reservations">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reservation Analytics</h1>
            <p className="text-muted-foreground">Performance insights and patterns</p>
          </div>
        </div>
        <DateRangeSelector
          value={dateRange}
          onChange={handleDateRangeChange}
          customRange={customRange}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : analytics ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Reservations</CardTitle>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.total_pax} total guests
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.completed}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics?.completionRate.toFixed(1)}% completion rate
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">No-Shows</CardTitle>
                <UserX className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.no_show}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics?.noShowRate.toFixed(1)}% no-show rate
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Party Size</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.avg_pax}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Range: {analytics.min_pax} - {analytics.max_pax} guests
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Key Rates Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key Performance Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-600">
                    {metrics?.completionRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {metrics?.confirmationRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Confirmation Rate</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {metrics?.noShowRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">No-Show Rate</div>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {metrics?.cancellationRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Cancellation Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts Row 1 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Reservations by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {statusData.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {statusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Pax Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Party Size Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {paxData.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={paxData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {paxData.map((_, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={['hsl(217, 91%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(25, 95%, 53%)', 'hsl(0, 84%, 60%)'][index]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Peak Days */}
            <Card>
              <CardHeader>
                <CardTitle>Reservations by Day of Week</CardTitle>
                <CardDescription>Which days are busiest?</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(8, 72%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Peak Hours */}
            <Card>
              <CardHeader>
                <CardTitle>Reservations by Time Slot</CardTitle>
                <CardDescription>When do guests prefer to dine?</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" fontSize={10} interval={1} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Reservation Volume Over Time</CardTitle>
              <CardDescription>Daily reservation counts</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(142, 76%, 36%)"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No reservation data available</p>
        </div>
      )}
    </div>
  );
}
