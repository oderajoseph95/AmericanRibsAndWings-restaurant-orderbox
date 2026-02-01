import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Briefcase, Phone, Mail, Loader2, Search, Edit, RefreshCw, Key, Calendar, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';
import { logAdminAction } from '@/lib/adminLogger';
import { createAdminNotification } from '@/hooks/useAdminNotifications';

const employeeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^09\d{9}$/, 'Phone must be 11 digits starting with 09').optional().or(z.literal('')),
  employee_id: z.string().optional(),
  date_hired: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

type Employee = Tables<'employees'>;

export default function Employees() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState<Employee | null>(null);
  const ITEMS_PER_PAGE = 20;
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employee_id: '',
    date_hired: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
    toast.success('Employees refreshed');
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Fetch employees
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Employee[];
    },
  });

  // Setup realtime subscription for employees
  useEffect(() => {
    const channel = supabase
      .channel('employees-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employees',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Create employee mutation using edge function
  const createEmployeeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('create-employee-auth', {
        body: {
          email: data.email,
          password: data.password,
          name: data.name,
          phone: data.phone || null,
          employee_id: data.employee_id || null,
          date_hired: data.date_hired || null,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create employee');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return { ...response.data, employeeName: data.name };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      toast.success('Employee created successfully');
      setDialogOpen(false);
      resetForm();
      
      await logAdminAction({
        action: 'create',
        entityType: 'employee',
        entityName: data.employeeName,
        newValues: { name: data.employeeName },
        details: `Added new employee: ${data.employeeName}`,
      });
      
      await createAdminNotification({
        title: "👔 New Employee Added",
        message: `${data.employeeName} has been added as an employee`,
        type: "employee",
        metadata: { employee_name: data.employeeName },
        action_url: "/admin/employees",
      });
    },
    onError: (error: Error) => {
      console.error('Create employee error:', error);
      if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        toast.error('A user with this email already exists');
      } else {
        toast.error(error.message || 'Failed to create employee');
      }
    },
  });

  // Update employee mutation
  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; email: string; phone: string; employee_id: string; date_hired: string }) => {
      const oldEmployee = employees.find(e => e.id === data.id);
      const { error } = await supabase
        .from('employees')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          employee_id: data.employee_id || null,
          date_hired: data.date_hired || null,
        })
        .eq('id', data.id);
      if (error) throw error;
      return { oldEmployee, newData: data };
    },
    onSuccess: async ({ oldEmployee, newData }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      toast.success('Employee updated');
      setEditSheetOpen(false);
      resetForm();
      
      await logAdminAction({
        action: 'update',
        entityType: 'employee',
        entityId: newData.id,
        entityName: newData.name,
        oldValues: { name: oldEmployee?.name },
        newValues: { name: newData.name },
        details: `Updated employee: ${newData.name}`,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update employee');
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const employee = employees.find(e => e.id === id);
      const { error } = await supabase
        .from('employees')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
      return { employee, isActive };
    },
    onSuccess: async ({ employee, isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
      toast.success('Employee status updated');
      
      await logAdminAction({
        action: 'status_change',
        entityType: 'employee',
        entityId: employee?.id,
        entityName: employee?.name || 'Unknown',
        oldValues: { is_active: !isActive },
        newValues: { is_active: isActive },
        details: `${isActive ? 'Activated' : 'Deactivated'} employee account: ${employee?.name}`,
      });
      
      await createAdminNotification({
        title: isActive ? "✅ Employee Activated" : "❌ Employee Deactivated",
        message: `${employee?.name}'s account has been ${isActive ? 'activated' : 'deactivated'}`,
        type: "employee",
        metadata: { employee_name: employee?.name, event: 'account_status_change' },
        action_url: "/admin/employees",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const response = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'reset_password',
          user_id: userId,
          new_password: newPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to reset password');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: async () => {
      toast.success('Password reset successfully');
      setResetPasswordDialogOpen(false);
      setNewPassword('');
      setResetPasswordEmployee(null);
      
      await logAdminAction({
        action: 'password_reset',
        entityType: 'employee',
        entityId: resetPasswordEmployee?.id,
        entityName: resetPasswordEmployee?.name,
        details: `Reset password for employee: ${resetPasswordEmployee?.name}`,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset password');
    },
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', employee_id: '', date_hired: '', password: '' });
    setFormErrors({});
    setEditingEmployee(null);
  };

  const handleOpenDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEditSheet = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone || '',
      employee_id: employee.employee_id || '',
      date_hired: employee.date_hired || '',
      password: '',
    });
    setEditSheetOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const schema = editingEmployee 
      ? employeeSchema.omit({ password: true })
      : employeeSchema.extend({ password: z.string().min(6, 'Password must be at least 6 characters') });

    const result = schema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0] as string] = err.message;
      });
      setFormErrors(errors);
      return;
    }

    if (editingEmployee) {
      updateEmployeeMutation.mutate({
        id: editingEmployee.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        employee_id: formData.employee_id,
        date_hired: formData.date_hired,
      });
    } else {
      createEmployeeMutation.mutate(formData);
    }
  };

  const handleResetPassword = async (employee: Employee) => {
    // Get user_id from employee record
    setResetPasswordEmployee(employee);
    setResetPasswordDialogOpen(true);
  };

  const handleResetPasswordSubmit = () => {
    if (!resetPasswordEmployee?.user_id || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    resetPasswordMutation.mutate({
      userId: resetPasswordEmployee.user_id,
      newPassword,
    });
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.phone && e.phone.includes(searchQuery)) ||
      (e.employee_id && e.employee_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Paginate filtered results
  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Employees</h1>
            <p className="text-muted-foreground mt-1">
              Manage staff members ({activeCount} active)
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Create a new employee account. They can login immediately with these credentials.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Juan Dela Cruz"
                />
                {formErrors.name && (
                  <p className="text-xs text-destructive">{formErrors.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="employee@example.com"
                />
                {formErrors.email && (
                  <p className="text-xs text-destructive">{formErrors.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="09171234567"
                />
                {formErrors.phone && (
                  <p className="text-xs text-destructive">{formErrors.phone}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee_id">Employee ID (optional)</Label>
                  <Input
                    id="employee_id"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    placeholder="EMP-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_hired">Date Hired (optional)</Label>
                  <Input
                    id="date_hired"
                    type="date"
                    value={formData.date_hired}
                    onChange={(e) => setFormData({ ...formData, date_hired: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                />
                {formErrors.password && (
                  <p className="text-xs text-destructive">{formErrors.password}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createEmployeeMutation.isPending}
              >
                {createEmployeeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Employee'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Employee List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden md:table-cell">ID</TableHead>
                    <TableHead className="hidden md:table-cell">Date Hired</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No employees found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                              <Briefcase className="w-5 h-5 text-teal-600" />
                            </div>
                            <div>
                              <p className="font-medium">{employee.name}</p>
                              <p className="text-xs text-muted-foreground md:hidden">{employee.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" />
                              {employee.email}
                            </div>
                            {employee.phone && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {employee.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {employee.employee_id ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Hash className="h-3 w-3" />
                              {employee.employee_id}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {employee.date_hired ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(employee.date_hired), 'MMM d, yyyy')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={employee.is_active ?? true}
                              onCheckedChange={(checked) =>
                                toggleActiveMutation.mutate({ id: employee.id, isActive: checked })
                              }
                            />
                            <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                              {employee.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditSheet(employee)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResetPassword(employee)}
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="py-2 px-3 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Sheet */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Employee</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              {formErrors.email && (
                <p className="text-xs text-destructive">{formErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              {formErrors.phone && (
                <p className="text-xs text-destructive">{formErrors.phone}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employee_id">Employee ID</Label>
              <Input
                id="edit-employee_id"
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date_hired">Date Hired</Label>
              <Input
                id="edit-date_hired"
                type="date"
                value={formData.date_hired}
                onChange={(e) => setFormData({ ...formData, date_hired: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={updateEmployeeMutation.isPending}
            >
              {updateEmployeeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordEmployee?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            <Button
              onClick={handleResetPasswordSubmit}
              className="w-full"
              disabled={resetPasswordMutation.isPending || newPassword.length < 6}
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
