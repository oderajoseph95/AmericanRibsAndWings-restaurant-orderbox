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
import { Plus, Trash2, Shield, Loader2, Upload, CreditCard, X } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import type { Enums } from '@/integrations/supabase/types';

export default function Settings() {
  const { role, user } = useAuth();
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [uploadingGcash, setUploadingGcash] = useState(false);
  const [uploadingBank, setUploadingBank] = useState(false);
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

  // Add user role mutation - now uses email to look up user
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('User role assigned successfully');
      setUserDialogOpen(false);
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
      email: form.get('email') as string,
      userRole: form.get('role') as Enums<'app_role'>,
    });
  };

  const getSetting = (key: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value as string | undefined;
  };

  const handleQRUpload = async (file: File, type: 'gcash' | 'bank') => {
    const setUploading = type === 'gcash' ? setUploadingGcash : setUploadingBank;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-qr-${Date.now()}.${fileExt}`;
      
      // Delete old file if exists
      const oldUrl = getSetting(`${type}_qr_url`);
      if (oldUrl) {
        const oldPath = oldUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('payment-qr-codes').remove([oldPath]);
        }
      }

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from('payment-qr-codes')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('payment-qr-codes')
        .getPublicUrl(fileName);

      // Save URL to settings
      await saveSettingMutation.mutateAsync({
        key: `${type}_qr_url`,
        value: urlData.publicUrl,
      });

      toast.success(`${type === 'gcash' ? 'GCash' : 'Bank'} QR code uploaded`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload QR code');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteQR = async (type: 'gcash' | 'bank') => {
    const url = getSetting(`${type}_qr_url`);
    if (!url) return;

    try {
      const path = url.split('/').pop();
      if (path) {
        await supabase.storage.from('payment-qr-codes').remove([path]);
      }
      
      // Clear the setting
      const setting = settings.find((s) => s.key === `${type}_qr_url`);
      if (setting) {
        await supabase.from('settings').delete().eq('id', setting.id);
        queryClient.invalidateQueries({ queryKey: ['settings'] });
      }
      
      toast.success('QR code removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove QR code');
    }
  };

  const roleColors: Record<Enums<'app_role'>, string> = {
    owner: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
    manager: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
    cashier: 'bg-green-500/20 text-green-700 border-green-500/30',
    driver: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
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

      {/* Payment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Settings
          </CardTitle>
          <CardDescription>
            Configure QR codes and account details for GCash and Bank Transfer payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* GCash Settings */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-lg">GCash</h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* QR Code Upload */}
              <div className="space-y-2">
                <Label>QR Code</Label>
                {getSetting('gcash_qr_url') ? (
                  <div className="relative w-40 h-40">
                    <img 
                      src={getSetting('gcash_qr_url')} 
                      alt="GCash QR" 
                      className="w-full h-full object-contain border rounded-lg"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => handleDeleteQR('gcash')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingGcash ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-xs text-muted-foreground">Upload QR</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleQRUpload(file, 'gcash');
                      }}
                      disabled={uploadingGcash}
                    />
                  </label>
                )}
              </div>

              {/* Account Details */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="gcash_account_name">Account Name</Label>
                  <Input
                    id="gcash_account_name"
                    defaultValue={getSetting('gcash_account_name') || ''}
                    placeholder="American Ribs & Wings"
                    onBlur={(e) =>
                      saveSettingMutation.mutate({
                        key: 'gcash_account_name',
                        value: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcash_number">GCash Number</Label>
                  <Input
                    id="gcash_number"
                    defaultValue={getSetting('gcash_number') || ''}
                    placeholder="09XX XXX XXXX"
                    onBlur={(e) =>
                      saveSettingMutation.mutate({
                        key: 'gcash_number',
                        value: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bank Transfer Settings */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-lg">Bank Transfer</h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* QR Code Upload */}
              <div className="space-y-2">
                <Label>QR Code</Label>
                {getSetting('bank_qr_url') ? (
                  <div className="relative w-40 h-40">
                    <img 
                      src={getSetting('bank_qr_url')} 
                      alt="Bank QR" 
                      className="w-full h-full object-contain border rounded-lg"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => handleDeleteQR('bank')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingBank ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-xs text-muted-foreground">Upload QR</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleQRUpload(file, 'bank');
                      }}
                      disabled={uploadingBank}
                    />
                  </label>
                )}
              </div>

              {/* Account Details */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="bank_name">Bank Name</Label>
                  <Input
                    id="bank_name"
                    defaultValue={getSetting('bank_name') || ''}
                    placeholder="BDO, BPI, etc."
                    onBlur={(e) =>
                      saveSettingMutation.mutate({
                        key: 'bank_name',
                        value: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_account_name">Account Name</Label>
                  <Input
                    id="bank_account_name"
                    defaultValue={getSetting('bank_account_name') || ''}
                    placeholder="American Ribs & Wings"
                    onBlur={(e) =>
                      saveSettingMutation.mutate({
                        key: 'bank_account_name',
                        value: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_account_number">Account Number</Label>
                  <Input
                    id="bank_account_number"
                    defaultValue={getSetting('bank_account_number') || ''}
                    placeholder="XXXX-XXXX-XXXX"
                    onBlur={(e) =>
                      saveSettingMutation.mutate({
                        key: 'bank_account_number',
                        value: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
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
