import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Minus, Plus, Check } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ProductWithRules = Tables<"products"> & {
  product_flavor_rules?: Tables<"product_flavor_rules">[] | Tables<"product_flavor_rules"> | null;
};

interface FlavorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithRules;
  flavors: Tables<"flavors">[];
  onConfirm: (
    product: Tables<"products">,
    selectedFlavors: { id: string; name: string; quantity: number; surcharge: number }[]
  ) => void;
}

export function FlavorModal({
  open,
  onOpenChange,
  product,
  flavors,
  onConfirm,
}: FlavorModalProps) {
  const [selectedFlavors, setSelectedFlavors] = useState<
    Record<string, number>
  >({});

  // Fire Meta Pixel ViewContent event when modal opens
  useEffect(() => {
    if (open && typeof (window as any).fbq === 'function') {
      (window as any).fbq('track', 'ViewContent', {
        content_name: product.name,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'PHP',
      });
      console.log('Meta Pixel ViewContent event fired:', product.name);
    }
  }, [open, product]);

  const flavorRulesRaw = product.product_flavor_rules;
  const flavorRule = Array.isArray(flavorRulesRaw) ? flavorRulesRaw[0] : flavorRulesRaw;

  const totalUnits = flavorRule?.total_units || 6;
  const unitsPerFlavor = flavorRule?.units_per_flavor || 3;
  const maxFlavors = flavorRule?.max_flavors || Math.ceil(totalUnits / unitsPerFlavor);
  const minFlavors = flavorRule?.min_flavors || 1;

  // Single-select mode for ribs (1 unit products)
  const isSingleSelect = totalUnits === 1 && unitsPerFlavor === 1;

  // Calculate current selection
  const selectedCount = useMemo(() => {
    return Object.values(selectedFlavors).reduce((sum, qty) => sum + qty, 0);
  }, [selectedFlavors]);

  const flavorCount = useMemo(() => {
    return Object.values(selectedFlavors).filter((qty) => qty > 0).length;
  }, [selectedFlavors]);

  // Validate selection
  const isValid = selectedCount === totalUnits && flavorCount >= minFlavors;

  // Calculate surcharge - PER DISTINCT SPECIAL FLAVOR USED
  // Rule: ₱40 per distinct special flavor, regardless of how many pieces it covers
  // Example: 6 pcs all same special = ₱40, 6 pcs 2 different special = ₱80
  const totalSurcharge = useMemo(() => {
    return Object.entries(selectedFlavors).reduce((sum, [flavorId, qty]) => {
      if (qty <= 0) return sum;
      const flavor = flavors.find((f) => f.id === flavorId);
      // Charge ONCE per distinct special flavor (not per slot)
      return sum + (flavor?.surcharge || 0);
    }, 0);
  }, [selectedFlavors, flavors]);

  // Filter to wing flavors - used for both wings and ribs products (shared sauces)
  const availableFlavors = useMemo(() => {
    return flavors.filter((f) => f.is_active && (f as any).flavor_category === 'wings');
  }, [flavors]);

  // Handle single-select (radio button behavior for ribs)
  const handleSingleSelect = (flavorId: string) => {
    setSelectedFlavors({ [flavorId]: 1 });
  };

  const handleFlavorChange = (flavorId: string, delta: number) => {
    setSelectedFlavors((prev) => {
      const current = prev[flavorId] || 0;
      const newValue = Math.max(0, current + delta * unitsPerFlavor);

      // Check if we can add more
      if (delta > 0 && selectedCount >= totalUnits) {
        return prev;
      }

      // Check max flavors
      if (delta > 0 && current === 0 && flavorCount >= maxFlavors) {
        return prev;
      }

      if (newValue === 0) {
        const { [flavorId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [flavorId]: newValue };
    });
  };

  const handleConfirm = () => {
    const selected = Object.entries(selectedFlavors)
      .filter(([_, qty]) => qty > 0)
      .map(([flavorId, qty]) => {
        const flavor = flavors.find((f) => f.id === flavorId)!;
        // Surcharge is charged ONCE per distinct special flavor
        return {
          id: flavorId,
          name: flavor.name,
          quantity: qty, // pieces selected with this flavor
          surcharge: flavor.surcharge || 0, // one-time surcharge per distinct flavor
        };
      });

    onConfirm(product, selected);
    setSelectedFlavors({});
  };

  const handleClose = () => {
    setSelectedFlavors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{product.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isSingleSelect 
              ? "Select your sauce" 
              : `Select your flavors (${selectedCount}/${totalUnits} pcs)`}
          </p>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="w-full bg-secondary rounded-full h-2 mb-4">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${(selectedCount / totalUnits) * 100}%` }}
          />
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2 pr-4">
            {availableFlavors.map((flavor) => {
              const qty = selectedFlavors[flavor.id] || 0;
              const isSelected = qty > 0;
              const isOutOfStock = (flavor as any).is_available === false;

              return (
                <div
                  key={flavor.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isOutOfStock
                      ? "border-border bg-muted/50 opacity-60"
                      : isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  } ${isSingleSelect && !isOutOfStock ? "cursor-pointer" : ""}`}
                  onClick={isSingleSelect && !isOutOfStock ? () => handleSingleSelect(flavor.id) : undefined}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {/* Radio button for single-select mode */}
                      {isSingleSelect && (
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                        </div>
                      )}
                      <span className={`font-medium ${isOutOfStock ? "text-muted-foreground" : ""}`}>
                        {flavor.name}
                      </span>
                      {isOutOfStock && (
                        <Badge variant="destructive" className="text-xs">
                          Out of Stock
                        </Badge>
                      )}
                      {!isOutOfStock && flavor.flavor_type === "special" && (
                        <Badge variant="secondary" className="text-xs">
                          Special
                        </Badge>
                      )}
                    </div>
                    {!isOutOfStock && (
                      flavor.surcharge && flavor.surcharge > 0 ? (
                        <p className={`text-xs text-accent ${isSingleSelect ? "ml-6" : ""}`}>
                          +₱{flavor.surcharge.toFixed(2)}
                        </p>
                      ) : (
                        <p className={`text-xs flex items-center gap-1 ${isSingleSelect ? "ml-6" : ""}`}>
                          <span className="line-through text-muted-foreground">₱0.00</span>
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">FREE</Badge>
                        </p>
                      )
                    )}
                  </div>

                  {/* Only show +/- buttons for multi-select mode (wings) */}
                  {!isSingleSelect && (
                    <div className="flex items-center gap-2">
                      {isSelected && (
                        <span className="text-sm font-medium text-primary">
                          {qty}pcs
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleFlavorChange(flavor.id, -1)}
                        disabled={qty === 0 || isOutOfStock}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleFlavorChange(flavor.id, 1)}
                        disabled={selectedCount >= totalUnits || isOutOfStock}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {/* Price summary */}
          <div className="w-full flex justify-between items-center py-2 border-t">
            <span className="text-muted-foreground">Price</span>
            <div className="text-right">
              <span className="text-lg font-bold text-primary">
                ₱{(product.price + totalSurcharge).toFixed(2)}
              </span>
              {totalSurcharge > 0 && (
                <p className="text-xs text-muted-foreground">
                  Base ₱{product.price.toFixed(2)} + Surcharge ₱{totalSurcharge.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleConfirm}
            disabled={!isValid}
          >
            <Check className="h-4 w-4 mr-2" />
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
