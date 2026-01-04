import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCheck, Package, Truck, AlertCircle, Info, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useDriverNotifications, DriverNotification } from "@/hooks/useDriverNotifications";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const typeIcons: Record<string, typeof Package> = {
  order: Package,
  assignment: Truck,
  alert: AlertCircle,
  info: Info,
};

interface DriverNotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
}

export function DriverNotificationsSheet({ open, onOpenChange, driverId }: DriverNotificationsSheetProps) {
  const { notifications, isLoading, markAsRead, markAllAsRead, isMarkingAllAsRead, unreadCount } = useDriverNotifications(driverId);
  const [selectedNotification, setSelectedNotification] = useState<DriverNotification | null>(null);

  const handleNotificationClick = (notification: DriverNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(notification);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle>Notifications</SheetTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  disabled={isMarkingAllAsRead}
                  className="text-xs"
                >
                  {isMarkingAllAsRead ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCheck className="h-3 w-3 mr-1" />
                  )}
                  Mark all read
                </Button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => {
                  const Icon = typeIcons[notification.type || "info"] || Info;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "w-full p-4 text-left hover:bg-muted/50 transition-colors flex gap-3",
                        !notification.is_read && "bg-primary/5"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-full shrink-0",
                        !notification.is_read ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Icon className={cn(
                          "h-4 w-4",
                          !notification.is_read ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            !notification.is_read && "text-foreground"
                          )}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <span className="shrink-0 w-2 h-2 bg-primary rounded-full mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.created_at && format(new Date(notification.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedNotification?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedNotification?.message}
            </p>
            {selectedNotification?.created_at && (
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedNotification.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            )}
            {selectedNotification?.order_id && (
              <Button asChild variant="outline" size="sm">
                <Link to="/driver/orders" onClick={() => setSelectedNotification(null)}>
                  View Orders
                </Link>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
