import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface EmployeeProtectedRouteProps {
  children: React.ReactNode;
}

export default function EmployeeProtectedRoute({ children }: EmployeeProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Check if employee is active
  const { data: employeeData, isLoading: employeeLoading } = useQuery({
    queryKey: ['employee-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, is_active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && role === 'employee',
  });

  // Show loading while checking auth
  if (loading || employeeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, redirect to employee login
  if (!user) {
    return <Navigate to="/employee/auth" state={{ from: location }} replace />;
  }

  // If user is admin (owner/manager/cashier), redirect to admin
  if (role === 'owner' || role === 'manager' || role === 'cashier') {
    return <Navigate to="/admin" replace />;
  }

  // If user is driver, redirect to driver portal
  if (role === 'driver') {
    return <Navigate to="/driver" replace />;
  }

  // If user has no role or wrong role, show error
  if (role !== 'employee') {
    return <Navigate to="/no-access" replace />;
  }

  // If employee is inactive, show inactive message
  if (employeeData && !employeeData.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Account Inactive</CardTitle>
            <CardDescription>
              Your employee account has been deactivated. Please contact your administrator for assistance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/employee/auth';
              }}
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
