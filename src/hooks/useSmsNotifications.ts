import { supabase } from "@/integrations/supabase/client";

export type SmsType = 
  | "order_received"
  | "payment_verified"
  | "driver_assigned"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_rejected"
  | "order_cancelled"
  | "order_preparing"
  | "order_ready_for_pickup"
  | "order_completed"
  | "review_request"
  | "test";

export interface SmsNotificationPayload {
  type: SmsType;
  recipientPhone?: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  driverName?: string;
  driverPhone?: string;
  totalAmount?: number;
  deliveryAddress?: string;
  reason?: string;
}

export async function sendSmsNotification(payload: SmsNotificationPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms-notification", {
      body: payload,
    });
    
    if (error) {
      console.error("SMS notification error:", error);
      return { success: false, error: error.message };
    }
    
    console.log("SMS notification sent:", data);
    return { success: true };
  } catch (error: any) {
    console.error("SMS notification error:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

export async function sendTestSms(phone: string): Promise<{ success: boolean; error?: string }> {
  return sendSmsNotification({
    type: "test",
    recipientPhone: phone,
  });
}
