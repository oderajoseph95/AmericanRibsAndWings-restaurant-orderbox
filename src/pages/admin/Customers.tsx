import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

export default function Customers() {
  const { role } = useAuth();
  const canEdit = role === 'owner' || role === 'manager';
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Tables<'customers'> | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Tables<'customers'> | null>(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');
      if (error) throw error;
      
      // Deduplicate customers by email (combine stats for duplicates)
      const deduped = data.reduce((acc: Record<string, typeof data[0]>, customer) => {
        const key = customer.email || customer.phone || customer.id;
        if (!acc[key]) {
          acc[key] = { ...customer };
        } else {
          // Merge stats into existing record
          acc[key].total_orders = (acc[key].total_orders || 0) + (customer.total_orders || 0);
          acc[key].total_spent = Number(acc[key].total_spent || 0) + Number(customer.total_spent || 0);
          // Keep the most recent order date
          if (customer.last_order_date && (!acc[key].last_order_date || customer.last_order_date > acc[key].last_order_date)) {
            acc[key].last_order_date = customer.last_order_date;
          }
        }
        return acc;
      }, {});
      
      return Object.values(deduped);
    },
  });

  const { data: customerOrders = [] } = useQuery({
    queryKey: ['customer-orders', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', selectedCustomer.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomer,
  });

  const saveMutation = useMutation({
    mutationFn: async (customer: { name: string; phone?: string | null; email?: string | null }) => {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customer)
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert({
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(editingCustomer ? 'Customer updated' : 'Customer created');
      setDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save customer');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete customer');
    },
  });

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      name: form.get('name') as string,
      phone: form.get('phone') as string || null,
      email: form.get('email') as string || null,
    });
  };

  const openEditDialog = (customer: Tables<'customers'>) => {
    setEditingCustomer(customer);
    setDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingCustomer(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">
            {customers.length} total customers
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer ? 'Edit Customer' : 'New Customer'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingCustomer?.name || ''}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={editingCustomer?.phone || ''}
                    placeholder="09XX XXX XXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={editingCustomer?.email || ''}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No customers found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.phone || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.email || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {customer.total_orders || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      ₱{(customer.total_spent || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedCustomer(customer)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(customer)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Delete this customer?')) {
                                  deleteMutation.mutate(customer.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Customer Detail Sheet */}
      <Sheet open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedCustomer && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCustomer.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedCustomer.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedCustomer.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Orders</p>
                    <p className="font-medium">{selectedCustomer.total_orders || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p className="font-medium">
                      ₱{(selectedCustomer.total_spent || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Recent Orders</h4>
                  {customerOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders yet</p>
                  ) : (
                    <div className="space-y-2">
                      {customerOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div>
                            <p className="font-mono text-sm">{order.order_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.created_at &&
                                format(new Date(order.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              ₱{order.total_amount?.toFixed(2)}
                            </p>
                            <Badge
                              variant="outline"
                              className="text-xs capitalize"
                            >
                              {order.status?.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
