import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

interface NotificationBellProps {
  userType: "admin" | "driver" | "customer";
  driverId?: string;
  customerPhone?: string;
  className?: string;
}

export function NotificationBell({ userType, driverId, customerPhone, className }: NotificationBellProps) {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    toggle,
  } = usePushNotifications({ userType, driverId, customerPhone });

  const handleToggle = async () => {
    try {
      await toggle();
      if (!isSubscribed) {
        toast.success("Notifications enabled!", {
          description: "You'll receive updates about orders",
        });
      } else {
        toast.success("Notifications disabled");
      }
    } catch (error: any) {
      if (error.message?.includes("denied")) {
        toast.error("Notifications blocked", {
          description: "Please enable notifications in your browser settings",
        });
      } else {
        toast.error("Failed to toggle notifications");
      }
    }
  };

  if (!isSupported) {
    return null;
  }

  const getTooltipText = () => {
    if (isLoading) return "Loading...";
    if (permission === "denied") return "Notifications blocked in browser";
    if (isSubscribed) return "Disable notifications";
    return "Enable notifications";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          disabled={isLoading || permission === "denied"}
          className={className}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isSubscribed ? (
            <Bell className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}
