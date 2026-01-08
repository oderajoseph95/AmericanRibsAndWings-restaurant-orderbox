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
import { Plus, Trash2, Shield, Loader2, Search, Pencil, Users as UsersIcon, Crown, Wand2, User } from 'lucide-react';
import { format } from 'date-fns';
import type { Enums } from '@/integrations/supabase/types';

interface UserData {
  email: string | null;
  username: string | null;
  is_super_owner: boolean;
}

export default function Users() {
  const { role, user, isSuperOwner } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ 
    id: string; 
    userId: string; 
    currentRole: Enums<'app_role'>; 
    currentUsername: string;
    isSuperOwner: boolean;
  } | null>(null);
  const [newRole, setNewRole] = useState<Enums<'app_role'>>('cashier');
  const [newUsername, setNewUsername] = useState('');
  const [userDataMap, setUserDataMap] = useState<Record<string, UserData>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [callerIsSuperOwner, setCallerIsSuperOwner] = useState(false);

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

  // Fetch user data when userRoles changes
  useEffect(() => {
    const fetchUserData = async () => {
      if (userRoles.length === 0 || role !== 'owner') return;
      
      setDataLoading(true);
      try {
        const userIds = userRoles.map(ur => ur.user_id);
        const response = await supabase.functions.invoke('admin-user-management', {
          body: { action: 'get-user-data', userIds }
        });

        if (response.error) {
          console.error('Error fetching user data:', response.error);
          return;
        }

        if (response.data?.users) {
          setUserDataMap(response.data.users);
        }
        if (response.data?.callerIsSuperOwner !== undefined) {
          setCallerIsSuperOwner(response.data.callerIsSuperOwner);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      } finally {
        setDataLoading(false);
      }
    };

    fetchUserData();
  }, [userRoles, role]);

  // Generate usernames mutation
  const generateUsernamesMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'generate-usernames' }
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success(`Generated ${data.generated?.length || 0} usernames`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to generate usernames');
    },
  });

  // Add user role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ email, userRole }: { email: string; userRole: Enums<'app_role'> }) => {
      const { data: userId, error: lookupError } = await supabase.rpc('get_user_id_by_email', {
        p_email: email,
      });
      if (lookupError) throw lookupError;
      if (!userId) throw new Error('User not found');

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
        toast.error('No account found with that email.');
      } else {
        toast.error(message);
      }
    },
  });

  // Update username mutation
  const updateUsernameMutation = useMutation({
    mutationFn: async ({ userId, newUsername }: { userId: string; newUsername: string }) => {
      const response = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'update-username', userId, newUsername }
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      if (editingUser) {
        setUserDataMap(prev => ({
          ...prev,
          [editingUser.userId]: { ...prev[editingUser.userId], username: data.newUsername }
        }));
      }
      toast.success(`Username updated to ${data.newUsername}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update username');
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, userId, newRole, oldRole }: { id: string; userId: string; newRole: Enums<'app_role'>; oldRole: Enums<'app_role'> }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('id', id);
      if (error) throw error;

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

  // Delete mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async ({ id, userId, role: deletedRole }: { id: string; userId: string; role: Enums<'app_role'> }) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
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
    
    if (newUsername !== editingUser.currentUsername) {
      promises.push(updateUsernameMutation.mutateAsync({ 
        userId: editingUser.userId, 
        newUsername 
      }));
    }
    
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
      // Errors handled by mutations
    }
  };

  const openEditDialog = (id: string, userId: string, currentRole: Enums<'app_role'>) => {
    const userData = userDataMap[userId];
    setEditingUser({ 
      id, 
      userId, 
      currentRole, 
      currentUsername: userData?.username || '',
      isSuperOwner: userData?.is_super_owner || false,
    });
    setNewRole(currentRole);
    setNewUsername(userData?.username || '');
    setEditDialogOpen(true);
  };

  const filteredRoles = userRoles.filter((ur) => {
    const userData = userDataMap[ur.user_id];
    const searchLower = search.toLowerCase();
    return (
      ur.user_id.toLowerCase().includes(searchLower) ||
      (userData?.username || '').toLowerCase().includes(searchLower) ||
      (userData?.email || '').toLowerCase().includes(searchLower)
    );
  });

  const usersWithoutUsernames = userRoles.filter(ur => !userDataMap[ur.user_id]?.username).length;
  const isSaving = updateUsernameMutation.isPending || updateRoleMutation.isPending;
  const hasChanges = editingUser && (newUsername !== editingUser.currentUsername || newRole !== editingUser.currentRole);

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
            <p>Only owners can view users.</p>
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
        <div className="flex gap-2">
          {callerIsSuperOwner && usersWithoutUsernames > 0 && (
            <Button 
              variant="outline" 
              onClick={() => generateUsernamesMutation.mutate()}
              disabled={generateUsernamesMutation.isPending}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              {generateUsernamesMutation.isPending ? 'Generating...' : `Generate ${usersWithoutUsernames} Usernames`}
            </Button>
          )}
          {callerIsSuperOwner && (
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
                    <Input id="email" name="email" type="email" placeholder="user@example.com" required />
                    <p className="text-xs text-muted-foreground">Enter the email they used to sign up</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role *</Label>
                    <Select name="role" defaultValue="cashier">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="cashier">Cashier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={addRoleMutation.isPending}>
                      {addRoleMutation.isPending ? 'Adding...' : 'Add User'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || dataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No admin users configured yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  {callerIsSuperOwner && <TableHead>Email</TableHead>}
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((ur) => {
                  const userData = userDataMap[ur.user_id];
                  return (
                    <TableRow key={ur.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">
                            {userData?.username || <span className="text-muted-foreground italic">No username</span>}
                          </span>
                          {userData?.is_super_owner && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                              <Crown className="h-3 w-3 mr-1" /> Super
                            </Badge>
                          )}
                          {ur.user_id === user?.id && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                      </TableCell>
                      {callerIsSuperOwner && (
                        <TableCell className="text-muted-foreground text-sm">
                          {userData?.email || "—"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className={roleColors[ur.role]}>
                          {ur.role.charAt(0).toUpperCase() + ur.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ur.created_at && format(new Date(ur.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {callerIsSuperOwner && ur.user_id !== user?.id && !userData?.is_super_owner && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(ur.id, ur.user_id, ur.role)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Remove this user from admin access?')) {
                                  deleteRoleMutation.mutate({ id: ur.id, userId: ur.user_id, role: ur.role });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update username and role for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="owner_swift_123"
              />
              <p className="text-xs text-muted-foreground">Lowercase, letters, numbers, and underscores only</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as Enums<'app_role'>)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSubmit} disabled={isSaving || !hasChanges}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>Understanding what each role can do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.owner}>Owner</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Full access. Only Super Owner can manage users.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.manager}>Manager</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Can manage orders, products, drivers, and payouts.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge variant="outline" className={roleColors.cashier}>Cashier</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Can view and manage orders, products, and customers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
