import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsSheet } from "./NotificationsSheet";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { cn } from "@/lib/utils";

export function AdminHeader() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount } = useAdminNotifications();

  return (
    <>
      <div className="flex items-center justify-end mb-4 md:mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setNotificationsOpen(true)}
          className={cn(
            "relative p-2 sm:p-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-all h-10 w-10 sm:h-12 sm:w-12",
            unreadCount > 0 && "ring-2 ring-primary/30"
          )}
        >
          <Bell className={cn(
            "h-5 w-5 sm:h-7 sm:w-7 text-primary",
            unreadCount > 0 && "animate-pulse"
          )} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 sm:h-6 sm:w-6 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground text-[10px] sm:text-xs font-bold animate-bounce">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </div>

      <NotificationsSheet
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
    </>
  );
}
