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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { Shield, Loader2, Upload, CreditCard, X, Trash2, AlertTriangle } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import type { Enums } from '@/integrations/supabase/types';

export default function Settings() {
  const { role, user } = useAuth();
  const [uploadingGcash, setUploadingGcash] = useState(false);
  const [uploadingBank, setUploadingBank] = useState(false);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const queryClient = useQueryClient();

  // Fetch settings
  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*');
      if (error) throw error;
      return data;
    },
  });

  // Save setting mutation with logging
  const saveSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Json }) => {
      const existingSetting = settings.find((s) => s.key === key);
      const oldValue = existingSetting?.value;
      
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

      // Log the action
      await logAdminAction({
        action: 'update',
        entityType: 'setting',
        entityName: key,
        oldValues: oldValue ? { [key]: oldValue } : undefined,
        newValues: { [key]: value },
        details: `Updated ${key}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Setting saved');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save setting');
    },
  });

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

      // Log QR upload
      await logAdminAction({
        action: 'upload',
        entityType: 'setting',
        entityName: `${type}_qr_code`,
        newValues: { url: urlData.publicUrl },
        details: `Uploaded ${type === 'gcash' ? 'GCash' : 'Bank'} QR code`,
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

      // Log QR deletion
      await logAdminAction({
        action: 'delete',
        entityType: 'setting',
        entityName: `${type}_qr_code`,
        oldValues: { url },
        details: `Deleted ${type === 'gcash' ? 'GCash' : 'Bank'} QR code`,
      });
      
      toast.success('QR code removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove QR code');
    }
  };

  // Data wipe handler
  const handleDataWipe = async () => {
    if (masterPassword !== 'WTF') {
      toast.error('Invalid master password');
      return;
    }

    setIsWiping(true);

    try {
      // Delete in order to respect foreign keys
      // 1. Delete order item flavors (via order items)
      const { data: orderItems } = await supabase.from('order_items').select('id');
      const orderItemIds = orderItems?.map(oi => oi.id) || [];
      if (orderItemIds.length > 0) {
        await supabase.from('order_item_flavors').delete().in('order_item_id', orderItemIds);
      }

      // 2. Delete order items
      await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 3. Delete payment proofs
      await supabase.from('payment_proofs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 4. Delete delivery photos
      await supabase.from('delivery_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 5. Delete driver earnings
      await supabase.from('driver_earnings').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 6. Delete driver payouts
      await supabase.from('driver_payouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 7. Delete stock adjustments
      await supabase.from('stock_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 8. Delete orders
      await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 9. Delete customers
      await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Log the wipe action
      await logAdminAction({
        action: 'data_wipe',
        entityType: 'system',
        details: 'Performed complete data wipe: orders, customers, driver earnings/payouts, stock adjustments',
      });

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });

      setWipeDialogOpen(false);
      setMasterPassword('');
      toast.success('Data wipe completed successfully');
    } catch (error: any) {
      console.error('Data wipe error:', error);
      toast.error(error.message || 'Failed to wipe data');
    } finally {
      setIsWiping(false);
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
          Manage system configuration
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

      {/* Store Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Store Hours</CardTitle>
          <CardDescription>Set your store's operating hours (displayed on the dashboard)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="store_open">Opening Time</Label>
              <Input
                id="store_open"
                type="time"
                defaultValue={
                  (() => {
                    const setting = settings.find((s) => s.key === 'store_hours');
                    const value = setting?.value as { open?: string } | null;
                    return value?.open || '10:00';
                  })()
                }
                onBlur={(e) => {
                  const current = settings.find((s) => s.key === 'store_hours');
                  const currentValue = (current?.value || {}) as { open?: string; close?: string; timezone?: string };
                  saveSettingMutation.mutate({
                    key: 'store_hours',
                    value: { ...currentValue, open: e.target.value },
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store_close">Closing Time</Label>
              <Input
                id="store_close"
                type="time"
                defaultValue={
                  (() => {
                    const setting = settings.find((s) => s.key === 'store_hours');
                    const value = setting?.value as { close?: string } | null;
                    return value?.close || '22:00';
                  })()
                }
                onBlur={(e) => {
                  const current = settings.find((s) => s.key === 'store_hours');
                  const currentValue = (current?.value || {}) as { open?: string; close?: string; timezone?: string };
                  saveSettingMutation.mutate({
                    key: 'store_hours',
                    value: { ...currentValue, close: e.target.value },
                  });
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded-md">
            <span className="text-xs text-muted-foreground">🌏 Timezone:</span>
            <span className="text-xs font-medium">Asia/Manila (Philippines, UTC+8)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            All times are in Philippines Standard Time (PST). Store open/closed status is displayed on the admin dashboard.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Business Information */}
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Legal and contact details (used in email footers)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legal_business_name">Legal Business Name</Label>
              <Input
                id="legal_business_name"
                defaultValue={getSetting('legal_business_name') || ''}
                placeholder="American Ribs & Wings Inc."
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'legal_business_name',
                    value: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tin_id">TIN ID</Label>
              <Input
                id="tin_id"
                defaultValue={getSetting('tin_id') || ''}
                placeholder="XXX-XXX-XXX-XXX"
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'tin_id',
                    value: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_phone">Business Phone</Label>
              <Input
                id="business_phone"
                defaultValue={getSetting('business_phone') || ''}
                placeholder="+63 921 408 0286"
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'business_phone',
                    value: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_address">Business Address</Label>
              <Input
                id="business_address"
                defaultValue={getSetting('business_address') || ''}
                placeholder="Floridablanca, Pampanga"
                onBlur={(e) =>
                  saveSettingMutation.mutate({
                    key: 'business_address',
                    value: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            These details will automatically appear in the footer of all email notifications sent to customers.
          </p>
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

      <Separator />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions. Use with extreme caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border border-destructive/30 rounded-lg bg-destructive/5">
            <h4 className="font-medium mb-2">Wipe All Data</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Delete ALL orders, customers, driver earnings, payouts, and stock adjustments. 
              Products, categories, flavors, drivers, and settings will remain intact.
            </p>
            <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Wipe All Data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm Data Wipe
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently delete ALL orders, customers, driver earnings, payouts, 
                    and stock adjustments. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm">
                    <p className="font-medium text-destructive mb-2">Will be deleted:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>All orders and order items</li>
                      <li>All customers</li>
                      <li>All payment proofs</li>
                      <li>All delivery photos</li>
                      <li>All driver earnings</li>
                      <li>All driver payouts</li>
                      <li>All stock adjustments</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="font-medium mb-2">Will be preserved:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Products, categories, flavors</li>
                      <li>Driver accounts</li>
                      <li>User accounts and roles</li>
                      <li>Settings and configurations</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="master-password">Enter Master Password</Label>
                    <Input
                      id="master-password"
                      type="password"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      placeholder="Enter master password"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setWipeDialogOpen(false);
                        setMasterPassword('');
                      }}
                      disabled={isWiping}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleDataWipe}
                      disabled={isWiping || !masterPassword}
                    >
                      {isWiping ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Confirm Wipe
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}