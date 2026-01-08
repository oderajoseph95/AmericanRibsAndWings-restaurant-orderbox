import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShoppingCart, RefreshCw, Mail, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface AbandonedCheckout {
  id: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  cart_items: any[];
  cart_total: number;
  order_type: string | null;
  delivery_city: string | null;
  delivery_barangay: string | null;
  last_section: string | null;
  status: string;
  recovery_started_at: string | null;
  email_attempts: number;
  sms_attempts: number;
  last_reminder_sent_at: string | null;
  next_reminder_scheduled_at: string | null;
}

interface Reminder {
  id: string;
  scheduled_for: string;
  channel: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
}

interface CheckoutEvent {
  id: string;
  event_type: string;
  channel: string | null;
  metadata: any;
  created_at: string;
}

export default function AbandonedCheckouts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCheckout, setSelectedCheckout] = useState<AbandonedCheckout | null>(null);
  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('abandoned-checkouts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'abandoned_checkouts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['abandoned-checkouts'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'abandoned_checkout_reminders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['checkout-reminders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch abandoned checkouts
  const { data: checkouts = [], isLoading } = useQuery({
    queryKey: ['abandoned-checkouts', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('abandoned_checkouts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as AbandonedCheckout[];
    },
  });

  // Fetch reminders for selected checkout
  const { data: reminders = [] } = useQuery({
    queryKey: ['checkout-reminders', selectedCheckout?.id],
    queryFn: async () => {
      if (!selectedCheckout) return [];
      const { data, error } = await supabase
        .from('abandoned_checkout_reminders')
        .select('*')
        .eq('abandoned_checkout_id', selectedCheckout.id)
        .order('scheduled_for', { ascending: true });
      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!selectedCheckout,
  });

  // Fetch events/timeline for selected checkout
  const { data: checkoutEvents = [] } = useQuery({
    queryKey: ['checkout-events', selectedCheckout?.id],
    queryFn: async () => {
      if (!selectedCheckout) return [];
      const { data, error } = await supabase
        .from('abandoned_checkout_events')
        .select('*')
        .eq('abandoned_checkout_id', selectedCheckout.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as CheckoutEvent[];
    },
    enabled: !!selectedCheckout,
  });

  // Recovery mutation
  const recoverMutation = useMutation({
    mutationFn: async (checkoutId: string) => {
      const { data, error } = await supabase.functions.invoke('recover-abandoned-checkout', {
        body: { abandoned_checkout_id: checkoutId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Recovery started! ${data.reminders_scheduled} reminders scheduled.`);
      queryClient.invalidateQueries({ queryKey: ['abandoned-checkouts'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start recovery');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'abandoned':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Abandoned</Badge>;
      case 'recovering':
        return <Badge variant="default" className="bg-amber-500"><RefreshCw className="h-3 w-3 mr-1" />Recovering</Badge>;
      case 'recovered':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Recovered</Badge>;
      case 'expired':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReminderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Sent</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Stats
  const stats = {
    total: checkouts.length,
    abandoned: checkouts.filter(c => c.status === 'abandoned').length,
    recovering: checkouts.filter(c => c.status === 'recovering').length,
    recovered: checkouts.filter(c => c.status === 'recovered').length,
    totalValue: checkouts.reduce((sum, c) => sum + (c.cart_total || 0), 0),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Abandoned Checkouts</h1>
          <p className="text-muted-foreground">Recover lost sales with automated reminders</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Abandoned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.abandoned}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recovering</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.recovering}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recovered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.recovered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Potential Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">₱{stats.totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="abandoned">Abandoned</SelectItem>
            <SelectItem value="recovering">Recovering</SelectItem>
            <SelectItem value="recovered">Recovered</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Cart</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reminders</TableHead>
                <TableHead>Abandoned</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No abandoned checkouts found</p>
                  </TableCell>
                </TableRow>
              ) : (
                checkouts.map((checkout) => (
                  <TableRow key={checkout.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{checkout.customer_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {checkout.customer_phone && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {checkout.customer_phone}
                            </span>
                          )}
                          {checkout.customer_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {checkout.customer_email}
                            </span>
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{checkout.cart_items?.length || 0} items</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">₱{checkout.cart_total?.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(checkout.status)}</TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {checkout.email_attempts || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {checkout.sms_attempts || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(checkout.created_at), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedCheckout(checkout)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Checkout Details</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="max-h-[60vh]">
                              <div className="space-y-4 pr-4">
                                {/* Customer Info */}
                                <div>
                                  <h4 className="font-medium mb-2">Customer</h4>
                                  <div className="text-sm space-y-1">
                                    <p><strong>Name:</strong> {checkout.customer_name || 'N/A'}</p>
                                    <p><strong>Phone:</strong> {checkout.customer_phone || 'N/A'}</p>
                                    <p><strong>Email:</strong> {checkout.customer_email || 'N/A'}</p>
                                  </div>
                                </div>

                                {/* Cart Items */}
                                <div>
                                  <h4 className="font-medium mb-2">Cart Items</h4>
                                  <div className="space-y-2">
                                    {checkout.cart_items?.map((item: any, index: number) => (
                                      <div key={index} className="flex justify-between text-sm bg-muted p-2 rounded">
                                        <span>{item.product?.name || item.name} x{item.quantity}</span>
                                        <span>₱{((item.product?.price || item.price) * item.quantity).toLocaleString()}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between font-medium pt-2 border-t">
                                      <span>Total</span>
                                      <span>₱{checkout.cart_total?.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Reminders */}
                                {reminders.length > 0 && (
                                  <div>
                                    <h4 className="font-medium mb-2">Scheduled Reminders</h4>
                                    <div className="space-y-2">
                                      {reminders.map((reminder) => (
                                        <div key={reminder.id} className="text-sm bg-muted p-3 rounded space-y-2">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              {reminder.channel === 'sms' ? (
                                                <MessageSquare className="h-4 w-4" />
                                              ) : (
                                                <Mail className="h-4 w-4" />
                                              )}
                                              <span className="font-medium capitalize">{reminder.channel}</span>
                                            </div>
                                            {getReminderStatusBadge(reminder.status)}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            <span>Scheduled: {format(new Date(reminder.scheduled_for), 'MMM d, h:mm a')}</span>
                                            {reminder.sent_at && (
                                              <span className="ml-2">• Sent: {format(new Date(reminder.sent_at), 'MMM d, h:mm a')}</span>
                                            )}
                                          </div>
                                          {reminder.error_message && (
                                            <p className="text-xs text-destructive">{reminder.error_message}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Activity Timeline */}
                                {checkoutEvents.length > 0 && (
                                  <div>
                                    <h4 className="font-medium mb-2">Activity Timeline</h4>
                                    <div className="relative pl-4 border-l-2 border-muted space-y-3">
                                      {checkoutEvents.map((event) => {
                                        const eventLabels: Record<string, { label: string; color: string }> = {
                                          created: { label: 'Checkout abandoned', color: 'bg-orange-500' },
                                          recovery_started: { label: 'Recovery initiated', color: 'bg-blue-500' },
                                          link_clicked: { label: 'Recovery link clicked', color: 'bg-purple-500' },
                                          cart_restored: { label: 'Cart restored', color: 'bg-green-500' },
                                          order_placed: { label: 'Order completed!', color: 'bg-emerald-600' },
                                          reminder_sent: { label: `Reminder sent (${event.channel || 'email'})`, color: 'bg-blue-400' },
                                          reminder_failed: { label: 'Reminder failed', color: 'bg-red-500' },
                                        };
                                        const info = eventLabels[event.event_type] || { label: event.event_type, color: 'bg-gray-500' };
                                        
                                        return (
                                          <div key={event.id} className="relative pb-1">
                                            <div className={`absolute -left-[9px] w-3 h-3 rounded-full ${info.color} border-2 border-background`} />
                                            <div className="text-sm ml-2">
                                              <span className="font-medium">{info.label}</span>
                                              <span className="text-xs text-muted-foreground ml-2">
                                                {format(new Date(event.created_at), 'MMM d, h:mm a')}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Recovery Link Preview */}
                                {checkout.status === 'recovering' && (
                                  <div>
                                    <Separator className="my-3" />
                                    <h4 className="font-medium mb-2">Recovery Link</h4>
                                    <div className="bg-muted p-2 rounded text-xs break-all flex items-center gap-2">
                                      <code className="flex-1">
                                        https://arwfloridablanca.shop/order?recover={checkout.id}
                                      </code>
                                      <a 
                                        href={`https://arwfloridablanca.shop/order?recover=${checkout.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                        
                        {checkout.status === 'abandoned' && (
                          <Button
                            size="sm"
                            onClick={() => recoverMutation.mutate(checkout.id)}
                            disabled={recoverMutation.isPending}
                          >
                            {recoverMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Recover
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
