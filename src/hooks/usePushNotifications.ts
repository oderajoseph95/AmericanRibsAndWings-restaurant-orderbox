import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const VAPID_PUBLIC_KEY = "BHOvQ4W0tWxajJ2gzj4bjmAFr6sZ6pkn2b5lg6LXz6UHtU2OHUrfgYqFPPs3FPSb1v1hWQCRlbX4IUN1-Ht4ayU";

interface UsePushNotificationsOptions {
  userType: "admin" | "driver" | "customer";
  driverId?: string;
  customerPhone?: string;
}

export function usePushNotifications({ userType, driverId, customerPhone }: UsePushNotificationsOptions) {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  // Check if push notifications are supported
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Check existing subscription
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isSupported) {
        setIsLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await (registration as any).pushManager?.getSubscription();
        
        if (subscription) {
          // Verify this subscription exists in our database
          const { data } = await supabase
            .from("push_subscriptions")
            .select("id")
            .eq("endpoint", subscription.endpoint)
            .maybeSingle();
          
          setIsSubscribed(!!data);
        } else {
          setIsSubscribed(false);
        }
      } catch (error) {
        console.error("[Push] Error checking subscription:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSubscription();
  }, [isSupported]);

  // Register service worker
  const registerServiceWorker = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers not supported");
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("[Push] Service worker registered:", registration);
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error("[Push] Service worker registration failed:", error);
      throw error;
    }
  }, []);

  // Convert base64 to Uint8Array for applicationServerKey
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      throw new Error("Push notifications not supported");
    }

    setIsLoading(true);
    
    try {
      // Request permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== "granted") {
        throw new Error("Notification permission denied");
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const subscriptionJSON = subscription.toJSON();
      
      if (!subscriptionJSON.endpoint || !subscriptionJSON.keys) {
        throw new Error("Invalid subscription");
      }

      // Save to database
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user?.id || null,
        driver_id: driverId || null,
        customer_phone: customerPhone || null,
        endpoint: subscriptionJSON.endpoint,
        p256dh: subscriptionJSON.keys.p256dh,
        auth_key: subscriptionJSON.keys.auth,
        user_type: userType,
      }, {
        onConflict: "endpoint",
      });

      if (error) throw error;

      setIsSubscribed(true);
      console.log("[Push] Subscription saved successfully");
      return true;
    } catch (error) {
      console.error("[Push] Subscription failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user?.id, driverId, customerPhone, userType, registerServiceWorker]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await (registration as any).pushManager?.getSubscription();
      
      if (subscription) {
        // Remove from database
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subscription.endpoint);
        
        // Unsubscribe from push
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      console.log("[Push] Unsubscribed successfully");
      return true;
    } catch (error) {
      console.error("[Push] Unsubscribe failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Toggle subscription
  const toggle = useCallback(async () => {
    if (isSubscribed) {
      return unsubscribe();
    } else {
      return subscribe();
    }
  }, [isSubscribed, subscribe, unsubscribe]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    toggle,
  };
}

// Helper to send push notification via edge function
export async function sendPushNotification(payload: {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  userType?: "admin" | "driver" | "customer";
  userId?: string;
  driverId?: string;
  customerPhone?: string;
  orderId?: string;
  orderNumber?: string;
}) {
  try {
    const { data, error } = await supabase.functions.invoke("send-push-notification", {
      body: payload,
    });

    if (error) throw error;
    console.log("[Push] Notification sent:", data);
    return data;
  } catch (error) {
    console.error("[Push] Failed to send notification:", error);
    throw error;
  }
}
