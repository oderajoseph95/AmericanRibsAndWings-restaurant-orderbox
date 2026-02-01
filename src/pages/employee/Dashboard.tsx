import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, Megaphone, Briefcase } from 'lucide-react';

export default function EmployeeDashboard() {
  const { user } = useAuth();

  // Fetch employee info
  const { data: employee } = useQuery({
    queryKey: ['employee-dashboard', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, email, employee_id, date_hired')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const placeholderCards = [
    {
      title: 'Payslips',
      description: 'View and download your pay statements',
      icon: FileText,
      status: 'Coming Soon',
      color: 'text-blue-600 bg-blue-100',
    },
    {
      title: 'Timesheets',
      description: 'Track your work hours and attendance',
      icon: Clock,
      status: 'Coming Soon',
      color: 'text-amber-600 bg-amber-100',
    },
    {
      title: 'Announcements',
      description: 'Stay updated with company news',
      icon: Megaphone,
      status: 'Coming Soon',
      color: 'text-purple-600 bg-purple-100',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Welcome, {employee?.name?.split(' ')[0] || 'Employee'}!
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
                Employee
              </Badge>
              {employee?.employee_id && (
                <span className="text-teal-100 text-sm">ID: {employee.employee_id}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {placeholderCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="text-xs">
                {card.status}
              </Badge>
            </div>
            <CardHeader className="pb-3">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg mb-1">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Full Name</dt>
              <dd className="font-medium">{employee?.name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{employee?.email || '—'}</dd>
            </div>
            {employee?.employee_id && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Employee ID</dt>
                <dd className="font-medium">{employee.employee_id}</dd>
              </div>
            )}
            {employee?.date_hired && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Date Hired</dt>
                <dd className="font-medium">
                  {new Date(employee.date_hired).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
