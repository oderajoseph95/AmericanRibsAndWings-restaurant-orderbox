import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { ArrowLeft, ArrowRight, Check, Loader2, Minus, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface BundleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Tables<"products">;
  flavors: Tables<"flavors">[];
  onConfirm: (
    product: Tables<"products">,
    selectedFlavors: { id: string; name: string; quantity: number; surcharge: number }[]
  ) => void;
}

type BundleComponent = Tables<"bundle_components"> & {
  component_product: Tables<"products">;
};

// Multi-slot selections for wings, single flavor for drinks/fries
type StepSelection = Record<string, number> | string;

export function BundleWizard({
  open,
  onOpenChange,
  product,
  flavors,
  onConfirm,
}: BundleWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, StepSelection>>({});

  // Fetch bundle components
  const { data: bundleComponents, isLoading } = useQuery({
    queryKey: ["bundle-components", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bundle_components")
        .select("*, component_product:products!component_product_id(*)")
        .eq("bundle_product_id", product.id)
        .eq("has_flavor_selection", true)
        .order("id");
      if (error) throw error;
      return data as BundleComponent[];
    },
    enabled: open,
  });

  // Determine flavor category from component product name
  const getFlavorCategory = (componentName: string): string => {
    const lower = componentName.toLowerCase();
    // Ribs, chicken, and wings all use "wings" flavors
    if (lower.includes("rib") || 
        lower.includes("chicken") || 
        lower.includes("wing") || 
        lower.includes("ala carte")) return "wings";
    if (lower.includes("fries") || lower.includes("fry")) return "fries";
    if (lower.includes("drink") || lower.includes("beverage")) return "drinks";
    return "wings"; // default
  };

  // Get current step component and filtered flavors (include unavailable for display)
  const currentComponent = bundleComponents?.[currentStep];
  const stepFlavors = useMemo(() => {
    if (!currentComponent || !flavors) return [];
    const category = getFlavorCategory(currentComponent.component_product.name);
    // Include unavailable flavors to show as greyed out, filter only by category and active
    return flavors.filter((f) => f.flavor_category === category && f.is_active);
  }, [currentComponent, flavors]);

  // Check if this step is multi-slot (e.g., 6 pcs wings = 2 slots)
  const isMultiSlotStep = useMemo(() => {
    if (!currentComponent) return false;
    const totalUnits = currentComponent.total_units || 0;
    const unitsPerFlavor = currentComponent.units_per_flavor || 3;
    return totalUnits > unitsPerFlavor;
  }, [currentComponent]);

  const totalSlots = useMemo(() => {
    if (!currentComponent) return 1;
    const totalUnits = currentComponent.total_units || 0;
    const unitsPerFlavor = currentComponent.units_per_flavor || 3;
    return Math.ceil(totalUnits / unitsPerFlavor);
  }, [currentComponent]);

  const unitsPerSlot = currentComponent?.units_per_flavor || 3;
  const totalUnits = currentComponent?.total_units || 0;

  // Calculate selected pieces for current step (multi-slot)
  const currentStepSelections = useMemo(() => {
    const sel = selections[currentStep];
    if (!sel || typeof sel === 'string') return {};
    return sel as Record<string, number>;
  }, [selections, currentStep]);

  const selectedPcs = useMemo(() => {
    return Object.values(currentStepSelections).reduce((sum, qty) => sum + qty, 0);
  }, [currentStepSelections]);

  const selectedSlots = useMemo(() => {
    return selectedPcs / unitsPerSlot;
  }, [selectedPcs, unitsPerSlot]);

  const totalSteps = bundleComponents?.length || 0;
  const isLastStep = currentStep === totalSteps - 1;
  
  // Can proceed if: multi-slot has all pieces selected, or single-slot has selection
  const canProceed = useMemo(() => {
    if (isMultiSlotStep) {
      return selectedPcs === totalUnits;
    }
    return selections[currentStep] !== undefined;
  }, [isMultiSlotStep, selectedPcs, totalUnits, selections, currentStep]);

  // Calculate total surcharge - PER DISTINCT SPECIAL FLAVOR USED
  // Rule: ₱40 per distinct special flavor, regardless of how many pieces/slots it covers
  const totalSurcharge = useMemo(() => {
    return Object.entries(selections).reduce((sum, [stepIdx, stepData]) => {
      if (typeof stepData === 'string') {
        // Single selection (drinks, fries)
        const flavor = flavors.find((f) => f.id === stepData);
        return sum + (flavor?.surcharge || 0);
      } else {
        // Multi-slot selection (wings) - charge ONCE per distinct special flavor
        return sum + Object.entries(stepData).reduce((stepSum, [flavorId, qty]) => {
          if (qty <= 0) return stepSum;
          const flavor = flavors.find((f) => f.id === flavorId);
          // Charge ONCE per distinct flavor (not per slot)
          return stepSum + (flavor?.surcharge || 0);
        }, 0);
      }
    }, 0);
  }, [selections, flavors]);

  // Handle single flavor selection (for drinks, fries)
  const handleFlavorSelect = (flavorId: string, isAvailable: boolean) => {
    if (!isAvailable) return;
    setSelections((prev) => ({ ...prev, [currentStep]: flavorId }));
  };

  // Handle multi-slot flavor change (for wings)
  const handleSlotChange = (flavorId: string, delta: number) => {
    const currentQty = currentStepSelections[flavorId] || 0;
    const newQty = Math.max(0, currentQty + delta * unitsPerSlot);
    
    // Validate total doesn't exceed component total_units
    const newTotal = selectedPcs - currentQty + newQty;
    if (newTotal > totalUnits) return;
    
    setSelections((prev) => {
      const prevStep = (prev[currentStep] as Record<string, number>) || {};
      if (newQty === 0) {
        const { [flavorId]: _, ...rest } = prevStep;
        return { ...prev, [currentStep]: rest };
      }
      return {
        ...prev,
        [currentStep]: { ...prevStep, [flavorId]: newQty }
      };
    });
  };

  const handleNext = () => {
    if (isLastStep) {
      handleConfirm();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleConfirm = () => {
    const selectedFlavors = Object.entries(selections).flatMap(([stepIdx, stepData]) => {
      const component = bundleComponents?.[Number(stepIdx)];
      
      if (typeof stepData === 'string') {
        // Single selection (drinks, fries)
        const flavor = flavors.find((f) => f.id === stepData)!;
        return [{
          id: stepData,
          name: flavor.name,
          quantity: component?.total_units || 1,
          surcharge: flavor.surcharge || 0,
          category: (flavor as any).flavor_category || 'drinks', // Pass category for display
        }];
      } else {
        // Multi-slot selection (wings) - charge ONCE per distinct special flavor
        return Object.entries(stepData)
          .filter(([_, qty]) => qty > 0)
          .map(([flavorId, qty]) => {
            const flavor = flavors.find((f) => f.id === flavorId)!;
            return {
              id: flavorId,
              name: flavor.name,
              quantity: qty,
              surcharge: flavor.surcharge || 0, // one-time per distinct flavor
              category: (flavor as any).flavor_category || 'wings', // Pass category for display
            };
          });
      }
    });

    onConfirm(product, selectedFlavors);
    handleClose();
  };

  const handleClose = () => {
    setCurrentStep(0);
    setSelections({});
    onOpenChange(false);
  };

  const getStepLabel = (componentName: string): string => {
    const lower = componentName.toLowerCase();
    if (lower.includes("rib")) return "CHOOSE RIBS FLAVOR";
    if (lower.includes("chicken") && !lower.includes("wing")) return "CHOOSE CHICKEN FLAVOR";
    if (lower.includes("wing") || lower.includes("ala carte")) return "CHOOSE WINGS FLAVOR";
    if (lower.includes("fries") || lower.includes("fry")) return "CHOOSE FRIES FLAVOR";
    if (lower.includes("drink") || lower.includes("beverage")) return "CHOOSE YOUR DRINK";
    return "CHOOSE FLAVOR";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{product.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={`flex-1 h-2 rounded-full transition-colors ${
                idx < currentStep
                  ? "bg-primary"
                  : idx === currentStep
                  ? "bg-primary/70"
                  : "bg-secondary"
              }`}
            />
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {currentComponent && (
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-primary animate-pulse mb-2">
                  {getStepLabel(currentComponent.component_product.name)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentComponent.component_product.name}
                  {currentComponent.total_units && ` (${currentComponent.total_units} pcs)`}
                </p>
                {/* Slot progress for multi-slot items */}
                {isMultiSlotStep && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-primary">
                      Selected: {selectedSlots} / {totalSlots} flavor slots
                    </p>
                    <div className="w-full bg-secondary rounded-full h-2 mt-1">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(selectedPcs / totalUnits) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-2 pr-4">
                {stepFlavors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No options available for this selection.
                  </p>
                ) : (
                  stepFlavors.map((flavor) => {
                    const isUnavailable = flavor.is_available === false;
                    
                    if (isMultiSlotStep) {
                      // Plus/minus slot-based UI for wings
                      const qty = currentStepSelections[flavor.id] || 0;
                      const isSelected = qty > 0;
                      
                      return (
                        <div
                          key={flavor.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            isUnavailable
                              ? "border-border bg-muted/50 opacity-60"
                              : isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isUnavailable ? "text-muted-foreground" : ""}`}>
                                {flavor.name}
                              </span>
                              {isUnavailable && (
                                <Badge variant="destructive" className="text-xs">
                                  Out of Stock
                                </Badge>
                              )}
                              {!isUnavailable && flavor.flavor_type === "special" && (
                                <Badge variant="secondary" className="text-xs">
                                  Special
                                </Badge>
                              )}
                            </div>
                            {!isUnavailable && (
                              flavor.surcharge && flavor.surcharge > 0 ? (
                                <p className="text-xs text-accent">
                                  +₱{flavor.surcharge.toFixed(2)} per special flavor
                                </p>
                              ) : (
                                <p className="text-xs flex items-center gap-1">
                                  <span className="line-through text-muted-foreground">₱0.00</span>
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">FREE</Badge>
                                </p>
                              )
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <span className="text-sm font-medium text-primary">
                                {qty} pcs
                              </span>
                            )}
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSlotChange(flavor.id, -1)}
                              disabled={qty === 0 || isUnavailable}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleSlotChange(flavor.id, 1)}
                              disabled={selectedPcs >= totalUnits || isUnavailable}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    } else {
                      // Radio-style single selection for drinks, fries
                      const isSelected = selections[currentStep] === flavor.id;
                      
                      return (
                        <button
                          key={flavor.id}
                          onClick={() => handleFlavorSelect(flavor.id, !isUnavailable)}
                          disabled={isUnavailable}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                            isUnavailable
                              ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                              : isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${isUnavailable ? "text-muted-foreground" : ""}`}>
                                {flavor.name}
                              </span>
                              {isUnavailable && (
                                <Badge variant="destructive" className="text-xs">
                                  Out of Stock
                                </Badge>
                              )}
                              {!isUnavailable && flavor.flavor_type === "special" && (
                                <Badge variant="secondary" className="text-xs">
                                  Special
                                </Badge>
                              )}
                            </div>
                            {!isUnavailable && (
                              flavor.surcharge && flavor.surcharge > 0 ? (
                                <p className="text-xs text-accent">
                                  +₱{flavor.surcharge.toFixed(2)}
                                </p>
                              ) : (
                                <p className="text-xs flex items-center gap-1">
                                  <span className="line-through text-muted-foreground">₱0.00</span>
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">FREE</Badge>
                                </p>
                              )
                            )}
                          </div>

                          <div
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isUnavailable
                                ? "border-muted-foreground/50"
                                : isSelected
                                ? "border-primary bg-primary"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isSelected && !isUnavailable && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                        </button>
                      );
                    }
                  })
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {/* Price summary on last step */}
          {isLastStep && (
            <div className="w-full flex justify-between items-center py-2 border-t">
              <span className="text-muted-foreground">Total Price</span>
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
          )}

          <div className="flex w-full gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className="flex-1"
            >
              {isLastStep ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Add to Cart
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
