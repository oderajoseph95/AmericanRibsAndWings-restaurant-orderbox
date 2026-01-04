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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Plus, Truck, Phone, Mail, Loader2, Search, Edit, Circle, Eye, DollarSign, MapPin, Package, TrendingUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';

const driverSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^09\d{9}$/, 'Phone must be 11 digits starting with 09'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

// Extended driver type with availability_status (pending types regeneration)
type Driver = Tables<'drivers'> & {
  availability_status?: 'offline' | 'online' | 'busy' | 'unavailable' | null;
};

const availabilityColors: Record<string, string> = {
  online: 'text-green-500',
  offline: 'text-gray-400',
  busy: 'text-yellow-500',
  unavailable: 'text-red-500',
};

const availabilityLabels: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
  unavailable: 'Unavailable',
};

export default function Drivers() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch drivers with realtime subscription
  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['admin-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Cast to extended Driver type
      return data as Driver[];
    },
  });

  // Setup realtime subscription for drivers
  useEffect(() => {
    const channel = supabase
      .channel('drivers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drivers',
        },
        (payload) => {
          console.log('Driver change:', payload);
          queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch selected driver stats
  const { data: driverStats, isLoading: loadingStats } = useQuery({
    queryKey: ['driver-stats', selectedDriver?.id],
    queryFn: async () => {
      if (!selectedDriver) return null;
      
      // Fetch earnings
      const { data: earnings, error: earningsErr } = await supabase
        .from('driver_earnings')
        .select('delivery_fee, distance_km, status, created_at')
        .eq('driver_id', selectedDriver.id);
      if (earningsErr) throw earningsErr;

      // Fetch payouts
      const { data: payouts, error: payoutsErr } = await supabase
        .from('driver_payouts')
        .select('amount, status')
        .eq('driver_id', selectedDriver.id);
      if (payoutsErr) throw payoutsErr;

      // Fetch recent orders
      const { data: recentOrders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, delivery_fee, delivery_distance_km, created_at')
        .eq('driver_id', selectedDriver.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (ordersErr) throw ordersErr;

      // Fetch payment info
      const { data: paymentInfo, error: paymentErr } = await supabase
        .from('driver_payment_info')
        .select('*')
        .eq('driver_id', selectedDriver.id);
      if (paymentErr) throw paymentErr;

      // Calculate stats
      const pendingEarnings = earnings?.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.delivery_fee), 0) || 0;
      const availableEarnings = earnings?.filter(e => e.status === 'available').reduce((sum, e) => sum + Number(e.delivery_fee), 0) || 0;
      const totalEarnings = earnings?.reduce((sum, e) => sum + Number(e.delivery_fee), 0) || 0;
      const totalDistance = earnings?.reduce((sum, e) => sum + Number(e.distance_km || 0), 0) || 0;
      const totalDeliveries = earnings?.length || 0;
      const avgDistance = totalDeliveries > 0 ? totalDistance / totalDeliveries : 0;
      const totalPaidOut = payouts?.filter(p => p.status === 'completed').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const pendingPayouts = payouts?.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      return {
        pendingEarnings,
        availableEarnings,
        totalEarnings,
        totalDistance,
        avgDistance,
        totalDeliveries,
        totalPaidOut,
        pendingPayouts,
        recentOrders: recentOrders || [],
        paymentInfo: paymentInfo || [],
      };
    },
    enabled: !!selectedDriver,
  });

  // Create driver mutation using edge function
  const createDriverMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; password: string }) => {
      // Get current session for authorization
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      // Call the edge function
      const response = await supabase.functions.invoke('create-driver-auth', {
        body: {
          email: data.email,
          password: data.password,
          name: data.name,
          phone: data.phone,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create driver');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      toast.success('Driver created successfully');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Create driver error:', error);
      if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
        toast.error('A user with this email already exists');
      } else {
        toast.error(error.message || 'Failed to create driver');
      }
    },
  });

  // Update driver mutation
  const updateDriverMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; email: string; phone: string }) => {
      const { error } = await supabase
        .from('drivers')
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      toast.success('Driver updated');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update driver');
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('drivers')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      toast.success('Driver status updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', password: '' });
    setFormErrors({});
    setEditingDriver(null);
  };

  const handleOpenDialog = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        password: '',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const schema = editingDriver 
      ? driverSchema.omit({ password: true })
      : driverSchema.extend({ password: z.string().min(6, 'Password must be at least 6 characters') });

    const result = schema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0] as string] = err.message;
      });
      setFormErrors(errors);
      return;
    }

    if (editingDriver) {
      updateDriverMutation.mutate({
        id: editingDriver.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
      });
    } else {
      createDriverMutation.mutate({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone.includes(searchQuery)
  );

  // Paginate filtered results
  const totalPages = Math.ceil(filteredDrivers.length / ITEMS_PER_PAGE);
  const paginatedDrivers = filteredDrivers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const activeCount = drivers.filter((d) => d.is_active).length;
  const onlineCount = drivers.filter((d) => d.availability_status === 'online').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Drivers</h1>
          <p className="text-muted-foreground mt-1">
            Manage delivery drivers ({activeCount} active, {onlineCount} online)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
              <DialogDescription>
                {editingDriver 
                  ? 'Update driver information' 
                  : 'Create a new driver account. They can login immediately with these credentials.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Juan Dela Cruz"
                />
                {formErrors.name && (
                  <p className="text-sm text-destructive">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="driver@example.com"
                  disabled={!!editingDriver}
                />
                {formErrors.email && (
                  <p className="text-sm text-destructive">{formErrors.email}</p>
                )}
                {editingDriver && (
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="09171234567"
                />
                {formErrors.phone && (
                  <p className="text-sm text-destructive">{formErrors.phone}</p>
                )}
              </div>

              {!editingDriver && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                  {formErrors.password && (
                    <p className="text-sm text-destructive">{formErrors.password}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createDriverMutation.isPending || updateDriverMutation.isPending}
                >
                  {(createDriverMutation.isPending || updateDriverMutation.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {editingDriver ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Drivers Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="py-12 text-center">
              <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No drivers match your search' : 'No drivers yet'}
              </p>
            </div>
          ) : (
            <>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Account Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrivers.map((driver) => {
                  const initials = driver.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  const availability = driver.availability_status || 'offline';

                  return (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar>
                              <AvatarImage src={driver.profile_photo_url || undefined} />
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <Circle 
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-current ${availabilityColors[availability]}`}
                            />
                          </div>
                          <span className="font-medium">{driver.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {driver.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {driver.phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`${availabilityColors[availability]} border-current`}
                        >
                          {availabilityLabels[availability]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={driver.is_active ?? false}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: driver.id, isActive: checked })
                            }
                          />
                          <Badge variant={driver.is_active ? 'default' : 'secondary'}>
                            {driver.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {driver.created_at && format(new Date(driver.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedDriver(driver);
                              setProfileSheetOpen(true);
                            }}
                            title="View Driver Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(driver)}
                            title="Edit Driver"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredDrivers.length)} of {filteredDrivers.length} drivers
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm px-2">Page {currentPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Driver Profile Sheet */}
      <Sheet open={profileSheetOpen} onOpenChange={setProfileSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedDriver && (
            <>
              <SheetHeader>
                <SheetTitle>Driver Profile</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Driver Info */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedDriver.profile_photo_url || undefined} />
                    <AvatarFallback className="text-lg">
                      {selectedDriver.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-bold">{selectedDriver.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {selectedDriver.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {selectedDriver.phone}
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={selectedDriver.is_active ? 'default' : 'secondary'}>
                    {selectedDriver.is_active ? 'Active Account' : 'Inactive Account'}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={`${availabilityColors[selectedDriver.availability_status || 'offline']} border-current`}
                  >
                    {availabilityLabels[selectedDriver.availability_status || 'offline']}
                  </Badge>
                </div>

                <Separator />

                {/* Earnings Summary */}
                {loadingStats ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : driverStats && (
                  <>
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Earnings Summary
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-lg font-bold text-orange-600">₱{driverStats.pendingEarnings.toFixed(2)}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground">Available</p>
                            <p className="text-lg font-bold text-green-600">₱{driverStats.availableEarnings.toFixed(2)}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground">Total Earnings</p>
                            <p className="text-lg font-bold">₱{driverStats.totalEarnings.toFixed(2)}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground">Total Paid Out</p>
                            <p className="text-lg font-bold text-blue-600">₱{driverStats.totalPaidOut.toFixed(2)}</p>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <Separator />

                    {/* Delivery Stats */}
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Delivery Stats
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        <Card>
                          <CardContent className="pt-4 text-center">
                            <Package className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-lg font-bold">{driverStats.totalDeliveries}</p>
                            <p className="text-xs text-muted-foreground">Deliveries</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4 text-center">
                            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-lg font-bold">{driverStats.totalDistance.toFixed(1)} km</p>
                            <p className="text-xs text-muted-foreground">Total Distance</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4 text-center">
                            <MapPin className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-lg font-bold">{driverStats.avgDistance.toFixed(1)} km</p>
                            <p className="text-xs text-muted-foreground">Avg Distance</p>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <Separator />

                    {/* Payment Methods */}
                    {driverStats.paymentInfo.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3">Payment Methods</h4>
                        <div className="space-y-2">
                          {driverStats.paymentInfo.map((info: any) => (
                            <div key={info.id} className="bg-muted p-3 rounded-lg text-sm">
                              <p className="font-medium capitalize">{info.payment_method}</p>
                              <p className="text-muted-foreground">{info.account_name}</p>
                              <p className="text-muted-foreground">{info.account_number}</p>
                              {info.bank_name && <p className="text-muted-foreground">{info.bank_name}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent Deliveries */}
                    {driverStats.recentOrders.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Recent Deliveries
                        </h4>
                        <div className="space-y-2">
                          {driverStats.recentOrders.map((order: any) => (
                            <div key={order.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                              <div>
                                <p className="font-medium font-mono text-sm">{order.order_number}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(order.created_at), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-green-600">+₱{Number(order.delivery_fee || 0).toFixed(2)}</p>
                                <Badge variant="outline" className="text-xs">
                                  {order.status?.replace(/_/g, ' ')}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Joined Date */}
                <div className="text-sm text-muted-foreground">
                  Joined: {selectedDriver.created_at && format(new Date(selectedDriver.created_at), 'MMMM d, yyyy')}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
