import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";

export interface NotificationMetadata {
  order_number?: string;
  customer_name?: string;
  customer_phone?: string;
  order_type?: string;
  total_amount?: number;
  items?: { name: string; quantity: number; price: number }[];
  delivery_address?: string;
  driver_name?: string;
  driver_id?: string;
  driver_phone?: string;
  payout_amount?: number;
  amount?: number;
  payment_method?: string;
  action_url?: string;
  action_label?: string;
}

export interface AdminNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
  metadata: NotificationMetadata | null;
  action_url: string | null;
}

export function useAdminNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["admin-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AdminNotification[];
    },
    enabled: !!user?.id,
  });

  // Update unread count
  useEffect(() => {
    const count = notifications.filter((n) => !n.is_read).length;
    setUnreadCount(count);
  }, [notifications]);

  // Setup realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("admin-notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  // Delete single notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("admin_notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  // Delete all notifications
  const deleteAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from("admin_notifications")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    deleteNotification: deleteNotificationMutation.mutate,
    deleteAllNotifications: deleteAllNotificationsMutation.mutate,
    isDeletingAll: deleteAllNotificationsMutation.isPending,
  };
}

// Helper function to create notifications for all admins with metadata
export async function createAdminNotification(payload: {
  title: string;
  message: string;
  type?: string;
  order_id?: string;
  metadata?: NotificationMetadata;
  action_url?: string;
}) {
  // Get all admin user IDs
  const { data: adminUsers, error: usersError } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["owner", "manager", "cashier"]);

  if (usersError) {
    console.error("Failed to fetch admin users:", usersError);
    return;
  }

  if (!adminUsers?.length) return;

  // Create notification for each admin
  const notifications = adminUsers.map((admin) => ({
    user_id: admin.user_id,
    title: payload.title,
    message: payload.message,
    type: payload.type || "info",
    order_id: payload.order_id || null,
    metadata: (payload.metadata || {}) as Json,
    action_url: payload.action_url || null,
  }));

  const { error } = await supabase
    .from("admin_notifications")
    .insert(notifications);

  if (error) {
    console.error("Failed to create notifications:", error);
  }
}
