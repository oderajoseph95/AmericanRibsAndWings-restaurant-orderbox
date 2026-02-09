import { useState, useEffect } from "react";
import { format, addDays, isBefore, startOfDay, isToday, setHours, setMinutes } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarIcon, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminLogger";
import { cn } from "@/lib/utils";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Order = Tables<"orders"> & {
  customers: Tables<"customers"> | null;
};

type OrderItem = Tables<"order_items"> & {
  order_item_flavors: Tables<"order_item_flavors">[];
};

interface OrderEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  orderItems: OrderItem[];
  onSuccess: () => void;
}

// Pickup time slots: 11 AM to 9 PM, 15-min intervals
function generatePickupTimeSlots(selectedDate: Date | undefined): string[] {
  const slots: string[] = [];
  const now = new Date();
  const isSelectedToday = selectedDate && isToday(selectedDate);

  for (let hour = 11; hour <= 21; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      if (hour === 21 && minute > 0) continue;
      const slotTime = setMinutes(setHours(new Date(), hour), minute);

      // For admin editing, allow past times on future dates
      if (isSelectedToday && isBefore(slotTime, now)) continue;

      const timeStr = format(slotTime, "h:mm a");
      slots.push(timeStr);
    }
  }
  return slots;
}

// Delivery time slots: 12 PM to 8 PM, 15-min intervals
function generateDeliveryTimeSlots(selectedDate: Date | undefined): string[] {
  const slots: string[] = [];
  const now = new Date();
  const isSelectedToday = selectedDate && isToday(selectedDate);

  for (let hour = 12; hour <= 20; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      if (hour === 20 && minute > 0) continue;
      const slotTime = setMinutes(setHours(new Date(), hour), minute);

      if (isSelectedToday && isBefore(slotTime, now)) continue;

      const timeStr = format(slotTime, "h:mm a");
      slots.push(timeStr);
    }
  }
  return slots;
}

// Validate Philippine phone number
const validatePhilippinePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (cleaned.startsWith("+63")) {
    return /^\+639\d{9}$/.test(cleaned);
  }
  if (cleaned.startsWith("63")) {
    return /^639\d{9}$/.test(cleaned);
  }
  if (cleaned.startsWith("09")) {
    return /^09\d{9}$/.test(cleaned);
  }
  return false;
};

export function OrderEditDialog({
  open,
  onOpenChange,
  order,
  orderItems,
  onSuccess,
}: OrderEditDialogProps) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("schedule");
  const [itemToDelete, setItemToDelete] = useState<OrderItem | null>(null);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Schedule state
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState<string | undefined>(undefined);

  // Items state - local copy for editing
  const [editedItems, setEditedItems] = useState<
    Array<{ id: string; productName: string; quantity: number; unitPrice: number; subtotal: number; lineTotal: number }>
  >([]);

  // Customer state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Delivery address state
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Internal notes state
  const [internalNotes, setInternalNotes] = useState("");

  // Initialize state when dialog opens
  useEffect(() => {
    if (open && order) {
      // Schedule
      if (order.order_type === "pickup" && order.pickup_date) {
        setScheduleDate(new Date(order.pickup_date));
        setScheduleTime(order.pickup_time || undefined);
      } else if (order.order_type === "delivery" && order.delivery_date) {
        setScheduleDate(new Date(order.delivery_date));
        setScheduleTime(order.delivery_time || undefined);
      } else {
        setScheduleDate(undefined);
        setScheduleTime(undefined);
      }

      // Items
      setEditedItems(
        orderItems.map((item) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          subtotal: item.subtotal,
          lineTotal: item.line_total || item.subtotal,
        }))
      );

      // Customer
      setCustomerName(order.customers?.name || "");
      setCustomerPhone(order.customers?.phone || "");
      setCustomerEmail(order.customers?.email || "");

      // Delivery
      setDeliveryAddress(order.delivery_address || "");

      // Notes
      setInternalNotes(order.internal_notes || "");
    }
  }, [open, order, orderItems]);

  // Generate time slots based on order type
  const timeSlots =
    order.order_type === "pickup"
      ? generatePickupTimeSlots(scheduleDate)
      : generateDeliveryTimeSlots(scheduleDate);

  // Calculate new totals from edited items
  const calculateTotals = () => {
    const newSubtotal = editedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const deliveryFee = order.delivery_fee || 0;
    const newTotal = newSubtotal + deliveryFee;
    return { newSubtotal, newTotal, deliveryFee };
  };

  // Update item quantity
  const updateItemQuantity = (itemId: string, delta: number) => {
    setEditedItems((items) =>
      items.map((item) => {
        if (item.id === itemId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          const newSubtotal = newQuantity * item.unitPrice;
          // Preserve surcharge ratio if any
          const originalItem = orderItems.find((oi) => oi.id === itemId);
          const surcharge = originalItem?.flavor_surcharge_total || 0;
          const newLineTotal = newSubtotal + surcharge;
          return {
            ...item,
            quantity: newQuantity,
            subtotal: newSubtotal,
            lineTotal: newLineTotal,
          };
        }
        return item;
      })
    );
  };

  // Remove item
  const removeItem = (itemId: string) => {
    setEditedItems((items) => items.filter((item) => item.id !== itemId));
    setItemToDelete(null);
  };

  // Save all changes
  const handleSave = async () => {
    setIsSaving(true);

    try {
      const changes: string[] = [];
      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};

      // 1. Update schedule if changed
      const originalDate =
        order.order_type === "pickup" ? order.pickup_date : order.delivery_date;
      const originalTime =
        order.order_type === "pickup" ? order.pickup_time : order.delivery_time;
      const newDateStr = scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : null;

      if (newDateStr !== originalDate || scheduleTime !== originalTime) {
        const scheduleUpdate =
          order.order_type === "pickup"
            ? { pickup_date: newDateStr, pickup_time: scheduleTime }
            : { delivery_date: newDateStr, delivery_time: scheduleTime };

        const { error: scheduleError } = await supabase
          .from("orders")
          .update(scheduleUpdate)
          .eq("id", order.id);

        if (scheduleError) throw scheduleError;

        changes.push("schedule");
        oldValues.schedule = { date: originalDate, time: originalTime };
        newValues.schedule = { date: newDateStr, time: scheduleTime };
      }

      // 2. Update items if changed
      const itemChanges: string[] = [];

      for (const editedItem of editedItems) {
        const originalItem = orderItems.find((oi) => oi.id === editedItem.id);
        if (originalItem && originalItem.quantity !== editedItem.quantity) {
          const { error: itemError } = await supabase
            .from("order_items")
            .update({
              quantity: editedItem.quantity,
              subtotal: editedItem.subtotal,
              line_total: editedItem.lineTotal,
            })
            .eq("id", editedItem.id);

          if (itemError) throw itemError;
          itemChanges.push(
            `${editedItem.productName}: ${originalItem.quantity} → ${editedItem.quantity}`
          );
        }
      }

      // Delete removed items
      const removedItems = orderItems.filter(
        (oi) => !editedItems.find((ei) => ei.id === oi.id)
      );
      for (const removedItem of removedItems) {
        // First delete associated flavors
        await supabase
          .from("order_item_flavors")
          .delete()
          .eq("order_item_id", removedItem.id);

        // Then delete the item
        const { error: deleteError } = await supabase
          .from("order_items")
          .delete()
          .eq("id", removedItem.id);

        if (deleteError) throw deleteError;
        itemChanges.push(`Removed: ${removedItem.product_name}`);
      }

      // Update order totals if items changed
      if (itemChanges.length > 0) {
        const { newSubtotal, newTotal } = calculateTotals();
        const { error: totalsError } = await supabase
          .from("orders")
          .update({ subtotal: newSubtotal, total_amount: newTotal })
          .eq("id", order.id);

        if (totalsError) throw totalsError;

        changes.push("items");
        oldValues.items = orderItems.map((oi) => ({
          name: oi.product_name,
          qty: oi.quantity,
        }));
        newValues.items = editedItems.map((ei) => ({
          name: ei.productName,
          qty: ei.quantity,
        }));
        newValues.itemChanges = itemChanges;
      }

      // 3. Update customer if changed
      if (order.customer_id) {
        const customerChanged =
          customerName !== (order.customers?.name || "") ||
          customerPhone !== (order.customers?.phone || "") ||
          customerEmail !== (order.customers?.email || "");

        if (customerChanged) {
          // Validate phone if provided
          if (customerPhone && !validatePhilippinePhone(customerPhone)) {
            toast.error("Invalid phone format. Use 09XXXXXXXXX or +639XXXXXXXXX");
            setIsSaving(false);
            return;
          }

          const { error: customerError } = await supabase
            .from("customers")
            .update({
              name: customerName,
              phone: customerPhone || null,
              email: customerEmail || null,
            })
            .eq("id", order.customer_id);

          if (customerError) throw customerError;

          changes.push("customer");
          oldValues.customer = {
            name: order.customers?.name,
            phone: order.customers?.phone,
            email: order.customers?.email,
          };
          newValues.customer = {
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
          };
        }
      }

      // 4. Update delivery address if changed
      if (
        order.order_type === "delivery" &&
        deliveryAddress !== (order.delivery_address || "")
      ) {
        const { error: addressError } = await supabase
          .from("orders")
          .update({ delivery_address: deliveryAddress })
          .eq("id", order.id);

        if (addressError) throw addressError;

        changes.push("delivery_address");
        oldValues.delivery_address = order.delivery_address;
        newValues.delivery_address = deliveryAddress;
      }

      // 5. Update internal notes if changed
      if (internalNotes !== (order.internal_notes || "")) {
        const { error: notesError } = await supabase
          .from("orders")
          .update({ internal_notes: internalNotes })
          .eq("id", order.id);

        if (notesError) throw notesError;

        changes.push("internal_notes");
        oldValues.internal_notes = order.internal_notes;
        newValues.internal_notes = internalNotes;
      }

      // Log the action if any changes were made
      if (changes.length > 0) {
        await logAdminAction({
          action: "edit_order",
          entityType: "order",
          entityId: order.id,
          entityName: order.order_number || undefined,
          oldValues,
          newValues,
          details: `Edited: ${changes.join(", ")}`,
        });

        toast.success("Order updated successfully");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["order-items", order.id] });
        onSuccess();
        onOpenChange(false);
      } else {
        toast.info("No changes to save");
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error("Failed to update order");
    } finally {
      setIsSaving(false);
    }
  };

  const { newSubtotal, newTotal, deliveryFee } = calculateTotals();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order {order.order_number}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="customer">Customer</TabsTrigger>
              {order.order_type === "delivery" && (
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
              )}
            </TabsList>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>
                    {order.order_type === "pickup" ? "Pickup" : "Delivery"} Date
                  </Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !scheduleDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduleDate ? format(scheduleDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={(date) => {
                          setScheduleDate(date);
                          setScheduleTime(undefined);
                          setDatePopoverOpen(false);
                        }}
                        disabled={(date) =>
                          isBefore(date, startOfDay(new Date())) ||
                          isBefore(addDays(new Date(), 30), date)
                        }
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>
                    {order.order_type === "pickup" ? "Pickup" : "Delivery"} Time
                  </Label>
                  <Select
                    value={scheduleTime}
                    onValueChange={setScheduleTime}
                    disabled={!scheduleDate}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={scheduleDate ? "Select time" : "Select date first"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.length > 0 ? (
                        timeSlots.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No slots available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="font-medium">Operating Hours:</p>
                  <p className="text-muted-foreground">
                    {order.order_type === "pickup"
                      ? "Pickup: 11:00 AM - 9:00 PM"
                      : "Delivery: 12:00 PM - 8:00 PM"}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Items Tab */}
            <TabsContent value="items" className="space-y-4 mt-4">
              <div className="space-y-3">
                {editedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        ₱{item.unitPrice.toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateItemQuantity(item.id, -1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateItemQuantity(item.id, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span className="w-20 text-right font-medium">
                        ₱{item.lineTotal.toFixed(2)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() =>
                          setItemToDelete(orderItems.find((oi) => oi.id === item.id) || null)
                        }
                        disabled={editedItems.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₱{newSubtotal.toFixed(2)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery Fee</span>
                    <span>₱{deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-2 border-t">
                  <span>New Total</span>
                  <span>₱{newTotal.toFixed(2)}</span>
                </div>
              </div>
            </TabsContent>

            {/* Customer Tab */}
            <TabsContent value="customer" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-name">Name</Label>
                  <Input
                    id="customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-phone">Phone</Label>
                  <Input
                    id="customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="09XXXXXXXXX"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: 09XXXXXXXXX or +639XXXXXXXXX
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-email">Email (optional)</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@email.com"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Delivery Tab */}
            {order.order_type === "delivery" && (
              <TabsContent value="delivery" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="delivery-address">Delivery Address</Label>
                    <Textarea
                      id="delivery-address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Full delivery address"
                      rows={3}
                    />
                  </div>

                  {order.delivery_distance_km && (
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span>Distance</span>
                        <span>{order.delivery_distance_km.toFixed(1)} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery Fee</span>
                        <span>₱{(order.delivery_fee || 0).toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: Changing the address does not recalculate the delivery fee.
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="internal-notes">Internal Notes</Label>
                    <Textarea
                      id="internal-notes"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Notes for staff (not visible to customer)"
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{itemToDelete?.product_name}" from this order?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && removeItem(itemToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
