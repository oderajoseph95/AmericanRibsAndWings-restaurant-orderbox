import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Truck, User, Package, Wallet, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const location = useLocation();
  
  const navItems = [
    { to: '/driver', icon: Home, label: 'Home', exact: true },
    { to: '/driver/orders', icon: Package, label: 'Orders' },
    { to: '/driver/earnings', icon: Wallet, label: 'Earnings' },
    { to: '/driver/profile', icon: User, label: 'Profile' },
  ];

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="sticky bottom-0 bg-card border-t border-border">
      <div className="container px-4 h-16 flex items-center justify-around">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              isActive(to, exact) 
                ? "text-primary" 
                : "text-muted-foreground hover:text-primary"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
