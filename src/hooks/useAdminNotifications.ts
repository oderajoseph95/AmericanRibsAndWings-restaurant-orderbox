import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";

export type NotificationCategory = "all" | "order" | "driver" | "email" | "system";

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
  event?: string;
  email_type?: string;
  recipient_type?: string;
  recipient_email?: string;
  new_status?: string;
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

const PAGE_SIZE = 20;

export function useAdminNotifications(activeTab: NotificationCategory = "all") {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(0);
  const [allNotifications, setAllNotifications] = useState<AdminNotification[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // Fetch notifications with pagination - refetches when tab changes
  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["admin-notifications", user?.id, activeTab, page],
    queryFn: async () => {
      if (!user?.id) return { notifications: [], total: 0 };
      
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      let query = supabase
        .from("admin_notifications")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      // Filter by type if not "all"
      if (activeTab !== "all") {
        query = query.eq("type", activeTab);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      return { 
        notifications: data as AdminNotification[], 
        total: count || 0 
      };
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch when dependencies change
  });

  // Reset page when tab changes, and update notifications when data arrives
  useEffect(() => {
    // When tab changes, reset to page 0
    setPage(0);
  }, [activeTab]);

  // Handle page data updates - separate from tab change reset
  useEffect(() => {
    if (pageData?.notifications !== undefined) {
      if (page === 0) {
        // First page: replace all notifications
        setAllNotifications(pageData.notifications);
      } else {
        // Subsequent pages: append
        setAllNotifications(prev => {
          // Prevent duplicates
          const existingIds = new Set(prev.map(n => n.id));
          const newNotifications = pageData.notifications.filter(n => !existingIds.has(n.id));
          return [...prev, ...newNotifications];
        });
      }
      setHasMore(pageData.notifications.length === PAGE_SIZE);
    }
  }, [pageData, page]);

  // Fetch unread count (always for all types)
  const { data: unreadData } = useQuery({
    queryKey: ["admin-notifications-unread", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      
      const { count, error } = await supabase
        .from("admin_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Update unread count
  useEffect(() => {
    if (unreadData !== undefined) {
      setUnreadCount(unreadData);
    }
  }, [unreadData]);

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
          // Reset to first page and refetch
          setPage(0);
          setAllNotifications([]);
          queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
          queryClient.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Load more function
  const loadMore = useCallback(() => {
    if (!isFetching && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [isFetching, hasMore]);

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
      queryClient.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
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
      setAllNotifications([]);
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
    },
  });

  return {
    notifications: allNotifications,
    unreadCount,
    isLoading: isLoading && page === 0,
    isLoadingMore: isFetching && page > 0,
    hasMore,
    loadMore,
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
