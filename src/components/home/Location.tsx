import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Phone, Mail, Facebook, Instagram, ExternalLink } from "lucide-react";

const hours = [
  { day: "Monday - Friday", time: "10:00 AM - 10:00 PM" },
  { day: "Saturday", time: "9:00 AM - 11:00 PM" },
  { day: "Sunday", time: "9:00 AM - 9:00 PM" },
];

export function Location() {
  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4">
            <MapPin className="h-3 w-3 mr-1" />
            Visit Us
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Location & Hours
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Come visit us or order for pickup. We're located in the heart of the city, 
            ready to serve you our delicious BBQ.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Map placeholder */}
          <div className="lg:col-span-2">
            <Card className="h-full overflow-hidden">
              <div className="relative h-80 lg:h-full min-h-[300px] bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                {/* Placeholder for Google Maps */}
                <div className="text-center p-8">
                  <MapPin className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Google Maps will be embedded here
                  </p>
                  <Button variant="outline" asChild>
                    <a 
                      href="https://maps.google.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      Open in Google Maps
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Info cards */}
          <div className="space-y-4">
            {/* Address */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-primary" />
                  Address
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground">
                  123 Main Street<br />
                  Barangay Centro<br />
                  City, Province 1234
                </p>
              </CardContent>
            </Card>

            {/* Hours */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-primary" />
                  Operating Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  {hours.map((item, index) => (
                    <li key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.day}</span>
                      <span className="font-medium text-foreground">{item.time}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Phone className="h-5 w-5 text-primary" />
                  Contact Us
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <a 
                  href="tel:+639123456789" 
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  (0912) 345-6789
                </a>
                <a 
                  href="mailto:order@americanribsandwings.com" 
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  order@americanribsandwings.com
                </a>
                <div className="flex gap-3 pt-2">
                  <a 
                    href="#" 
                    className="w-10 h-10 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a 
                    href="#" 
                    className="w-10 h-10 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
