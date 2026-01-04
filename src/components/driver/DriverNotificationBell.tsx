import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";
import { DriverNotificationsSheet } from "./DriverNotificationsSheet";
import { cn } from "@/lib/utils";

interface DriverNotificationBellProps {
  driverId: string;
}

export function DriverNotificationBell({ driverId }: DriverNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useDriverNotifications(driverId);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
      >
        <Bell className={cn(
          "h-6 w-6 text-primary",
          unreadCount > 0 && "animate-pulse"
        )} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground text-xs font-bold animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <DriverNotificationsSheet
        open={open}
        onOpenChange={setOpen}
        driverId={driverId}
      />
    </>
  );
}
