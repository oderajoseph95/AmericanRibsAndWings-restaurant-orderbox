import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Clock, Users, ShoppingBag, AlertCircle, CheckCircle2, XCircle, HelpCircle, MapPin, Phone, Search, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEOHead } from "@/components/SEOHead";
import { Footer } from "@/components/home/Footer";
import { supabase } from "@/integrations/supabase/client";
import { STORE_NAME, STORE_ADDRESS_LINE1, STORE_ADDRESS_LINE2, STORE_ADDRESS_LINE3, STORE_PHONE } from "@/lib/constants";
import { trackAnalyticsEvent } from "@/hooks/useAnalytics";
import { sendSmsNotification } from "@/hooks/useSmsNotifications";
import { sendEmailNotification } from "@/hooks/useEmailNotifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type ReservationStatus = "pending" | "confirmed" | "cancelled" | "cancelled_by_customer" | "completed" | "no_show";

interface ReservationData {
  reservation_code: string;
  name: string;
  pax: number;
  reservation_date: string;
  reservation_time: string;
  status: ReservationStatus;
  preorder_items: PreorderItem[] | null;
}

interface PreorderItem {
  name: string;
  quantity: number;
  price?: number;
}

const statusConfig: Record<ReservationStatus, {
  label: string;
  className: string;
  icon: React.ReactNode;
  message: string;
}> = {
  pending: {
    label: "Pending Confirmation",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <HelpCircle className="h-5 w-5" />,
    message: "Your reservation is pending confirmation. You'll receive an update soon.",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-5 w-5" />,
    message: "Your reservation is confirmed. We look forward to seeing you!",
  },
  cancelled: {
    label: "Not Approved",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="h-5 w-5" />,
    message: "Unfortunately, this reservation was not approved. Please contact the store.",
  },
  cancelled_by_customer: {
    label: "Cancelled by You",
    className: "bg-orange-100 text-orange-800 border-orange-200",
    icon: <Ban className="h-5 w-5" />,
    message: "You cancelled this reservation. Thank you for letting us know.",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: <CheckCircle2 className="h-5 w-5" />,
    message: "Thank you for dining with us!",
  },
  no_show: {
    label: "No Show",
    className: "bg-gray-100 text-gray-800 border-gray-200",
    icon: <AlertCircle className="h-5 w-5" />,
    message: "This reservation was marked as no-show.",
  },
};

export default function ReservationTracking() {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if cancellation is allowed (only for pending or confirmed)
  const canCancel = reservation && (reservation.status === "pending" || reservation.status === "confirmed");

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim() || !phone.trim()) {
      setError("Please enter both reservation code and phone number.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setLookupAttempted(true);

    try {
      const { data, error: rpcError } = await supabase.rpc("lookup_reservation", {
        p_code: code.trim(),
        p_phone: phone.trim(),
      });

      if (rpcError) {
        throw rpcError;
      }

      if (data) {
        setReservation(data as unknown as ReservationData);
        trackAnalyticsEvent("reservation_lookup_success", {
          reservation_code: code.trim(),
        });
      } else {
        setReservation(null);
        trackAnalyticsEvent("reservation_lookup_failed", {
          attempted_code: code.trim(),
        });
      }
    } catch (err) {
      console.error("Lookup error:", err);
      setError("Something went wrong. Please try again.");
      setReservation(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!reservation) return;
    
    setIsCancelling(true);
    setShowCancelDialog(false);

    try {
      const { data, error: rpcError } = await supabase.rpc("cancel_reservation_by_customer", {
        p_code: code.trim(),
        p_phone: phone.trim(),
      });

      if (rpcError) {
        throw rpcError;
      }

      const result = data as { 
        success: boolean; 
        error?: string; 
        message?: string;
        reservation_code?: string;
        customer_name?: string;
        customer_phone?: string;
        customer_email?: string;
        pax?: number;
        reservation_date?: string;
        reservation_time?: string;
      };

      if (result.success) {
        // Update local state
        setReservation(prev => prev ? { ...prev, status: "cancelled_by_customer" } : null);
        
        toast.success("Reservation cancelled successfully");
        
        trackAnalyticsEvent("reservation_cancelled_by_customer", {
          reservation_code: reservation.reservation_code,
        });

        // Send confirmation notifications (fire and forget)
        const formattedDate = format(new Date(reservation.reservation_date), "MMM d");
        const formattedTime = formatReservationTime(reservation.reservation_time);

        // Send SMS
        sendSmsNotification({
          type: "reservation_cancelled_by_customer",
          recipientPhone: result.customer_phone,
          reservationCode: result.reservation_code,
          customerName: result.customer_name,
          reservationDate: formattedDate,
          reservationTime: formattedTime,
          pax: result.pax,
        }).catch(err => console.error("Failed to send cancellation SMS:", err));

        // Send email if available
        if (result.customer_email) {
          sendEmailNotification({
            type: "reservation_cancelled_by_customer",
            recipientEmail: result.customer_email,
            reservationCode: result.reservation_code,
            customerName: result.customer_name,
            reservationDate: format(new Date(reservation.reservation_date), "MMMM d, yyyy"),
            reservationTime: formattedTime,
            pax: result.pax,
          }).catch(err => console.error("Failed to send cancellation email:", err));
        }
      } else {
        // Show error message
        toast.error(result.message || "Unable to cancel reservation");
      }
    } catch (err) {
      console.error("Cancel error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReset = () => {
    setReservation(null);
    setLookupAttempted(false);
    setError(null);
    setCode("");
    setPhone("");
  };

  // Format date for display
  const formatReservationDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  // Format time for display
  const formatReservationTime = (timeString: string) => {
    try {
      const [hours, minutes] = timeString.split(":");
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return format(date, "h:mm a");
    } catch {
      return timeString;
    }
  };

  // Parse preorder items from JSON
  const parsePreorderItems = (items: unknown): PreorderItem[] => {
    if (!items) return [];
    if (Array.isArray(items)) {
      return items.filter((item): item is PreorderItem => 
        typeof item === "object" && item !== null && "name" in item && "quantity" in item
      );
    }
    return [];
  };

  const statusInfo = reservation?.status ? statusConfig[reservation.status] : null;
  const preorderItems = reservation ? parsePreorderItems(reservation.preorder_items) : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        pagePath="/reserve/track"
        fallbackTitle="Check Reservation Status | American Ribs & Wings"
        fallbackDescription="Look up and verify your reservation status at American Ribs & Wings."
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-lg">Check Reservation Status</h1>
            <p className="text-xs text-muted-foreground">{STORE_NAME}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-6 max-w-md mx-auto">
        {!reservation && !lookupAttempted ? (
          /* Lookup Form */
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5" />
                Find Your Reservation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Reservation Code</Label>
                  <Input
                    id="code"
                    placeholder="e.g. ARW-RSV-1234"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="uppercase"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 09171234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Checking..." : "Check Status"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : lookupAttempted && !reservation ? (
          /* Not Found State */
          <Card className="text-center py-8">
            <CardContent className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2">Reservation Not Found</h2>
                <p className="text-muted-foreground text-sm">
                  We couldn't find a reservation with those details. Please check your code and phone number.
                </p>
              </div>
              <Button onClick={handleReset}>Try Again</Button>
            </CardContent>
          </Card>
        ) : reservation ? (
          /* Reservation Details */
          <div className="space-y-4">
            {/* Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  {statusInfo && (
                    <>
                      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${statusInfo.className}`}>
                        {statusInfo.icon}
                      </div>
                      <Badge className={`text-sm px-4 py-1 ${statusInfo.className}`}>
                        {statusInfo.label}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {statusInfo.message}
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Reservation Details Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Reservation Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Confirmation Code */}
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Confirmation Code</p>
                  <p className="font-mono font-bold text-lg tracking-wide">
                    {reservation.reservation_code}
                  </p>
                </div>

                {/* Name */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{reservation.name}</p>
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{formatReservationDate(reservation.reservation_date)}</p>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="font-medium">{formatReservationTime(reservation.reservation_time)}</p>
                  </div>
                </div>

                {/* Party Size */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Party Size</p>
                    <p className="font-medium">{reservation.pax} {reservation.pax === 1 ? "guest" : "guests"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pre-Order Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4" />
                  Pre-Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                {preorderItems.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">
                      Pre-order (not paid)
                    </p>
                    {preorderItems.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                        <span className="text-sm">{item.name}</span>
                        <span className="text-sm text-muted-foreground">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pre-orders selected
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Store Contact Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">{STORE_NAME}</p>
                    <p className="text-muted-foreground">{STORE_ADDRESS_LINE1}</p>
                    <p className="text-muted-foreground">{STORE_ADDRESS_LINE2}</p>
                    <p className="text-muted-foreground">{STORE_ADDRESS_LINE3}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <a 
                    href={`tel:${STORE_PHONE}`} 
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {STORE_PHONE.replace(/(\d{4})(\d{3})(\d{4})/, "$1 $2 $3")}
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Cancel Reservation Button - only show for pending or confirmed */}
            {canCancel && (
              <Card className="border-destructive/20 bg-destructive/5">
                <CardContent className="pt-4 pb-4">
                  <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Need to cancel? Please do so at least 2 hours before your reservation time.
                    </p>
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => setShowCancelDialog(true)}
                      disabled={isCancelling}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      {isCancelling ? "Cancelling..." : "Cancel Reservation"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Check Another */}
            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={handleReset}>
                Check Another Reservation
              </Button>
            </div>
          </div>
        ) : null}

        {/* Store Contact - shown only on lookup form */}
        {!reservation && !lookupAttempted && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{STORE_NAME}</p>
                  <p className="text-muted-foreground">{STORE_ADDRESS_LINE1}</p>
                  <p className="text-muted-foreground">{STORE_ADDRESS_LINE2}</p>
                  <p className="text-muted-foreground">{STORE_ADDRESS_LINE3}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <a 
                  href={`tel:${STORE_PHONE}`} 
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {STORE_PHONE.replace(/(\d{4})(\d{3})(\d{4})/, "$1 $2 $3")}
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this reservation? This action cannot be undone.
              {reservation && (
                <span className="block mt-2 font-medium text-foreground">
                  {formatReservationDate(reservation.reservation_date)} at {formatReservationTime(reservation.reservation_time)} for {reservation.pax} {reservation.pax === 1 ? "guest" : "guests"}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reservation</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelReservation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer */}
      <Footer />
    </div>
  );
}
