import { useState, useRef, ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  MapPin, 
  Phone, 
  Clock, 
  Camera,
  Navigation,
  CheckCircle2,
  Package,
  Image
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { logDriverAction } from '@/lib/driverLogger';

type Order = Tables<'orders'> & {
  customer: Tables<'customers'> | null;
};

type Driver = Tables<'drivers'>;

// Status colors and labels
const statusColors: Record<string, string> = {
  waiting_for_rider: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  picked_up: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  in_transit: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  delivered: 'bg-green-500/20 text-green-700 border-green-500/30',
  completed: 'bg-green-500/20 text-green-700 border-green-500/30',
};

const statusLabels: Record<string, string> = {
  waiting_for_rider: 'Waiting for Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  completed: 'Completed',
};

export default function DriverOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('assigned');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);
  const [photoAction, setPhotoAction] = useState<'pickup' | 'delivery' | null>(null);

  // Fetch driver profile
  const { data: driver } = useQuery({
    queryKey: ['driver-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Driver;
    },
    enabled: !!user?.id,
  });

  // Fetch assigned orders
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['driver-orders', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*, customer:customers(*)')
        .eq('driver_id', driver.id)
        .in('status', ['waiting_for_rider', 'picked_up', 'in_transit', 'delivered', 'completed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!driver?.id,
  });

  // Fetch delivery photos for done orders
  const doneOrderIds = orders?.filter(o => ['delivered', 'completed'].includes(o.status || '')).map(o => o.id) || [];
  const { data: deliveryPhotos = [] } = useQuery({
    queryKey: ['driver-delivery-photos', doneOrderIds],
    queryFn: async () => {
      if (doneOrderIds.length === 0) return [];
      const { data, error } = await supabase
        .from('delivery_photos')
        .select('*')
        .in('order_id', doneOrderIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Tables<'delivery_photos'>[];
    },
    enabled: doneOrderIds.length > 0,
  });

  // Helper to get photos for an order
  const getOrderPhotos = (orderId: string) => {
    return deliveryPhotos.filter(p => p.order_id === orderId);
  };

  // Update order status mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: 'picked_up' | 'in_transit' | 'delivered' }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status, status_changed_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error('Failed to update order: ' + error.message);
    },
  });

  // Handle photo upload
  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingOrderId || !photoAction || !driver) return;

    const order = orders?.find(o => o.id === uploadingOrderId);
    const oldStatus = order?.status;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uploadingOrderId}/${photoAction}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);

      // Save photo record
      await supabase.from('delivery_photos').insert({
        order_id: uploadingOrderId,
        driver_id: driver.id,
        photo_type: photoAction,
        image_url: publicUrl,
      });

      // Log photo upload action
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'photo_upload',
        entityType: 'order',
        entityId: uploadingOrderId,
        entityName: order?.order_number || undefined,
        details: `Uploaded ${photoAction} photo for order ${order?.order_number}`,
      });

      // Update order status
      const newStatus = photoAction === 'pickup' ? 'picked_up' : 'delivered';
      await updateOrderMutation.mutateAsync({ orderId: uploadingOrderId, status: newStatus });

      // Log status change action
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'status_change',
        entityType: 'order',
        entityId: uploadingOrderId,
        entityName: order?.order_number || undefined,
        oldValues: { status: oldStatus },
        newValues: { status: newStatus },
        details: `Changed status from ${oldStatus} to ${newStatus}`,
      });

      toast.success(`${photoAction === 'pickup' ? 'Pickup' : 'Delivery'} photo uploaded`);
    } catch (error: any) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setUploadingOrderId(null);
      setPhotoAction(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePickup = (orderId: string) => {
    setUploadingOrderId(orderId);
    setPhotoAction('pickup');
    fileInputRef.current?.click();
  };

  const handleStartDelivery = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    const oldStatus = order?.status;
    
    await updateOrderMutation.mutateAsync({ orderId, status: 'in_transit' });
    
    // Log status change
    if (driver) {
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'status_change',
        entityType: 'order',
        entityId: orderId,
        entityName: order?.order_number || undefined,
        oldValues: { status: oldStatus },
        newValues: { status: 'in_transit' },
        details: `Started delivery - changed status from ${oldStatus} to in_transit`,
      });
    }
  };

  const handleDelivered = (orderId: string) => {
    setUploadingOrderId(orderId);
    setPhotoAction('delivery');
    fileInputRef.current?.click();
  };

  // Filter orders by tab
  const filterOrders = (tab: string) => {
    if (!orders) return [];
    switch (tab) {
      case 'assigned':
        return orders.filter(o => o.status === 'waiting_for_rider');
      case 'active':
        return orders.filter(o => ['picked_up', 'in_transit'].includes(o.status || ''));
      case 'done':
        return orders.filter(o => ['delivered', 'completed'].includes(o.status || ''));
      default:
        return orders;
    }
  };

  const filteredOrders = filterOrders(activeTab);

  const openInMaps = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  if (ordersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        className="hidden"
      />

      <h1 className="text-2xl font-bold">My Orders</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assigned">
            Assigned ({orders?.filter(o => o.status === 'waiting_for_rider').length || 0})
          </TabsTrigger>
          <TabsTrigger value="active">
            Active ({orders?.filter(o => ['picked_up', 'in_transit'].includes(o.status || '')).length || 0})
          </TabsTrigger>
          <TabsTrigger value="done">
            Done ({orders?.filter(o => ['delivered', 'completed'].includes(o.status || '')).length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No orders in this category</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.customer?.name || 'Unknown Customer'}
                      </p>
                    </div>
                    <Badge className={statusColors[order.status || ''] || 'bg-muted'}>
                      {statusLabels[order.status || ''] || order.status}
                    </Badge>
                  </div>

                  {/* Customer Contact */}
                  {order.customer?.phone && (
                    <a 
                      href={`tel:${order.customer.phone}`}
                      className="flex items-center gap-2 text-sm text-primary"
                    >
                      <Phone className="h-4 w-4" />
                      {order.customer.phone}
                    </a>
                  )}

                  {/* Delivery Address */}
                  {order.delivery_address && (
                    <button
                      onClick={() => openInMaps(order.delivery_address!)}
                      className="flex items-start gap-2 text-sm text-left w-full hover:bg-muted/50 rounded p-2 -mx-2"
                    >
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span className="flex-1">{order.delivery_address}</span>
                      <Navigation className="h-4 w-4 text-primary shrink-0" />
                    </button>
                  )}

                  {/* Pickup Time */}
                  {order.pickup_date && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {format(new Date(order.pickup_date), 'MMM d')}
                      {order.pickup_time && ` at ${order.pickup_time}`}
                    </div>
                  )}

                  {/* Order Amount + Delivery Fee */}
                  <div className="space-y-1 pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Order Total</span>
                      <span>₱{order.total_amount?.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-medium text-green-600">
                      <span>Your Earnings (Delivery Fee)</span>
                      <span>₱{order.delivery_fee?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t space-y-2">
                    {order.status === 'waiting_for_rider' && (
                      <Button 
                        onClick={() => handlePickup(order.id)} 
                        className="w-full"
                        disabled={uploadingOrderId === order.id}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        {uploadingOrderId === order.id ? 'Uploading...' : 'Take Pickup Photo'}
                      </Button>
                    )}

                    {order.status === 'picked_up' && (
                      <Button 
                        onClick={() => handleStartDelivery(order.id)} 
                        className="w-full"
                        disabled={updateOrderMutation.isPending}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Start Delivery
                      </Button>
                    )}

                    {order.status === 'in_transit' && (
                      <Button 
                        onClick={() => handleDelivered(order.id)} 
                        className="w-full"
                        disabled={uploadingOrderId === order.id}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        {uploadingOrderId === order.id ? 'Uploading...' : 'Take Delivery Photo'}
                      </Button>
                    )}

                    {(order.status === 'delivered' || order.status === 'completed') && (
                      <>
                        <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">
                            {order.status === 'delivered' ? 'Delivered Successfully' : 'Completed'}
                          </span>
                        </div>
                        
                        {/* Show uploaded photos for completed orders */}
                        {getOrderPhotos(order.id).length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {getOrderPhotos(order.id).map((photo) => (
                              <a
                                key={photo.id}
                                href={photo.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative aspect-video rounded-lg overflow-hidden border bg-muted"
                              >
                                <img
                                  src={photo.image_url}
                                  alt={`${photo.photo_type} photo`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded capitalize flex items-center gap-1">
                                  <Image className="h-3 w-3" />
                                  {photo.photo_type}
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
