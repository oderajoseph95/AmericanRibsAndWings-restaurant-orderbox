import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Clock, Award, Heart, Truck, Users, LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

interface AboutContent {
  title?: string;
  titleAccent?: string;
  story?: string;
  yearsInBusiness?: string;
  menuItems?: string;
  happyCustomers?: string;
  features?: FeatureItem[];
}

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Flame,
  Clock,
  Award,
  Heart,
  Truck,
  Users,
};

// Default features if none configured
const defaultFeatures: FeatureItem[] = [
  {
    icon: "Flame",
    title: "Slow-Smoked",
    description: "Our ribs are smoked for hours to achieve that perfect fall-off-the-bone tenderness.",
  },
  {
    icon: "Award",
    title: "Premium Quality",
    description: "We source only the finest cuts and freshest ingredients for our dishes.",
  },
  {
    icon: "Heart",
    title: "Made with Love",
    description: "Every dish is prepared with passion and attention to detail.",
  },
  {
    icon: "Clock",
    title: "Fast Service",
    description: "Quick preparation without compromising on quality or taste.",
  },
  {
    icon: "Truck",
    title: "Delivery Available",
    description: "Enjoy our BBQ at home with our reliable delivery service.",
  },
  {
    icon: "Users",
    title: "Group Orders",
    description: "Perfect for parties, events, and family gatherings.",
  },
];

export function About() {
  const { data: sectionConfig, isLoading } = useQuery({
    queryKey: ["homepage-section", "about"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "about")
        .eq("is_visible", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <section id="about" className="py-3 md:py-12 bg-background">
        <div className="container px-4 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (!sectionConfig) return null;

  const content = (sectionConfig.content as AboutContent) || {};
  const features = content.features && content.features.length > 0 ? content.features : defaultFeatures;

  return (
    <section id="about" className="py-3 md:py-12 bg-background">
      <div className="container px-4">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left side - Story */}
          <div>
            <Badge variant="secondary" className="mb-3">
              {content.title || "Our Story"}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Authentic American
              <span className="text-primary"> {content.titleAccent || "BBQ Experience"}</span>
            </h2>
            <div className="space-y-3 text-muted-foreground">
              <p className="text-base">
                {content.story || "Welcome to American Ribs & Wings, where we bring the authentic taste of American BBQ right to your table. Our journey started with a simple passion: to serve the most delicious, tender ribs and crispy wings you've ever tasted."}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{content.yearsInBusiness || "5+"}</div>
                <div className="text-xs text-muted-foreground">Years</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{content.menuItems || "50+"}</div>
                <div className="text-xs text-muted-foreground">Menu Items</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{content.happyCustomers || "10K+"}</div>
                <div className="text-xs text-muted-foreground">Customers</div>
              </div>
            </div>
          </div>

          {/* Right side - Features grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, index) => {
              const IconComponent = iconMap[feature.icon] || Flame;
              return (
                <Card 
                  key={index} 
                  className="border-border/50 hover:border-primary/50 hover:shadow-md transition-all duration-300"
                >
                  <CardContent className="p-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1 text-sm">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
