import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Truck, User, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function DriverLayout() {
  const { user, signOut, isDriver } = useAuth();
  const navigate = useNavigate();

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
    enabled: !!user?.id && isDriver,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/driver/auth');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Driver Portal</h1>
              {driver && (
                <p className="text-xs text-muted-foreground">{driver.name}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 bg-card border-t border-border">
        <div className="container px-4 h-16 flex items-center justify-around">
          <Link
            to="/driver"
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <Package className="h-5 w-5" />
            <span className="text-xs">Orders</span>
          </Link>
          <Link
            to="/driver/profile"
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <User className="h-5 w-5" />
            <span className="text-xs">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
