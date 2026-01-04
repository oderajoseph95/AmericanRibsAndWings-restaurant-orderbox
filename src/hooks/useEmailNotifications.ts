import { supabase } from "@/integrations/supabase/client";

export type EmailType = 
  | "new_order"
  | "order_approved"
  | "order_rejected"
  | "order_cancelled"
  | "order_preparing"
  | "order_ready_for_pickup"
  | "order_picked_up"
  | "order_in_transit"
  | "order_delivered"
  | "order_completed"
  | "driver_assigned"
  | "payout_requested"
  | "payout_approved"
  | "payout_rejected";

export interface EmailNotificationPayload {
  type: EmailType;
  recipientEmail: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  totalAmount?: number;
  deliveryAddress?: string;
  orderType?: string;
  driverName?: string;
  driverPhone?: string;
  payoutAmount?: number;
  reason?: string;
}

export async function sendEmailNotification(payload: EmailNotificationPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email-notification", {
      body: payload,
    });

    if (error) {
      console.error("Email notification error:", error);
      return { success: false, error: error.message };
    }

    console.log("Email notification sent:", data);
    return { success: true };
  } catch (err: any) {
    console.error("Email notification failed:", err);
    return { success: false, error: err.message };
  }
}
