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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
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
  Wallet,
  Package,
  MapPin,
  Phone,
  Camera,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { createAdminNotification } from '@/hooks/useAdminNotifications';
import { createDriverNotification } from '@/hooks/useDriverNotifications';

type OrderInfo = {
  id: string;
  order_number: string | null;
  status: string;
  total_amount: number;
  delivery_address: string | null;
  delivery_distance_km: number | null;
  delivery_fee: number | null;
  customer?: {
    name: string;
    phone: string | null;
  } | null;
};

type DeliveryPhoto = {
  id: string;
  order_id: string;
  photo_type: string;
  image_url: string;
  taken_at: string;
};

type EarningWithOrder = {
  id: string;
  order_id: string;
  delivery_fee: number;
  distance_km: number | null;
  status: string;
  order?: OrderInfo | null;
  photos?: DeliveryPhoto[];
};

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
  rejection_reason: string | null;
  drivers?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  } | null;
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
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
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    await queryClient.invalidateQueries({ queryKey: ['payout-stats'] });
    toast.success('Payouts refreshed');
    setTimeout(() => setIsRefreshing(false), 500);
  };

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

  // Fetch earnings and order details when a payout is selected
  const { data: payoutDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['payout-details', selectedPayout?.id, selectedPayout?.driver_id],
    queryFn: async () => {
      if (!selectedPayout?.driver_id) return null;

      // Get earnings that are part of this payout request (status = 'requested')
      const { data: earnings, error: earningsError } = await supabase
        .from('driver_earnings')
        .select(`
          id, order_id, delivery_fee, distance_km, status,
          orders (
            id, order_number, status, total_amount, delivery_address, 
            delivery_distance_km, delivery_fee,
            customers (name, phone)
          )
        `)
        .eq('driver_id', selectedPayout.driver_id)
        .eq('status', 'requested');

      if (earningsError) throw earningsError;

      // Get delivery photos for these orders
      const orderIds = earnings?.map(e => e.order_id) || [];
      let photos: DeliveryPhoto[] = [];
      
      if (orderIds.length > 0) {
        const { data: photosData } = await supabase
          .from('delivery_photos')
          .select('*')
          .in('order_id', orderIds);
        photos = photosData || [];
      }

      // Map photos to earnings
      const earningsWithPhotos = earnings?.map(e => {
        const orderData = e.orders as any;
        return {
          id: e.id,
          order_id: e.order_id,
          delivery_fee: e.delivery_fee,
          distance_km: e.distance_km,
          status: e.status,
          order: orderData ? {
            id: orderData.id,
            order_number: orderData.order_number,
            status: orderData.status,
            total_amount: orderData.total_amount,
            delivery_address: orderData.delivery_address,
            delivery_distance_km: orderData.delivery_distance_km,
            delivery_fee: orderData.delivery_fee,
            customer: orderData.customers,
          } : null,
          photos: photos.filter(p => p.order_id === e.order_id),
        };
      }) || [];

      return earningsWithPhotos as EarningWithOrder[];
    },
    enabled: !!selectedPayout?.driver_id && selectedPayout.status === 'pending',
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['payout-stats'],
    queryFn: async () => {
      const { data: payoutData, error: payoutError } = await supabase
        .from('driver_payouts')
        .select('status, amount');
      if (payoutError) throw payoutError;

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
      proofUrl,
      rejectionReason: reason
    }: { 
      id: string; 
      status: string; 
      notes?: string; 
      proofUrl?: string;
      rejectionReason?: string;
    }) => {
      const payout = payouts.find(p => p.id === id);
      const updateData: any = {
        status,
        processed_at: new Date().toISOString(),
        processed_by: user?.id,
      };

      if (notes !== undefined) updateData.admin_notes = notes;
      if (proofUrl) updateData.payment_proof_url = proofUrl;
      if (reason) updateData.rejection_reason = reason;

      const { error } = await supabase
        .from('driver_payouts')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Log the action
      await logAdminAction({
        action: status === 'completed' ? 'complete' : status === 'approved' ? 'approve' : 'reject',
        entityType: 'payout',
        entityId: id,
        entityName: `₱${payout?.amount.toFixed(2)} - ${payout?.drivers?.name}`,
        oldValues: { status: payout?.status },
        newValues: { status, rejection_reason: reason },
        details: reason ? `Rejected: ${reason}` : notes || undefined,
      });

      // If completed, update related earnings to 'paid'
      if (status === 'completed' && payout) {
        await supabase
          .from('driver_earnings')
          .update({ status: 'paid' })
          .eq('driver_id', payout.driver_id)
          .eq('status', 'requested');
      }

      // If rejected, update related earnings back to 'available'
      if (status === 'rejected' && payout) {
        await supabase
          .from('driver_earnings')
          .update({ status: 'available' })
          .eq('driver_id', payout.driver_id)
          .eq('status', 'requested');
        
        // Notify driver about rejection
        await createDriverNotification({
          driverId: payout.driver_id,
          title: "Payout Request Rejected",
          message: `Your payout request for ₱${payout.amount.toFixed(2)} was rejected. ${reason || ''}`,
          type: "payout",
          metadata: { payout_amount: payout.amount },
          actionUrl: "/driver/earnings",
        });
        
        // Also notify admin
        await createAdminNotification({
          title: "❌ Payout Rejected",
          message: `Payout of ₱${payout.amount.toFixed(2)} for ${payout.drivers?.name} was rejected`,
          type: "driver",
          metadata: { 
            driver_name: payout.drivers?.name,
            payout_amount: payout.amount,
            payment_method: payout.payment_method
          },
          action_url: "/admin/payouts",
        });
      }

      // Notify driver about completed payout
      if (status === 'completed' && payout) {
        await createDriverNotification({
          driverId: payout.driver_id,
          title: "Payout Completed! 💰",
          message: `Your payout of ₱${payout.amount.toFixed(2)} has been processed.`,
          type: "payout",
          metadata: { payout_amount: payout.amount },
          actionUrl: "/driver/earnings",
        });
        
        // Also notify admin
        await createAdminNotification({
          title: "💰 Payout Completed",
          message: `Payout of ₱${payout.amount.toFixed(2)} for ${payout.drivers?.name} has been completed`,
          type: "driver",
          metadata: { 
            driver_name: payout.drivers?.name,
            payout_amount: payout.amount,
            payment_method: payout.payment_method
          },
          action_url: "/admin/payouts",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payout-stats'] });
      toast.success('Payout updated');
      setSelectedPayout(null);
      setRejectionDialogOpen(false);
      setRejectionReason('');
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

  const handleReject = () => {
    if (!selectedPayout || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    updatePayoutMutation.mutate({
      id: selectedPayout.id,
      status: 'rejected',
      notes: adminNotes,
      rejectionReason: rejectionReason.trim(),
    });
  };

  const filteredPayouts = payouts.filter(
    (payout) =>
      payout.drivers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      payout.drivers?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Driver Payouts</h1>
          <p className="text-muted-foreground mt-1">Manage driver payout requests</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-8 w-8"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
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
        <SheetContent className="w-full sm:max-w-2xl p-0">
          {selectedPayout && (
            <ScrollArea className="h-full">
              <div className="p-6">
                <SheetHeader>
                  <SheetTitle className="flex items-center justify-between">
                    <span>Payout Request</span>
                    <Badge variant="outline" className={statusColors[selectedPayout.status]}>
                      {selectedPayout.status}
                    </Badge>
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Amount */}
                  <div className="text-center py-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-3xl font-bold">₱{selectedPayout.amount.toFixed(2)}</p>
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

                  {/* Orders Included - Only show for pending payouts */}
                  {selectedPayout.status === 'pending' && (
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Orders Included ({payoutDetails?.length || 0})
                      </h4>
                      {detailsLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : payoutDetails && payoutDetails.length > 0 ? (
                        <div className="space-y-3">
                          {payoutDetails.map((earning) => (
                            <div key={earning.id} className="border rounded-lg p-4 space-y-3">
                              {/* Order Header */}
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{earning.order?.order_number || 'Order'}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {earning.order?.status}
                                  </Badge>
                                </div>
                                <p className="font-bold text-green-600">₱{earning.delivery_fee.toFixed(2)}</p>
                              </div>

                              {/* Customer & Address */}
                              {earning.order && (
                                <div className="text-sm space-y-1">
                                  <div className="flex items-start gap-2">
                                    <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium">{earning.order.customer?.name}</p>
                                      {earning.order.customer?.phone && (
                                        <p className="text-muted-foreground flex items-center gap-1">
                                          <Phone className="h-3 w-3" />
                                          {earning.order.customer.phone}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {earning.order.delivery_address && (
                                    <div className="flex items-start gap-2">
                                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                      <p className="text-muted-foreground">{earning.order.delivery_address}</p>
                                    </div>
                                  )}
                                  <div className="flex gap-4 text-muted-foreground">
                                    <span>Distance: {earning.distance_km?.toFixed(1) || '—'} km</span>
                                    <span>Order Total: ₱{earning.order.total_amount?.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}

                              {/* Delivery Photos */}
                              {earning.photos && earning.photos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                    <Camera className="h-3 w-3" />
                                    Delivery Photos
                                  </p>
                                  <div className="flex gap-2">
                                    {earning.photos.map((photo) => (
                                      <a
                                        key={photo.id}
                                        href={photo.image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        <div className="relative">
                                          <img
                                            src={photo.image_url}
                                            alt={photo.photo_type}
                                            className="w-24 h-24 object-cover rounded-lg border hover:opacity-90"
                                          />
                                          <Badge 
                                            variant="secondary" 
                                            className="absolute bottom-1 left-1 text-[10px] capitalize"
                                          >
                                            {photo.photo_type}
                                          </Badge>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(!earning.photos || earning.photos.length === 0) && (
                                <p className="text-xs text-orange-600 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  No delivery photos uploaded
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No orders attached to this payout request</p>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Timestamps */}
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Requested: {format(new Date(selectedPayout.requested_at), 'PPp')}</p>
                    {selectedPayout.processed_at && (
                      <p>Processed: {format(new Date(selectedPayout.processed_at), 'PPp')}</p>
                    )}
                  </div>

                  {/* Payment Proof (for completed) */}
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

                  {/* Rejection Reason (for rejected) */}
                  {selectedPayout.status === 'rejected' && selectedPayout.rejection_reason && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-600 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Rejection Reason
                      </h4>
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-400">
                          {selectedPayout.rejection_reason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Admin Notes */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Admin Notes (Internal)</h4>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add internal notes..."
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

                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => setRejectionDialogOpen(true)}
                        disabled={updatePayoutMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Reject Payout Request
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payout. The driver will see this reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason (required)..."
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Examples: Missing delivery photos, Order not yet delivered, Invalid payment details
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason.trim() || updatePayoutMutation.isPending}
            >
              {updatePayoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
