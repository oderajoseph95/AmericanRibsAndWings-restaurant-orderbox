import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CalendarDays, Clock, MapPin, Info } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { Footer } from "@/components/home/Footer";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { STORE_NAME, STORE_ADDRESS_LINE1, STORE_ADDRESS_LINE3 } from "@/lib/constants";
import { useVisitorPresence } from "@/hooks/useVisitorPresence";

export default function Reserve() {
  useVisitorPresence("/reserve");
  const { opensAt, closesAt, isLoading: storeStatusLoading } = useStoreStatus();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead 
        pagePath="/reserve" 
        fallbackTitle="Reserve a Table | American Ribs & Wings"
        fallbackDescription="Reserve your table at American Ribs & Wings. Choose your date, time, and number of guests."
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
            <h1 className="font-bold text-lg">Reserve a Table</h1>
            <p className="text-xs text-muted-foreground">{STORE_NAME}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container px-4 py-6 max-w-2xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <CalendarDays className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Reserve a Table</h2>
          <p className="text-muted-foreground">
            Reserve your table in advance. We'll confirm your reservation via SMS.
          </p>
        </div>

        {/* Form Placeholder Container */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                Reservation form coming soon
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Store Info Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-primary" />
              Store Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Address */}
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">{STORE_NAME}</p>
                <p className="text-muted-foreground">{STORE_ADDRESS_LINE1}</p>
                <p className="text-muted-foreground">{STORE_ADDRESS_LINE3}</p>
              </div>
            </div>
            
            {/* Hours */}
            {!storeStatusLoading && opensAt && closesAt && (
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Operating Hours</p>
                  <p className="text-muted-foreground">{opensAt} - {closesAt}</p>
                </div>
              </div>
            )}

            {/* Confirmation Note */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p>Reservations are subject to confirmation. You will receive an SMS once your reservation is confirmed.</p>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
