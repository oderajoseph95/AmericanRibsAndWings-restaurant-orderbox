import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function DriverProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isDriver, isOwner, isManager, isCashier } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/driver/auth" replace />;
  }

  // If they're an admin, redirect to admin portal
  if (isOwner || isManager || isCashier) {
    return <Navigate to="/admin" replace />;
  }

  // If they're not a driver, show no access
  if (!isDriver) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}
