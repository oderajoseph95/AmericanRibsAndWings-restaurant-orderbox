import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logDriverAction } from '@/lib/driverLogger';
import { 
  Package, 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle, 
  Camera,
  Loader2,
  Navigation,
  User,
  AlertCircle,
  Power,
  Coffee,
  Truck,
  Wallet,
  ArrowRight,
  TrendingUp,
  Timer,
  Route
} from 'lucide-react';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Order = Tables<'orders'> & {
  customers: Tables<'customers'> | null;
};

type DriverAvailability = 'offline' | 'online' | 'busy' | 'unavailable';

type Driver = Tables<'drivers'> & {
  availability_status?: DriverAvailability | null;
};

const statusColors: Record<string, string> = {
  waiting_for_rider: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  picked_up: 'bg-indigo-500/20 text-indigo-700 border-indigo-500/30',
  in_transit: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  delivered: 'bg-green-500/20 text-green-700 border-green-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
};

const statusLabels: Record<string, string> = {
  waiting_for_rider: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'On the Way',
  delivered: 'Delivered',
  completed: 'Completed',
};

const availabilityConfig: Record<DriverAvailability, { icon: typeof Power; color: string; label: string; bgColor: string; borderColor: string }> = {
  offline: { icon: Power, color: 'text-gray-500', label: 'Offline', bgColor: 'bg-gray-100', borderColor: 'border-gray-300' },
  online: { icon: Truck, color: 'text-green-600', label: 'Online', bgColor: 'bg-green-100', borderColor: 'border-green-500' },
  busy: { icon: Coffee, color: 'text-yellow-600', label: 'Busy', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500' },
  unavailable: { icon: AlertCircle, color: 'text-red-600', label: 'Unavailable', bgColor: 'bg-red-100', borderColor: 'border-red-500' },
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [photoType, setPhotoType] = useState<'pickup' | 'delivery'>('pickup');
  const [uploading, setUploading] = useState(false);

  // Fetch driver profile
  const { data: driver, refetch: refetchDriver } = useQuery({
    queryKey: ['driver-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Driver | null;
    },
    enabled: !!user?.id,
  });

  // Fetch assigned orders
  const { data: orders = [], isLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['driver-orders', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(*)')
        .eq('driver_id', driver.id)
        .in('status', ['waiting_for_rider', 'picked_up', 'in_transit', 'delivered', 'completed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!driver?.id,
  });

  // Fetch today's earnings
  const { data: todayEarnings = { total: 0, count: 0 } } = useQuery({
    queryKey: ['driver-today-earnings', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return { total: 0, count: 0 };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('driver_earnings')
        .select('delivery_fee')
        .eq('driver_id', driver.id)
        .eq('status', 'available')
        .gte('created_at', today.toISOString());
      
      if (error) throw error;
      return {
        total: data?.reduce((sum, e) => sum + e.delivery_fee, 0) || 0,
        count: data?.length || 0,
      };
    },
    enabled: !!driver?.id,
  });

  // Setup realtime subscription for orders
  useEffect(() => {
    if (!driver?.id) return;

    const channel = supabase
      .channel('driver-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `driver_id=eq.${driver.id}`,
        },
        () => {
          refetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver?.id, refetchOrders]);

  // Update availability status mutation
  const updateAvailabilityMutation = useMutation({
    mutationFn: async (status: DriverAvailability) => {
      if (!driver?.id) throw new Error('No driver profile');
      const { error } = await supabase
        .from('drivers')
        .update({ availability_status: status } as any)
        .eq('id', driver.id);
      if (error) throw error;
      return status;
    },
    onSuccess: async (newStatus) => {
      refetchDriver();
      toast.success(`Status changed to ${newStatus}`);
      
      // Log status change
      if (driver) {
        await logDriverAction({
          driverId: driver.id,
          driverName: driver.name,
          action: 'status_change',
          entityType: 'driver',
          entityId: driver.id,
          entityName: driver.name,
          oldValues: { availability_status: driver.availability_status },
          newValues: { availability_status: newStatus },
          details: `Changed availability from ${driver.availability_status || 'offline'} to ${newStatus}`,
        });
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: Enums<'order_status'> }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
      toast.success('Order status updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  const handlePhotoUpload = async (file: File) => {
    if (!selectedOrder || !driver) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedOrder.id}-${photoType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);

      await supabase
        .from('delivery_photos')
        .insert({
          order_id: selectedOrder.id,
          driver_id: driver.id,
          photo_type: photoType,
          image_url: urlData.publicUrl,
        });

      // Log photo upload
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'photo_upload',
        entityType: 'order',
        entityId: selectedOrder.id,
        entityName: selectedOrder.order_number || undefined,
        details: `Uploaded ${photoType} photo for order ${selectedOrder.order_number}`,
      });

      const newStatus = photoType === 'pickup' ? 'picked_up' : 'delivered';
      await updateStatusMutation.mutateAsync({ orderId: selectedOrder.id, status: newStatus });

      // Log status change
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'status_change',
        entityType: 'order',
        entityId: selectedOrder.id,
        entityName: selectedOrder.order_number || undefined,
        oldValues: { status: selectedOrder.status },
        newValues: { status: newStatus },
        details: `Changed status from ${selectedOrder.status} to ${newStatus}`,
      });

      setPhotoDialogOpen(false);
      setSelectedOrder(null);
      toast.success(`${photoType === 'pickup' ? 'Pickup' : 'Delivery'} photo uploaded!`);
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast.error(error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handlePickup = (order: Order) => {
    setSelectedOrder(order);
    setPhotoType('pickup');
    setPhotoDialogOpen(true);
  };

  const handleStartDelivery = async (order: Order) => {
    const oldStatus = order.status;
    await updateStatusMutation.mutateAsync({ orderId: order.id, status: 'in_transit' });

    // Log status change
    if (driver) {
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'status_change',
        entityType: 'order',
        entityId: order.id,
        entityName: order.order_number || undefined,
        oldValues: { status: oldStatus },
        newValues: { status: 'in_transit' },
        details: `Started delivery - changed status from ${oldStatus} to in_transit`,
      });
    }

    if (order.delivery_address) {
      const address = encodeURIComponent(order.delivery_address.replace(/\s*\[.*?\]\s*/g, ''));
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
    }
  };

  const handleDelivered = (order: Order) => {
    setSelectedOrder(order);
    setPhotoType('delivery');
    setPhotoDialogOpen(true);
  };

  // Categorize orders
  const assignedOrders = orders.filter(o => o.status === 'waiting_for_rider');
  const activeOrders = orders.filter(o => ['picked_up', 'in_transit'].includes(o.status || ''));
  const completedToday = orders.filter(o => 
    ['delivered', 'completed'].includes(o.status || '') &&
    o.updated_at && new Date(o.updated_at).toDateString() === new Date().toDateString()
  ).length;

  const currentAvailability = (driver?.availability_status || 'offline') as DriverAvailability;
  const currentConfig = availabilityConfig[currentAvailability];
  const CurrentIcon = currentConfig.icon;

  if (!driver) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Driver profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={`border-2 ${currentConfig.borderColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${currentConfig.bgColor}`}>
                <CurrentIcon className={`h-6 w-6 ${currentConfig.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <p className={`text-xl font-bold ${currentConfig.color}`}>{currentConfig.label}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(availabilityConfig) as DriverAvailability[]).map((status) => {
              const config = availabilityConfig[status];
              const Icon = config.icon;
              const isActive = currentAvailability === status;
              
              return (
                <Button
                  key={status}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateAvailabilityMutation.mutate(status)}
                  disabled={updateAvailabilityMutation.isPending}
                  className={`flex flex-col h-auto py-2 px-1 ${isActive ? '' : config.color}`}
                >
                  <Icon className="h-4 w-4 mb-1" />
                  <span className="text-xs">{config.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200">
          <CardContent className="pt-4 text-center">
            <Wallet className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">₱{todayEarnings.total.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Today's Earnings</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200">
          <CardContent className="pt-4 text-center">
            <Route className="h-6 w-6 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-600">{completedToday}</p>
            <p className="text-xs text-muted-foreground">Deliveries Today</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200">
          <CardContent className="pt-4 text-center">
            <Package className="h-6 w-6 text-purple-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-purple-600">{assignedOrders.length + activeOrders.length}</p>
            <p className="text-xs text-muted-foreground">Pending Orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Orders - Priority View */}
      {activeOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Timer className="h-5 w-5 text-blue-600" />
            Active Delivery
          </h2>
          {activeOrders.map((order) => (
            <Card key={order.id} className="border-2 border-blue-200 bg-blue-50/30">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">{order.customers?.name}</p>
                  </div>
                  <Badge className={statusColors[order.status || '']}>
                    {statusLabels[order.status || '']}
                  </Badge>
                </div>
                
                {order.customers?.phone && (
                  <a href={`tel:${order.customers.phone}`} className="flex items-center gap-2 text-sm text-primary">
                    <Phone className="h-4 w-4" />
                    {order.customers.phone}
                  </a>
                )}

                {order.delivery_address && (
                  <div className="flex items-start gap-2 text-sm p-2 bg-background rounded-lg">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground flex-1">
                      {order.delivery_address.replace(/\s*\[.*?\]\s*/g, '')}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  {order.status === 'picked_up' && (
                    <Button onClick={() => handleStartDelivery(order)} className="flex-1">
                      <Navigation className="h-4 w-4 mr-2" />
                      Start Delivery
                    </Button>
                  )}
                  {order.status === 'in_transit' && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (order.delivery_address) {
                            const address = encodeURIComponent(order.delivery_address.replace(/\s*\[.*?\]\s*/g, ''));
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                          }
                        }}
                        className="flex-1"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Navigate
                      </Button>
                      <Button onClick={() => handleDelivered(order)} className="flex-1">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Delivered
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assigned Orders */}
      {assignedOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-600" />
            Assigned Orders ({assignedOrders.length})
          </h2>
          {assignedOrders.map((order) => (
            <Card key={order.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">{order.customers?.name}</p>
                  </div>
                  <Badge className={statusColors[order.status || '']}>
                    {statusLabels[order.status || '']}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className="font-medium text-green-600">₱{order.delivery_fee?.toFixed(2)}</span>
                </div>

                <Button onClick={() => handlePickup(order)} className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  Pick Up Order
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {assignedOrders.length === 0 && activeOrders.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">No active orders</p>
            {currentAvailability !== 'online' && (
              <p className="text-sm text-muted-foreground">
                Switch to <span className="font-medium text-green-600">Online</span> to receive orders
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => navigate('/driver/orders')} className="h-auto py-4">
          <div className="text-center">
            <Package className="h-5 w-5 mx-auto mb-1" />
            <span className="text-sm">All Orders</span>
          </div>
        </Button>
        <Button variant="outline" onClick={() => navigate('/driver/earnings')} className="h-auto py-4">
          <div className="text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1" />
            <span className="text-sm">Earnings</span>
          </div>
        </Button>
      </div>

      {/* Photo Upload Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {photoType === 'pickup' ? 'Pickup Photo' : 'Delivery Photo'}
            </DialogTitle>
            <DialogDescription>
              {photoType === 'pickup' 
                ? 'Take a photo of the order before leaving the restaurant'
                : 'Take a photo as proof of delivery'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              {uploading ? (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Tap to take photo or upload</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
                disabled={uploading}
              />
            </label>
            
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => setPhotoDialogOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}