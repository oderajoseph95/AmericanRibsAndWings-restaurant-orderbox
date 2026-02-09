import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, CalendarDays, Clock, Users, ArrowLeft, RotateCcw } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { Footer } from "@/components/home/Footer";
import { STORE_NAME } from "@/lib/constants";

interface ReservationConfirmationProps {
  name: string;
  pax: number;
  date: string;
  time: string;
  onNewReservation: () => void;
}

export function ReservationConfirmation({
  name,
  pax,
  date,
  time,
  onNewReservation,
}: ReservationConfirmationProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead 
        pagePath="/reserve" 
        fallbackTitle="Reservation Submitted | American Ribs & Wings"
        fallbackDescription="Your table reservation has been submitted."
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
            <h1 className="font-bold text-lg">Reservation Submitted</h1>
            <p className="text-xs text-muted-foreground">{STORE_NAME}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-8 max-w-md mx-auto">
        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Reservation Submitted!
          </h2>
          <p className="text-muted-foreground">
            Thank you, {name}. Your reservation request has been received.
          </p>
        </div>

        {/* Status Card - R1.4: Show Pending status instead of reservation code */}
        <Card className="mb-6 border-warning/20 bg-warning/5">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Status</p>
            <p className="text-xl font-semibold text-warning">
              Pending Confirmation
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              We will contact you to confirm this reservation
            </p>
          </CardContent>
        </Card>

        {/* Reservation Details */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Reservation Details
            </h3>
            
            <div className="flex items-center gap-3 py-2 border-b border-border">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{date}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 py-2 border-b border-border">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Time</p>
                <p className="font-medium">{time}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 py-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Party Size</p>
                <p className="font-medium">{pax} {pax === 1 ? "guest" : "guests"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Note */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6 text-sm text-muted-foreground text-center">
          <p>
            Reservations are subject to confirmation. We will contact you to confirm your booking.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link to="/">
              Back to Home
            </Link>
          </Button>
          
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={onNewReservation}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Make Another Reservation
          </Button>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}