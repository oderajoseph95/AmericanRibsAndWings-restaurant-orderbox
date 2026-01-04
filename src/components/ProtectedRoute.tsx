import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

type AdminRole = 'owner' | 'manager' | 'cashier';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: AdminRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, role, loading, isDriver } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/auth');
      } else if (isDriver) {
        // Drivers should go to driver portal, not admin
        navigate('/driver');
      } else if (!role) {
        // User is logged in but has no role
        navigate('/no-access');
      } else if (requiredRoles && !requiredRoles.includes(role as AdminRole)) {
        navigate('/no-access');
      }
    }
  }, [user, role, loading, navigate, requiredRoles, isDriver]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !role || isDriver) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(role as AdminRole)) {
    return null;
  }

  return <>{children}</>;
}
