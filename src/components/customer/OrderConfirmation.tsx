import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Home } from "lucide-react";

interface OrderConfirmationProps {
  orderNumber: string;
  onNewOrder: () => void;
}

export function OrderConfirmation({ orderNumber, onNewOrder }: OrderConfirmationProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 text-center">
          {/* Success icon */}
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-success" />
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
                <span>Pick up your order or wait for delivery</span>
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
