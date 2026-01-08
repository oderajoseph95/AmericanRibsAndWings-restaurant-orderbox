import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  CheckCircle2, 
  CheckCircle,
  Package, 
  Truck, 
  MapPin, 
  Clock, 
  Loader2,
  Copy,
  Share2,
  ArrowRight,
  Home,
  Phone,
  Calendar,
  ChefHat,
  CircleDot,
  XCircle,
  User,
  RefreshCw,
  Bike,
  Timer,
  PackageCheck,
  CookingPot,
  Camera
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { SEOHead } from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import type { Enums } from "@/integrations/supabase/types";
import { CustomerNotificationPrompt } from "@/components/customer/CustomerNotificationPrompt";
import { useVisitorPresence } from "@/hooks/useVisitorPresence";

// Types for the secure RPC response
interface OrderTrackingCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface OrderTrackingDriver {
  id: string;
  name: string;
  phone: string;
  profile_photo_url: string | null;
}

interface OrderTrackingOrder {
  id: string;
  order_number: string | null;
  status: Enums<'order_status'> | null;
  order_type: Enums<'order_type'> | null;
  created_at: string | null;
  updated_at: string | null;
  status_changed_at: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  pickup_date: string | null;
  pickup_time: string | null;
  delivery_address: string | null;
  delivery_distance_km: number | null;
  driver_id: string | null;
  customer: OrderTrackingCustomer | null;
}

interface OrderTrackingItemFlavor {
  flavor_name: string;
  quantity: number;
  surcharge_applied: number;
}

interface OrderTrackingItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  flavors: OrderTrackingItemFlavor[] | null;
}

interface OrderTrackingResponse {
  order: OrderTrackingOrder;
  items: OrderTrackingItem[];
  driver: OrderTrackingDriver | null;
  is_owner: boolean;
  is_admin: boolean;
}

const RESTAURANT_INFO = {
  address: "Purok 1 Ground Floor, Hony Arcade, Floridablanca, 2006 Pampanga, Philippines",
  phone: "+63 976 207 4276",
};

const statusConfig: Record<Enums<'order_status'>, { 
  label: string; 
  icon: typeof Clock; 
  color: string;
  description: string;
}> = {
  pending: { 
    label: 'Order Placed', 
    icon: Clock, 
    color: 'text-yellow-600',
    description: 'Your order has been received'
  },
  for_verification: { 
    label: 'Verifying Payment', 
    icon: Clock, 
    color: 'text-blue-600',
    description: 'We are verifying your payment'
  },
  approved: { 
    label: 'Payment Verified', 
    icon: CheckCircle, 
    color: 'text-green-600',
    description: 'Payment confirmed, preparing to cook'
  },
  preparing: { 
    label: 'Preparing', 
    icon: ChefHat, 
    color: 'text-orange-600',
    description: 'Your order is being prepared'
  },
  ready_for_pickup: { 
    label: 'Ready for Pickup', 
    icon: Package, 
    color: 'text-emerald-600',
    description: 'Your order is ready! Come pick it up'
  },
  waiting_for_rider: { 
    label: 'Waiting for Rider', 
    icon: Clock, 
    color: 'text-purple-600',
    description: 'Waiting for delivery rider'
  },
  picked_up: { 
    label: 'Picked Up by Rider', 
    icon: Truck, 
    color: 'text-indigo-600',
    description: 'Rider has your order'
  },
  in_transit: { 
    label: 'On the Way', 
    icon: Truck, 
    color: 'text-blue-600',
    description: 'Your order is on its way to you'
  },
  delivered: { 
    label: 'Delivered', 
    icon: CheckCircle, 
    color: 'text-green-600',
    description: 'Order has been delivered'
  },
  completed: { 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'text-emerald-600',
    description: 'Order completed successfully'
  },
  rejected: { 
    label: 'Returned to Restaurant', 
    icon: XCircle, 
    color: 'text-red-600',
    description: 'Order was returned to the restaurant'
  },
  cancelled: { 
    label: 'Cancelled', 
    icon: XCircle, 
    color: 'text-gray-600',
    description: 'Order was cancelled'
  },
};

// Define status flow for timeline
const pickupFlow: Enums<'order_status'>[] = ['pending', 'for_verification', 'approved', 'preparing', 'ready_for_pickup', 'completed'];
const deliveryFlow: Enums<'order_status'>[] = ['pending', 'for_verification', 'approved', 'preparing', 'waiting_for_rider', 'picked_up', 'in_transit', 'delivered', 'completed'];

export default function ThankYou() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  useVisitorPresence("/thank-you");
  const [trackingData, setTrackingData] = useState<OrderTrackingResponse | null>(null);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [showStatusFlash, setShowStatusFlash] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get actual order UUID from tracking data (orderId from URL is order_number, not UUID)
  const actualOrderId = trackingData?.order?.id;

  // Fetch delivery photos for the order using actual UUID
  const { data: deliveryPhotos = [] } = useQuery({
    queryKey: ['delivery-photos', actualOrderId],
    queryFn: async () => {
      if (!actualOrderId) return [];
      const { data, error } = await supabase
        .from('delivery_photos')
        .select('*')
        .eq('order_id', actualOrderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Tables<'delivery_photos'>[];
    },
    enabled: !!actualOrderId,
  });

  // Fetch order data using secure RPC function with polling fallback
  const { data: orderData, isLoading, error, refetch } = useQuery({
    queryKey: ['order-tracking', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID');
      const { data, error } = await supabase.rpc('get_order_tracking', {
        p_order_id: orderId
      });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as unknown as OrderTrackingResponse;
    },
    enabled: !!orderId,
    refetchInterval: 30000, // Poll every 30 seconds as fallback
    refetchIntervalInBackground: false,
  });

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Status updated!');
    } catch (err) {
      toast.error('Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Update local tracking data when query data changes
  useEffect(() => {
    if (orderData) {
      setTrackingData(orderData);
    }
  }, [orderData]);

  // Get search params for checkout source detection
  const [searchParams] = useSearchParams();

  // Fire Meta Pixel Purchase ONLY once per order AND only from checkout redirect
  useEffect(() => {
    if (trackingData?.order && trackingData.order.total_amount && typeof window !== 'undefined') {
      const orderIdForPixel = trackingData.order.id;
      const source = searchParams.get('source');
      const pixelKey = `purchase_fired_${orderIdForPixel}`;
      
      // STRICT CONDITIONS - must meet BOTH:
      // 1. Must have ?source=checkout in URL (proves this is a checkout redirect)
      // 2. Must not have fired already for this order (localStorage backup)
      const isFromCheckout = source === 'checkout';
      const alreadyFired = localStorage.getItem(pixelKey) === 'true';
      
      if (isFromCheckout && !alreadyFired) {
        const fbq = (window as any).fbq;
        if (typeof fbq === 'function') {
          fbq('track', 'Purchase', {
            currency: 'PHP',
            value: trackingData.order.total_amount,
            content_type: 'product',
            content_ids: trackingData.items?.map(item => item.id) || [],
            num_items: trackingData.items?.reduce((sum, item) => sum + item.quantity, 0) || 1,
          });
          console.log('Meta Pixel Purchase fired:', { orderId: orderIdForPixel, value: trackingData.order.total_amount });
          
          // Mark as fired in localStorage
          localStorage.setItem(pixelKey, 'true');
        }
        
        // Clean up URL immediately - remove ?source=checkout
        window.history.replaceState({}, document.title, `/thank-you/${orderIdForPixel}`);
      } else {
        console.log('Meta Pixel Purchase skipped:', { isFromCheckout, alreadyFired, orderId: orderIdForPixel });
        
        // Also clean URL if source param exists but was blocked
        if (source) {
          window.history.replaceState({}, document.title, `/thank-you/${orderIdForPixel}`);
        }
      }
    }
  }, [trackingData, searchParams]);

  // Subscribe to realtime updates with LIVE indicator
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        async (payload) => {
          console.log('Real-time update received:', payload);
          // Show flash animation
          setShowStatusFlash(true);
          setTimeout(() => setShowStatusFlash(false), 1000);
          
          // Refetch full tracking data to get driver info, proper masked/unmasked data
          try {
            const { data, error } = await supabase.rpc('get_order_tracking', {
              p_order_id: orderId
            });
            if (!error && data) {
              setTrackingData(data as unknown as OrderTrackingResponse);
              const newStatus = (data as any).order?.status;
              if (newStatus) {
                toast.success(`Order updated: ${statusConfig[newStatus as Enums<'order_status'>]?.label || newStatus}`, {
                  icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
                  duration: 5000,
                });
              }
            }
          } catch (err) {
            console.error('Failed to refetch tracking data:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setIsLiveConnected(true);
        } else {
          setIsLiveConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const getShareUrl = () => {
    return `${window.location.origin}/thank-you/${orderId}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    toast.success('Link copied to clipboard!');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Order ${trackingData?.order?.order_number}`,
          text: 'Track my order from American Ribs & Wings',
          url: getShareUrl(),
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCreateAccount = async () => {
    const customerEmail = trackingData?.order?.customer?.email;
    if (!customerEmail || !password) {
      toast.error('Please enter a password');
      return;
    }

    setIsCreatingAccount(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: customerEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/my-orders`,
        },
      });

      if (error) throw error;

      // Link customer record to user
      const { data: { user } } = await supabase.auth.getUser();
      if (user && trackingData?.order?.customer) {
        await supabase.rpc('link_customer_to_user', {
          p_user_id: user.id,
          p_email: customerEmail,
          p_phone: trackingData.order.customer.phone,
        });
      }

      toast.success('Account created! Check your email to verify.');
      setShowAccountPrompt(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const order = trackingData?.order;
  const orderItems = trackingData?.items || [];

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">
              We couldn't find this order. Please check the URL or contact support.
            </p>
            <Button asChild>
              <Link to="/order">
                <ArrowRight className="h-4 w-4 mr-2" />
                Place a New Order
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStatus = order.status || 'pending';
  const statusInfo = statusConfig[currentStatus];
  const StatusIcon = statusInfo.icon;
  const statusFlow = order.order_type === 'delivery' ? deliveryFlow : pickupFlow;
  const currentStatusIndex = statusFlow.indexOf(currentStatus);
  const isTerminal = ['completed', 'rejected', 'cancelled'].includes(currentStatus);
  const isDelivery = order.order_type === 'delivery';

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background">
      <SEOHead 
        pagePath={`/thank-you/${orderId}`}
        fallbackTitle={`Order ${order?.order_number || ''} | American Ribs & Wings`}
        fallbackDescription="Track your order status in real-time at American Ribs & Wings Floridablanca."
      />
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
        <div className="container px-4 h-16 flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-bold text-lg">Order Tracking</h1>
              <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
            </div>
            {/* Live indicator */}
            {isLiveConnected && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs flex items-center gap-1.5 animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                LIVE
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="icon" onClick={handleCopyLink}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Customer Notification Prompt */}
        <CustomerNotificationPrompt customerPhone={order?.customer?.phone} />

        {/* Success Header - Only show on first visit (recent orders) */}
        {['pending', 'for_verification'].includes(currentStatus) && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Thank You!</h1>
            <p className="text-muted-foreground">
              Your order has been successfully placed
            </p>
          </div>
        )}

        {/* Order Number & Current Status */}
        <Card className={`transition-all duration-300 ${showStatusFlash ? 'ring-2 ring-green-500 bg-green-50/50 dark:bg-green-950/20' : ''}`}>
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground mb-1">Order Number</p>
              <p className="text-2xl font-bold text-primary font-mono">{order.order_number}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Placed {order.created_at && format(new Date(order.created_at), 'PPp')}
              </p>
            </div>

            {/* Current Status Badge with Animation */}
            <div className={`relative overflow-hidden flex items-center justify-center gap-3 p-4 rounded-lg bg-muted transition-all duration-300 ${statusInfo.color} ${showStatusFlash ? 'scale-105' : ''}`}>
              {/* Animated glow ring for current status */}
              <div className="absolute inset-0 rounded-lg animate-status-pulse opacity-30" style={{ background: `linear-gradient(135deg, currentColor, transparent)` }} />
              
              <div className={`relative z-10 p-2 rounded-full bg-current/10 ${
                currentStatus === 'preparing' ? 'animate-cooking' :
                currentStatus === 'in_transit' ? 'animate-bike-ride' :
                ['pending', 'for_verification', 'waiting_for_rider'].includes(currentStatus) ? 'animate-bounce-subtle' :
                ''
              }`}>
                {currentStatus === 'in_transit' ? (
                  <Bike className="h-6 w-6" />
                ) : currentStatus === 'preparing' ? (
                  <CookingPot className="h-6 w-6" />
                ) : (
                  <StatusIcon className="h-6 w-6" />
                )}
              </div>
              <div className="relative z-10">
                <p className="font-semibold">{statusInfo.label}</p>
                <p className="text-sm opacity-80">{statusInfo.description}</p>
              </div>
            </div>

            {/* Delivery Animation Track - Show for in_transit */}
            {currentStatus === 'in_transit' && isDelivery && (
              <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border border-blue-200/50 dark:border-blue-800/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Package className="h-4 w-4" />
                    <span className="text-xs font-medium">Restaurant</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <span className="text-xs font-medium">Your Location</span>
                    <MapPin className="h-4 w-4" />
                  </div>
                </div>
                <div className="relative h-8 bg-muted/50 rounded-full overflow-hidden">
                  {/* Road dashes */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-gradient-to-r from-border via-muted-foreground/30 to-border animate-road-move" 
                         style={{ backgroundSize: '20px 2px', backgroundRepeat: 'repeat-x' }} />
                  </div>
                  {/* Animated biker */}
                  <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2">
                    <div className="animate-bike-ride bg-primary text-primary-foreground p-1.5 rounded-full shadow-lg">
                      <Bike className="h-4 w-4" />
                    </div>
                  </div>
                  {/* Start point */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full" />
                  {/* End point */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                </div>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  🏍️ Your rider is on the way!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Timeline */}
        {!isTerminal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {statusFlow.map((status, index) => {
                  const config = statusConfig[status];
                  const Icon = config.icon;
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const isPending = index > currentStatusIndex;

                  return (
                    <div key={status} className="flex items-start gap-4">
                      <div className="relative">
                        {/* Glow ring for current status */}
                        {isCurrent && (
                          <div className="absolute inset-0 w-8 h-8 rounded-full bg-primary/30 animate-ping" />
                        )}
                        <div className={cn(
                          "relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
                          isCompleted && "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
                          isCurrent && "bg-primary text-primary-foreground shadow-lg animate-status-glow",
                          isPending && "bg-muted text-muted-foreground"
                        )}>
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : isCurrent ? (
                            status === 'in_transit' ? (
                              <Bike className="h-4 w-4 animate-bike-ride" />
                            ) : status === 'preparing' ? (
                              <CookingPot className="h-4 w-4 animate-cooking" />
                            ) : status === 'waiting_for_rider' ? (
                              <Timer className="h-4 w-4 animate-bounce-subtle" />
                            ) : (
                              <CircleDot className="h-4 w-4 animate-pulse" />
                            )
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                      <div className={cn(
                        "flex-1 pb-4 border-b border-border last:border-0 last:pb-0",
                        isCurrent && "relative"
                      )}>
                        <p className={cn(
                          "font-medium transition-all",
                          isPending && "text-muted-foreground",
                          isCurrent && "text-primary font-semibold"
                        )}>
                          {config.label}
                          {isCurrent && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                              Current
                            </span>
                          )}
                        </p>
                        {(isCompleted || isCurrent) && (
                          <p className="text-sm text-muted-foreground">
                            {config.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delivery Details */}
        {isDelivery && order.delivery_address && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Delivery Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <p className="text-sm">{order.delivery_address}</p>
              </div>
              {order.delivery_fee && order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className="font-medium">₱{order.delivery_fee.toFixed(2)}</span>
                </div>
              )}
              {order.delivery_distance_km && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Distance</span>
                  <span className="font-medium">{order.delivery_distance_km.toFixed(1)} km</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Driver Info */}
        {trackingData?.driver && isDelivery && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Your Driver
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20">
                  {trackingData.driver.profile_photo_url ? (
                    <img 
                      src={trackingData.driver.profile_photo_url} 
                      alt={trackingData.driver.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{trackingData.driver.name}</p>
                  <a 
                    href={`tel:${trackingData.driver.phone}`}
                    className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline mt-1"
                  >
                    <Phone className="h-4 w-4" />
                    {trackingData.driver.phone}
                  </a>
                </div>
              </div>
              {currentStatus === 'in_transit' && (
                <div className="mt-4 p-3 bg-primary/10 rounded-lg text-center">
                  <p className="text-sm font-medium text-primary">
                    🚗 Your order is on its way!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Order Photos - Show pickup and delivery proof photos for ALL order types */}
        {deliveryPhotos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Order Photos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {deliveryPhotos.map((photo) => (
                  <div key={photo.id} className="space-y-2">
                    <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
                      <img
                        src={photo.image_url}
                        alt={photo.photo_type === 'pickup' ? 'Pickup Photo' : 'Delivery Photo'}
                        className="w-full h-full object-cover"
                      />
                      <Badge 
                        className={cn(
                          "absolute top-2 left-2",
                          photo.photo_type === 'pickup' 
                            ? "bg-blue-500/90 text-white" 
                            : "bg-green-500/90 text-white"
                        )}
                      >
                        {photo.photo_type === 'pickup' 
                          ? (isDelivery ? 'Picked Up' : 'Ready') 
                          : 'Delivered'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {photo.taken_at ? format(new Date(photo.taken_at), 'PPp') : 
                       photo.created_at ? format(new Date(photo.created_at), 'PPp') : ''}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pickup Notice Banner */}
        {order.order_type === 'pickup' && (
          <Card className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    PLEASE SHOW THIS PAGE TO THE CASHIER
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Present this screen at the restaurant for pickup
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pickup Details */}
        {order.order_type === 'pickup' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Pickup Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.pickup_date && order.pickup_time && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {order.pickup_date} at {order.pickup_time}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <p className="text-sm">{RESTAURANT_INFO.address}</p>
              </div>
              <a 
                href={`tel:${RESTAURANT_INFO.phone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
              >
                <Phone className="h-4 w-4" />
                {RESTAURANT_INFO.phone}
              </a>
              
              {/* Map Embed */}
              <div className="mt-4 rounded-lg overflow-hidden border">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3854.3639837208784!2d120.52905357511342!3d14.972486785559141!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33965f8959158815%3A0x17cf9400a2dfff7e!2sAmerican%20Ribs%20And%20Wings%20-%20Floridablanca!5e0!3m2!1sen!2sph!4v1767465076316!5m2!1sen!2sph"
                  width="100%"
                  height="200"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Pickup Location"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderItems.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {item.quantity}x {item.product_name}
                  </span>
                  <span>₱{item.line_total?.toFixed(2)}</span>
                </div>
                {item.flavors && item.flavors.length > 0 && (
                  <div className="ml-4 text-sm text-muted-foreground space-y-0.5">
                    {item.flavors.map((flavor, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          - {flavor.flavor_name} {flavor.surcharge_applied > 0 ? `(Special flavor for ${flavor.quantity} wings)` : `(Free flavor for ${flavor.quantity} wings)`}
                        </span>
                        {flavor.surcharge_applied > 0 && (
                          <span>+₱{flavor.surcharge_applied.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₱{order.subtotal?.toFixed(2)}</span>
              </div>
              {order.delivery_fee && order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>₱{order.delivery_fee.toFixed(2)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>₱{order.total_amount?.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Info - Only show for owners/admins */}
        {order.customer && (trackingData?.is_owner || trackingData?.is_admin) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Name:</span> {order.customer.name}</p>
              {order.customer.phone && (
                <p><span className="text-muted-foreground">Phone:</span> {order.customer.phone}</p>
              )}
              {order.customer.email && (
                <p><span className="text-muted-foreground">Email:</span> {order.customer.email}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Security Notice for public viewers */}
        {!trackingData?.is_owner && !trackingData?.is_admin && (
          <Card className="border-muted bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center text-sm text-muted-foreground">
                <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-600" />
                <p>Your personal information is protected.</p>
                <p className="text-xs mt-1">Log in to see full order details.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save to Account Prompt */}
        {trackingData?.is_owner && order.customer?.email && !showAccountPrompt && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="text-center">
                <h3 className="font-semibold mb-2">Save Your Order History</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create an account to track all your orders and checkout faster next time.
                </p>
                <Button onClick={() => setShowAccountPrompt(true)}>
                  Create Account
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showAccountPrompt && trackingData?.is_owner && order.customer?.email && (
          <Card className="border-primary">
            <CardContent className="pt-6 space-y-4">
              <div className="text-center">
                <h3 className="font-semibold mb-1">Create Your Account</h3>
                <p className="text-sm text-muted-foreground">
                  Using: {order.customer.email}
                </p>
              </div>
              <Input
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowAccountPrompt(false)}
                >
                  Maybe Later
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleCreateAccount}
                  disabled={isCreatingAccount || !password}
                >
                  {isCreatingAccount ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3 pb-6">
          <Button className="w-full" size="lg" asChild>
            <Link to="/order">
              <ArrowRight className="h-4 w-4 mr-2" />
              Place Another Order
            </Link>
          </Button>
          <Button variant="outline" className="w-full" size="lg" asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-sm text-muted-foreground pb-4">
          Bookmark this page to track your order status updates in real-time.
        </p>
      </div>
    </div>
  );
}
