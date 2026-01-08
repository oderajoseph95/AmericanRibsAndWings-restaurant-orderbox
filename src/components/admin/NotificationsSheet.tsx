import { useState } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Bell, CheckCheck, Package, Truck, Mail, Settings, Loader2, Trash2, DollarSign, User, MapPin, ShoppingBag, ExternalLink, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAdminNotifications, AdminNotification, NotificationCategory } from "@/hooks/useAdminNotifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  order: <Package className="h-4 w-4" />,
  driver: <Truck className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  order: "bg-blue-500/10 text-blue-600",
  driver: "bg-green-500/10 text-green-600",
  email: "bg-purple-500/10 text-purple-600",
  system: "bg-orange-500/10 text-orange-600",
};

// Group notifications by date
function groupNotificationsByDate(notifications: AdminNotification[]): Record<string, AdminNotification[]> {
  const groups: Record<string, AdminNotification[]> = {};
  
  for (const notification of notifications) {
    const date = new Date(notification.created_at);
    let key: string;
    
    if (isToday(date)) {
      key = "Today";
    } else if (isYesterday(date)) {
      key = "Yesterday";
    } else {
      key = format(date, "MMMM d, yyyy");
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(notification);
  }
  
  return groups;
}

export function NotificationsSheet({ open, onOpenChange }: NotificationsSheetProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NotificationCategory>("all");
  const { 
    notifications, 
    unreadCount, 
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    markAsRead, 
    markAllAsRead, 
    isMarkingAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    isDeletingAll
  } = useAdminNotifications(activeTab);
  const [selectedNotification, setSelectedNotification] = useState<AdminNotification | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  const groupedNotifications = groupNotificationsByDate(notifications);

  const handleNotificationClick = (notification: AdminNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(notification);
  };

  const handleViewAction = () => {
    if (!selectedNotification) return;
    
    setSelectedNotification(null);
    onOpenChange(false);
    
    if (selectedNotification.action_url) {
      navigate(selectedNotification.action_url);
    } else if (selectedNotification.order_id) {
      navigate(`/admin/orders?orderId=${selectedNotification.order_id}`);
    } else if (selectedNotification.type === "driver") {
      navigate("/admin/drivers");
    } else if (selectedNotification.type === "email") {
      navigate("/admin/email-templates");
    } else if (selectedNotification.type === "system") {
      navigate("/admin/settings");
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

  const getActionLabel = (notification: AdminNotification | null): string | null => {
    if (!notification) return null;
    if (notification.metadata?.action_label) return notification.metadata.action_label;
    if (notification.order_id) return "View Order";
    if (notification.type === "driver") return "View Drivers";
    if (notification.type === "email") return "View Emails";
    if (notification.type === "system") return "View Settings";
    return null;
  };

  const getNotificationIcon = (type: string) => {
    return categoryIcons[type] || <Bell className="h-4 w-4" />;
  };

  const getNotificationColor = (type: string) => {
    return categoryColors[type] || "bg-muted text-muted-foreground";
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 pr-14 border-b space-y-4">
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
            
            {/* Category Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NotificationCategory)}>
              <TabsList className="w-full grid grid-cols-5 h-9">
                <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
                <TabsTrigger value="order" className="text-xs px-2 gap-1">
                  <Package className="h-3 w-3" />
                  <span className="hidden sm:inline">Orders</span>
                </TabsTrigger>
                <TabsTrigger value="driver" className="text-xs px-2 gap-1">
                  <Truck className="h-3 w-3" />
                  <span className="hidden sm:inline">Driver</span>
                </TabsTrigger>
                <TabsTrigger value="email" className="text-xs px-2 gap-1">
                  <Mail className="h-3 w-3" />
                  <span className="hidden sm:inline">Emails</span>
                </TabsTrigger>
                <TabsTrigger value="system" className="text-xs px-2 gap-1">
                  <Settings className="h-3 w-3" />
                  <span className="hidden sm:inline">System</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
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
                  {activeTab === "all" 
                    ? "You'll see order updates and alerts here"
                    : `No ${activeTab} notifications`
                  }
                </p>
              </div>
            ) : (
              <div className="pb-4">
                {Object.entries(groupedNotifications).map(([dateGroup, groupNotifications]) => (
                  <div key={dateGroup}>
                    {/* Date Group Header */}
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {dateGroup}
                      </span>
                    </div>
                    
                    {/* Notifications in this group */}
                    <div className="divide-y">
                      {groupNotifications.map((notification) => (
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
                              <div className={cn("p-2 rounded-full shrink-0", getNotificationColor(notification.type))}>
                                {getNotificationIcon(notification.type)}
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
                                <div className="flex items-center gap-2 mt-1.5">
                                  {notification.metadata?.order_number && (
                                    <Badge variant="outline" className="text-xs">
                                      {notification.metadata.order_number}
                                    </Badge>
                                  )}
                                  <p className="text-xs text-muted-foreground/70">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                  </p>
                                </div>
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
                  </div>
                ))}
                
                {/* Load More Button */}
                {hasMore && (
                  <div className="px-4 py-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={loadMore}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      )}
                      Load More
                    </Button>
                  </div>
                )}
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
              <div className={cn("p-2 rounded-full", getNotificationColor(selectedNotification?.type || ""))}>
                {selectedNotification && getNotificationIcon(selectedNotification.type)}
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
