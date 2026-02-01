import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, LogOut } from 'lucide-react';

export default function EmployeeLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Fetch employee info
  const { data: employee } = useQuery({
    queryKey: ['employee-info', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, email, employee_id')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/employee/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Employee Portal</h1>
              <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{employee?.name || 'Loading...'}</p>
              <div className="flex items-center gap-1.5 justify-end">
                <Badge variant="outline" className="text-xs bg-teal-500/10 text-teal-700 border-teal-500/30">
                  Employee
                </Badge>
                {employee?.employee_id && (
                  <span className="text-xs text-muted-foreground">#{employee.employee_id}</span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
