import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, ArrowRight, Home, MapPin, Phone, Clock, Calendar } from "lucide-react";
import type { OrderType } from "@/pages/Order";

interface OrderConfirmationProps {
  orderNumber: string;
  orderType: OrderType;
  pickupDate?: string;
  pickupTime?: string;
  onNewOrder: () => void;
}

const RESTAURANT_INFO = {
  address: "Purok 1 Ground Floor, Hony Arcade, Floridablanca, 2006 Pampanga, Philippines",
  phone: "+63 976 207 4276",
};

export function OrderConfirmation({ 
  orderNumber, 
  orderType,
  pickupDate,
  pickupTime,
  onNewOrder 
}: OrderConfirmationProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 text-center">
          {/* Success icon */}
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Order Placed Successfully!
          </h1>

          <p className="text-muted-foreground mb-6">
            Thank you for your order. We'll start preparing it right away.
          </p>

          {/* Order number */}
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Order Number</p>
            <p className="text-xl font-bold text-primary">{orderNumber}</p>
          </div>

          {/* Pickup Details */}
          {orderType === "pickup" && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Pickup Details
              </h3>
              
              {pickupDate && pickupTime && (
                <div className="flex items-center gap-2 mb-3 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{pickupDate}</span>
                  <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                  <span className="font-medium">{pickupTime}</span>
                </div>
              )}

              <Separator className="my-3" />

              <p className="text-sm text-muted-foreground mb-1">Pickup Location:</p>
              <p className="text-sm font-medium mb-3">
                {RESTAURANT_INFO.address}
              </p>
              
              <a 
                href={`tel:${RESTAURANT_INFO.phone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline"
              >
                <Phone className="h-4 w-4" />
                {RESTAURANT_INFO.phone}
              </a>
            </div>
          )}

          {/* Delivery Details */}
          {orderType === "delivery" && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-primary mb-3">Delivery Information</h3>
              <p className="text-sm text-muted-foreground">
                Your order will be delivered to your specified address. Our delivery rider will contact you when they're on their way.
              </p>
            </div>
          )}

          {/* What's next */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-medium mb-2">What's Next?</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">1.</span>
                <span>We'll verify your order and payment (if applicable)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">2.</span>
                <span>Your order will be prepared by our kitchen</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">3.</span>
                <span>
                  {orderType === "pickup" 
                    ? "Pick up your order at the scheduled time" 
                    : "Our rider will deliver your order"}
                </span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={onNewOrder}>
              Place Another Order
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button variant="outline" className="w-full" size="lg" asChild>
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
