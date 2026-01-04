import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCheck, Package, Truck, AlertCircle, Info, Loader2, Trash2, DollarSign, User, MapPin, ShoppingBag, ExternalLink, Bell } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useDriverNotifications, DriverNotification } from "@/hooks/useDriverNotifications";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const typeIcons: Record<string, React.ReactNode> = {
  order: <Package className="h-4 w-4" />,
  assignment: <Truck className="h-4 w-4" />,
  payout: <DollarSign className="h-4 w-4" />,
  alert: <AlertCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const typeColors: Record<string, string> = {
  order: "bg-blue-500/10 text-blue-600",
  assignment: "bg-green-500/10 text-green-600",
  payout: "bg-emerald-500/10 text-emerald-600",
  alert: "bg-red-500/10 text-red-600",
  info: "bg-muted text-muted-foreground",
};

interface DriverNotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
}

export function DriverNotificationsSheet({ open, onOpenChange, driverId }: DriverNotificationsSheetProps) {
  const navigate = useNavigate();
  const { 
    notifications, 
    isLoading, 
    markAsRead, 
    markAllAsRead, 
    isMarkingAllAsRead, 
    unreadCount,
    deleteNotification,
    deleteAllNotifications,
    isDeletingAll
  } = useDriverNotifications(driverId);
  const [selectedNotification, setSelectedNotification] = useState<DriverNotification | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  const handleNotificationClick = (notification: DriverNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(notification);
  };

  const handleViewAction = () => {
    if (!selectedNotification) return;
    
    // Close dialogs
    setSelectedNotification(null);
    onOpenChange(false);
    
    // Navigate based on notification type
    if (selectedNotification.action_url) {
      navigate(selectedNotification.action_url);
    } else if (selectedNotification.order_id) {
      // Navigate with orderId param to auto-open the order
      navigate(`/driver/orders?orderId=${selectedNotification.order_id}`);
    } else if (selectedNotification.type === "order" || selectedNotification.type === "assignment") {
      navigate("/driver/orders");
    } else if (selectedNotification.type === "payout") {
      navigate("/driver/earnings");
    }
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    deleteNotification(notificationId);
    toast.success("Notification deleted");
  };

  const handleClearAll = () => {
    deleteAllNotifications();
    setShowClearAllDialog(false);
    toast.success("All notifications cleared");
  };

  const getActionLabel = (notification: DriverNotification | null): string | null => {
    if (!notification) return null;
    if (notification.metadata?.action_label) return notification.metadata.action_label;
    if (notification.order_id || notification.type === "order" || notification.type === "assignment") return "View Orders";
    if (notification.type === "payout") return "View Earnings";
    return null;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 pr-14 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="default" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </SheetTitle>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowClearAllDialog(true)}
                    disabled={isDeletingAll}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  You'll see delivery assignments and updates here
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => {
                  const type = notification.type || "info";
                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        "relative group",
                        !notification.is_read && "bg-primary/5"
                      )}
                    >
                      <button
                        onClick={() => handleNotificationClick(notification)}
                        className="w-full p-4 text-left hover:bg-muted/50 transition-colors flex gap-3 pr-12"
                      >
                        <div className={cn(
                          "p-2 rounded-full shrink-0",
                          typeColors[type] || typeColors.info
                        )}>
                          {typeIcons[type] || typeIcons.info}
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
                          {notification.metadata?.order_number && (
                            <Badge variant="outline" className="mt-1.5 text-xs">
                              {notification.metadata.order_number}
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {notification.created_at && formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDeleteNotification(e, notification.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-full", typeColors[selectedNotification?.type || "info"])}>
                {selectedNotification && (typeIcons[selectedNotification.type || "info"] || typeIcons.info)}
              </div>
              <div>
                <DialogTitle>{selectedNotification?.title}</DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedNotification?.created_at && format(new Date(selectedNotification.created_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <Separator />
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedNotification?.message}
            </p>
            
            {/* Rich Details */}
            {selectedNotification?.metadata && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                {selectedNotification.metadata.order_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Order:</span>
                    <span>{selectedNotification.metadata.order_number}</span>
                  </div>
                )}
                
                {selectedNotification.metadata.customer_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Customer:</span>
                    <span>{selectedNotification.metadata.customer_name}</span>
                    {selectedNotification.metadata.customer_phone && (
                      <a href={`tel:${selectedNotification.metadata.customer_phone}`} className="text-primary hover:underline">
                        ({selectedNotification.metadata.customer_phone})
                      </a>
                    )}
                  </div>
                )}
                
                {selectedNotification.metadata.total_amount !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Order Total:</span>
                    <span className="font-semibold">
                      ₱{selectedNotification.metadata.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                
                {selectedNotification.metadata.delivery_address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="font-medium">Delivery:</span>
                    <span className="flex-1">{selectedNotification.metadata.delivery_address}</span>
                  </div>
                )}
                
                {selectedNotification.metadata.items && selectedNotification.metadata.items.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Items:</span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {selectedNotification.metadata.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span>{item.quantity}x {item.name}</span>
                          <span className="text-muted-foreground">₱{item.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedNotification.metadata.payout_amount !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Payout:</span>
                    <span className="font-semibold text-emerald-600">
                      ₱{selectedNotification.metadata.payout_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {selectedNotification && getActionLabel(selectedNotification) && (
            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedNotification(null)}>
                Close
              </Button>
              <Button size="sm" onClick={handleViewAction} className="gap-2">
                {getActionLabel(selectedNotification)}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {notifications.length} notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
