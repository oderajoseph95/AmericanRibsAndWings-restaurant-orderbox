import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Package, Truck, MapPin, Clock, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ThankYou() {
  const { orderId } = useParams<{ orderId: string }>();

  const { data: trackingData, isLoading, error } = useQuery({
    queryKey: ["order-confirmation", orderId],
    queryFn: async () => {
      if (!orderId) throw new Error("Order ID is required");
      const { data, error } = await supabase.rpc("get_order_tracking", {
        p_order_id: orderId,
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !trackingData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">
              We couldn't find this order. Please check the URL or contact support.
            </p>
            <Link to="/order">
              <Button>Back to Order</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const order = trackingData.order;
  const items = trackingData.items || [];
  const isDelivery = order.order_type === "delivery";

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-16">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Thank You!</h1>
          <p className="text-lg text-muted-foreground">
            Your order has been successfully placed
          </p>
        </div>

        {/* Order Number Card */}
        <Card className="mb-6 border-green-200 dark:border-green-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Order Number</span>
              <span className="text-xl font-bold font-mono">{order.order_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                {order.status === "for_verification" ? "Awaiting Verification" : order.status?.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Order Type</span>
              <div className="flex items-center gap-2">
                {isDelivery ? (
                  <Truck className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="capitalize">{order.order_type?.replace(/_/g, " ")}</span>
              </div>
            </div>
            {!isDelivery && order.pickup_date && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pickup Schedule</span>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(order.pickup_date), "MMM d, yyyy")} at {order.pickup_time}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item: any) => (
                <div key={item.id} className="flex justify-between">
                  <div>
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-muted-foreground ml-2">×{item.quantity}</span>
                    {item.flavors && item.flavors.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {item.flavors.map((f: any) => `${f.flavor_name} (${f.quantity})`).join(", ")}
                      </p>
                    )}
                  </div>
                  <span>₱{Number(item.line_total).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₱{Number(order.subtotal).toFixed(2)}</span>
              </div>
              {isDelivery && order.delivery_fee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span>₱{Number(order.delivery_fee).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2">
                <span>Total</span>
                <span>₱{Number(order.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What's Next */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">What's Next?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {order.status === "for_verification" ? (
              <>
                <p className="text-muted-foreground">
                  We've received your payment proof and are verifying it. You'll receive a confirmation once approved.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Payment verification (in progress)</li>
                  <li>Order preparation begins</li>
                  {isDelivery ? (
                    <li>Rider assignment and delivery</li>
                  ) : (
                    <li>Ready for pickup notification</li>
                  )}
                </ol>
              </>
            ) : (
              <p className="text-muted-foreground">
                Your order is being processed. Track your order status using the button below.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to={`/order/${orderId}`} className="flex-1">
            <Button className="w-full" size="lg">
              <ExternalLink className="h-4 w-4 mr-2" />
              Track Your Order
            </Button>
          </Link>
          <Link to="/order" className="flex-1">
            <Button variant="outline" className="w-full" size="lg">
              Place Another Order
            </Button>
          </Link>
        </div>

        {/* Footer Note */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          Save this page or bookmark the tracking link for updates on your order.
        </p>
      </div>
    </div>
  );
}
