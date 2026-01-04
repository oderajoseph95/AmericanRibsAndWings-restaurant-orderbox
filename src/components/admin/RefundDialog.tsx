import { useState, useRef, ChangeEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload, Image } from 'lucide-react';
import { logAdminAction } from '@/lib/adminLogger';

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string | null;
  orderTotal: number;
  newStatus: 'cancelled' | 'rejected';
  onSuccess: () => void;
}

export function RefundDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  orderTotal,
  newStatus,
  onSuccess,
}: RefundDialogProps) {
  const [refundAmount, setRefundAmount] = useState(orderTotal.toString());
  const [refundReason, setRefundReason] = useState('');
  const [isRefunded, setIsRefunded] = useState(false);
  const [refundProofUrl, setRefundProofUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `refunds/${orderId}/proof-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('driver-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('driver-photos')
        .getPublicUrl(fileName);

      setRefundProofUrl(publicUrl);
      toast.success('Refund proof uploaded');
    } catch (error: any) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!refundReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const updateData: Record<string, unknown> = {
        status: newStatus,
        refund_reason: refundReason.trim(),
        refund_amount: isRefunded ? parseFloat(refundAmount) || 0 : 0,
        is_refunded: isRefunded,
        refund_proof_url: isRefunded ? refundProofUrl : null,
        refunded_at: isRefunded ? new Date().toISOString() : null,
        refunded_by: isRefunded ? userId : null,
      };

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      await logAdminAction({
        action: 'status_change',
        entityType: 'order',
        entityId: orderId,
        entityName: orderNumber || undefined,
        newValues: { 
          status: newStatus, 
          refund_amount: isRefunded ? parseFloat(refundAmount) : 0,
          is_refunded: isRefunded 
        },
        details: isRefunded 
          ? `Order ${newStatus} with refund of ₱${parseFloat(refundAmount).toFixed(2)}. Reason: ${refundReason}`
          : `Order ${newStatus}. Reason: ${refundReason}`,
      });

      toast.success(`Order ${newStatus}${isRefunded ? ' and refund recorded' : ''}`);
      onSuccess();
      onOpenChange(false);
      
      // Reset form
      setRefundAmount(orderTotal.toString());
      setRefundReason('');
      setIsRefunded(false);
      setRefundProofUrl(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {newStatus === 'cancelled' ? 'Cancel Order' : 'Reject Order'}
          </DialogTitle>
          <DialogDescription>
            {orderNumber ? `Order ${orderNumber}` : 'Order'} - ₱{orderTotal.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Enter reason for cancellation/rejection..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="isRefunded"
              checked={isRefunded}
              onCheckedChange={(checked) => setIsRefunded(checked === true)}
            />
            <Label htmlFor="isRefunded" className="cursor-pointer">
              Refund has been processed
            </Label>
          </div>

          {isRefunded && (
            <>
              <div className="space-y-2">
                <Label htmlFor="refundAmount">Refund Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                  <Input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Refund Proof (optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Screenshot
                  </Button>
                  {refundProofUrl && (
                    <a
                      href={refundProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Image className="h-4 w-4" />
                      View
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={newStatus === 'cancelled' ? 'default' : 'destructive'}
            onClick={handleSubmit}
            disabled={isSubmitting || !refundReason.trim()}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {newStatus === 'cancelled' ? 'Cancel Order' : 'Reject Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
