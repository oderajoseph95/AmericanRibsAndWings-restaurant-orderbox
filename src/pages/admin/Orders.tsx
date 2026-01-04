import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { RefundDialog } from '@/components/admin/RefundDialog';
import { Search, Eye, Clock, CheckCircle, XCircle, Loader2, Image, ExternalLink, Truck, ChefHat, Package, MoreHorizontal, Link, Share2, Copy, User, AlertTriangle, ChevronDown, Trash2, Camera, Upload } from 'lucide-react';
import { sendPushNotification } from '@/hooks/usePushNotifications';
import { createAdminNotification } from '@/hooks/useAdminNotifications';
import { createDriverNotification } from '@/hooks/useDriverNotifications';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Order = Tables<'orders'> & {
  customers: Tables<'customers'> | null;
  drivers: Tables<'drivers'> | null;
};

type OrderItem = Tables<'order_items'> & {
  order_item_flavors: Tables<'order_item_flavors'>[];
};

type PaymentProof = Tables<'payment_proofs'>;

type DeliveryPhoto = Tables<'delivery_photos'>;

// Extended driver type with availability_status
type DriverWithStatus = Tables<'drivers'> & {
  availability_status?: 'offline' | 'online' | 'busy' | 'unavailable' | null;
};

const availabilityColors: Record<string, string> = {
  online: 'text-green-600',
  offline: 'text-gray-400',
  busy: 'text-yellow-600',
  unavailable: 'text-red-600',
};

const statusColors: Record<Enums<'order_status'>, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  for_verification: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  approved: 'bg-green-500/20 text-green-700 border-green-500/30',
  preparing: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
  ready_for_pickup: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  waiting_for_rider: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  picked_up: 'bg-indigo-500/20 text-indigo-700 border-indigo-500/30',
  in_transit: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  delivered: 'bg-green-500/20 text-green-700 border-green-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<Enums<'order_status'>, string> = {
  pending: 'Pending',
  for_verification: 'For Verification',
  approved: 'Approved',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup',
  waiting_for_rider: 'Waiting for Rider',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function Orders() {
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [refundDialog, setRefundDialog] = useState<{
    open: boolean;
    orderId: string;
    orderNumber: string | null;
    orderTotal: number;
    newStatus: 'cancelled' | 'rejected';
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 20;
  const queryClient = useQueryClient();

  const isOwner = role === 'owner';

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      let query = supabase
        .from('orders')
        .select('*, customers(*), drivers(*)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as Enums<'order_status'>);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { orders: data as Order[], totalCount: count || 0 };
    },
  });

  const orders = ordersData?.orders || [];
  const totalCount = ordersData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  // Fetch available drivers with status
  const { data: availableDrivers = [], refetch: refetchDrivers } = useQuery({
    queryKey: ['available-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as DriverWithStatus[];
    },
  });

  // Setup realtime subscriptions
  useEffect(() => {
    const ordersChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('Order change:', payload);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    const driversChannel = supabase
      .channel('drivers-status-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
        },
        (payload) => {
          console.log('Driver status change:', payload);
          refetchDrivers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(driversChannel);
    };
  }, [queryClient, refetchDrivers]);

  const { data: orderItems = [] } = useQuery({
    queryKey: ['order-items', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*, order_item_flavors(*)')
        .eq('order_id', selectedOrder.id);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!selectedOrder,
  });

  // Fetch payment proofs for selected order
  const { data: paymentProofs = [] } = useQuery({
    queryKey: ['payment-proofs', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from('payment_proofs')
        .select('*')
        .eq('order_id', selectedOrder.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as PaymentProof[];
    },
    enabled: !!selectedOrder,
  });

  // Fetch delivery photos for selected order
  const { data: deliveryPhotos = [] } = useQuery({
    queryKey: ['delivery-photos', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from('delivery_photos')
        .select('*')
        .eq('order_id', selectedOrder.id)
        .order('taken_at', { ascending: true });
      if (error) throw error;
      return data as DeliveryPhoto[];
    },
    enabled: !!selectedOrder,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, orderNumber }: { id: string; status: Enums<'order_status'>; orderNumber?: string }) => {
      const order = orders.find(o => o.id === id);
      const oldStatus = order?.status;
      const customerPhone = order?.customers?.phone;
      const driverId = order?.driver_id;
      
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // Log the action
      await logAdminAction({
        action: 'status_change',
        entityType: 'order',
        entityId: id,
        entityName: orderNumber || order?.order_number || undefined,
        oldValues: { status: oldStatus },
        newValues: { status },
        details: `Changed status from ${oldStatus} to ${status}`,
      });

      // Send push notifications based on status change
      const orderNum = orderNumber || order?.order_number || '';
      try {
        // Notify customer for key status changes
        if (customerPhone) {
          if (status === 'approved') {
            await sendPushNotification({
              title: "Order Approved! ✅",
              body: `Your order #${orderNum} has been approved`,
              url: `/thank-you/${id}`,
              customerPhone,
              userType: "customer",
            });
          } else if (status === 'ready_for_pickup') {
            await sendPushNotification({
              title: "Order Ready! 🍗",
              body: `Your order #${orderNum} is ready for pickup`,
              url: `/thank-you/${id}`,
              customerPhone,
              userType: "customer",
            });
          } else if (status === 'in_transit') {
            await sendPushNotification({
              title: "On the Way! 🚗",
              body: `Your order #${orderNum} is being delivered`,
              url: `/thank-you/${id}`,
              customerPhone,
              userType: "customer",
            });
          } else if (status === 'delivered') {
            await sendPushNotification({
              title: "Order Delivered! 🎉",
              body: `Your order #${orderNum} has been delivered. Enjoy!`,
              url: `/thank-you/${id}`,
              customerPhone,
              userType: "customer",
            });
          } else if (status === 'cancelled' || status === 'rejected') {
            await sendPushNotification({
              title: "Order Update",
              body: `Your order #${orderNum} has been ${status}`,
              url: `/thank-you/${id}`,
              customerPhone,
              userType: "customer",
            });
          }
        }

        // Notify driver when order is ready
        if (driverId && status === 'ready_for_pickup') {
          await sendPushNotification({
            title: "Order Ready for Pickup! 📦",
            body: `Order #${orderNum} is ready to be picked up`,
            url: `/driver/orders`,
            driverId,
            userType: "driver",
          });
          
          // Create in-app driver notification
          await createDriverNotification({
            driverId,
            title: "Order Ready for Pickup! 📦",
            message: `Order #${orderNum} is ready. Head to the restaurant to pick it up.`,
            type: "order",
            orderId: id,
          });
        }
      } catch (e) {
        console.error("Failed to send status notification:", e);
      }

      return { id, status };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Update local selected order state so buttons refresh immediately
      if (selectedOrder?.id === variables.id) {
        setSelectedOrder(prev => prev ? { ...prev, status: variables.status } : null);
      }
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ orderId, driverId, orderNumber }: { orderId: string; driverId: string | null; orderNumber?: string }) => {
      const order = orders.find(o => o.id === orderId);
      const oldDriverId = order?.driver_id;
      const oldDriverName = order?.drivers?.name;
      const newDriverName = driverId ? availableDrivers.find(d => d.id === driverId)?.name : null;

      const { error } = await supabase
        .from('orders')
        .update({ driver_id: driverId })
        .eq('id', orderId);
      if (error) throw error;

      // Log the action
      await logAdminAction({
        action: 'assign',
        entityType: 'order',
        entityId: orderId,
        entityName: orderNumber || order?.order_number || undefined,
        oldValues: oldDriverId ? { driver: oldDriverName || oldDriverId } : undefined,
        newValues: driverId ? { driver: newDriverName || driverId } : { driver: 'unassigned' },
        details: driverId 
          ? `Assigned driver ${newDriverName || driverId}`
          : `Unassigned driver${oldDriverName ? ` (was ${oldDriverName})` : ''}`,
      });

      // Send push notification and in-app notification to driver when assigned
      if (driverId) {
        const orderNum = orderNumber || order?.order_number || '';
        try {
          await sendPushNotification({
            title: "New Delivery Assigned!",
            body: `You've been assigned Order #${orderNum}`,
            url: `/driver/orders`,
            driverId: driverId,
            userType: "driver",
            orderId: orderId,
            orderNumber: orderNum,
          });
        } catch (e) {
          console.error("Failed to send driver push notification:", e);
        }
        
        // Create in-app driver notification
        await createDriverNotification({
          driverId,
          title: "New Delivery Assigned! 🚗",
          message: `You've been assigned Order #${orderNum}. Check your orders for details.`,
          type: "assignment",
          orderId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Driver assigned');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to assign driver');
    },
  });

  // Bulk delete mutation
  const handleBulkDelete = async () => {
    if (selectedOrderIds.size === 0) return;
    setIsDeleting(true);

    try {
      const orderIds = Array.from(selectedOrderIds);
      
      for (const orderId of orderIds) {
        // Get order items first
        const { data: items } = await supabase
          .from('order_items')
          .select('id')
          .eq('order_id', orderId);
        
        const itemIds = items?.map(i => i.id) || [];
        
        // Delete in order: flavors -> items -> proofs -> earnings -> photos -> order
        if (itemIds.length > 0) {
          await supabase.from('order_item_flavors').delete().in('order_item_id', itemIds);
        }
        await supabase.from('order_items').delete().eq('order_id', orderId);
        await supabase.from('payment_proofs').delete().eq('order_id', orderId);
        await supabase.from('driver_earnings').delete().eq('order_id', orderId);
        await supabase.from('delivery_photos').delete().eq('order_id', orderId);
        await supabase.from('stock_adjustments').delete().eq('order_id', orderId);
        
        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        if (error) throw error;
      }

      // Log bulk delete
      await logAdminAction({
        action: 'bulk_delete',
        entityType: 'orders',
        details: `Deleted ${orderIds.length} orders`,
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrderIds(new Set());
      setShowDeleteDialog(false);
      toast.success(`Deleted ${orderIds.length} orders`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete orders');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyTrackingLink = (orderId: string) => {
    const url = `${window.location.origin}/thank-you/${orderId}`;
    navigator.clipboard.writeText(url);
    toast.success('Tracking link copied to clipboard!');
  };

  const handleQuickStatusUpdate = (orderId: string, status: Enums<'order_status'>, orderNumber?: string | null, orderTotal?: number) => {
    // For cancelled or rejected, show refund dialog
    if (status === 'cancelled' || status === 'rejected') {
      const order = orders.find(o => o.id === orderId);
      setRefundDialog({
        open: true,
        orderId,
        orderNumber: orderNumber || order?.order_number || null,
        orderTotal: orderTotal ?? order?.total_amount ?? 0,
        newStatus: status,
      });
      return;
    }
    updateStatusMutation.mutate({ id: orderId, status, orderNumber: orderNumber || undefined });
  };

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ internal_notes: notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Notes saved');
    },
  });

  // Handle admin photo upload for pickup orders
  const handleAdminPhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;

    setUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedOrder.id}/admin-pickup-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);

      // Save photo record
      await supabase.from('delivery_photos').insert({
        order_id: selectedOrder.id,
        driver_id: null, // Admin uploaded, not driver
        photo_type: 'pickup',
        image_url: publicUrl,
      });

      // Log the action
      await logAdminAction({
        action: 'photo_upload',
        entityType: 'order',
        entityId: selectedOrder.id,
        entityName: selectedOrder.order_number || undefined,
        details: `Uploaded pickup proof photo for order ${selectedOrder.order_number}`,
      });

      // Auto-complete pickup orders when photo is uploaded
      if (selectedOrder.order_type === 'pickup') {
        await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', selectedOrder.id);
        
        // Update local state
        setSelectedOrder(prev => prev ? { ...prev, status: 'completed' } : null);
        
        await logAdminAction({
          action: 'status_change',
          entityType: 'order',
          entityId: selectedOrder.id,
          entityName: selectedOrder.order_number || undefined,
          oldValues: { status: selectedOrder.status },
          newValues: { status: 'completed' },
          details: `Auto-completed pickup order after photo upload`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['delivery-photos', selectedOrder.id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(selectedOrder.order_type === 'pickup' ? 'Pickup photo uploaded & order completed' : 'Pickup photo uploaded');
    } catch (error: any) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      order.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const getNextActions = (status: Enums<'order_status'> | null, orderType: string | null) => {
    const isDelivery = orderType === 'delivery';
    
    switch (status) {
      case 'pending':
        return [
          { label: 'Send for Verification', status: 'for_verification' as const, variant: 'default' as const },
          { label: 'Reject', status: 'rejected' as const, variant: 'destructive' as const },
        ];
      case 'for_verification':
        return [
          { label: 'Approve', status: 'approved' as const, variant: 'default' as const },
          { label: 'Reject', status: 'rejected' as const, variant: 'destructive' as const },
        ];
      case 'approved':
        return [
          { label: 'Start Preparing', status: 'preparing' as const, variant: 'default' as const },
          { label: 'Cancel', status: 'cancelled' as const, variant: 'destructive' as const },
        ];
      case 'preparing':
        return isDelivery ? [
          { label: 'Ready - Waiting for Rider', status: 'waiting_for_rider' as const, variant: 'default' as const },
          { label: 'Cancel', status: 'cancelled' as const, variant: 'destructive' as const },
        ] : [
          { label: 'Ready for Pickup', status: 'ready_for_pickup' as const, variant: 'default' as const },
          { label: 'Cancel', status: 'cancelled' as const, variant: 'destructive' as const },
        ];
      case 'ready_for_pickup':
        return [
          { label: 'Complete', status: 'completed' as const, variant: 'default' as const },
        ];
      case 'waiting_for_rider':
        return [
          { label: 'Picked Up by Rider', status: 'picked_up' as const, variant: 'default' as const },
          { label: 'Cancel', status: 'cancelled' as const, variant: 'destructive' as const },
        ];
      case 'picked_up':
        return [
          { label: 'In Transit', status: 'in_transit' as const, variant: 'default' as const },
        ];
      case 'in_transit':
        return [
          { label: 'Delivered', status: 'delivered' as const, variant: 'default' as const },
        ];
      case 'delivered':
        return [
          { label: 'Complete', status: 'completed' as const, variant: 'default' as const },
        ];
      default:
        return [];
    }
  };

  // All possible statuses admin can set (for manual override dropdown)
  const getAllStatuses = (): { label: string; status: Enums<'order_status'>; group: string }[] => {
    return [
      { label: 'Pending', status: 'pending', group: 'Initial' },
      { label: 'For Verification', status: 'for_verification', group: 'Initial' },
      { label: 'Approved', status: 'approved', group: 'Processing' },
      { label: 'Preparing', status: 'preparing', group: 'Processing' },
      { label: 'Ready for Pickup', status: 'ready_for_pickup', group: 'Pickup' },
      { label: 'Waiting for Rider', status: 'waiting_for_rider', group: 'Delivery' },
      { label: 'Picked Up', status: 'picked_up', group: 'Delivery' },
      { label: 'In Transit', status: 'in_transit', group: 'Delivery' },
      { label: 'Delivered', status: 'delivered', group: 'Delivery' },
      { label: 'Completed', status: 'completed', group: 'Final' },
      { label: 'Rejected', status: 'rejected', group: 'Final' },
      { label: 'Cancelled', status: 'cancelled', group: 'Final' },
    ];
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1">Manage customer orders</p>
        </div>
        {isOwner && selectedOrderIds.size > 0 && (
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedOrderIds.size})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="for_verification">For Verification</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
                <SelectItem value="waiting_for_rider">Waiting for Rider</SelectItem>
                <SelectItem value="picked_up">Picked Up</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isOwner && (
                    <TableHead className="w-[40px]">
                      <Checkbox 
                        checked={selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    {isOwner && (
                      <TableCell>
                        <Checkbox 
                          checked={selectedOrderIds.has(order.id)}
                          onCheckedChange={() => toggleSelectOrder(order.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-sm">
                      {order.order_number}
                    </TableCell>
                    <TableCell>{order.customers?.name || 'Walk-in'}</TableCell>
                    <TableCell className="capitalize">
                      {order.order_type?.replace('_', ' ')}
                    </TableCell>
                    <TableCell>₱{order.total_amount?.toFixed(2)}</TableCell>
                    <TableCell>
                      {/* Inline clickable driver assignment for delivery orders */}
                      {order.order_type === 'delivery' ? (
                        <Select
                          value={order.driver_id || 'unassigned'}
                          onValueChange={(value) => {
                            assignDriverMutation.mutate({
                              orderId: order.id,
                              driverId: value === 'unassigned' ? null : value,
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue>
                              {order.drivers ? (
                                <span className="flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${order.drivers.availability_status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                  {order.drivers.name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Assign</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">No driver</SelectItem>
                            {availableDrivers
                              .sort((a, b) => {
                                const orderMap = { online: 0, busy: 1, offline: 2, unavailable: 3 };
                                return (orderMap[a.availability_status || 'offline'] ?? 2) - (orderMap[b.availability_status || 'offline'] ?? 2);
                              })
                              .map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  <span className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${d.availability_status === 'online' ? 'bg-green-500' : d.availability_status === 'busy' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                                    {d.name}
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Inline clickable status dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="cursor-pointer">
                            <Badge
                              variant="outline"
                              className={`${statusColors[order.status || 'pending']} hover:opacity-80 transition-opacity`}
                            >
                              {statusLabels[order.status || 'pending']}
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Badge>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          {getNextActions(order.status, order.order_type).length > 0 && (
                            <>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Quick Actions</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {getNextActions(order.status, order.order_type).map((action) => (
                                    <DropdownMenuItem
                                      key={action.status}
                                      onClick={() => handleQuickStatusUpdate(order.id, action.status)}
                                      className={action.variant === 'destructive' ? 'text-destructive' : ''}
                                    >
                                      {action.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {getAllStatuses().map((item) => (
                            <DropdownMenuItem
                              key={item.status}
                              onClick={() => {
                                if (item.status !== order.status) {
                                  handleQuickStatusUpdate(order.id, item.status);
                                }
                              }}
                              disabled={item.status === order.status}
                              className={item.status === order.status ? 'bg-muted' : ''}
                            >
                              <Badge variant="outline" className={`mr-2 ${statusColors[item.status]}`}>
                                {item.label}
                              </Badge>
                              {item.status === order.status && <span className="ml-auto text-xs">(current)</span>}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {order.created_at && format(new Date(order.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyTrackingLink(order.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Tracking Link
                          </DropdownMenuItem>
                          
                          {getNextActions(order.status, order.order_type).length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Share2 className="h-4 w-4 mr-2" />
                                  Update Status
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {getNextActions(order.status, order.order_type).map((action) => (
                                    <DropdownMenuItem
                                      key={action.status}
                                      onClick={() => handleQuickStatusUpdate(order.id, action.status)}
                                      disabled={updateStatusMutation.isPending}
                                      className={action.variant === 'destructive' ? 'text-destructive' : ''}
                                    >
                                      {action.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} orders
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
        </CardContent>
      </Card>

      {/* Refund Dialog */}
      {refundDialog && (
        <RefundDialog
          open={refundDialog.open}
          onOpenChange={(open) => {
            if (!open) setRefundDialog(null);
          }}
          orderId={refundDialog.orderId}
          orderNumber={refundDialog.orderNumber}
          orderTotal={refundDialog.orderTotal}
          newStatus={refundDialog.newStatus}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setRefundDialog(null);
          }}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedOrderIds.size} Orders?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected orders and all related data (items, payment proofs, etc.). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete Orders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedOrder && (
            <>
              <SheetHeader>
                <SheetTitle>Order {selectedOrder.order_number}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={statusColors[selectedOrder.status || 'pending']}
                  >
                    {statusLabels[selectedOrder.status || 'pending']}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyTrackingLink(selectedOrder.id)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Share Tracking Link
                    </Button>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground block">
                  {selectedOrder.created_at &&
                    format(new Date(selectedOrder.created_at), 'PPp')}
                </span>

                <div className="space-y-2">
                  <h4 className="font-medium">Customer</h4>
                  <div className="text-sm text-muted-foreground">
                    <p>{selectedOrder.customers?.name || 'Walk-in Customer'}</p>
                    {selectedOrder.customers?.phone && (
                      <p>{selectedOrder.customers.phone}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Items</h4>
                  <div className="space-y-2">
                    {orderItems.map((item) => (
                      <div key={item.id} className="space-y-1 p-2 bg-muted rounded">
                        <div className="flex justify-between text-sm">
                          <span>
                            {item.quantity}x {item.product_name}
                          </span>
                          <span>₱{item.line_total?.toFixed(2) || item.subtotal.toFixed(2)}</span>
                        </div>
                        {item.order_item_flavors.length > 0 && (
                          <div className="pl-4 text-xs text-muted-foreground">
                            {item.order_item_flavors.map((f, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{f.quantity}x {f.flavor_name}</span>
                                {f.surcharge_applied && f.surcharge_applied > 0 && (
                                  <span>+₱{(f.surcharge_applied * (f.quantity || 1)).toFixed(2)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrder.order_type === 'delivery' && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Delivery Details</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{selectedOrder.delivery_address}</p>
                      <div className="flex justify-between">
                        <span>Distance:</span>
                        <span>{selectedOrder.delivery_distance_km?.toFixed(1)} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery Fee:</span>
                        <span>₱{selectedOrder.delivery_fee?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedOrder.order_type === 'pickup' && selectedOrder.pickup_date && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Pickup Schedule</h4>
                    <div className="text-sm text-muted-foreground">
                      <p>{format(new Date(selectedOrder.pickup_date), 'PPPP')}</p>
                      {selectedOrder.pickup_time && <p>at {selectedOrder.pickup_time}</p>}
                    </div>
                  </div>
                )}

                {/* Assign Driver for Delivery Orders */}
                {selectedOrder.order_type === 'delivery' && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Assign Driver</h4>
                    <Select
                      value={selectedOrder.driver_id || 'unassigned'}
                      onValueChange={(value) => {
                        assignDriverMutation.mutate({
                          orderId: selectedOrder.id,
                          driverId: value === 'unassigned' ? null : value,
                          orderNumber: selectedOrder.order_number || undefined,
                        });
                        setSelectedOrder(prev => prev ? { ...prev, driver_id: value === 'unassigned' ? null : value } : null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">No driver assigned</SelectItem>
                        {availableDrivers
                          .sort((a, b) => {
                            const orderMap = { online: 0, busy: 1, offline: 2, unavailable: 3 };
                            return (orderMap[a.availability_status || 'offline'] ?? 2) - (orderMap[b.availability_status || 'offline'] ?? 2);
                          })
                          .map((driver) => (
                            <SelectItem key={driver.id} value={driver.id}>
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  driver.availability_status === 'online' ? 'bg-green-500' : 
                                  driver.availability_status === 'busy' ? 'bg-yellow-500' : 'bg-gray-400'
                                }`} />
                                {driver.name}
                                {driver.availability_status && (
                                  <span className={`text-xs ${availabilityColors[driver.availability_status]}`}>
                                    ({driver.availability_status})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Payment Proof */}
                {paymentProofs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Payment Proof</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentProofs.map((proof) => (
                        <a
                          key={proof.id}
                          href={proof.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={proof.image_url}
                            alt="Payment proof"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            View
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Photos */}
                <div className="space-y-2">
                  <h4 className="font-medium">Order Photos</h4>
                  
                  {/* Hidden file input for admin photo upload */}
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleAdminPhotoUpload}
                    className="hidden"
                  />

                  {/* Upload button for pickup orders */}
                  {selectedOrder.order_type === 'pickup' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="w-full mb-2"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4 mr-2" />
                      )}
                      {uploadingPhoto ? 'Uploading...' : 'Upload Pickup Photo'}
                    </Button>
                  )}

                  {deliveryPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {deliveryPhotos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={photo.image_url}
                            alt={`${photo.photo_type} photo`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded capitalize">
                            {photo.photo_type}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No photos uploaded yet</p>
                  )}
                </div>

                {/* Totals */}
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>₱{selectedOrder.subtotal?.toFixed(2)}</span>
                  </div>
                  {selectedOrder.delivery_fee && selectedOrder.delivery_fee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Delivery Fee</span>
                      <span>₱{selectedOrder.delivery_fee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>₱{selectedOrder.total_amount?.toFixed(2)}</span>
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="space-y-2">
                  <h4 className="font-medium">Internal Notes</h4>
                  <Textarea
                    placeholder="Add internal notes..."
                    defaultValue={selectedOrder.internal_notes || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (selectedOrder.internal_notes || '')) {
                        updateNotesMutation.mutate({
                          id: selectedOrder.id,
                          notes: e.target.value,
                        });
                      }
                    }}
                  />
                </div>

                {/* Quick Actions */}
                {getNextActions(selectedOrder.status, selectedOrder.order_type).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Quick Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {getNextActions(selectedOrder.status, selectedOrder.order_type).map(
                        (action) => (
                          <Button
                            key={action.status}
                            variant={action.variant}
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              handleQuickStatusUpdate(
                                selectedOrder.id,
                                action.status,
                                selectedOrder.order_number || undefined
                              )
                            }
                          >
                            {action.label}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Admin Override - All Status Options */}
                <div className="space-y-2 pt-4 border-t">
                  <h4 className="font-medium text-sm text-muted-foreground">Admin Override</h4>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Set Any Status
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      {getAllStatuses().map((item) => (
                        <DropdownMenuItem
                          key={item.status}
                          onClick={() => {
                            if (item.status !== selectedOrder.status) {
                              handleQuickStatusUpdate(selectedOrder.id, item.status, selectedOrder.order_number || undefined);
                            }
                          }}
                          disabled={item.status === selectedOrder.status}
                        >
                          <Badge variant="outline" className={`mr-2 ${statusColors[item.status]}`}>
                            {item.label}
                          </Badge>
                          {item.status === selectedOrder.status && <span className="ml-auto text-xs">(current)</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}