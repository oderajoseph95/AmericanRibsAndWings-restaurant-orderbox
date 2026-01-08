import { ShoppingBag, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { CartItem } from "@/pages/Order";

interface CompactOrderSummaryProps {
  cart: CartItem[];
  subtotal: number;
  deliveryFee: number | null;
  grandTotal: number;
}

export function CompactOrderSummary({
  cart,
  subtotal,
  deliveryFee,
  grandTotal
}: CompactOrderSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="bg-muted/50 rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm text-primary underline underline-offset-2 decoration-dashed cursor-pointer">
            Click to view order summary
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-primary">₱{grandTotal.toFixed(2)}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          "grid transition-all duration-200",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 space-y-2">
            <Separator />
            {cart.map(item => (
              <div key={item.id} className="space-y-1">
                {/* Main product line */}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.quantity}x {item.product.name}
                  </span>
                  <span>₱{item.lineTotal.toFixed(2)}</span>
                </div>
                
                {/* Flavor/combo selections - indented below */}
                {item.flavors && item.flavors.length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {item.flavors.map((flavor, idx) => {
                      // For single-unit items like ribs, hide the "(X pcs)" notation
                      const isSingleUnit = item.flavors?.length === 1 && flavor.quantity === 1;
                      return (
                        <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            • {flavor.name}{!isSingleUnit ? ` (${flavor.quantity} pcs)` : (flavor.surcharge > 0 ? " (Special)" : "")}
                          </span>
                          {flavor.surcharge > 0 && (
                            <span className="text-primary">+₱{flavor.surcharge.toFixed(2)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            {deliveryFee !== null && (
              <div className="flex justify-between text-sm">
                <span>Delivery Fee</span>
                <span>₱{deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary">₱{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
