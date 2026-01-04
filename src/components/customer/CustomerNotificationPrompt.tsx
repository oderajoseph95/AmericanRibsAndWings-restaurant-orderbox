import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

interface CustomerNotificationPromptProps {
  customerPhone?: string | null;
}

export function CustomerNotificationPrompt({ customerPhone }: CustomerNotificationPromptProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { isSupported, isSubscribed, subscribe } = usePushNotifications({
    userType: "customer",
    customerPhone: customerPhone || undefined,
  });

  useEffect(() => {
    // Don't show if no phone, already subscribed, or dismissed
    if (!customerPhone || isSubscribed || dismissed) {
      setShow(false);
      return;
    }

    // Show if notifications are supported and permission not denied
    if (isSupported && Notification.permission !== "denied") {
      setShow(true);
    }
  }, [customerPhone, isSupported, isSubscribed, dismissed]);

  const handleEnable = async () => {
    try {
      await subscribe();
      toast.success("Notifications enabled! We'll update you on your order.");
      setShow(false);
    } catch (err) {
      toast.error("Failed to enable notifications");
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">Get Order Updates</p>
          <p className="text-xs text-muted-foreground">
            We'll notify you when your order status changes
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
