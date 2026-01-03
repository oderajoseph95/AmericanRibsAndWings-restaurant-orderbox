import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Shield, Loader2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

export default function Settings() {
  const { role, user } = useAuth();
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user roles
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: role === 'owner',
  });

  // Fetch settings
  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Add user role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, userRole }: { userId: string; userRole: Enums<'app_role'> }) => {
      // Check if role already exists
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: userRole })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_roles').insert({
          user_id: userId,
          role: userRole,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('User role updated');
      setUserDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add user role');
    },
  });

  // Delete user role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('User role removed');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove user role');
    },
  });

  // Save setting mutation
  const saveSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Json }) => {
      const existingSetting = settings.find((s) => s.key === key);
      if (existingSetting) {
        const { error } = await supabase
          .from('settings')
          .update({ value })
          .eq('id', existingSetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('settings').insert({
          key,
          value,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Setting saved');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save setting');
    },
  });

  const handleUserSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    addRoleMutation.mutate({
      userId: form.get('user_id') as string,
      userRole: form.get('role') as Enums<'app_role'>,
    });
  };

  const getSetting = (key: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value as string | undefined;
  };

  const roleColors: Record<Enums<'app_role'>, string> = {
    owner: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
    manager: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
    cashier: 'bg-green-500/20 text-green-700 border-green-500/30',
  };

  if (role !== 'owner') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">View system settings</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Only owners can modify settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage system configuration and admin users
        </p>
      </div>

      {/* Store Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Store Information</CardTitle>
          <CardDescription>Basic store settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="store_name">Store Name</Label>
              <Input
                id="store_name"
                defaultValue={getSetting('store_name') || 'American Ribs & Wings'}
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'store_name',
                    value: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_prefix">Order Number Prefix</Label>
              <Input
                id="order_prefix"
                defaultValue={getSetting('order_prefix') || 'ORD'}
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'order_prefix',
                    value: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Admin Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Admin Users</CardTitle>
            <CardDescription>
              Manage who can access the admin panel
            </CardDescription>
          </div>
          <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Admin User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUserSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user_id">User ID *</Label>
                  <Input
                    id="user_id"
                    name="user_id"
                    placeholder="Paste the user's UUID"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Get this from the user after they sign up
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select name="role" defaultValue="cashier">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setUserDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addRoleMutation.isPending}>
                    {addRoleMutation.isPending ? 'Adding...' : 'Add User'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {rolesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : userRoles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No admin users configured yet.</p>
              <p className="text-sm mt-1">
                Add your first user to grant them admin access.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map((ur) => (
                  <TableRow key={ur.id}>
                    <TableCell className="font-mono text-xs">
                      {ur.user_id}
                      {ur.user_id === user?.id && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleColors[ur.role]}>
                        {ur.role.charAt(0).toUpperCase() + ur.role.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ur.created_at && format(new Date(ur.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {ur.user_id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Remove this user from admin access?')) {
                              deleteRoleMutation.mutate(ur.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Current User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Your Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs">{user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className={roleColors[role as Enums<'app_role'>]}>
                {role?.charAt(0).toUpperCase() + (role?.slice(1) || '')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
