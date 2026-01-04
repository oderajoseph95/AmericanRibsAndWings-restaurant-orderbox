import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  MapPin, 
  Navigation, 
  Calendar,
  Target,
  Route
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

type DriverStatsProps = {
  driverId: string;
};

export function DriverStatsCards({ driverId }: DriverStatsProps) {
  // Fetch comprehensive stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['driver-comprehensive-stats', driverId],
    queryFn: async () => {
      const now = new Date();
      const todayStart = startOfDay(now);
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const monthStart = startOfMonth(now);

      // Fetch all orders for this driver
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, status, delivery_distance_km, delivery_fee, delivery_address, updated_at')
        .eq('driver_id', driverId)
        .in('status', ['delivered', 'completed']);
      
      if (ordersError) throw ordersError;

      // Fetch earnings
      const { data: earnings, error: earningsError } = await supabase
        .from('driver_earnings')
        .select('delivery_fee, distance_km, status, created_at')
        .eq('driver_id', driverId);
      
      if (earningsError) throw earningsError;

      // Calculate stats
      const allOrders = orders || [];
      const allEarnings = earnings || [];

      // Daily stats
      const todayOrders = allOrders.filter(o => 
        o.updated_at && new Date(o.updated_at) >= todayStart
      );
      const todayDistance = todayOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);
      const todayEarnings = allEarnings
        .filter(e => e.created_at && new Date(e.created_at) >= todayStart)
        .reduce((sum, e) => sum + Number(e.delivery_fee), 0);

      // Weekly stats
      const weekOrders = allOrders.filter(o => 
        o.updated_at && new Date(o.updated_at) >= weekStart
      );
      const weekDistance = weekOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);
      const weekEarnings = allEarnings
        .filter(e => e.created_at && new Date(e.created_at) >= weekStart)
        .reduce((sum, e) => sum + Number(e.delivery_fee), 0);

      // Monthly stats
      const monthOrders = allOrders.filter(o => 
        o.updated_at && new Date(o.updated_at) >= monthStart
      );
      const monthDistance = monthOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);

      // Total stats
      const totalDistance = allOrders.reduce((sum, o) => sum + (o.delivery_distance_km || 0), 0);
      const totalDeliveries = allOrders.length;
      const avgDistance = totalDeliveries > 0 ? totalDistance / totalDeliveries : 0;

      // Parse addresses for top locations
      const locationCounts: Record<string, number> = {};
      allOrders.forEach(order => {
        if (order.delivery_address) {
          // Extract barangay/city from address - look for pattern like "Barangay, City"
          const addressParts = order.delivery_address.split(',').map(s => s.trim());
          // Usually the barangay/city is in the middle of the address
          let location = '';
          if (addressParts.length >= 3) {
            // Try to get city/municipality (usually 2nd or 3rd from end before "Pampanga")
            const pampangaIndex = addressParts.findIndex(p => p.toLowerCase().includes('pampanga'));
            if (pampangaIndex > 0) {
              location = addressParts[pampangaIndex - 1];
            } else {
              location = addressParts[1];
            }
          } else if (addressParts.length >= 2) {
            location = addressParts[0];
          }
          
          if (location) {
            // Clean up the location name
            location = location.replace(/\[.*?\]/g, '').trim();
            if (location) {
              locationCounts[location] = (locationCounts[location] || 0) + 1;
            }
          }
        }
      });

      // Get top 5 locations
      const topLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      return {
        today: {
          deliveries: todayOrders.length,
          distance: todayDistance,
          earnings: todayEarnings,
        },
        week: {
          deliveries: weekOrders.length,
          distance: weekDistance,
          earnings: weekEarnings,
        },
        month: {
          deliveries: monthOrders.length,
          distance: monthDistance,
        },
        total: {
          deliveries: totalDeliveries,
          distance: totalDistance,
          avgDistance,
        },
        topLocations,
      };
    },
    enabled: !!driverId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Today's Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Today ({format(new Date(), 'MMM d')})
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-primary">{stats?.today.deliveries || 0}</p>
              <p className="text-xs text-muted-foreground">Deliveries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats?.today.distance.toFixed(1) || '0'}</p>
              <p className="text-xs text-muted-foreground">km traveled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-green-600">₱{stats?.today.earnings.toFixed(0) || '0'}</p>
              <p className="text-xs text-muted-foreground">Earned</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Weekly Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          This Week
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{stats?.week.deliveries || 0}</p>
              <p className="text-xs text-muted-foreground">Deliveries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{stats?.week.distance.toFixed(1) || '0'}</p>
              <p className="text-xs text-muted-foreground">km traveled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">₱{stats?.week.earnings.toFixed(0) || '0'}</p>
              <p className="text-xs text-muted-foreground">Earned</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lifetime Stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <Target className="h-4 w-4" />
          All Time Performance
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{stats?.total.deliveries || 0}</p>
              <p className="text-xs text-muted-foreground">Total Deliveries</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{stats?.total.distance.toFixed(0) || '0'}</p>
              <p className="text-xs text-muted-foreground">Total km</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{stats?.total.avgDistance.toFixed(1) || '0'}</p>
              <p className="text-xs text-muted-foreground">Avg km/order</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Locations */}
      {stats?.topLocations && stats.topLocations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Top Delivery Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topLocations.map((loc, idx) => (
                <div key={loc.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                      {idx + 1}
                    </span>
                    <span className="truncate">{loc.name}</span>
                  </div>
                  <span className="text-muted-foreground font-medium">{loc.count} orders</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
