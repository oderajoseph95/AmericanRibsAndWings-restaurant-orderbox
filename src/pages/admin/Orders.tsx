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
import { toast } from 'sonner';
import { Search, Eye, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Order = Tables<'orders'> & {
  customers: Tables<'customers'> | null;
};

type OrderItem = Tables<'order_items'> & {
  order_item_flavors: Tables<'order_item_flavors'>[];
};

const statusColors: Record<Enums<'order_status'>, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  for_verification: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  approved: 'bg-green-500/20 text-green-700 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
};

const statusLabels: Record<Enums<'order_status'>, string> = {
  pending: 'Pending',
  for_verification: 'For Verification',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Enums<'order_status'> }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });

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

  const getNextActions = (status: Enums<'order_status'> | null) => {
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
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
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
                  <span className="text-sm text-muted-foreground">
                    {selectedOrder.created_at &&
                      format(new Date(selectedOrder.created_at), 'PPp')}
                  </span>
                </div>

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
                  {getNextActions(selectedOrder.status).map((action) => (
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
