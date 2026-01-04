import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Search, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Upload,
  DollarSign,
  User,
  CreditCard,
  ExternalLink,
  Truck,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';

type Payout = {
  id: string;
  driver_id: string;
  amount: number;
  payment_method: string;
  account_details: {
    account_name?: string;
    account_number?: string;
    bank_name?: string;
  };
  status: string;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  payment_proof_url: string | null;
  admin_notes: string | null;
  drivers?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  } | null;
  // Attached earnings with order info
  earnings?: {
    order_id: string;
    delivery_fee: number;
    orders?: {
      order_number: string;
      status: string;
      total_amount: number;
    };
  }[];
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  approved: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
};

export default function Payouts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch payouts
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['admin-payouts', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('driver_payouts')
        .select('*, drivers(id, name, email, phone)')
        .order('requested_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Payout[];
    },
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['payout-stats'],
    queryFn: async () => {
      // Fetch payout requests
      const { data: payoutData, error: payoutError } = await supabase
        .from('driver_payouts')
        .select('status, amount');
      if (payoutError) throw payoutError;

      // Fetch pending earnings (drivers on delivery)
      const { data: earningsData, error: earningsError } = await supabase
        .from('driver_earnings')
        .select('status, delivery_fee');
      if (earningsError) throw earningsError;

      const pending = payoutData.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
      const completed = payoutData.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
      const pendingCount = payoutData.filter(p => p.status === 'pending').length;
      const pendingEarnings = earningsData.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.delivery_fee), 0);
      const availableEarnings = earningsData.filter(e => e.status === 'available').reduce((sum, e) => sum + Number(e.delivery_fee), 0);

      return { pending, completed, pendingCount, pendingEarnings, availableEarnings };
    },
  });

  // Update payout mutation
  const updatePayoutMutation = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      notes, 
      proofUrl 
    }: { 
      id: string; 
      status: string; 
      notes?: string; 
      proofUrl?: string 
    }) => {
      const updateData: any = {
        status,
        processed_at: new Date().toISOString(),
        processed_by: user?.id,
      };

      if (notes !== undefined) updateData.admin_notes = notes;
      if (proofUrl) updateData.payment_proof_url = proofUrl;

      const { error } = await supabase
        .from('driver_payouts')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // If completed, update related earnings to 'paid'
      if (status === 'completed') {
        const payout = payouts.find(p => p.id === id);
        if (payout) {
          await supabase
            .from('driver_earnings')
            .update({ status: 'paid' })
            .eq('driver_id', payout.driver_id)
            .eq('status', 'requested');
        }
      }

      // If rejected, update related earnings back to 'available'
      if (status === 'rejected') {
        const payout = payouts.find(p => p.id === id);
        if (payout) {
          await supabase
            .from('driver_earnings')
            .update({ status: 'available' })
            .eq('driver_id', payout.driver_id)
            .eq('status', 'requested');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-stats'] });
      toast.success('Payout updated');
      setSelectedPayout(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update payout');
    },
  });

  const handleUploadProof = async (file: File) => {
    if (!selectedPayout) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedPayout.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('payout-proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('payout-proofs')
        .getPublicUrl(fileName);

      // Update payout with proof and mark as completed
      await updatePayoutMutation.mutateAsync({
        id: selectedPayout.id,
        status: 'completed',
        notes: adminNotes,
        proofUrl: urlData.publicUrl,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload proof');
    } finally {
      setUploading(false);
    }
  };

  const filteredPayouts = payouts.filter(
    (payout) =>
      payout.drivers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      payout.drivers?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Driver Payouts</h1>
        <p className="text-muted-foreground mt-1">Manage driver payout requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Transit</p>
                <p className="text-xl font-bold text-orange-600">₱{(stats?.pendingEarnings || 0).toFixed(2)}</p>
              </div>
              <Truck className="h-6 w-6 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-xl font-bold text-green-600">₱{(stats?.availableEarnings || 0).toFixed(2)}</p>
              </div>
              <Wallet className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending Requests</p>
                <p className="text-xl font-bold">{stats?.pendingCount || 0}</p>
              </div>
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending Amount</p>
                <p className="text-xl font-bold">₱{(stats?.pending || 0).toFixed(2)}</p>
              </div>
              <DollarSign className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Paid</p>
                <p className="text-xl font-bold">₱{(stats?.completed || 0).toFixed(2)}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drivers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payout requests found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{payout.drivers?.name}</p>
                        <p className="text-xs text-muted-foreground">{payout.drivers?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-bold">₱{payout.amount.toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{payout.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[payout.status]}>
                        {payout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(payout.requested_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPayout(payout);
                            setAdminNotes(payout.admin_notes || '');
                          }}
                        >
                          {payout.status === 'pending' ? 'Process' : 'View'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payout Detail Sheet */}
      <Sheet open={!!selectedPayout} onOpenChange={() => setSelectedPayout(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPayout && (
            <>
              <SheetHeader>
                <SheetTitle>Payout Request</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={statusColors[selectedPayout.status]}>
                    {selectedPayout.status}
                  </Badge>
                  <span className="text-2xl font-bold">₱{selectedPayout.amount.toFixed(2)}</span>
                </div>

                {/* Driver Info */}
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Driver
                  </h4>
                  <div className="bg-muted p-3 rounded-lg text-sm">
                    <p className="font-medium">{selectedPayout.drivers?.name}</p>
                    <p className="text-muted-foreground">{selectedPayout.drivers?.email}</p>
                    <p className="text-muted-foreground">{selectedPayout.drivers?.phone}</p>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payment Details
                  </h4>
                  <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                    <p><strong>Method:</strong> {selectedPayout.payment_method.toUpperCase()}</p>
                    <p><strong>Account Name:</strong> {selectedPayout.account_details?.account_name}</p>
                    <p><strong>Account Number:</strong> {selectedPayout.account_details?.account_number}</p>
                    {selectedPayout.account_details?.bank_name && (
                      <p><strong>Bank:</strong> {selectedPayout.account_details.bank_name}</p>
                    )}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Requested: {format(new Date(selectedPayout.requested_at), 'PPp')}</p>
                  {selectedPayout.processed_at && (
                    <p>Processed: {format(new Date(selectedPayout.processed_at), 'PPp')}</p>
                  )}
                </div>

                {/* Payment Proof */}
                {selectedPayout.payment_proof_url && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Payment Proof</h4>
                    <a
                      href={selectedPayout.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={selectedPayout.payment_proof_url}
                        alt="Payment proof"
                        className="w-full h-48 object-cover rounded-lg border hover:opacity-90"
                      />
                    </a>
                    <a
                      href={selectedPayout.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Full Size
                    </a>
                  </div>
                )}

                {/* Admin Notes */}
                <div className="space-y-2">
                  <h4 className="font-medium">Admin Notes</h4>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes..."
                    disabled={selectedPayout.status !== 'pending'}
                  />
                </div>

                {/* Actions for pending payouts */}
                {selectedPayout.status === 'pending' && (
                  <div className="space-y-3 pt-4 border-t">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadProof(file);
                      }}
                    />
                    
                    <Button
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || updatePayoutMutation.isPending}
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload Proof & Complete
                    </Button>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          updatePayoutMutation.mutate({
                            id: selectedPayout.id,
                            status: 'approved',
                            notes: adminNotes,
                          });
                        }}
                        disabled={updatePayoutMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          updatePayoutMutation.mutate({
                            id: selectedPayout.id,
                            status: 'rejected',
                            notes: adminNotes,
                          });
                        }}
                        disabled={updatePayoutMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}