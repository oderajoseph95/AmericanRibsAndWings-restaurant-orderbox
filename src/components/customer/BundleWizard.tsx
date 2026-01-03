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
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
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

export function BundleWizard({
  open,
  onOpenChange,
  product,
  flavors,
  onConfirm,
}: BundleWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string>>({});

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

  // Get current step component and filtered flavors
  const currentComponent = bundleComponents?.[currentStep];
  const stepFlavors = useMemo(() => {
    if (!currentComponent || !flavors) return [];
    const category = getFlavorCategory(currentComponent.component_product.name);
    return flavors.filter((f) => f.flavor_category === category && f.is_active);
  }, [currentComponent, flavors]);

  const totalSteps = bundleComponents?.length || 0;
  const isLastStep = currentStep === totalSteps - 1;
  const canProceed = selections[currentStep] !== undefined;

  // Calculate total surcharge
  const totalSurcharge = useMemo(() => {
    return Object.entries(selections).reduce((sum, [stepIdx, flavorId]) => {
      const flavor = flavors.find((f) => f.id === flavorId);
      return sum + (flavor?.surcharge || 0);
    }, 0);
  }, [selections, flavors]);

  const handleFlavorSelect = (flavorId: string) => {
    setSelections((prev) => ({ ...prev, [currentStep]: flavorId }));
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
    const selectedFlavors = Object.entries(selections).map(([stepIdx, flavorId]) => {
      const component = bundleComponents?.[Number(stepIdx)];
      const flavor = flavors.find((f) => f.id === flavorId)!;
      return {
        id: flavorId,
        name: flavor.name,
        quantity: component?.total_units || 1,
        surcharge: flavor.surcharge || 0,
      };
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
                    const isSelected = selections[currentStep] === flavor.id;

                    return (
                      <button
                        key={flavor.id}
                        onClick={() => handleFlavorSelect(flavor.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{flavor.name}</span>
                            {flavor.flavor_type === "special" && (
                              <Badge variant="secondary" className="text-xs">
                                Special
                              </Badge>
                            )}
                          </div>
                          {flavor.surcharge && flavor.surcharge > 0 ? (
                            <p className="text-xs text-accent">
                              +₱{flavor.surcharge.toFixed(2)}
                            </p>
                          ) : (
                            <p className="text-xs flex items-center gap-1">
                              <span className="line-through text-muted-foreground">₱0.00</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">FREE</Badge>
                            </p>
                          )}
                        </div>

                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </button>
                    );
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
