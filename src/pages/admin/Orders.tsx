import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';
import { Search, Eye, Clock, CheckCircle, XCircle, Loader2, Image, ExternalLink, Truck, ChefHat, Package, MoreHorizontal, Link, Share2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Order = Tables<'orders'> & {
  customers: Tables<'customers'> | null;
};

type OrderItem = Tables<'order_items'> & {
  order_item_flavors: Tables<'order_item_flavors'>[];
};

type PaymentProof = Tables<'payment_proofs'>;

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*, customers(*)')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as Enums<'order_status'>);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Order[];
    },
  });

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Enums<'order_status'> }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
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

  const handleCopyTrackingLink = (orderId: string) => {
    const url = `${window.location.origin}/order/${orderId}`;
    navigator.clipboard.writeText(url);
    toast.success('Tracking link copied to clipboard!');
  };

  const handleQuickStatusUpdate = (orderId: string, status: Enums<'order_status'>) => {
    updateStatusMutation.mutate({ id: orderId, status });
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

  const filteredOrders = orders.filter(
    (order) =>
      order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      order.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Orders</h1>
        <p className="text-muted-foreground mt-1">Manage customer orders</p>
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
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.order_number}
                    </TableCell>
                    <TableCell>{order.customers?.name || 'Walk-in'}</TableCell>
                    <TableCell className="capitalize">
                      {order.order_type?.replace('_', ' ')}
                    </TableCell>
                    <TableCell>₱{order.total_amount?.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[order.status || 'pending']}
                      >
                        {statusLabels[order.status || 'pending']}
                      </Badge>
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
        </CardContent>
      </Card>

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
                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between text-sm border-b pb-2"
                      >
                        <div>
                          <p className="font-medium">
                            {item.quantity}x {item.product_name}
                          </p>
                          {item.order_item_flavors.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Flavors:{' '}
                              {item.order_item_flavors
                                .map((f) => f.flavor_name)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                        <span>₱{item.line_total?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delivery Info */}
                {selectedOrder.order_type === 'delivery' && selectedOrder.delivery_address && (
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Delivery Details
                    </h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{selectedOrder.delivery_address}</p>
                      {selectedOrder.delivery_distance_km && (
                        <p>Distance: {selectedOrder.delivery_distance_km.toFixed(1)} km</p>
                      )}
                      {selectedOrder.delivery_fee && (
                        <p>Delivery Fee: ₱{selectedOrder.delivery_fee.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Proof */}
                {paymentProofs.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Payment Proof
                    </h4>
                    <div className="space-y-3">
                      {paymentProofs.map((proof) => (
                        <div key={proof.id} className="border rounded-lg p-3 space-y-2">
                          <a 
                            href={proof.image_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img 
                              src={proof.image_url} 
                              alt="Payment proof" 
                              className="w-full h-48 object-cover rounded-md border hover:opacity-90 transition-opacity"
                            />
                          </a>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Uploaded: {proof.uploaded_at && format(new Date(proof.uploaded_at), 'PPp')}
                            </span>
                            <a 
                              href={proof.image_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Full Size
                            </a>
                          </div>
                          {proof.verified_at && (
                            <Badge variant="outline" className="bg-green-500/20 text-green-700 border-green-500/30">
                              Verified {format(new Date(proof.verified_at), 'PPp')}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total</span>
                  <span>₱{selectedOrder.total_amount?.toFixed(2)}</span>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Internal Notes</h4>
                  <Textarea
                    defaultValue={selectedOrder.internal_notes || ''}
                    placeholder="Add notes..."
                    onBlur={(e) =>
                      updateNotesMutation.mutate({
                        id: selectedOrder.id,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  {getNextActions(selectedOrder.status, selectedOrder.order_type).map((action) => (
                    <Button
                      key={action.status}
                      variant={action.variant}
                      onClick={() =>
                        updateStatusMutation.mutate({
                          id: selectedOrder.id,
                          status: action.status,
                        })
                      }
                      disabled={updateStatusMutation.isPending}
                    >
                      {action.status === 'approved' && (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      {action.status === 'rejected' && (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      {action.status === 'for_verification' && (
                        <Clock className="h-4 w-4 mr-2" />
                      )}
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
