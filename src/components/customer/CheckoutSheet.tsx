import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, isBefore, startOfDay, isToday, setHours, setMinutes } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, Check, Package, Truck, CalendarIcon, MapPin, User, CreditCard, ClipboardList, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DeliveryMapPicker } from "./DeliveryMapPicker";
import { AccordionSection } from "./checkout/AccordionSection";
import { CompactOrderSummary } from "./checkout/CompactOrderSummary";
import type { CartItem, OrderType } from "@/pages/Order";

// Philippine phone number validation helper
const validatePhilippinePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s-]/g, '');
  // Valid formats: 09XXXXXXXXX, +639XXXXXXXX, 639XXXXXXXX
  if (cleaned.startsWith('+63')) {
    return /^\+639\d{9}$/.test(cleaned);
  }
  if (cleaned.startsWith('63')) {
    return /^639\d{9}$/.test(cleaned);
  }
  if (cleaned.startsWith('09')) {
    return /^09\d{9}$/.test(cleaned);
  }
  return false;
};

const checkoutSchema = z.object({
  orderType: z.enum(["pickup", "delivery"]),
  pickupDate: z.date().optional(),
  pickupTime: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string()
    .min(11, "Phone number must be 11 digits")
    .max(13, "Phone number too long")
    .refine(validatePhilippinePhone, "Phone must start with 09, +63, or 63 (e.g., 09171234567)"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  landmark: z.string().optional(),
  customerLat: z.number().optional(),
  customerLng: z.number().optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["cash", "gcash", "bank"])
}).superRefine((data, ctx) => {
  if (data.orderType === "delivery") {
    if (!data.city?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a city",
        path: ["city"]
      });
    }
    if (!data.customerLat || !data.customerLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please drop a pin on the map for your location",
        path: ["streetAddress"]
      });
    }
    if (!data.streetAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Street address is required for delivery",
        path: ["streetAddress"]
      });
    }
  }
  if (data.orderType === "pickup") {
    if (!data.pickupDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a pickup date",
        path: ["pickupDate"]
      });
    }
    if (!data.pickupTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a pickup time",
        path: ["pickupTime"]
      });
    }
  }
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;
type SectionId = "order-type" | "pickup-schedule" | "delivery-address" | "customer-info" | "payment" | "review";

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  total: number;
  onOrderConfirmed: (orderNumber: string, orderId: string, orderType: OrderType, pickupDate?: string, pickupTime?: string) => void;
}

function generateTimeSlots(selectedDate: Date | undefined): string[] {
  const slots: string[] = [];
  const now = new Date();
  const isSelectedToday = selectedDate && isToday(selectedDate);
  // Pickup hours: 12 PM to 8 PM only
  for (let hour = 12; hour <= 20; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 20 && minute === 30) continue;
      const slotTime = setMinutes(setHours(new Date(), hour), minute);
      if (isSelectedToday) {
        const bufferTime = new Date(now.getTime() + 60 * 60 * 1000);
        if (isBefore(slotTime, bufferTime)) continue;
      }
      const timeStr = format(slotTime, "h:mm a");
      slots.push(timeStr);
    }
  }
  return slots;
}

export function CheckoutSheet({
  open,
  onOpenChange,
  cart,
  total,
  onOrderConfirmed
}: CheckoutSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [deliveryEta, setDeliveryEta] = useState<string | null>(null);
  const [travelMinutes, setTravelMinutes] = useState<number | null>(null);
  const [barangay, setBarangay] = useState("");
  const [geocodedAddress, setGeocodedAddress] = useState<string>("");
  
  // Accordion state - start with delivery-address since delivery is default
  const [activeSection, setActiveSection] = useState<SectionId>("delivery-address");
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set(["order-type"]));

  // Fetch payment settings
  const { data: paymentSettings = [] } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .in('key', [
          'gcash_qr_url', 'gcash_account_name', 'gcash_number',
          'bank_qr_url', 'bank_name', 'bank_account_name', 'bank_account_number'
        ]);
      if (error) throw error;
      return data;
    },
  });

  const getPaymentSetting = (key: string) => {
    const setting = paymentSettings.find((s) => s.key === key);
    // Settings value is stored as JSONB, so it may already be a string or need extraction
    if (!setting?.value) return undefined;
    // If value is already a string, return it; otherwise it might be wrapped
    return typeof setting.value === 'string' ? setting.value : String(setting.value);
  };

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      orderType: "delivery",
      name: "",
      phone: "",
      email: "",
      streetAddress: "",
      city: "",
      landmark: "",
      notes: "",
      paymentMethod: "gcash"
    }
  });

  const CASH_MAX_AMOUNT = 500;
  const paymentMethod = form.watch("paymentMethod");
  const orderType = form.watch("orderType");
  const pickupDate = form.watch("pickupDate");
  const pickupTime = form.watch("pickupTime");
  const streetAddress = form.watch("streetAddress");
  const city = form.watch("city");
  const customerName = form.watch("name");
  const customerPhone = form.watch("phone");

  // Fire Meta Pixel InitiateCheckout event when checkout opens
  useEffect(() => {
    if (open && typeof (window as any).fbq === 'function') {
      (window as any).fbq('track', 'InitiateCheckout', {
        content_ids: cart.map(item => item.product.id),
        contents: cart.map(item => ({
          id: item.product.id,
          quantity: item.quantity,
        })),
        num_items: cart.reduce((sum, item) => sum + item.quantity, 0),
        value: total,
        currency: 'PHP',
      });
      console.log('Meta Pixel InitiateCheckout event fired:', total);
    }
  }, [open, cart, total]);

  // Reset delivery fee when switching order type
  useEffect(() => {
    if (orderType === "pickup") {
      setDeliveryFee(null);
      setDeliveryDistance(null);
      setDeliveryEta(null);
      setTravelMinutes(null);
      setBarangay("");
      // Auto-advance to pickup schedule
      setActiveSection("pickup-schedule");
      setCompletedSections(prev => new Set([...prev, "order-type"]));
    } else {
      // Auto-advance to delivery address
      setActiveSection("delivery-address");
      setCompletedSections(prev => new Set([...prev, "order-type"]));
    }
  }, [orderType]);

  // Auto-advance when delivery fee is calculated
  useEffect(() => {
    if (deliveryFee !== null && deliveryFee >= 0) {
      setCompletedSections(prev => new Set([...prev, "delivery-address"]));
    }
  }, [deliveryFee]);

  // Auto-advance when pickup schedule is complete
  useEffect(() => {
    if (pickupDate && pickupTime) {
      setCompletedSections(prev => new Set([...prev, "pickup-schedule"]));
    }
  }, [pickupDate, pickupTime]);

  // Auto-advance when customer info is complete
  useEffect(() => {
    if (customerName && customerName.length >= 2 && customerPhone && customerPhone.length >= 10) {
      setCompletedSections(prev => new Set([...prev, "customer-info"]));
    }
  }, [customerName, customerPhone]);

  const grandTotal = total + (deliveryFee || 0);
  const isCashAllowed = orderType === "pickup" && grandTotal <= CASH_MAX_AMOUNT;

  // Auto-advance when payment is complete + enforce payment rules
  useEffect(() => {
    // If cash is selected but not allowed, switch to gcash
    if (paymentMethod === "cash" && !isCashAllowed) {
      form.setValue("paymentMethod", "gcash");
      if (orderType === "delivery") {
        toast.info("Cash payment is not available for delivery orders");
      } else if (grandTotal > CASH_MAX_AMOUNT) {
        toast.info(`Cash payment is only available for orders up to ₱${CASH_MAX_AMOUNT}`);
      }
      return;
    }

    const isPaymentComplete = paymentMethod === "cash" || paymentProof !== null;
    if (isPaymentComplete) {
      setCompletedSections(prev => new Set([...prev, "payment"]));
    } else {
      setCompletedSections(prev => {
        const newSet = new Set(prev);
        newSet.delete("payment");
        return newSet;
      });
    }
  }, [paymentMethod, paymentProof, orderType, grandTotal, isCashAllowed]);

  const handleLocationSelect = (data: {
    lat: number;
    lng: number;
    city: string;
    address: string;
  }) => {
    form.setValue("customerLat", data.lat);
    form.setValue("customerLng", data.lng);
    form.setValue("city", data.city);
    setGeocodedAddress(data.address);
  };

  const handleFeeCalculated = (fee: number, distance: number, eta?: string, travel?: number) => {
    setDeliveryFee(fee);
    setDeliveryDistance(distance);
    setDeliveryEta(eta || null);
    setTravelMinutes(travel || null);
  };

  const handleCalculating = (calculating: boolean) => {
    setIsCalculatingFee(calculating);
  };

  const handleDeliveryContinue = () => {
    setCompletedSections(prev => new Set([...prev, "delivery-address"]));
    setActiveSection("customer-info");
  };

  const handlePaymentProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File too large. Maximum size is 5MB.");
        return;
      }
      setPaymentProof(file);
      const reader = new FileReader();
      reader.onload = () => setPaymentProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearPaymentProof = () => {
    setPaymentProof(null);
    setPaymentProofPreview(null);
  };

  const timeSlots = generateTimeSlots(pickupDate);

  const getSectionSummary = (sectionId: SectionId): string => {
    switch (sectionId) {
      case "order-type":
        return orderType === "delivery" ? "Delivery" : "Pickup";
      case "pickup-schedule":
        return pickupDate && pickupTime 
          ? `${format(pickupDate, "MMM d")} at ${pickupTime}`
          : "Select date & time";
      case "delivery-address":
        if (deliveryFee !== null && deliveryDistance !== null) {
          return `${deliveryDistance} km • ₱${deliveryFee} fee • ${deliveryEta || "Calculating..."}`;
        }
        return barangay && city 
          ? `${barangay}, ${city}`
          : "Enter your address";
      case "customer-info":
        return customerName && customerPhone
          ? `${customerName.split(" ")[0]} • ${customerPhone}`
          : "Enter your details";
      case "payment":
        if (paymentMethod === "cash") return "Cash on Pickup";
        return `${paymentMethod.toUpperCase()}${paymentProof ? " ✓" : " (Pending upload)"}`;
      case "review":
        return `₱${grandTotal.toFixed(2)} total`;
      default:
        return "";
    }
  };

  // Get errors for each section
  const getSectionErrors = (sectionId: SectionId): string[] => {
    const errors = form.formState.errors;
    switch (sectionId) {
      case "customer-info":
        return [
          errors.name?.message,
          errors.phone?.message,
          errors.email?.message
        ].filter(Boolean) as string[];
      case "delivery-address":
        return [
          errors.streetAddress?.message,
          errors.city?.message,
          errors.customerLat?.message,
          errors.customerLng?.message
        ].filter(Boolean) as string[];
      case "pickup-schedule":
        return [
          errors.pickupDate?.message,
          errors.pickupTime?.message
        ].filter(Boolean) as string[];
      case "payment":
        return [errors.paymentMethod?.message].filter(Boolean) as string[];
      default:
        return [];
    }
  };

  // Handle form validation errors on submit
  const handleInvalidSubmit = (errors: any) => {
    // Find which section has the first error and show a toast
    let errorMessage = "";
    let targetSection: SectionId | null = null;

    // Check customer info first (most common)
    if (errors.name || errors.phone || errors.email) {
      errorMessage = errors.phone?.message || errors.name?.message || errors.email?.message;
      targetSection = "customer-info";
    }
    // Check delivery address
    else if (errors.streetAddress || errors.city || errors.customerLat || errors.customerLng) {
      errorMessage = errors.streetAddress?.message || errors.city?.message || "Please complete your delivery address";
      targetSection = "delivery-address";
    }
    // Check pickup schedule
    else if (errors.pickupDate || errors.pickupTime) {
      errorMessage = errors.pickupDate?.message || errors.pickupTime?.message;
      targetSection = "pickup-schedule";
    }
    // Check payment
    else if (errors.paymentMethod) {
      errorMessage = errors.paymentMethod?.message;
      targetSection = "payment";
    }

    if (errorMessage) {
      toast.error(errorMessage, {
        description: "Please fix the error and try again",
        icon: <AlertTriangle className="h-4 w-4" />,
        duration: 5000,
      });

      // Expand the section with the error
      if (targetSection) {
        setActiveSection(targetSection);
      }
    }
  };

  const onSubmit = async (data: CheckoutFormData) => {
    if ((data.paymentMethod === "gcash" || data.paymentMethod === "bank") && !paymentProof) {
      toast.error("Please upload payment proof for this payment method.");
      return;
    }
    if (data.orderType === "delivery" && deliveryFee === null) {
      toast.error("Please wait for delivery fee calculation or check your address.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Use secure RPC function for customer creation
      const { data: customerId, error: customerError } = await supabase.rpc('create_checkout_customer', {
        p_name: data.name.trim(),
        p_email: data.email?.trim() || null,
        p_phone: data.phone.trim()
      });
      if (customerError) throw customerError;

      const deliveryAddress = data.orderType === "delivery" 
        ? `${data.streetAddress}, ${barangay}, ${data.city}, Pampanga${data.landmark ? ` (Landmark: ${data.landmark})` : ""} [GPS: ${data.customerLat?.toFixed(5)}, ${data.customerLng?.toFixed(5)}]` 
        : null;

      // Use secure RPC function for order creation (bypasses RLS)
      const { data: orderResult, error: orderError } = await supabase.rpc('create_checkout_order', {
        p_customer_id: customerId,
        p_order_type: data.orderType,
        p_subtotal: total,
        p_total_amount: grandTotal,
        p_delivery_address: deliveryAddress,
        p_delivery_fee: deliveryFee || 0,
        p_delivery_distance_km: deliveryDistance,
        p_pickup_date: data.orderType === "pickup" && data.pickupDate ? format(data.pickupDate, "yyyy-MM-dd") : null,
        p_pickup_time: data.orderType === "pickup" && data.pickupTime ? data.pickupTime : null,
        p_internal_notes: data.notes || null
      });
      
      if (orderError) throw orderError;
      const order = orderResult[0];

      // Use secure RPC functions for order items (bypasses RLS)
      for (const item of cart) {
        const { data: orderItemId, error: itemError } = await supabase.rpc('create_checkout_order_item', {
          p_order_id: order.id,
          p_product_id: item.product.id,
          p_product_name: item.product.name,
          p_product_sku: item.product.sku || null,
          p_quantity: item.quantity,
          p_unit_price: item.product.price,
          p_subtotal: item.quantity * item.product.price,
          p_flavor_surcharge_total: item.flavors?.reduce((sum, f) => sum + f.surcharge * f.quantity, 0) || 0
        });
        if (itemError) throw itemError;

        // Use secure RPC function for flavors
        if (item.flavors && item.flavors.length > 0) {
          for (const f of item.flavors) {
            const { error: flavorError } = await supabase.rpc('create_checkout_order_item_flavor', {
              p_order_item_id: orderItemId,
              p_flavor_id: f.id,
              p_flavor_name: f.name,
              p_quantity: f.quantity,
              p_surcharge_applied: f.surcharge
            });
            if (flavorError) throw flavorError;
          }
        }
      }

      if (paymentProof) {
        const fileExt = paymentProof.name.split(".").pop();
        const fileName = `${order.id}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(fileName, paymentProof);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("payment-proofs").getPublicUrl(fileName);
        await supabase.from("payment_proofs").insert({
          order_id: order.id,
          image_url: urlData.publicUrl
        });
        await supabase.from("orders").update({ status: "for_verification" }).eq("id", order.id);
      }

      toast.success("Order placed successfully!");
      // Navigate to thank you page
      window.location.href = `/thank-you/${order.id}`;
      form.reset();
      clearPaymentProof();
      setDeliveryFee(null);
      setDeliveryDistance(null);
      setActiveSection("delivery-address");
      setCompletedSections(new Set(["order-type"]));
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Checkout</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, handleInvalidSubmit)} className="p-4 space-y-3">
              {/* Compact Order Summary */}
              <CompactOrderSummary 
                cart={cart} 
                subtotal={total} 
                deliveryFee={deliveryFee} 
                grandTotal={grandTotal} 
              />

              {/* Section 1: Order Type - Always visible, not collapsible */}
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="flex items-center gap-3 p-3 bg-muted/30 border-b">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground">
                    <Package className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-sm">Order Type</span>
                </div>
                <div className="p-3">
                  <FormField 
                    control={form.control} 
                    name="orderType" 
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup 
                            onValueChange={field.onChange} 
                            value={field.value} 
                            className="grid grid-cols-2 gap-2"
                          >
                            <div>
                              <RadioGroupItem value="pickup" id="pickup" className="peer sr-only" />
                              <Label 
                                htmlFor="pickup" 
                                className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                              >
                                <Package className="h-5 w-5 mb-1" />
                                <span className="text-xs font-medium">Pickup</span>
                              </Label>
                            </div>
                            <div>
                              <RadioGroupItem value="delivery" id="delivery" className="peer sr-only" />
                              <Label 
                                htmlFor="delivery" 
                                className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer"
                              >
                                <Truck className="h-5 w-5 mb-1" />
                                <span className="text-xs font-medium">Delivery</span>
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )} 
                  />
                </div>
              </div>

              {/* Section 2a: Pickup Schedule (only for pickup) */}
              {orderType === "pickup" && (
                <AccordionSection
                  id="pickup-schedule"
                  title="Pickup Schedule"
                  icon={<CalendarIcon className="h-4 w-4" />}
                  summary={getSectionSummary("pickup-schedule")}
                  isActive={activeSection === "pickup-schedule"}
                  isCompleted={completedSections.has("pickup-schedule")}
                  isDisabled={!completedSections.has("order-type")}
                  hasError={getSectionErrors("pickup-schedule").length > 0}
                  onToggle={() => completedSections.has("order-type") && setActiveSection("pickup-schedule")}
                >
                  <p className="text-sm text-muted-foreground mb-3">
                    Schedule pickup up to 3 days in advance.
                  </p>

                  <FormField 
                    control={form.control} 
                    name="pickupDate" 
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Pickup Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button 
                                variant="outline" 
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Select pickup date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar 
                              mode="single" 
                              selected={field.value} 
                              onSelect={date => {
                                field.onChange(date);
                                form.setValue("pickupTime", undefined);
                              }} 
                              disabled={date => isBefore(date, startOfDay(new Date())) || isBefore(addDays(new Date(), 3), date)} 
                              initialFocus 
                              className={cn("p-3 pointer-events-auto")} 
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )} 
                  />

                  <FormField 
                    control={form.control} 
                    name="pickupTime" 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pickup Time *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!pickupDate}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={pickupDate ? "Select time" : "Select date first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {timeSlots.length > 0 ? timeSlots.map(slot => (
                              <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                            )) : (
                              <SelectItem value="none" disabled>No slots available for today</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} 
                  />

                  {pickupDate && pickupTime && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => setActiveSection("customer-info")}
                    >
                      Continue
                    </Button>
                  )}
                </AccordionSection>
              )}

              {/* Section 2b: Delivery Address & ETA (merged - only for delivery) */}
              {orderType === "delivery" && (
                <AccordionSection
                  id="delivery-address"
                  title="Delivery Address & ETA"
                  icon={<MapPin className="h-4 w-4" />}
                  summary={getSectionSummary("delivery-address")}
                  isActive={activeSection === "delivery-address"}
                  isCompleted={completedSections.has("delivery-address")}
                  isDisabled={!completedSections.has("order-type")}
                  hasError={getSectionErrors("delivery-address").length > 0}
                  onToggle={() => completedSections.has("order-type") && setActiveSection("delivery-address")}
                >
                  <DeliveryMapPicker 
                    onLocationSelect={handleLocationSelect} 
                    onFeeCalculated={handleFeeCalculated} 
                    onCalculating={handleCalculating}
                    onContinue={handleDeliveryContinue}
                    streetAddress={streetAddress || ""} 
                    onStreetAddressChange={value => form.setValue("streetAddress", value)} 
                    barangay={barangay} 
                    onBarangayChange={setBarangay} 
                    landmark={form.watch("landmark") || ""} 
                    onLandmarkChange={value => form.setValue("landmark", value)} 
                  />

                  {isCalculatingFee && (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm">Calculating delivery fee...</span>
                    </div>
                  )}
                </AccordionSection>
              )}

              {/* Section 3: Customer Information */}
              <AccordionSection
                id="customer-info"
                title="Customer Information"
                icon={<User className="h-4 w-4" />}
                summary={getSectionSummary("customer-info")}
                isActive={activeSection === "customer-info"}
                isCompleted={completedSections.has("customer-info")}
                isDisabled={orderType === "pickup" ? !completedSections.has("pickup-schedule") : !completedSections.has("delivery-address")}
                hasError={getSectionErrors("customer-info").length > 0}
                onToggle={() => {
                  const canAccess = orderType === "pickup" ? completedSections.has("pickup-schedule") : completedSections.has("delivery-address");
                  if (canAccess) setActiveSection("customer-info");
                }}
              >
                <FormField 
                  control={form.control} 
                  name="name" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />

                <FormField 
                  control={form.control} 
                  name="phone" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="09171234567" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Format: 09XX XXX XXXX or +639XX XXX XXXX</p>
                      <FormMessage />
                    </FormItem>
                  )} 
                />

                <FormField 
                  control={form.control} 
                  name="email" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="your@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />

                <FormField 
                  control={form.control} 
                  name="notes" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any special instructions..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />

                {customerName && customerName.length >= 2 && customerPhone && customerPhone.length >= 10 && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => setActiveSection("payment")}
                  >
                    Continue
                  </Button>
                )}
              </AccordionSection>

              {/* Section 4: Payment Method */}
              <AccordionSection
                id="payment"
                title="Payment Method"
                icon={<CreditCard className="h-4 w-4" />}
                summary={getSectionSummary("payment")}
                isActive={activeSection === "payment"}
                isCompleted={completedSections.has("payment")}
                isDisabled={!completedSections.has("customer-info")}
                onToggle={() => completedSections.has("customer-info") && setActiveSection("payment")}
              >
                <FormField 
                  control={form.control} 
                  name="paymentMethod" 
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup onValueChange={(value) => {
                          field.onChange(value);
                          // Clear payment proof when switching methods
                          if (value === "cash") {
                            clearPaymentProof();
                          }
                        }} value={field.value} className="space-y-2">
                          {/* Cash Option - Conditional */}
                          <div className={cn(
                            "flex items-center space-x-3 p-3 border rounded-lg",
                            isCashAllowed 
                              ? "cursor-pointer hover:bg-muted/50" 
                              : "opacity-50 cursor-not-allowed bg-muted/30"
                          )}>
                            <RadioGroupItem value="cash" id="cash" disabled={!isCashAllowed} />
                            <Label htmlFor="cash" className={cn("flex-1", isCashAllowed && "cursor-pointer")}>
                              <span className="font-medium">Cash</span>
                              <p className="text-xs text-muted-foreground">
                                {isCashAllowed 
                                  ? "Pay upon pickup"
                                  : orderType === "delivery"
                                    ? "Cash not available for delivery orders"
                                    : `Cash allowed for pickup orders up to ₱${CASH_MAX_AMOUNT} only`
                                }
                              </p>
                            </Label>
                          </div>

                          {/* GCash Option */}
                          <div className={cn(
                            "flex flex-col border rounded-lg transition-all",
                            paymentMethod === "gcash" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          )}>
                            <div className="flex items-center space-x-3 p-3 cursor-pointer">
                              <RadioGroupItem value="gcash" id="gcash" />
                              <Label htmlFor="gcash" className="flex-1 cursor-pointer">
                                <span className="font-medium">GCash</span>
                                <p className="text-xs text-muted-foreground">Scan QR & upload screenshot</p>
                              </Label>
                            </div>
                            
                            {/* GCash Details - Inline when selected */}
                            {paymentMethod === "gcash" && (
                              <div className="px-3 pb-3 pt-1 border-t border-primary/20 space-y-3">
                                <div className="bg-white p-4 rounded-lg text-center">
                                  <p className="text-sm font-medium text-foreground mb-2">Scan to pay via GCash</p>
                                  {getPaymentSetting('gcash_qr_url') ? (
                                    <img 
                                      src={getPaymentSetting('gcash_qr_url')} 
                                      alt="GCash QR Code" 
                                      className="w-40 h-40 mx-auto object-contain border rounded-lg"
                                    />
                                  ) : (
                                    <div className="w-40 h-40 mx-auto bg-muted rounded-lg flex items-center justify-center border">
                                      <span className="text-xs text-muted-foreground">QR Code not set</span>
                                    </div>
                                  )}
                                  <p className="text-sm mt-2 font-medium">
                                    {getPaymentSetting('gcash_account_name') || 'American Ribs & Wings'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {getPaymentSetting('gcash_number') || 'Contact store for number'}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bank Transfer Option */}
                          <div className={cn(
                            "flex flex-col border rounded-lg transition-all",
                            paymentMethod === "bank" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          )}>
                            <div className="flex items-center space-x-3 p-3 cursor-pointer">
                              <RadioGroupItem value="bank" id="bank" />
                              <Label htmlFor="bank" className="flex-1 cursor-pointer">
                                <span className="font-medium">Bank Transfer</span>
                                <p className="text-xs text-muted-foreground">Scan QR & upload screenshot</p>
                              </Label>
                            </div>
                            
                            {/* Bank Details - Inline when selected */}
                            {paymentMethod === "bank" && (
                              <div className="px-3 pb-3 pt-1 border-t border-primary/20 space-y-3">
                                <div className="bg-white p-4 rounded-lg text-center">
                                  <p className="text-sm font-medium text-foreground mb-2">Bank Transfer Details</p>
                                  {getPaymentSetting('bank_qr_url') ? (
                                    <img 
                                      src={getPaymentSetting('bank_qr_url')} 
                                      alt="Bank QR Code" 
                                      className="w-40 h-40 mx-auto object-contain border rounded-lg"
                                    />
                                  ) : (
                                    <div className="w-40 h-40 mx-auto bg-muted rounded-lg flex items-center justify-center border">
                                      <span className="text-xs text-muted-foreground">QR Code not set</span>
                                    </div>
                                  )}
                                  <p className="text-sm mt-2 font-medium">
                                    {getPaymentSetting('bank_name') || 'Bank'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {getPaymentSetting('bank_account_name') || 'American Ribs & Wings'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {getPaymentSetting('bank_account_number') || 'Contact store for account'}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )} 
                />

                {/* Payment Proof Upload - Only for GCash/Bank */}
                {(paymentMethod === "gcash" || paymentMethod === "bank") && (
                  <div className="space-y-2 mt-3">
                    <Label className="flex items-center gap-2">
                      Upload Payment Screenshot *
                      {!paymentProof && (
                        <span className="text-xs text-destructive">(Required)</span>
                      )}
                    </Label>
                    {paymentProofPreview ? (
                      <div className="relative">
                        <img 
                          src={paymentProofPreview} 
                          alt="Payment proof" 
                          className="w-full h-40 object-cover rounded-lg border" 
                        />
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="icon" 
                          className="absolute top-2 right-2 h-7 w-7" 
                          onClick={clearPaymentProof}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Uploaded
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-destructive/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Click to upload screenshot</span>
                        <span className="text-xs text-destructive mt-1">Required to place order</span>
                        <input 
                          type="file" 
                          accept="image/jpeg,image/png,image/jpg" 
                          className="hidden" 
                          onChange={handlePaymentProofChange} 
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Continue Button */}
                {(paymentMethod === "cash" || paymentProof) && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-3"
                    onClick={() => setActiveSection("review")}
                  >
                    Continue to Review
                  </Button>
                )}
              </AccordionSection>

              {/* Section 5: Review & Place Order */}
              <AccordionSection
                id="review"
                title="Review & Place Order"
                icon={<ClipboardList className="h-4 w-4" />}
                summary={getSectionSummary("review")}
                isActive={activeSection === "review"}
                isCompleted={false}
                isDisabled={!completedSections.has("payment")}
                onToggle={() => completedSections.has("payment") && setActiveSection("review")}
              >
                <div className="space-y-3">
                  {/* Detailed Order Items */}
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium mb-2">Order Items</p>
                    {cart.map(item => (
                      <div key={item.id} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{item.quantity}x {item.product.name}</span>
                          <span>₱{item.lineTotal.toFixed(2)}</span>
                        </div>
                        {item.flavors && item.flavors.length > 0 && (
                          <div className="ml-4 space-y-0.5">
                            {item.flavors.map((flavor, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                <span>
                                  • {flavor.name} {flavor.quantity > 1 && `(${flavor.quantity}x)`}
                                </span>
                                {flavor.surcharge > 0 && (
                                  <span className="text-primary">+₱{(flavor.surcharge * flavor.quantity).toFixed(2)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>₱{total.toFixed(2)}</span>
                    </div>
                    {deliveryFee !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery Fee ({deliveryDistance} km)</span>
                        <span>₱{deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold">
                      <span>Grand Total</span>
                      <span className="text-primary text-lg">₱{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment proof warning */}
                  {(paymentMethod === "gcash" || paymentMethod === "bank") && !paymentProof && (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Please upload your payment proof to continue
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg" 
                    disabled={
                      isSubmitting || 
                      (orderType === "delivery" && (isCalculatingFee || deliveryFee === null)) ||
                      ((paymentMethod === "gcash" || paymentMethod === "bank") && !paymentProof)
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Placing Order...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Place Order · ₱{grandTotal.toFixed(2)}
                      </>
                    )}
                  </Button>
                </div>
              </AccordionSection>
            </form>
          </Form>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
