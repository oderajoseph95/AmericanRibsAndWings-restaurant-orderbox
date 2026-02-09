import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  CheckCircle2, 
  CalendarDays, 
  Clock, 
  Users, 
  ArrowLeft, 
  RotateCcw,
  User,
  Phone,
  Mail,
  MessageSquare,
  Search,
  Copy,
  Check
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { Footer } from "@/components/home/Footer";
import { STORE_NAME } from "@/lib/constants";
import { ReservationTicket } from "./ReservationTicket";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

interface ReservationConfirmationProps {
  reservationCode: string;
  name: string;
  phone: string;
  email: string | null;
  pax: number;
  date: string;
  time: string;
  notes: string | null;
  onNewReservation: () => void;
}

// Mask phone number for privacy (show first 4 and last 3)
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  const visible = phone.slice(0, 4) + "****" + phone.slice(-3);
  return visible;
}

export function ReservationConfirmation({
  reservationCode,
  name,
  phone,
  email,
  pax,
  date,
  time,
  notes,
  onNewReservation,
}: ReservationConfirmationProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(reservationCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Reservation code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Please copy the code manually",
        variant: "destructive",
      });
    }
  };

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
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
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

        {/* Reservation Code Card - PROMINENT */}
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">Your Reservation Code</p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <p className="text-3xl font-bold text-primary tracking-wider">
                {reservationCode}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopyCode}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save this code to track your reservation status
            </p>
          </CardContent>
        </Card>

        {/* Status Card */}
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

        {/* Your Details Section */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Your Details
            </h3>
            
            <div className="flex items-center gap-3 py-2 border-b border-border">
              <User className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 py-2 border-b border-border">
              <Phone className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{maskPhone(phone)}</p>
              </div>
            </div>
            
            {email && (
              <div className="flex items-center gap-3 py-2 border-b border-border">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{email}</p>
                </div>
              </div>
            )}
            
            {notes && (
              <div className="flex items-start gap-3 py-2">
                <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Special Requests</p>
                  <p className="font-medium">{notes}</p>
                </div>
              </div>
            )}
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
          {/* Download PDF Ticket */}
          <ReservationTicket
            reservationCode={reservationCode}
            name={name}
            pax={pax}
            date={date}
            time={time}
          />
          
          {/* Track Reservation */}
          <Button asChild variant="outline" className="w-full" size="lg">
            <Link to={`/reserve/track?code=${reservationCode}`}>
              <Search className="mr-2 h-4 w-4" />
              Track Your Reservation
            </Link>
          </Button>
          
          {/* Back to Home */}
          <Button asChild className="w-full" size="lg">
            <Link to="/">
              Back to Home
            </Link>
          </Button>
          
          {/* Make Another Reservation */}
          <Button
            variant="ghost"
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
