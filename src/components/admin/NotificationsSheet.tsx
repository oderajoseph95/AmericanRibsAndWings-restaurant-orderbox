import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Bell, CheckCheck, Package, Truck, AlertCircle, Info, Loader2, Trash2, DollarSign, User, MapPin, Clock, ShoppingBag, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAdminNotifications, AdminNotification } from "@/hooks/useAdminNotifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  order: <Package className="h-4 w-4 text-blue-500" />,
  driver: <Truck className="h-4 w-4 text-green-500" />,
  payout: <DollarSign className="h-4 w-4 text-emerald-500" />,
  stock: <AlertCircle className="h-4 w-4 text-orange-500" />,
  alert: <AlertCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-muted-foreground" />,
};

const typeColors: Record<string, string> = {
  order: "bg-blue-500/10 text-blue-600",
  driver: "bg-green-500/10 text-green-600",
  payout: "bg-emerald-500/10 text-emerald-600",
  stock: "bg-orange-500/10 text-orange-600",
  alert: "bg-red-500/10 text-red-600",
  info: "bg-muted text-muted-foreground",
};

export function NotificationsSheet({ open, onOpenChange }: NotificationsSheetProps) {
  const navigate = useNavigate();
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    markAsRead, 
    markAllAsRead, 
    isMarkingAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    isDeletingAll
  } = useAdminNotifications();
  const [selectedNotification, setSelectedNotification] = useState<AdminNotification | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  const handleNotificationClick = (notification: AdminNotification) => {
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
    
    // Navigate based on notification type and action_url
    if (selectedNotification.action_url) {
      navigate(selectedNotification.action_url);
    } else if (selectedNotification.order_id) {
      const orderNumber = selectedNotification.metadata?.order_number;
      navigate(`/admin/orders?search=${orderNumber || selectedNotification.order_id}`);
    } else if (selectedNotification.type === "payout") {
      navigate("/admin/payouts");
    } else if (selectedNotification.type === "stock") {
      navigate("/admin/stock");
    } else if (selectedNotification.type === "driver") {
      navigate("/admin/drivers");
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

  const getActionLabel = (notification: AdminNotification) => {
    if (notification.metadata?.action_label) return notification.metadata.action_label;
    if (notification.order_id) return "View Order";
    if (notification.type === "payout") return "View Payouts";
    if (notification.type === "stock") return "View Stock";
    if (notification.type === "driver") return "View Drivers";
    return null;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
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
                  >
                    {isMarkingAllAsRead ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCheck className="h-4 w-4 mr-2" />
                    )}
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground/70">
                  You'll see order updates and alerts here
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "relative group",
                      !notification.is_read && "bg-primary/5"
                    )}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full p-4 text-left hover:bg-muted/50 transition-colors pr-12"
                    >
                      <div className="flex gap-3">
                        <div className={cn("p-2 rounded-full shrink-0", typeColors[notification.type] || typeColors.info)}>
                          {typeIcons[notification.type] || typeIcons.info}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              "font-medium text-sm truncate",
                              !notification.is_read && "text-foreground",
                              notification.is_read && "text-muted-foreground"
                            )}>
                              {notification.title}
                            </p>
                            {!notification.is_read && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                          {notification.metadata?.order_number && (
                            <Badge variant="outline" className="mt-1.5 text-xs">
                              {notification.metadata.order_number}
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
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
                ))}
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
                {selectedNotification && (typeIcons[selectedNotification.type] || typeIcons.info)}
              </div>
              <div>
                <DialogTitle>{selectedNotification?.title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {selectedNotification && format(new Date(selectedNotification.created_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <Separator />
          
          <div className="space-y-4">
            <p className="text-sm text-foreground">{selectedNotification?.message}</p>
            
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
                
                {selectedNotification.metadata.order_type && (
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Type:</span>
                    <Badge variant="outline" className="capitalize">
                      {selectedNotification.metadata.order_type}
                    </Badge>
                  </div>
                )}
                
                {selectedNotification.metadata.total_amount !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Total:</span>
                    <span className="font-semibold text-primary">
                      ₱{selectedNotification.metadata.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                
                {selectedNotification.metadata.delivery_address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="font-medium">Address:</span>
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
                    <span className="font-medium">Payout Amount:</span>
                    <span className="font-semibold text-emerald-600">
                      ₱{selectedNotification.metadata.payout_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                
                {selectedNotification.metadata.driver_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Driver:</span>
                    <span>{selectedNotification.metadata.driver_name}</span>
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
