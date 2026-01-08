import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, Clock, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MenuModal } from "./MenuModal";
import { useStoreStatus } from "@/hooks/useStoreStatus";

interface HeroContent {
  badge?: string;
  headline?: string;
  headlineAccent?: string;
  tagline?: string;
  primaryCta?: string;
  primaryCtaLink?: string;
  secondaryCta?: string;
  secondaryCtaLink?: string;
  address?: string;
  hours?: string;
  phone?: string;
}

export function Hero() {
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const { isOpen: isStoreOpen, opensAt, isLoading: storeStatusLoading } = useStoreStatus();

  const { data: sectionConfig } = useQuery({
    queryKey: ["homepage-section", "hero"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "hero")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const content = (sectionConfig?.content as HeroContent) || {};
  
  // Dynamic badge based on store status
  const getDynamicBadge = () => {
    if (storeStatusLoading) return "Loading...";
    if (isStoreOpen) return "Now Open for Orders";
    if (opensAt) return `Order for Later · We Open at ${opensAt}`;
    return "Pre-order for Tomorrow";
  };
  
  // Default values
  const badge = getDynamicBadge();
  const headline = content.headline || "American Ribs";
  const headlineAccent = content.headlineAccent || "& Wings";
  const tagline = content.tagline || "Authentic American BBQ crafted with passion. Smoky ribs, crispy wings, and flavors that'll make you come back for more.";
  const primaryCta = content.primaryCta || "Order Now";
  const primaryCtaLink = content.primaryCtaLink || "/order";
  const secondaryCta = content.secondaryCta || "View Menu";
  const address = content.address || "Floridablanca, Pampanga";
  const hours = content.hours || "12PM - 9PM Daily";
  const phone = content.phone || "0976 207 4276";

  return (
    <>
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden pt-16 md:pt-20">
        {/* Background with gradient overlay using brand colors */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-accent/80" />
        
        {/* Pattern overlay */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="container relative z-10 px-4 pt-8 pb-12 md:pt-10 md:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge - hidden on mobile (shown in navbar), visible on tablet+ */}
            <div className={`hidden md:inline-flex items-center gap-2 ${isStoreOpen ? 'bg-white/20' : 'bg-white/10'} text-white px-3 py-1.5 rounded-full text-sm font-medium mb-4`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isStoreOpen ? 'bg-accent' : 'bg-orange-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isStoreOpen ? 'bg-accent' : 'bg-orange-400'}`}></span>
              </span>
              {badge}
            </div>

            {/* Main heading */}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 tracking-tight">
              {headline}
              <span className="block text-accent">{headlineAccent}</span>
            </h1>

            {/* Tagline */}
            <p className="text-lg md:text-xl text-white/90 mb-6 max-w-xl mx-auto">
              {tagline}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <Button 
                asChild 
                size="lg" 
                className="bg-accent text-accent-foreground hover:bg-accent/90 text-base px-6 py-5 rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                <Link to={primaryCtaLink}>
                  {primaryCta}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="border-white/30 bg-white text-foreground hover:bg-white/90 text-base px-6 py-5 rounded-full"
                onClick={() => setMenuModalOpen(true)}
              >
                {secondaryCta}
              </Button>
            </div>

            {/* Quick info */}
            <div className="flex flex-wrap justify-center gap-4 text-white/80 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{hours}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>{phone}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Menu Modal */}
      <MenuModal open={menuModalOpen} onOpenChange={setMenuModalOpen} />
    </>
  );
}