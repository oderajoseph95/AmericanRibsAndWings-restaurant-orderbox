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
import { ArrowLeft, ArrowRight, Check, Loader2, Minus, Plus, Package } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface BundleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Tables<"products">;
  flavors: Tables<"flavors">[];
  onConfirm: (
    product: Tables<"products">,
    selectedFlavors: { id: string; name: string; quantity: number; surcharge: number; category?: string }[],
    includedItems?: { name: string; quantity: number; surcharge?: number }[]
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
  // Rice upgrade state: 'plain' (default, free) or 'java' (+₱40)
  const [riceUpgrade, setRiceUpgrade] = useState<'plain' | 'java'>('plain');

  // Fetch ALL bundle components (both flavor-selectable and included)
  const { data: allBundleComponents, isLoading } = useQuery({
    queryKey: ["bundle-components-all", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bundle_components")
        .select("*, component_product:products!component_product_id(*)")
        .eq("bundle_product_id", product.id)
        .order("id");
      if (error) throw error;
      return data as BundleComponent[];
    },
    enabled: open,
  });

  // Separate flavor-selectable components from included items
  const flavorSelectableComponents = useMemo(() => {
    return allBundleComponents?.filter(c => c.has_flavor_selection) || [];
  }, [allBundleComponents]);

  const includedComponents = useMemo(() => {
    return allBundleComponents?.filter(c => !c.has_flavor_selection) || [];
  }, [allBundleComponents]);

  // Check if this bundle has Plain Rice (Rice Meal bundles)
  const hasPlainRice = useMemo(() => {
    return includedComponents.some(c => 
      c.component_product.name.toLowerCase().includes('plain rice')
    );
  }, [includedComponents]);

  // Java Rice upgrade price
  const JAVA_RICE_UPGRADE_PRICE = 40;

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

  // Total steps = flavor-selectable components + rice upgrade step (if applicable) + 1 review step
  const riceUpgradeStepIndex = flavorSelectableComponents.length;
  const totalSteps = flavorSelectableComponents.length + (hasPlainRice ? 1 : 0) + 1;
  const isRiceUpgradeStep = hasPlainRice && currentStep === riceUpgradeStepIndex;
  const isReviewStep = currentStep === totalSteps - 1;
  const isLastStep = isReviewStep;

  // Get current step component and filtered flavors (include unavailable for display)
  const currentComponent = (!isReviewStep && !isRiceUpgradeStep) ? flavorSelectableComponents[currentStep] : null;
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

  // Can proceed if: multi-slot has all pieces selected, or single-slot has selection, or rice upgrade step, or review step
  const canProceed = useMemo(() => {
    if (isReviewStep) return true;
    if (isRiceUpgradeStep) return true; // Rice upgrade always has a default selection
    if (isMultiSlotStep) {
      return selectedPcs === totalUnits;
    }
    return selections[currentStep] !== undefined;
  }, [isReviewStep, isRiceUpgradeStep, isMultiSlotStep, selectedPcs, totalUnits, selections, currentStep]);

  // Calculate total surcharge - PER DISTINCT SPECIAL FLAVOR USED + rice upgrade
  // Rule: ₱40 per distinct special flavor, regardless of how many pieces/slots it covers
  const totalSurcharge = useMemo(() => {
    const flavorSurcharge = Object.entries(selections).reduce((sum, [stepIdx, stepData]) => {
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
    
    // Add rice upgrade surcharge if Java Rice selected
    const riceSurcharge = (hasPlainRice && riceUpgrade === 'java') ? JAVA_RICE_UPGRADE_PRICE : 0;
    
    return flavorSurcharge + riceSurcharge;
  }, [selections, flavors, hasPlainRice, riceUpgrade]);

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
      const component = flavorSelectableComponents[Number(stepIdx)];
      const componentName = component?.component_product.name.toLowerCase() || '';
      
      // Determine category for display
      let category = 'wings';
      if (componentName.includes('rib')) category = 'ribs';
      else if (componentName.includes('fries')) category = 'fries';
      else if (componentName.includes('drink')) category = 'drinks';
      
      if (typeof stepData === 'string') {
        // Single selection (drinks, fries)
        const flavor = flavors.find((f) => f.id === stepData)!;
        return [{
          id: stepData,
          name: flavor.name,
          quantity: component?.total_units || 1,
          surcharge: flavor.surcharge || 0,
          category,
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
              category,
            };
          });
      }
    });

    // Build included items list - handle rice upgrade for Rice Meals
    const includedItems = includedComponents.map(comp => {
      let displayName = comp.component_product.name;
      const isPlainRice = displayName.toLowerCase().includes('plain rice');
      let surcharge = 0;
      
      // Clean up display names and handle rice upgrade
      if (isPlainRice) {
        // If user upgraded to Java Rice, show that instead and add surcharge
        if (hasPlainRice && riceUpgrade === 'java') {
          displayName = 'Java Rice';
          surcharge = JAVA_RICE_UPGRADE_PRICE;
        } else {
          displayName = 'Plain Rice';
        }
      } else if (displayName.toLowerCase().includes('java rice')) {
        displayName = 'Java Rice';
      } else if (displayName.toLowerCase().includes('coleslaw')) {
        displayName = 'Coleslaw';
      } else if (displayName.toLowerCase().includes('fries')) {
        displayName = 'Fries';
      } else if (displayName.toLowerCase().includes('juice')) {
        displayName = '1L Juice';
      } else if (displayName.toLowerCase().includes('wine')) {
        displayName = 'Red Wine';
      } else if (displayName.toLowerCase().includes('cake')) {
        displayName = 'Bento Cake';
      }
      
      return {
        name: displayName,
        quantity: comp.quantity || 1,
        surcharge,
      };
    });

    onConfirm(product, selectedFlavors, includedItems);
    handleClose();
  };

  const handleClose = () => {
    setCurrentStep(0);
    setSelections({});
    setRiceUpgrade('plain'); // Reset rice selection
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

  // Get display text for wings quantity (for X wings)
  const getWingsDisplayText = (qty: number): string => {
    return `for ${qty} wings`;
  };

  // Build summary of selections for review step
  const getSelectionsSummary = () => {
    return Object.entries(selections).map(([stepIdx, stepData]) => {
      const component = flavorSelectableComponents[Number(stepIdx)];
      const componentName = component?.component_product.name || '';
      const isWings = componentName.toLowerCase().includes('wing') || componentName.toLowerCase().includes('ala carte');
      const isRibs = componentName.toLowerCase().includes('rib');
      
      if (typeof stepData === 'string') {
        const flavor = flavors.find((f) => f.id === stepData);
        return {
          componentName: isRibs ? 'Ribs' : componentName,
          isMultiSlot: false,
          flavors: [{
            name: flavor?.name || '',
            quantity: component?.total_units || 1,
            surcharge: flavor?.surcharge || 0,
          }],
        };
      } else {
        return {
          componentName: isWings ? 'Chicken Wings' : componentName,
          isMultiSlot: true,
          totalPcs: component?.total_units || 0,
          flavors: Object.entries(stepData)
            .filter(([_, qty]) => qty > 0)
            .map(([flavorId, qty]) => {
              const flavor = flavors.find((f) => f.id === flavorId);
              return {
                name: flavor?.name || '',
                quantity: qty,
                surcharge: flavor?.surcharge || 0,
              };
            }),
        };
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
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
        ) : isRiceUpgradeStep ? (
          /* Rice Upgrade Step - Only for Rice Meal bundles */
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-4 pr-4">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-primary animate-pulse mb-2">
                  RICE OPTION
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your meal includes Plain Rice. Would you like to upgrade?
                </p>
              </div>

              {/* Plain Rice Option - Default */}
              <button
                onClick={() => setRiceUpgrade('plain')}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors text-left ${
                  riceUpgrade === 'plain'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Plain Rice</span>
                    <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-700 dark:text-green-400">
                      Included
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Standard white rice, included in your meal
                  </p>
                </div>
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    riceUpgrade === 'plain'
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {riceUpgrade === 'plain' && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </button>

              {/* Java Rice Upgrade Option */}
              <button
                onClick={() => setRiceUpgrade('java')}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors text-left ${
                  riceUpgrade === 'java'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Java Rice</span>
                    <Badge variant="secondary" className="text-xs">
                      Upgrade
                    </Badge>
                  </div>
                  <p className="text-xs text-accent mt-1">
                    +₱{JAVA_RICE_UPGRADE_PRICE.toFixed(0)}
                  </p>
                  <p className="text-xs text-primary mt-1 animate-pulse">
                    🔥 Flavourful Java Mix Delicious Rice 🔥
                  </p>
                </div>
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    riceUpgrade === 'java'
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {riceUpgrade === 'java' && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </button>
            </div>
          </ScrollArea>
        ) : isReviewStep ? (
          /* Review Step */
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-4 pr-4">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Package className="h-5 w-5" />
                Review Your Order
              </h3>

              {/* Selected Flavors Summary */}
              {getSelectionsSummary().map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-muted/30">
                  <h4 className="font-semibold text-sm mb-2">
                    {item.isMultiSlot ? `${item.totalPcs} pcs ${item.componentName}` : item.componentName}
                  </h4>
                  <div className="space-y-1">
                    {item.flavors.map((flavor, fIdx) => (
                      <div key={fIdx} className="flex justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <span className="text-muted-foreground">•</span>
                          <span>{flavor.name}</span>
                          {item.isMultiSlot && (
                            <span className="text-muted-foreground text-xs">
                              ({getWingsDisplayText(flavor.quantity)})
                            </span>
                          )}
                        </span>
                        {flavor.surcharge > 0 && (
                          <span className="text-primary font-medium">+₱{flavor.surcharge.toFixed(0)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Included Items - with rice upgrade handling */}
              {includedComponents.length > 0 && (
                <div className="border rounded-lg p-3 bg-green-500/10 border-green-500/30">
                  <h4 className="font-semibold text-sm mb-2 text-green-700 dark:text-green-400">
                    Included in this meal:
                  </h4>
                  <div className="space-y-1">
                    {includedComponents.map((comp, idx) => {
                      let displayName = comp.component_product.name;
                      const isPlainRice = displayName.toLowerCase().includes('plain rice');
                      
                      // Handle rice upgrade display
                      if (isPlainRice && hasPlainRice && riceUpgrade === 'java') {
                        displayName = 'Java Rice';
                      } else if (isPlainRice) {
                        displayName = 'Plain Rice';
                      } else if (displayName.toLowerCase().includes('java rice')) {
                        displayName = 'Java Rice';
      } else if (displayName.toLowerCase().includes('coleslaw')) {
        displayName = 'Coleslaw';
      } else if (displayName.toLowerCase().includes('fries')) {
        displayName = 'Fries';
      } else if (displayName.toLowerCase().includes('juice')) {
        displayName = '1L Juice';
      } else if (displayName.toLowerCase().includes('wine')) {
        displayName = 'Red Wine';
      } else if (displayName.toLowerCase().includes('cake')) {
        displayName = 'Bento Cake';
      }
                      
                      const qty = comp.quantity || 1;
                      const showUpgradePrice = isPlainRice && hasPlainRice && riceUpgrade === 'java';
                      
                      return (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-400">•</span>
                            <span>{qty > 1 ? `${qty} cups ` : ''}{displayName}</span>
                          </span>
                          {showUpgradePrice ? (
                            <span className="text-primary font-medium">+₱{JAVA_RICE_UPGRADE_PRICE}</span>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-700 dark:text-green-400">
                              Included
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
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

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-4 pb-4">
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

        <DialogFooter className="flex-col gap-2 sm:flex-col mt-4">
          {/* Price summary on review step */}
          {isReviewStep && (
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
