import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Instagram, Mail, Phone, MapPin, Loader2 } from "lucide-react";

interface FooterContent {
  brandName?: string;
  brandAccent?: string;
  tagline?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  copyright?: string;
}

export function Footer() {
  const currentYear = new Date().getFullYear();

  const { data: sectionConfig } = useQuery({
    queryKey: ["homepage-section", "footer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "footer")
        .eq("is_visible", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Get location data for address, phone, email
  const { data: locationConfig } = useQuery({
    queryKey: ["homepage-section", "location"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "location")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const content = (sectionConfig?.content as FooterContent) || {};
  const locationContent = (locationConfig?.content as Record<string, unknown>) || {};

  // Use footer content or fall back to location content
  const address = content.address || (locationContent.address as string) || "";
  const phone = content.phone || (locationContent.phone as string) || "";
  const email = content.email || (locationContent.email as string) || "";
  const facebookUrl = content.facebookUrl || (locationContent.facebookUrl as string) || "";
  const instagramUrl = content.instagramUrl || (locationContent.instagramUrl as string) || "";
  const hours = (locationContent.hours as { day: string; time: string }[]) || [];

  return (
    <footer className="bg-foreground text-background">
      <div className="container px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Brand */}
          <div>
            <h3 className="text-xl font-bold mb-3">
              {content.brandName || "American Ribs"}
              <span className="text-accent"> {content.brandAccent || "& Wings"}</span>
            </h3>
            <p className="text-background/70 mb-3 text-sm">
              {content.tagline || "Authentic American BBQ crafted with passion. Smoky ribs, crispy wings, and flavors that'll make you come back for more."}
            </p>
            <div className="flex gap-2">
              {facebookUrl && (
                <a 
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 bg-background/10 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {instagramUrl && (
                <a 
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 bg-background/10 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#menu" className="text-background/70 hover:text-accent transition-colors">
                  Our Menu
                </a>
              </li>
              <li>
                <Link to="/order" className="text-background/70 hover:text-accent transition-colors">
                  Order Online
                </Link>
              </li>
              <li>
                <a href="#about" className="text-background/70 hover:text-accent transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#location" className="text-background/70 hover:text-accent transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h4 className="font-semibold mb-3">Hours</h4>
            <ul className="space-y-1 text-background/70 text-sm">
              {hours.length > 0 ? (
                hours.map((item, index) => (
                  <li key={index} className="flex justify-between gap-2">
                    <span>{item.day}</span>
                    <span>{item.time}</span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex justify-between">
                    <span>Mon - Sat</span>
                    <span>12PM - 9PM</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Sunday</span>
                    <span>12PM - 9PM</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-background/70 text-sm">
              {address && (
                <li className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{address.split("\n").join(", ")}</span>
                </li>
              )}
              {phone && (
                <li>
                  <a 
                    href={`tel:${phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 hover:text-accent transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a 
                    href={`mailto:${email}`}
                    className="flex items-center gap-2 hover:text-accent transition-colors break-all"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    {email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-background/10 mt-6 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-background/50 text-xs">
            {content.copyright || `© ${currentYear} American Ribs & Wings. All rights reserved.`}
          </p>
          <div className="flex gap-4 text-xs text-background/50">
            <a href="#" className="hover:text-accent transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-accent transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
