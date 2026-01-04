import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  CheckCircle,
  Package
} from 'lucide-react';
import { format } from 'date-fns';

export default function DriverProfile() {
  const { user } = useAuth();

  // Fetch driver profile
  const { data: driver } = useQuery({
    queryKey: ['driver-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch delivery stats
  const { data: stats } = useQuery({
    queryKey: ['driver-stats', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return null;
      
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, created_at')
        .eq('driver_id', driver.id);
      
      if (error) throw error;
      
      const total = data.length;
      const completed = data.filter(o => ['delivered', 'completed'].includes(o.status || '')).length;
      const today = data.filter(o => 
        ['delivered', 'completed'].includes(o.status || '') &&
        o.created_at && new Date(o.created_at).toDateString() === new Date().toDateString()
      ).length;
      
      return { total, completed, today };
    },
    enabled: !!driver?.id,
  });

  if (!driver) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  const initials = driver.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-24 w-24 mb-4">
              <AvatarImage src={driver.profile_photo_url || undefined} alt={driver.name} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold">{driver.name}</h2>
            <Badge variant={driver.is_active ? 'default' : 'secondary'} className="mt-2">
              {driver.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{driver.email}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Phone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{driver.phone}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-3">
            <div className="bg-muted p-2 rounded-full">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="font-medium">
                {driver.created_at && format(new Date(driver.created_at), 'MMMM d, yyyy')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <Package className="h-6 w-6 mx-auto text-primary" />
              </div>
              <p className="text-2xl font-bold">{stats?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </div>
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <CheckCircle className="h-6 w-6 mx-auto text-green-600" />
              </div>
              <p className="text-2xl font-bold">{stats?.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <div className="bg-muted p-3 rounded-lg mb-2">
                <Calendar className="h-6 w-6 mx-auto text-blue-600" />
              </div>
              <p className="text-2xl font-bold">{stats?.today || 0}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
