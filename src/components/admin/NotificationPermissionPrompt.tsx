import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const DISMISSED_KEY = "admin_notification_prompt_dismissed";

export function NotificationPermissionPrompt() {
  const [isDismissed, setIsDismissed] = useState(true);
  const { isSupported, isSubscribed, permission, toggle, isLoading } = usePushNotifications({ userType: "admin" });

  useEffect(() => {
    // Check if already dismissed
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === "true") {
      setIsDismissed(true);
    } else if (isSupported && permission === "default" && !isSubscribed) {
      // Only show if permission not yet asked and not subscribed
      setIsDismissed(false);
    }
  }, [isSupported, permission, isSubscribed]);

  const handleEnable = async () => {
    try {
      await toggle();
      toast.success("Notifications enabled!", {
        description: "You'll now receive alerts for new orders",
      });
      setIsDismissed(true);
    } catch (error: any) {
      if (error.message?.includes("denied")) {
        toast.error("Notifications blocked", {
          description: "Please enable notifications in your browser settings",
        });
      }
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  if (isDismissed || isSubscribed || !isSupported) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">Enable Push Notifications</p>
          <p className="text-sm text-muted-foreground">
            Get instant alerts when new orders come in
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleEnable}
          disabled={isLoading}
        >
          Enable
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
