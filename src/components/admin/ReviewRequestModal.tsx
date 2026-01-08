import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Loader2, Star, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { sendEmailNotification } from '@/hooks/useEmailNotifications';
import { sendSmsNotification } from '@/hooks/useSmsNotifications';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { format } from 'date-fns';

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
}

interface ReviewRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string | null;
    total_amount: number | null;
    last_review_requested_at?: string | null;
    customers: {
      name: string;
      email: string | null;
      phone: string | null;
    } | null;
  };
  orderItems: OrderItem[];
  onSuccess: () => void;
}

const GOOGLE_REVIEW_URL = 'https://g.page/r/CX7_36IAlM8XEBM/review';

export function ReviewRequestModal({ 
  open, 
  onOpenChange, 
  order, 
  orderItems,
  onSuccess 
}: ReviewRequestModalProps) {
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const hasEmail = !!order.customers?.email;
  const hasPhone = !!order.customers?.phone;
  const wasRequested = !!order.last_review_requested_at;

  const handleSend = async () => {
    if (!sendEmail && !sendSms) {
      toast.error('Please select at least one method');
      return;
    }

    setIsSending(true);
    const results: { email?: boolean; sms?: boolean } = {};

    try {
      // Send Email
      if (sendEmail && hasEmail) {
        const emailResult = await sendEmailNotification({
          type: 'review_request' as any, // This type will be handled by edge function
          recipientEmail: order.customers!.email!,
          orderId: order.id,
          orderNumber: order.order_number || '',
          customerName: order.customers!.name,
          totalAmount: order.total_amount || 0,
          orderItems: orderItems.map(item => ({
            name: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total || item.quantity * item.unit_price,
          })),
        });
        results.email = emailResult.success;
      }

      // Send SMS (under 140 chars)
      if (sendSms && hasPhone) {
        const smsResult = await sendSmsNotification({
          type: 'review_request' as any,
          recipientPhone: order.customers!.phone!,
          orderNumber: order.order_number || '',
          customerName: order.customers!.name,
        });
        results.sms = smsResult.success;
      }

      // Update order with review requested timestamp
      await supabase
        .from('orders')
        .update({ last_review_requested_at: new Date().toISOString() })
        .eq('id', order.id);

      // Log the action
      await logAdminAction({
        action: 'review_request_sent',
        entityType: 'order',
        entityId: order.id,
        entityName: order.order_number || undefined,
        newValues: {
          email_sent: results.email,
          sms_sent: results.sms,
          customer_name: order.customers?.name,
        },
        details: `Review request sent via ${[
          results.email && 'email',
          results.sms && 'SMS'
        ].filter(Boolean).join(' and ')}`,
      });

      // Show success message
      const successMethods = [];
      if (results.email) successMethods.push('email');
      if (results.sms) successMethods.push('SMS');
      
      if (successMethods.length > 0) {
        toast.success(`Review request sent via ${successMethods.join(' and ')}!`);
      } else {
        toast.error('Failed to send review request');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Review request error:', error);
      toast.error('Failed to send review request');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            Request Customer Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-medium">{order.customers?.name}</p>
            <p className="text-sm text-muted-foreground">Order #{order.order_number}</p>
            {wasRequested && (
              <Badge variant="outline" className="mt-2 text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                Previously requested on {format(new Date(order.last_review_requested_at!), 'MMM d, h:mm a')}
              </Badge>
            )}
          </div>

          {/* Order Items Preview */}
          <div className="text-sm">
            <p className="text-muted-foreground mb-1">Order summary:</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {orderItems.slice(0, 3).map((item, idx) => (
                <li key={idx}>• {item.quantity}x {item.product_name}</li>
              ))}
              {orderItems.length > 3 && (
                <li className="text-muted-foreground/70">... and {orderItems.length - 3} more items</li>
              )}
            </ul>
          </div>

          {/* Channel Selection */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Send review request via:</p>
            
            <div 
              className={`flex items-center space-x-3 p-3 rounded-lg border ${
                hasEmail ? 'bg-card' : 'bg-muted/50 opacity-60'
              }`}
            >
              <Checkbox 
                id="email" 
                checked={sendEmail && hasEmail}
                onCheckedChange={(checked) => setSendEmail(!!checked)}
                disabled={!hasEmail}
              />
              <Label 
                htmlFor="email" 
                className="flex items-center gap-2 cursor-pointer flex-1"
              >
                <Mail className="h-4 w-4 text-blue-500" />
                <div>
                  <span>Email</span>
                  {hasEmail ? (
                    <p className="text-xs text-muted-foreground">{order.customers?.email}</p>
                  ) : (
                    <p className="text-xs text-red-500">No email provided</p>
                  )}
                </div>
              </Label>
              {hasEmail && sendEmail && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>

            <div 
              className={`flex items-center space-x-3 p-3 rounded-lg border ${
                hasPhone ? 'bg-card' : 'bg-muted/50 opacity-60'
              }`}
            >
              <Checkbox 
                id="sms" 
                checked={sendSms && hasPhone}
                onCheckedChange={(checked) => setSendSms(!!checked)}
                disabled={!hasPhone}
              />
              <Label 
                htmlFor="sms" 
                className="flex items-center gap-2 cursor-pointer flex-1"
              >
                <MessageSquare className="h-4 w-4 text-green-500" />
                <div>
                  <span>SMS</span>
                  {hasPhone ? (
                    <p className="text-xs text-muted-foreground">{order.customers?.phone}</p>
                  ) : (
                    <p className="text-xs text-red-500">No phone provided</p>
                  )}
                </div>
              </Label>
              {hasPhone && sendSms && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
            <p className="font-medium mb-1">Customer will receive:</p>
            <p>• Thank you message with order recap</p>
            <p>• Link to review on Google Business</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend}
            disabled={isSending || (!sendEmail && !sendSms) || (!hasEmail && sendEmail) || (!hasPhone && sendSms)}
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : wasRequested ? (
              <>
                <Star className="h-4 w-4" />
                Resend Request
              </>
            ) : (
              <>
                <Star className="h-4 w-4" />
                Send Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
