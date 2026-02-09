import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Clock, Users, ShoppingBag, AlertCircle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/SEOHead";
import { Footer } from "@/components/home/Footer";
import { supabase } from "@/integrations/supabase/client";
import { STORE_NAME } from "@/lib/constants";

type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

interface PreorderItem {
  name: string;
  quantity: number;
  price?: number;
}

const statusConfig: Record<ReservationStatus, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  icon: React.ReactNode;
  message: string;
}> = {
  pending: {
    label: "Pending Confirmation",
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <HelpCircle className="h-5 w-5" />,
    message: "Your reservation is awaiting confirmation. You will receive an SMS once confirmed.",
  },
  confirmed: {
    label: "Confirmed",
    variant: "default",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-5 w-5" />,
    message: "Please arrive on time. Present your confirmation code if asked.",
  },
  cancelled: {
    label: "Not Approved",
    variant: "destructive",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="h-5 w-5" />,
    message: "Your reservation was not approved. Please contact the store.",
  },
  completed: {
    label: "Completed",
    variant: "default",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: <CheckCircle2 className="h-5 w-5" />,
    message: "Thank you for dining with us!",
  },
  no_show: {
    label: "No Show",
    variant: "secondary",
    className: "bg-gray-100 text-gray-800 border-gray-200",
    icon: <AlertCircle className="h-5 w-5" />,
    message: "This reservation was marked as no-show.",
  },
};

export default function ReservationTracking() {
  const { confirmationCode } = useParams<{ confirmationCode: string }>();

  const { data: reservation, isLoading, error } = useQuery({
    queryKey: ["reservation-tracking", confirmationCode],
    queryFn: async () => {
      if (!confirmationCode) return null;
      
      // Case-insensitive lookup by confirmation_code
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .ilike("confirmation_code", confirmationCode)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!confirmationCode,
  });

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

  const status = reservation?.status as ReservationStatus | undefined;
  const statusInfo = status ? statusConfig[status] : null;
  const preorderItems = parsePreorderItems(reservation?.preorder_items);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        pagePath="/reserve/track"
        fallbackTitle="Reservation Status | American Ribs & Wings"
        fallbackDescription="Check your reservation status at American Ribs & Wings."
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
            <h1 className="font-bold text-lg">Reservation Status</h1>
            <p className="text-xs text-muted-foreground">{STORE_NAME}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-6 max-w-md mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error || !reservation ? (
          /* Error / Not Found State */
          <Card className="text-center py-8">
            <CardContent className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2">Reservation Not Found</h2>
                <p className="text-muted-foreground text-sm">
                  We couldn't find a reservation with this code. Please check your SMS or email for the correct code.
                </p>
              </div>
              <Button asChild>
                <Link to="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
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
                    {reservation.confirmation_code || reservation.reservation_code}
                  </p>
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

            {/* Back to Home */}
            <div className="pt-4">
              <Button variant="outline" className="w-full" asChild>
                <Link to="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
