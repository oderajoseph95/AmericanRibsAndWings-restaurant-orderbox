import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: ('owner' | 'manager' | 'cashier')[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/auth');
      } else if (!role) {
        // User is logged in but has no role
        navigate('/no-access');
      } else if (requiredRoles && !requiredRoles.includes(role)) {
        navigate('/no-access');
      }
    }
  }, [user, role, loading, navigate, requiredRoles]);

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

  if (!user || !role) {
    return null;
  }

  if (requiredRoles && !requiredRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
