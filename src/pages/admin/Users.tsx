import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Plus, Trash2, Shield, Loader2, Search, Pencil, Users as UsersIcon, Mail } from 'lucide-react';
import { format } from 'date-fns';
import type { Enums } from '@/integrations/supabase/types';

export default function Users() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ 
    id: string; 
    userId: string; 
    currentRole: Enums<'app_role'>; 
    currentEmail: string;
  } | null>(null);
  const [newRole, setNewRole] = useState<Enums<'app_role'>>('cashier');
  const [newEmail, setNewEmail] = useState('');
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});
  const [emailsLoading, setEmailsLoading] = useState(false);

  const roleColors: Record<Enums<'app_role'>, string> = {
    owner: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
    manager: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
    cashier: 'bg-green-500/20 text-green-700 border-green-500/30',
    driver: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  };

  // Fetch user roles
  const { data: userRoles = [], isLoading } = useQuery({
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

  // Fetch emails when userRoles changes
  useEffect(() => {
    const fetchEmails = async () => {
      if (userRoles.length === 0 || role !== 'owner') return;
      
      setEmailsLoading(true);
      try {
        const userIds = userRoles.map(ur => ur.user_id);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;

        const response = await supabase.functions.invoke('admin-user-management', {
          body: { action: 'get-emails', userIds }
        });

        if (response.error) {
          console.error('Error fetching emails:', response.error);
          return;
        }

        if (response.data?.emails) {
          setEmailMap(response.data.emails);
        }
      } catch (error) {
        console.error('Failed to fetch emails:', error);
      } finally {
        setEmailsLoading(false);
      }
    };

    fetchEmails();
  }, [userRoles, role]);

  // Add user role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ email, userRole }: { email: string; userRole: Enums<'app_role'> }) => {
      // First, look up user ID by email using secure RPC function
      const { data: userId, error: lookupError } = await supabase.rpc('get_user_id_by_email', {
        p_email: email,
      });

      if (lookupError) throw lookupError;
      if (!userId) throw new Error('User not found');

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

      // Log the action
      await logAdminAction({
        action: 'create',
        entityType: 'user',
        entityId: userId,
        entityName: email,
        newValues: { role: userRole },
        details: `Assigned ${userRole} role to ${email}`,
      });

      return { email, userRole };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success(`${data.email} assigned as ${data.userRole}`);
      setAddDialogOpen(false);
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to add user role';
      if (message.includes('No user found')) {
        toast.error('No account found with that email. Make sure they signed up first.');
      } else {
        toast.error(message);
      }
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, userId, newRole, oldRole }: { id: string; userId: string; newRole: Enums<'app_role'>; oldRole: Enums<'app_role'> }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('id', id);
      if (error) throw error;

      // Log the action
      await logAdminAction({
        action: 'update',
        entityType: 'user',
        entityId: userId,
        oldValues: { role: oldRole },
        newValues: { role: newRole },
        details: `Changed role from ${oldRole} to ${newRole}`,
      });

      return { newRole };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success(`Role updated to ${data.newRole}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update role');
    },
  });

  // Update user email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async ({ userId, newEmail }: { userId: string; newEmail: string }) => {
      const response = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'update-email', userId, newEmail }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update email');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (data) => {
      // Update local email map
      if (editingUser) {
        setEmailMap(prev => ({ ...prev, [editingUser.userId]: data.newEmail }));
      }
      toast.success(`Email updated to ${data.newEmail}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update email');
    },
  });

  // Delete user role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async ({ id, userId, role: deletedRole }: { id: string; userId: string; role: Enums<'app_role'> }) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;

      // Log the action
      await logAdminAction({
        action: 'delete',
        entityType: 'user',
        entityId: userId,
        oldValues: { role: deletedRole },
        details: `Removed ${deletedRole} role`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('User role removed');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove user role');
    },
  });

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    addRoleMutation.mutate({
      email: form.get('email') as string,
      userRole: form.get('role') as Enums<'app_role'>,
    });
  };

  const handleEditSubmit = async () => {
    if (!editingUser) return;
    
    const promises: Promise<any>[] = [];
    
    // Update email if changed
    if (newEmail !== editingUser.currentEmail) {
      promises.push(updateEmailMutation.mutateAsync({ 
        userId: editingUser.userId, 
        newEmail 
      }));
    }
    
    // Update role if changed
    if (newRole !== editingUser.currentRole) {
      promises.push(updateRoleMutation.mutateAsync({
        id: editingUser.id,
        userId: editingUser.userId,
        newRole,
        oldRole: editingUser.currentRole,
      }));
    }

    if (promises.length === 0) {
      setEditDialogOpen(false);
      return;
    }

    try {
      await Promise.all(promises);
      setEditDialogOpen(false);
      setEditingUser(null);
    } catch {
      // Errors are handled by individual mutations
    }
  };

  const openEditDialog = (id: string, userId: string, currentRole: Enums<'app_role'>) => {
    const currentEmail = emailMap[userId] || '';
    setEditingUser({ id, userId, currentRole, currentEmail });
    setNewRole(currentRole);
    setNewEmail(currentEmail);
    setEditDialogOpen(true);
  };

  const filteredRoles = userRoles.filter((ur) => {
    const email = emailMap[ur.user_id] || '';
    const searchLower = search.toLowerCase();
    return (
      ur.user_id.toLowerCase().includes(searchLower) ||
      email.toLowerCase().includes(searchLower)
    );
  });

  const isSaving = updateEmailMutation.isPending || updateRoleMutation.isPending;
  const hasChanges = editingUser && (newEmail !== editingUser.currentEmail || newRole !== editingUser.currentRole);

  if (role !== 'owner') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">Manage admin users</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Only owners can manage users.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">
            Manage admin panel access ({userRoles.length} users)
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Admin User</DialogTitle>
              <DialogDescription>
                Grant admin panel access to a user by their email address.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="user@example.com"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter the email they used to sign up
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
                <p className="text-xs text-muted-foreground">
                  Drivers are managed separately in the Drivers page
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
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
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || emailsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No admin users configured yet.</p>
              <p className="text-sm mt-1">
                Add your first user to grant them admin access.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((ur) => (
                  <TableRow key={ur.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {emailMap[ur.user_id] || (
                            <span className="text-muted-foreground italic">Loading...</span>
                          )}
                        </span>
                        {ur.user_id === user?.id && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
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
                      <div className="flex gap-1">
                        {ur.user_id !== user?.id && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(ur.id, ur.user_id, ur.role)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Remove this user from admin access?')) {
                                  deleteRoleMutation.mutate({ 
                                    id: ur.id, 
                                    userId: ur.user_id, 
                                    role: ur.role 
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update email address and role for this user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
              />
              <p className="text-xs text-muted-foreground">
                User can login with the new email using their same password
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as Enums<'app_role'>)}>
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
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleEditSubmit} 
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>Understanding what each role can do</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.owner}>Owner</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Full access to all features including user management, settings, and reports.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.manager}>Manager</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Can manage orders, products, drivers, and payouts. Cannot modify settings or users.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.cashier}>Cashier</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Can view and manage orders, products, and customers. Read-only for drivers and reports.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
