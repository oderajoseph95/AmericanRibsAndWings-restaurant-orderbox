import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  Image,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { logDriverAction } from '@/lib/driverLogger';
import { sendEmailNotification, EmailType } from '@/hooks/useEmailNotifications';
import { sendSmsNotification, SmsType } from '@/hooks/useSmsNotifications';
// Email notification now handles admin recipients automatically in edge function

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
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
};

const statusLabels: Record<string, string> = {
  waiting_for_rider: 'Waiting for Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  completed: 'Completed',
  rejected: 'Returned',
};

const returnReasons = [
  { value: 'customer_not_available', label: 'Customer not available' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'customer_refused', label: 'Customer refused delivery' },
  { value: 'cannot_locate', label: 'Cannot locate customer' },
  { value: 'other', label: 'Other reason' },
];

export default function DriverOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('assigned');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const returnFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);
  const [photoAction, setPhotoAction] = useState<'pickup' | 'delivery' | null>(null);
  
  // Return to sender state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnPhotoFile, setReturnPhotoFile] = useState<File | null>(null);
  const [isReturning, setIsReturning] = useState(false);

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
        .in('status', ['waiting_for_rider', 'picked_up', 'in_transit', 'delivered', 'completed', 'rejected'])
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

  // Auto-open order from URL param (from notifications)
  useEffect(() => {
    const orderId = searchParams.get('orderId');
    if (orderId && orders && orders.length > 0) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
        // Switch to appropriate tab based on order status
        if (order.status === 'waiting_for_rider') {
          setActiveTab('assigned');
        } else if (['picked_up', 'in_transit'].includes(order.status || '')) {
          setActiveTab('active');
        } else if (['delivered', 'completed', 'rejected'].includes(order.status || '')) {
          setActiveTab('done');
        }
        // Clear the param so refresh doesn't reopen
        searchParams.delete('orderId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, orders, setSearchParams]);

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

      // Send email notifications
      const emailType: EmailType = photoAction === 'pickup' ? 'order_picked_up' : 'order_delivered';
      // Send email notification - admin recipients handled automatically
      await sendEmailNotification({
        type: emailType,
        recipientEmail: order?.customer?.email || undefined,
        orderId: uploadingOrderId,
        orderNumber: order?.order_number || '',
        customerName: order?.customer?.name || '',
        customerPhone: order?.customer?.phone || '',
        totalAmount: order?.total_amount || 0,
        orderType: order?.order_type || '',
        deliveryAddress: order?.delivery_address || undefined,
        driverName: driver.name,
        driverPhone: driver.phone,
      });

      // Send SMS notification
      const smsType: SmsType = photoAction === 'pickup' ? 'order_out_for_delivery' : 'order_delivered';
      if (order?.customer?.phone) {
        await sendSmsNotification({
          type: smsType,
          recipientPhone: order.customer.phone,
          orderId: uploadingOrderId,
          orderNumber: order?.order_number || '',
          customerName: order?.customer?.name || '',
          driverName: driver.name,
        });
      }

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

      // Send email notification - admin recipients handled automatically
      await sendEmailNotification({
        type: 'order_in_transit',
        recipientEmail: order?.customer?.email || undefined,
        orderId: orderId,
        orderNumber: order?.order_number || '',
        customerName: order?.customer?.name || '',
        customerPhone: order?.customer?.phone || '',
        totalAmount: order?.total_amount || 0,
        deliveryAddress: order?.delivery_address || undefined,
        driverName: driver.name,
        driverPhone: driver.phone,
      });

      // Send SMS notification for out for delivery
      if (order?.customer?.phone) {
        await sendSmsNotification({
          type: 'order_out_for_delivery',
          recipientPhone: order.customer.phone,
          orderId: orderId,
          orderNumber: order?.order_number || '',
          customerName: order?.customer?.name || '',
          driverName: driver.name,
        });
      }
    }
  };

  const handleDelivered = (orderId: string) => {
    setUploadingOrderId(orderId);
    setPhotoAction('delivery');
    fileInputRef.current?.click();
  };

  // Handle return to sender
  const handleOpenReturnDialog = (order: Order) => {
    setReturnOrder(order);
    setReturnReason('');
    setReturnNotes('');
    setReturnPhotoFile(null);
    setReturnDialogOpen(true);
  };

  const handleReturnPhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReturnPhotoFile(file);
    }
  };

  const handleReturnToSender = async () => {
    if (!returnOrder || !driver || !returnReason) {
      toast.error('Please select a reason for return');
      return;
    }

    setIsReturning(true);
    try {
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (returnPhotoFile) {
        const fileExt = returnPhotoFile.name.split('.').pop();
        const fileName = `${returnOrder.id}/return-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('driver-photos')
          .upload(fileName, returnPhotoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('driver-photos')
          .getPublicUrl(fileName);

        photoUrl = publicUrl;

        // Save photo record with 'return' type
        await supabase.from('delivery_photos').insert({
          order_id: returnOrder.id,
          driver_id: driver.id,
          photo_type: 'return',
          image_url: publicUrl,
        });
      }

      const reasonLabel = returnReasons.find(r => r.value === returnReason)?.label || returnReason;
      const returnDetails = `Return reason: ${reasonLabel}${returnNotes ? `. Notes: ${returnNotes}` : ''}`;

      // Update order status to rejected with internal notes
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          status: 'rejected',
          status_changed_at: new Date().toISOString(),
          internal_notes: `[RETURN TO SENDER] ${returnDetails}. Driver: ${driver.name}`,
        })
        .eq('id', returnOrder.id);

      if (updateError) throw updateError;

      // Log the return action
      await logDriverAction({
        driverId: driver.id,
        driverName: driver.name,
        action: 'return',
        entityType: 'order',
        entityId: returnOrder.id,
        entityName: returnOrder.order_number || undefined,
        oldValues: { status: returnOrder.status },
        newValues: { status: 'rejected', reason: reasonLabel, notes: returnNotes },
        details: `Returned order to restaurant. ${returnDetails}`,
      });

      // Send email notification for return - admin recipients handled automatically
      await sendEmailNotification({
        type: 'order_returned',
        recipientEmail: returnOrder.customer?.email || undefined,
        orderId: returnOrder.id,
        orderNumber: returnOrder.order_number || '',
        customerName: returnOrder.customer?.name || '',
        customerPhone: returnOrder.customer?.phone || '',
        totalAmount: returnOrder.total_amount || 0,
        reason: reasonLabel + (returnNotes ? `: ${returnNotes}` : ''),
        driverName: driver.name,
        driverPhone: driver.phone,
      });

      queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
      toast.success('Order marked as returned to restaurant');
      setReturnDialogOpen(false);
      setReturnOrder(null);
    } catch (error: any) {
      toast.error('Failed to return order: ' + error.message);
    } finally {
      setIsReturning(false);
    }
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
        return orders.filter(o => ['delivered', 'completed', 'rejected'].includes(o.status || ''));
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
                      <div className="space-y-2">
                        <Button 
                          onClick={() => handleDelivered(order.id)} 
                          className="w-full"
                          disabled={uploadingOrderId === order.id}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          {uploadingOrderId === order.id ? 'Uploading...' : 'Take Delivery Photo'}
                        </Button>
                        <Button 
                          onClick={() => handleOpenReturnDialog(order)} 
                          variant="outline"
                          className="w-full text-amber-600 border-amber-300 hover:bg-amber-50"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Return to Restaurant
                        </Button>
                      </div>
                    )}

                    {order.status === 'rejected' && (
                      <div className="flex items-center justify-center gap-2 text-red-600 py-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-medium">Returned to Restaurant</span>
                      </div>
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

      {/* Return to Sender Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="h-5 w-5" />
              Return to Restaurant
            </DialogTitle>
            <DialogDescription>
              Order {returnOrder?.order_number} will be marked as returned.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Reason for return *</label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {returnReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Additional notes (optional)</label>
              <Textarea 
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Explain what happened..."
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Photo proof (optional)</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={returnFileInputRef}
                onChange={handleReturnPhotoSelect}
                className="hidden"
              />
              {returnPhotoFile ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                  <Camera className="h-4 w-4 text-green-600" />
                  <span className="text-sm flex-1 truncate">{returnPhotoFile.name}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setReturnPhotoFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => returnFileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => setReturnDialogOpen(false)}
                disabled={isReturning}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-amber-600 hover:bg-amber-700" 
                onClick={handleReturnToSender}
                disabled={isReturning || !returnReason}
              >
                {isReturning ? 'Processing...' : 'Confirm Return'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
