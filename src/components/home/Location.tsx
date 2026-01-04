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
  subtitle?: string;
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
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <section id="location" className="py-3 md:py-12 bg-gradient-to-b from-muted/30 to-background">
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
    <section id="location" className="py-3 md:py-12 bg-gradient-to-b from-muted/30 to-background">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5">
            <MapPin className="h-3 w-3 mr-1" />
            Visit Us
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            {content.title || "Location & Hours"}
          </h2>
          {content.subtitle && (
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              {content.subtitle}
            </p>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2">
            <Card className="h-full overflow-hidden">
              <div className="relative h-64 lg:h-full min-h-[280px]">
                {content.mapEmbedUrl ? (
                  <iframe
                    src={content.mapEmbedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0, minHeight: "280px" }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="American Ribs & Wings Location"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                    <div className="text-center p-6">
                      <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Map not configured</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Info cards */}
          <div className="space-y-3">
            {/* Address */}
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" />
                  Address
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4">
                <p className="text-muted-foreground text-sm">
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
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  Operating Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4">
                <ul className="space-y-1">
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
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-4 w-4 text-primary" />
                  Contact Us
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 space-y-2">
                {content.phone && (
                  <a 
                    href={`tel:${content.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {content.phone}
                  </a>
                )}
                {content.email && (
                  <a 
                    href={`mailto:${content.email}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-xs break-all"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {content.email}
                  </a>
                )}
                <div className="flex gap-2 pt-1">
                  {content.facebookUrl && (
                    <a 
                      href={content.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Facebook className="h-4 w-4" />
                    </a>
                  )}
                  {content.instagramUrl && (
                    <a 
                      href={content.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-muted rounded-full flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Instagram className="h-4 w-4" />
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
