import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import type { CartItem } from "@/pages/Order";

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemove: (itemId: string) => void;
  onClearCart?: () => void;
  onCheckout: () => void;
  onClose?: () => void;
  total: number;
}

export function Cart({ items, onUpdateQuantity, onRemove, onClearCart, onCheckout, onClose, total }: CartProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleBrowseMenu = () => {
    onClose?.();
    if (location.pathname !== "/order") {
      navigate("/order");
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground mb-2">Your cart is empty</p>
        <p className="text-sm text-muted-foreground/70 mb-4">
          Add some delicious items to get started!
        </p>
        <Button onClick={handleBrowseMenu}>
          Browse Menu
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 max-h-[50vh] lg:max-h-[calc(100vh-350px)]">
        <div className="p-4 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3">
              {/* Product image */}
              <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {item.product.image_url ? (
                  <img
                    src={item.product.image_url}
                    alt={item.product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl opacity-50">🍖</span>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm line-clamp-1">
                  {item.product.name}
                </h4>

                {/* Flavors */}
                {item.flavors && item.flavors.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {item.flavors.map((flavor, idx) => {
                      // Determine display label based on flavor category
                      const category = (flavor as any).category || 'wings';
                      const isSingleUnit = item.flavors?.length === 1 && flavor.quantity === 1;
                      
                      // Build descriptive label based on category
                      const getFlavorLabel = () => {
                        if (category === 'drinks') {
                          return ''; // Drinks don't need extra label
                        }
                        if (category === 'fries') {
                          return ''; // Fries flavors don't need extra label
                        }
                        // Wings/ribs category - show quantity if multiple
                        if (isSingleUnit) {
                          return flavor.surcharge > 0 ? '(Special)' : '';
                        }
                        return `(${flavor.quantity} pcs)`;
                      };
                      
                      return (
                        <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground/70">•</span>
                            <span>{flavor.name}</span>
                            {getFlavorLabel() && (
                              <span className="text-muted-foreground/60">{getFlavorLabel()}</span>
                            )}
                          </span>
                          {flavor.surcharge > 0 && (
                            <span className="text-primary shrink-0 ml-1">+₱{flavor.surcharge.toFixed(2)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Price */}
                <p className="text-sm font-semibold text-primary mt-1">
                  ₱{item.lineTotal.toFixed(2)}
                </p>

                {/* Quantity controls */}
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onUpdateQuantity(item.id, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-6 text-center">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onUpdateQuantity(item.id, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive ml-auto"
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Footer */}
      <div className="p-4 space-y-4">
        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">₱{total.toFixed(2)}</span>
        </div>

        {/* Total */}
        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="text-primary">₱{total.toFixed(2)}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {onClearCart && (
            <Button 
              variant="ghost" 
              size="lg"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button className="flex-1" size="lg" onClick={onCheckout}>
            Proceed to Checkout
          </Button>
        </div>
      </div>

      {/* Clear Cart Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {items.length} items from your cart. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onClearCart?.();
                setShowClearConfirm(false);
              }}
            >
              Clear Cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
