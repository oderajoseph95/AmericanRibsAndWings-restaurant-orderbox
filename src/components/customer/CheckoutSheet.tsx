import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, isBefore, startOfDay, isToday, setHours, setMinutes } from "date-fns";
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
import { Loader2, Upload, X, Check, Package, Truck, CalendarIcon, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DeliveryMapPicker } from "./DeliveryMapPicker";
import type { CartItem, OrderType } from "@/pages/Order";
const checkoutSchema = z.object({
  orderType: z.enum(["pickup", "delivery"]),
  pickupDate: z.date().optional(),
  pickupTime: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().min(10, "Phone number is required").max(15),
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
interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  total: number;
  onOrderConfirmed: (orderNumber: string, orderId: string, orderType: OrderType, pickupDate?: string, pickupTime?: string) => void;
}

// Generate time slots from 10 AM to 9 PM in 30-minute intervals
function generateTimeSlots(selectedDate: Date | undefined): string[] {
  const slots: string[] = [];
  const now = new Date();
  const isSelectedToday = selectedDate && isToday(selectedDate);
  for (let hour = 10; hour <= 21; hour++) {
    for (let minute of [0, 30]) {
      // Skip 9:30 PM
      if (hour === 21 && minute === 30) continue;
      const slotTime = setMinutes(setHours(new Date(), hour), minute);

      // If today, skip times that have already passed (+ 1 hour buffer)
      if (isSelectedToday) {
        const bufferTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
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
  const [barangay, setBarangay] = useState("");
  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      orderType: "pickup",
      name: "",
      phone: "",
      email: "",
      streetAddress: "",
      city: "",
      landmark: "",
      notes: "",
      paymentMethod: "cash"
    }
  });
  const paymentMethod = form.watch("paymentMethod");
  const orderType = form.watch("orderType");
  const pickupDate = form.watch("pickupDate");
  const streetAddress = form.watch("streetAddress");
  const city = form.watch("city");
  const [geocodedAddress, setGeocodedAddress] = useState<string>("");

  // Reset delivery fee when switching order type
  useEffect(() => {
    if (orderType === "pickup") {
      setDeliveryFee(null);
      setDeliveryDistance(null);
      setBarangay("");
    }
  }, [orderType]);

  // Handle location selection from map picker
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
  const handleFeeCalculated = (fee: number, distance: number) => {
    setDeliveryFee(fee);
    setDeliveryDistance(distance);
  };
  const handleCalculating = (calculating: boolean) => {
    setIsCalculatingFee(calculating);
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
  const grandTotal = total + (deliveryFee || 0);
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
      // 1. Create or find customer
      const {
        data: customer,
        error: customerError
      } = await supabase.from("customers").insert({
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || null
      }).select().single();
      if (customerError) throw customerError;

      // Build delivery address string (include barangay)
      const deliveryAddress = data.orderType === "delivery" ? `${data.streetAddress}, ${barangay}, ${data.city}, Pampanga${data.landmark ? ` (Landmark: ${data.landmark})` : ""} [GPS: ${data.customerLat?.toFixed(5)}, ${data.customerLng?.toFixed(5)}]` : null;

      // 2. Create order
      const orderData = {
        customer_id: customer.id,
        order_type: data.orderType as OrderType,
        status: "pending" as const,
        subtotal: total,
        total_amount: grandTotal,
        delivery_address: deliveryAddress,
        delivery_fee: deliveryFee || 0,
        delivery_distance_km: deliveryDistance,
        pickup_date: data.orderType === "pickup" && data.pickupDate ? format(data.pickupDate, "yyyy-MM-dd") : null,
        pickup_time: data.orderType === "pickup" && data.pickupTime ? data.pickupTime : null,
        internal_notes: data.notes || null
      };
      const {
        data: order,
        error: orderError
      } = await supabase.from("orders").insert(orderData).select().single();
      if (orderError) throw orderError;

      // 3. Create order items
      for (const item of cart) {
        const orderItemData = {
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          product_sku: item.product.sku,
          quantity: item.quantity,
          unit_price: item.product.price,
          subtotal: item.quantity * item.product.price,
          flavor_surcharge_total: item.flavors?.reduce((sum, f) => sum + f.surcharge * f.quantity, 0) || 0,
          line_total: item.lineTotal
        };
        const {
          data: orderItem,
          error: itemError
        } = await supabase.from("order_items").insert(orderItemData).select().single();
        if (itemError) throw itemError;

        // 4. Create order item flavors
        if (item.flavors && item.flavors.length > 0) {
          const flavorInserts = item.flavors.map(f => ({
            order_item_id: orderItem.id,
            flavor_id: f.id,
            flavor_name: f.name,
            quantity: f.quantity,
            surcharge_applied: f.surcharge
          }));
          const {
            error: flavorError
          } = await supabase.from("order_item_flavors").insert(flavorInserts);
          if (flavorError) throw flavorError;
        }
      }

      // 5. Upload payment proof if present
      if (paymentProof) {
        const fileExt = paymentProof.name.split(".").pop();
        const fileName = `${order.id}.${fileExt}`;
        const {
          error: uploadError
        } = await supabase.storage.from("payment-proofs").upload(fileName, paymentProof);
        if (uploadError) throw uploadError;
        const {
          data: urlData
        } = supabase.storage.from("payment-proofs").getPublicUrl(fileName);
        await supabase.from("payment_proofs").insert({
          order_id: order.id,
          image_url: urlData.publicUrl
        });

        // Update order status to for_verification
        await supabase.from("orders").update({
          status: "for_verification"
        }).eq("id", order.id);
      }
      toast.success("Order placed successfully!");
      onOrderConfirmed(order.order_number || order.id, order.id, data.orderType as OrderType, data.pickupDate ? format(data.pickupDate, "MMMM d, yyyy") : undefined, data.pickupTime);
      form.reset();
      clearPaymentProof();
      setDeliveryFee(null);
      setDeliveryDistance(null);
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  return <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Checkout</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-6">
              {/* Order summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-medium mb-2">Order Summary</h3>
                <div className="space-y-1 text-sm">
                  {cart.map(item => <div key={item.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span>₱{item.lineTotal.toFixed(2)}</span>
                    </div>)}
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₱{total.toFixed(2)}</span>
                </div>
                {orderType === "delivery" && <div className="flex justify-between text-sm">
                    <span>
                      Delivery Fee
                      {deliveryDistance && ` (${deliveryDistance} km)`}
                    </span>
                    {isCalculatingFee ? <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculating...
                      </span> : deliveryFee !== null ? <span>₱{deliveryFee.toFixed(2)}</span> : <span className="text-muted-foreground">--</span>}
                  </div>}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-primary">₱{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Order type selection */}
              <div className="space-y-4">
                <h3 className="font-medium">Order Type</h3>
                <FormField control={form.control} name="orderType" render={({
                field
              }) => <FormItem>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-2">
                          <div>
                            <RadioGroupItem value="pickup" id="pickup" className="peer sr-only" />
                            <Label htmlFor="pickup" className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                              <Package className="h-5 w-5 mb-1" />
                              <span className="text-xs font-medium">Pickup</span>
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem value="delivery" id="delivery" className="peer sr-only" />
                            <Label htmlFor="delivery" className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                              <Truck className="h-5 w-5 mb-1" />
                              <span className="text-xs font-medium">Delivery</span>
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>} />
              </div>

              {/* Pickup date/time selection */}
              {orderType === "pickup" && <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-medium">Pickup Schedule</h3>
                  <p className="text-sm text-muted-foreground">
                    You can schedule pickup up to 3 days in advance.
                  </p>

                  <FormField control={form.control} name="pickupDate" render={({
                field
              }) => <FormItem className="flex flex-col">
                        <FormLabel>Pickup Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "PPP") : <span>Select pickup date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={date => {
                      field.onChange(date);
                      // Reset time when date changes
                      form.setValue("pickupTime", undefined);
                    }} disabled={date => isBefore(date, startOfDay(new Date())) || isBefore(addDays(new Date(), 3), date)} initialFocus className={cn("p-3 pointer-events-auto")} />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="pickupTime" render={({
                field
              }) => <FormItem>
                        <FormLabel>Pickup Time *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!pickupDate}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={pickupDate ? "Select time" : "Select date first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {timeSlots.length > 0 ? timeSlots.map(slot => <SelectItem key={slot} value={slot}>
                                  {slot}
                                </SelectItem>) : <SelectItem value="none" disabled>
                                No slots available for today
                              </SelectItem>}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>} />
                </div>}

              {/* Delivery address with map picker */}
              {orderType === "delivery" && <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-medium">Delivery Address</h3>
                  

                  <DeliveryMapPicker onLocationSelect={handleLocationSelect} onFeeCalculated={handleFeeCalculated} onCalculating={handleCalculating} streetAddress={streetAddress || ""} onStreetAddressChange={value => form.setValue("streetAddress", value)} barangay={barangay} onBarangayChange={setBarangay} landmark={form.watch("landmark") || ""} onLandmarkChange={value => form.setValue("landmark", value)} />

                  {/* Delivery fee display */}
                  {(isCalculatingFee || deliveryFee !== null) && <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                      <MapPin className="h-4 w-4 text-primary" />
                      {isCalculatingFee ? <span className="text-sm flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Calculating delivery fee...
                        </span> : deliveryFee !== null && <span className="text-sm">
                          <span className="font-medium">{deliveryDistance} km</span> - Delivery fee: <span className="font-semibold text-primary">₱{deliveryFee.toFixed(2)}</span>
                        </span>}
                    </div>}
                </div>}

              {/* Customer info */}
              <div className="space-y-4">
                <h3 className="font-medium">Customer Information</h3>

                <FormField control={form.control} name="name" render={({
                field
              }) => <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="phone" render={({
                field
              }) => <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="09XX XXX XXXX" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="email" render={({
                field
              }) => <FormItem>
                      <FormLabel>Email (optional)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="your@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="notes" render={({
                field
              }) => <FormItem>
                      <FormLabel>Order Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any special instructions..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />
              </div>

              {/* Payment method */}
              <div className="space-y-4">
                <h3 className="font-medium">Payment Method</h3>

                <FormField control={form.control} name="paymentMethod" render={({
                field
              }) => <FormItem>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2">
                          <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <RadioGroupItem value="cash" id="cash" />
                            <Label htmlFor="cash" className="flex-1 cursor-pointer">
                              <span className="font-medium">Cash</span>
                              <p className="text-xs text-muted-foreground">
                                Pay upon {orderType === "delivery" ? "delivery" : "pickup"}
                              </p>
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <RadioGroupItem value="gcash" id="gcash" />
                            <Label htmlFor="gcash" className="flex-1 cursor-pointer">
                              <span className="font-medium">GCash</span>
                              <p className="text-xs text-muted-foreground">
                                Upload payment screenshot
                              </p>
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <RadioGroupItem value="bank" id="bank" />
                            <Label htmlFor="bank" className="flex-1 cursor-pointer">
                              <span className="font-medium">Bank Transfer</span>
                              <p className="text-xs text-muted-foreground">
                                Upload payment screenshot
                              </p>
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>} />

                {/* Payment proof upload */}
                {(paymentMethod === "gcash" || paymentMethod === "bank") && <div className="space-y-2">
                    <Label>Payment Proof *</Label>
                    {paymentProofPreview ? <div className="relative">
                        <img src={paymentProofPreview} alt="Payment proof" className="w-full h-48 object-cover rounded-lg border" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={clearPaymentProof}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div> : <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">
                          Click to upload screenshot
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={handlePaymentProofChange} />
                      </label>}
                  </div>}
              </div>

              {/* Submit */}
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || orderType === "delivery" && (isCalculatingFee || deliveryFee === null)}>
                {isSubmitting ? <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Placing Order...
                  </> : <>
                    <Check className="h-4 w-4 mr-2" />
                    Place Order · ₱{grandTotal.toFixed(2)}
                  </>}
              </Button>
            </form>
          </Form>
        </ScrollArea>
      </SheetContent>
    </Sheet>;
}