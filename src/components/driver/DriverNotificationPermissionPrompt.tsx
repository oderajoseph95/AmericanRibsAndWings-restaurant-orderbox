import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

interface DriverNotificationPermissionPromptProps {
  driverId: string;
}

export function DriverNotificationPermissionPrompt({ driverId }: DriverNotificationPermissionPromptProps) {
  const [show, setShow] = useState(false);
  const { isSupported, isSubscribed, subscribe } = usePushNotifications({
    userType: "driver",
    driverId,
  });

  useEffect(() => {
    // Check if prompt was dismissed
    const dismissed = localStorage.getItem("driver_notification_prompt_dismissed");
    if (dismissed) {
      setShow(false);
      return;
    }

    // Show if notifications are supported, not subscribed, and permission not denied
    if (isSupported && !isSubscribed && Notification.permission !== "denied") {
      setShow(true);
    }
  }, [isSupported, isSubscribed]);

  const handleEnable = async () => {
    try {
      await subscribe();
      toast.success("Notifications enabled! You'll receive order alerts.");
      setShow(false);
    } catch (err) {
      toast.error("Failed to enable notifications");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("driver_notification_prompt_dismissed", "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">Enable Order Notifications</p>
          <p className="text-xs text-muted-foreground">
            Get instant alerts when orders are assigned to you
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleEnable}>
          Enable
        </Button>
        <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
