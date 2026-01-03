import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Clock, Phone, Mail, Facebook, Instagram, Loader2 } from "lucide-react";

interface HoursItem {
  day: string;
  time: string;
}

interface LocationContent {
  title?: string;
  address?: string;
  phone?: string;
  email?: string;
  mapEmbedUrl?: string;
  hours?: HoursItem[];
  facebookUrl?: string;
  instagramUrl?: string;
}

export function Location() {
  // Fetch section config
  const { data: sectionConfig, isLoading } = useQuery({
    queryKey: ["homepage-section", "location"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "location")
        .eq("is_visible", true)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <section className="py-20 bg-secondary/30">
        <div className="container px-4 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (!sectionConfig) return null;

  const content = (sectionConfig.content as LocationContent) || {};
  
  // Default hours if not set
  const hours: HoursItem[] = content.hours || [
    { day: "Sunday - Saturday", time: "12:00 PM - 9:00 PM" }
  ];

  // Parse address into lines
  const addressLines = content.address?.split("\n") || ["123 Main Street", "City, Province"];

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
            {content.title || "Location & Hours"}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Come visit us or order for pickup. We're located in Floridablanca, 
            ready to serve you our delicious BBQ.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2">
            <Card className="h-full overflow-hidden">
              <div className="relative h-80 lg:h-full min-h-[300px]">
                {content.mapEmbedUrl ? (
                  <iframe
                    src={content.mapEmbedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, minHeight: "300px" }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="American Ribs & Wings Location"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                    <div className="text-center p-8">
                      <MapPin className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-muted-foreground">Map not configured</p>
                    </div>
                  </div>
                )}
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
                  {addressLines.map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < addressLines.length - 1 && <br />}
                    </span>
                  ))}
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
                {content.phone && (
                  <a 
                    href={`tel:${content.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {content.phone}
                  </a>
                )}
                {content.email && (
                  <a 
                    href={`mailto:${content.email}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm break-all"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    {content.email}
                  </a>
                )}
                <div className="flex gap-3 pt-2">
                  {content.facebookUrl && (
                    <a 
                      href={content.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Facebook className="h-5 w-5" />
                    </a>
                  )}
                  {content.instagramUrl && (
                    <a 
                      href={content.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Instagram className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
