import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriverNotification {
  id: string;
  driver_id: string;
  title: string;
  message: string;
  type: string | null;
  order_id: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

export function useDriverNotifications(driverId?: string) {
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["driver-notifications", driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from("driver_notifications")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as DriverNotification[];
    },
    enabled: !!driverId,
  });

  // Update unread count when notifications change
  useEffect(() => {
    const count = notifications.filter((n) => !n.is_read).length;
    setUnreadCount(count);
  }, [notifications]);

  // Setup realtime subscription
  useEffect(() => {
    if (!driverId) return;

    const channel = supabase
      .channel(`driver-notifications-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "driver_notifications",
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["driver-notifications", driverId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("driver_notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-notifications", driverId] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!driverId) return;
      const { error } = await supabase
        .from("driver_notifications")
        .update({ is_read: true })
        .eq("driver_id", driverId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-notifications", driverId] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    isMarkingAllAsRead: markAllAsRead.isPending,
  };
}

// Utility function to create a driver notification
export async function createDriverNotification(payload: {
  driverId: string;
  title: string;
  message: string;
  type?: string;
  orderId?: string;
}) {
  const { error } = await supabase.from("driver_notifications").insert({
    driver_id: payload.driverId,
    title: payload.title,
    message: payload.message,
    type: payload.type || "order",
    order_id: payload.orderId || null,
  });

  if (error) {
    console.error("Failed to create driver notification:", error);
  }
}
