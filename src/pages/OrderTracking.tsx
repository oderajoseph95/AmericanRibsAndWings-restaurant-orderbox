import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  CheckCircle, 
  Clock, 
  ArrowRight, 
  Home, 
  MapPin, 
  Phone, 
  Calendar,
  Copy,
  Share2,
  Loader2,
  Package,
  Truck,
  ChefHat,
  CircleDot,
  XCircle,
  User
} from "lucide-react";
import { format } from "date-fns";
import type { Tables, Enums } from "@/integrations/supabase/types";

// Types for the secure RPC response
interface OrderTrackingCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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
    label: 'Rejected', 
    icon: XCircle, 
    color: 'text-red-600',
    description: 'Order was rejected'
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

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [trackingData, setTrackingData] = useState<OrderTrackingResponse | null>(null);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Fetch order data using secure RPC function
  const { data: orderData, isLoading, error } = useQuery({
    queryKey: ['order-tracking', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID');
      const { data, error } = await supabase.rpc('get_order_tracking', {
        p_order_id: orderId
      });
      if (error) throw error;
      return data as unknown as OrderTrackingResponse;
    },
    enabled: !!orderId,
  });

  // Update local tracking data when query data changes
  useEffect(() => {
    if (orderData) {
      setTrackingData(orderData);
    }
  }, [orderData]);

  // Subscribe to realtime updates
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
        (payload) => {
          // Refetch the tracking data to get proper masked/unmasked data
          setTrackingData(prev => {
            if (!prev) return null;
            return {
              ...prev,
              order: { ...prev.order, status: payload.new.status as Enums<'order_status'> }
            };
          });
          toast.success(`Order status updated to ${statusConfig[payload.new.status as Enums<'order_status'>]?.label || payload.new.status}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard!');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Order ${trackingData?.order?.order_number}`,
          text: 'Track my order from American Ribs & Wings',
          url: window.location.href,
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const order = trackingData?.order;
  const orderItems = trackingData?.items || [];

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Order Not Found</h1>
            <p className="text-muted-foreground mb-6">
              We couldn't find this order. Please check the link and try again.
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Order Tracking</h1>
            <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleCopyLink}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Order Number & Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground mb-1">Order Number</p>
              <p className="text-2xl font-bold text-primary">{order.order_number}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Placed {order.created_at && format(new Date(order.created_at), 'PPp')}
              </p>
            </div>

            {/* Current Status */}
            <div className={`flex items-center justify-center gap-3 p-4 rounded-lg bg-muted ${statusInfo.color}`}>
              <StatusIcon className="h-6 w-6" />
              <div>
                <p className="font-semibold">{statusInfo.label}</p>
                <p className="text-sm opacity-80">{statusInfo.description}</p>
              </div>
            </div>
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
                      <div className={`
                        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                        ${isCompleted ? 'bg-green-100 text-green-600' : ''}
                        ${isCurrent ? 'bg-primary text-primary-foreground' : ''}
                        ${isPending ? 'bg-muted text-muted-foreground' : ''}
                      `}>
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : isCurrent ? (
                          <CircleDot className="h-4 w-4 animate-pulse" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 pb-4 border-b border-border last:border-0 last:pb-0">
                        <p className={`font-medium ${isPending ? 'text-muted-foreground' : ''}`}>
                          {config.label}
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

        {/* Delivery/Pickup Details */}
        {order.order_type === 'delivery' && order.delivery_address && (
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
              {order.delivery_fee && (
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
                          - {flavor.flavor_name} {flavor.quantity > 1 && `(${flavor.quantity}x)`}
                        </span>
                        {flavor.surcharge_applied > 0 && (
                          <span>+₱{(flavor.surcharge_applied * flavor.quantity).toFixed(2)}</span>
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

        {/* Save to Account Prompt - Only show for owners who have email visible */}
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
      </div>
    </div>
  );
}