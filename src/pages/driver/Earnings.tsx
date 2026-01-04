import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Wallet, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  MapPin,
  DollarSign,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type PaymentInfo = {
  id: string;
  driver_id: string;
  payment_method: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  is_default: boolean;
};

type Earning = {
  id: string;
  driver_id: string;
  order_id: string;
  delivery_fee: number;
  distance_km: number;
  status: string;
  created_at: string;
  orders?: { order_number: string | null } | null;
};

type Payout = {
  id: string;
  driver_id: string;
  amount: number;
  payment_method: string;
  account_details: any;
  status: string;
  requested_at: string;
  processed_at: string | null;
  payment_proof_url: string | null;
  admin_notes: string | null;
};

const statusColors: Record<string, string> = {
  available: 'bg-green-500/20 text-green-700 border-green-500/30',
  requested: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  processing: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  paid: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  approved: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
};

export default function DriverEarnings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');

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

  // Fetch payment info
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['driver-payment-info', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from('driver_payment_info')
        .select('*')
        .eq('driver_id', driver.id);
      if (error) throw error;
      return data as PaymentInfo[];
    },
    enabled: !!driver?.id,
  });

  // Fetch earnings
  const { data: earnings = [], isLoading: earningsLoading } = useQuery({
    queryKey: ['driver-earnings', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from('driver_earnings')
        .select('*, orders(order_number)')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Earning[];
    },
    enabled: !!driver?.id,
  });

  // Fetch payouts
  const { data: payouts = [] } = useQuery({
    queryKey: ['driver-payouts', driver?.id],
    queryFn: async () => {
      if (!driver?.id) return [];
      const { data, error } = await supabase
        .from('driver_payouts')
        .select('*')
        .eq('driver_id', driver.id)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return data as Payout[];
    },
    enabled: !!driver?.id,
  });

  // Request payout mutation
  const requestPayoutMutation = useMutation({
    mutationFn: async () => {
      if (!driver?.id) throw new Error('No driver');
      const paymentInfo = paymentMethods.find(p => p.payment_method === selectedPaymentMethod);
      if (!paymentInfo) throw new Error('No payment method selected');

      const availableEarnings = earnings.filter(e => e.status === 'available');
      const totalAmount = availableEarnings.reduce((sum, e) => sum + e.delivery_fee, 0);

      if (totalAmount <= 0) throw new Error('No available earnings to withdraw');

      // Create payout request
      const { error: payoutError } = await supabase
        .from('driver_payouts')
        .insert({
          driver_id: driver.id,
          amount: totalAmount,
          payment_method: paymentInfo.payment_method,
          account_details: {
            account_name: paymentInfo.account_name,
            account_number: paymentInfo.account_number,
            bank_name: paymentInfo.bank_name,
          },
          status: 'pending',
        });

      if (payoutError) throw payoutError;

      // Update earnings status to 'requested'
      const earningIds = availableEarnings.map(e => e.id);
      const { error: updateError } = await supabase
        .from('driver_earnings')
        .update({ status: 'requested' })
        .in('id', earningIds);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-earnings'] });
      queryClient.invalidateQueries({ queryKey: ['driver-payouts'] });
      toast.success('Payout request submitted!');
      setPayoutDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to request payout');
    },
  });

  // Calculate stats
  const totalEarnings = earnings.reduce((sum, e) => sum + e.delivery_fee, 0);
  const availableBalance = earnings.filter(e => e.status === 'available').reduce((sum, e) => sum + e.delivery_fee, 0);
  const pendingPayout = earnings.filter(e => ['requested', 'processing'].includes(e.status)).reduce((sum, e) => sum + e.delivery_fee, 0);
  const paidOut = earnings.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.delivery_fee, 0);
  const totalDistance = earnings.reduce((sum, e) => sum + (e.distance_km || 0), 0);
  const deliveryCount = earnings.length;

  // Chart data - group by day
  const chartData = earnings.reduce((acc, earning) => {
    const date = format(new Date(earning.created_at), 'MMM d');
    const existing = acc.find(d => d.date === date);
    if (existing) {
      existing.amount += earning.delivery_fee;
      existing.deliveries += 1;
    } else {
      acc.push({ date, amount: earning.delivery_fee, deliveries: 1 });
    }
    return acc;
  }, [] as { date: string; amount: number; deliveries: number }[]).reverse().slice(-14);

  if (!driver) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Available</span>
            </div>
            <p className="text-2xl font-bold text-green-600">₱{availableBalance.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Earned</span>
            </div>
            <p className="text-2xl font-bold">₱{totalEarnings.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <p className="text-xl font-bold text-yellow-600">₱{pendingPayout.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Distance</span>
            </div>
            <p className="text-xl font-bold">{totalDistance.toFixed(1)} km</p>
          </CardContent>
        </Card>
      </div>

      {/* Request Payout Button */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Withdraw Earnings</p>
              <p className="text-sm text-muted-foreground">
                Available: ₱{availableBalance.toFixed(2)}
              </p>
            </div>
            <Button 
              onClick={() => setPayoutDialogOpen(true)}
              disabled={availableBalance <= 0 || paymentMethods.length === 0}
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Request Payout
            </Button>
          </div>
          {paymentMethods.length === 0 && (
            <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Add payment method in Profile to request payouts
            </p>
          )}
        </CardContent>
      </Card>

      {/* Earnings Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Earnings Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number) => [`₱${value.toFixed(2)}`, 'Earnings']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Earnings and Payouts */}
      <Tabs defaultValue="earnings">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="earnings">Earnings ({deliveryCount})</TabsTrigger>
          <TabsTrigger value="payouts">Payouts ({payouts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="earnings" className="space-y-3 mt-4">
          {earningsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : earnings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No earnings yet</p>
              </CardContent>
            </Card>
          ) : (
            earnings.map((earning) => (
              <Card key={earning.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{earning.orders?.order_number || 'Order'}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(earning.created_at), 'MMM d, h:mm a')}
                      </p>
                      {earning.distance_km > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {earning.distance_km.toFixed(1)} km
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">₱{earning.delivery_fee.toFixed(2)}</p>
                      <Badge variant="outline" className={statusColors[earning.status] || ''}>
                        {earning.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="payouts" className="space-y-3 mt-4">
          {payouts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No payout requests yet</p>
              </CardContent>
            </Card>
          ) : (
            payouts.map((payout) => (
              <Card key={payout.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">₱{payout.amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        via {payout.payment_method}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusColors[payout.status] || ''}>
                      {payout.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requested: {format(new Date(payout.requested_at), 'MMM d, h:mm a')}
                  </p>
                  {payout.processed_at && (
                    <p className="text-xs text-muted-foreground">
                      Processed: {format(new Date(payout.processed_at), 'MMM d, h:mm a')}
                    </p>
                  )}
                  {payout.payment_proof_url && (
                    <a 
                      href={payout.payment_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      View Payment Proof
                    </a>
                  )}
                  {payout.admin_notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Note: {payout.admin_notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Payout Dialog */}
      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Withdraw ₱{availableBalance.toFixed(2)} to your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Payment Method</label>
              <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.payment_method}>
                      <span className="capitalize">{method.payment_method}</span>
                      <span className="text-muted-foreground ml-2">
                        - {method.account_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPaymentMethod && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                {(() => {
                  const method = paymentMethods.find(p => p.payment_method === selectedPaymentMethod);
                  if (!method) return null;
                  return (
                    <>
                      <p><strong>Method:</strong> {method.payment_method.toUpperCase()}</p>
                      <p><strong>Name:</strong> {method.account_name}</p>
                      <p><strong>Account:</strong> {method.account_number}</p>
                      {method.bank_name && <p><strong>Bank:</strong> {method.bank_name}</p>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => requestPayoutMutation.mutate()}
              disabled={!selectedPaymentMethod || requestPayoutMutation.isPending}
            >
              {requestPayoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowUpRight className="h-4 w-4 mr-2" />
              )}
              Request ₱{availableBalance.toFixed(2)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}