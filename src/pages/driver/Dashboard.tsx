import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Package, 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle, 
  Truck, 
  Camera,
  Loader2,
  Navigation,
  User,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Order = Tables<'orders'> & {
  customers: Tables<'customers'> | null;
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

export default function DriverDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('assigned');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [photoType, setPhotoType] = useState<'pickup' | 'delivery'>('pickup');
  const [uploading, setUploading] = useState(false);

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
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch assigned orders
  const { data: orders = [], isLoading } = useQuery({
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
    refetchInterval: 30000, // Refetch every 30 seconds
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

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);

      // Create delivery photo record
      const { error: photoError } = await supabase
        .from('delivery_photos')
        .insert({
          order_id: selectedOrder.id,
          driver_id: driver.id,
          photo_type: photoType,
          image_url: urlData.publicUrl,
        });

      if (photoError) throw photoError;

      // Update order status
      const newStatus = photoType === 'pickup' ? 'picked_up' : 'delivered';
      await updateStatusMutation.mutateAsync({ orderId: selectedOrder.id, status: newStatus });

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
    // Update status to in_transit
    await updateStatusMutation.mutateAsync({ orderId: order.id, status: 'in_transit' });

    // Open Google Maps navigation
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

  const filterOrders = (status: string) => {
    switch (status) {
      case 'assigned':
        return orders.filter(o => o.status === 'waiting_for_rider');
      case 'picked_up':
        return orders.filter(o => o.status === 'picked_up' || o.status === 'in_transit');
      case 'delivered':
        return orders.filter(o => o.status === 'delivered' || o.status === 'completed');
      default:
        return orders;
    }
  };

  // Quick stats
  const assignedCount = orders.filter(o => o.status === 'waiting_for_rider').length;
  const inProgressCount = orders.filter(o => ['picked_up', 'in_transit'].includes(o.status || '')).length;
  const completedToday = orders.filter(o => 
    ['delivered', 'completed'].includes(o.status || '') &&
    o.updated_at && new Date(o.updated_at).toDateString() === new Date().toDateString()
  ).length;

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
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{assignedCount}</p>
            <p className="text-xs text-muted-foreground">Assigned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completedToday}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assigned">
            Assigned ({filterOrders('assigned').length})
          </TabsTrigger>
          <TabsTrigger value="picked_up">
            Active ({filterOrders('picked_up').length})
          </TabsTrigger>
          <TabsTrigger value="delivered">
            Done ({filterOrders('delivered').length})
          </TabsTrigger>
        </TabsList>

        {['assigned', 'picked_up', 'delivered'].map((tab) => (
          <TabsContent key={tab} value={tab} className="space-y-4 mt-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filterOrders(tab).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No orders in this category</p>
                </CardContent>
              </Card>
            ) : (
              filterOrders(tab).map((order) => (
                <Card key={order.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{order.order_number}</CardTitle>
                      <Badge className={statusColors[order.status || ''] || 'bg-muted'}>
                        {statusLabels[order.status || ''] || order.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Customer Info */}
                    {order.customers && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{order.customers.name}</span>
                        {order.customers.phone && (
                          <a 
                            href={`tel:${order.customers.phone}`}
                            className="ml-auto flex items-center gap-1 text-primary"
                          >
                            <Phone className="h-4 w-4" />
                            Call
                          </a>
                        )}
                      </div>
                    )}

                    {/* Delivery Address */}
                    {order.delivery_address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {order.delivery_address.replace(/\s*\[.*?\]\s*/g, '')}
                        </span>
                      </div>
                    )}

                    {/* Order Time */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {order.created_at && format(new Date(order.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between text-sm font-medium pt-2 border-t">
                      <span>Total</span>
                      <span>₱{order.total_amount?.toFixed(2)}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      {order.status === 'waiting_for_rider' && (
                        <Button 
                          onClick={() => handlePickup(order)} 
                          className="flex-1"
                          disabled={updateStatusMutation.isPending}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Mark Picked Up
                        </Button>
                      )}
                      
                      {order.status === 'picked_up' && (
                        <Button 
                          onClick={() => handleStartDelivery(order)} 
                          className="flex-1"
                          disabled={updateStatusMutation.isPending}
                        >
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
                          <Button 
                            onClick={() => handleDelivered(order)} 
                            className="flex-1"
                            disabled={updateStatusMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Delivered
                          </Button>
                        </>
                      )}

                      {['delivered', 'completed'].includes(order.status || '') && (
                        <div className="flex items-center gap-2 text-green-600 text-sm">
                          <CheckCircle className="h-4 w-4" />
                          <span>Completed</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

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
