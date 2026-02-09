import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/home/Navbar";
import { Footer } from "@/components/home/Footer";
import { SEOHead } from "@/components/SEOHead";
import { CalendarPlus, Search, Users, Flame } from "lucide-react";
import { FILIPINO_NAMES } from "@/data/filipinoNames";
import { format, addDays } from "date-fns";

interface GalleryImage {
  id: string;
  title: string | null;
  image_url: string;
  sort_order: number | null;
  is_active: boolean | null;
}

interface ReservationFomoMessage {
  name: string;
  pax: number;
  dateLabel: string;
}

// Helper functions
const getRandomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomBetween = (min: number, max: number): number => 
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateFutureDate = (): string => {
  const daysAhead = getRandomBetween(1, 7);
  const futureDate = addDays(new Date(), daysAhead);
  
  if (daysAhead === 1) return "tomorrow";
  if (daysAhead <= 6) return format(futureDate, "EEEE");
  return format(futureDate, "'next' EEEE");
};

const generateFomoMessage = (): ReservationFomoMessage => ({
  name: getRandomItem(FILIPINO_NAMES),
  pax: getRandomBetween(1, 6),
  dateLabel: generateFutureDate(),
});

// Placeholder images for the gallery
const placeholderImages: GalleryImage[] = [
  { id: "p1", title: "Delicious Ribs", image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop", sort_order: 1, is_active: true },
  { id: "p2", title: "Crispy Wings", image_url: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=300&fit=crop", sort_order: 2, is_active: true },
  { id: "p3", title: "BBQ Feast", image_url: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=300&fit=crop", sort_order: 3, is_active: true },
  { id: "p4", title: "Grilled Perfection", image_url: "https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop", sort_order: 4, is_active: true },
  { id: "p5", title: "Smoky Goodness", image_url: "https://images.unsplash.com/photo-1504382262782-5b4ece78642b?w=400&h=300&fit=crop", sort_order: 5, is_active: true },
  { id: "p6", title: "Family Platter", image_url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop", sort_order: 6, is_active: true },
];

export default function ReserveNow() {
  const [fomoMessage, setFomoMessage] = useState<ReservationFomoMessage | null>(null);
  const [isFading, setIsFading] = useState(false);

  // Fetch gallery images
  const { data: images } = useQuery({
    queryKey: ["gallery-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gallery_images")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as GalleryImage[];
    },
  });

  // FOMO rotation effect
  useEffect(() => {
    // Initial message
    setFomoMessage(generateFomoMessage());

    // Rotate every 10-20 seconds with fade animation
    const rotateMessage = () => {
      setIsFading(true);
      setTimeout(() => {
        setFomoMessage(generateFomoMessage());
        setIsFading(false);
      }, 300);
    };

    const interval = setInterval(rotateMessage, getRandomBetween(10000, 20000));
    return () => clearInterval(interval);
  }, []);

  const displayImages = images && images.length > 0 ? images : placeholderImages;
  const scrollImages = [...displayImages, ...displayImages];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead 
        pagePath="/reservenow" 
        fallbackTitle="Reserve a Table | American Ribs & Wings"
        fallbackDescription="Reserve your table for an unforgettable BBQ experience at American Ribs & Wings in Floridablanca, Pampanga."
      />
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden pt-16">
        {/* Background with gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-accent/80" />
        
        {/* Scrolling gallery background */}
        <div className="absolute inset-0 overflow-hidden opacity-15">
          <div className="flex gap-2 animate-scroll-left">
            {scrollImages.map((image, index) => (
              <div
                key={`scroll-${image.id}-${index}`}
                className="flex-shrink-0 w-48 h-36 rounded-lg overflow-hidden"
              >
                <img
                  src={image.image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Pattern overlay */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="container relative z-10 px-4 py-12 md:py-16">
          <div className="max-w-2xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Users className="h-4 w-4" />
              Dine-In Experience
            </div>

            {/* Main heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
              Reserve Your
              <span className="block text-accent">Experience</span>
            </h1>

            {/* Tagline */}
            <p className="text-lg md:text-xl text-white/90 mb-8 max-w-lg mx-auto">
              Enjoy premium BBQ dining with family and friends. 
              Skip the wait — secure your table today.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg" 
                className="bg-accent text-accent-foreground hover:bg-accent/90 text-base px-8 py-6 rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                <Link to="/reserve">
                  <CalendarPlus className="mr-2 h-5 w-5" />
                  Reserve a Table
                </Link>
              </Button>
              <Button 
                asChild
                variant="outline" 
                size="lg"
                className="border-white/30 bg-white text-foreground hover:bg-white/90 text-base px-8 py-6 rounded-full"
              >
                <Link to="/reserve/track">
                  <Search className="mr-2 h-5 w-5" />
                  Check My Reservation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FOMO Activity Feed */}
      <section className="py-8 md:py-12 bg-muted/50">
        <div className="container px-4">
          <div className="max-w-md mx-auto text-center">
            {/* Activity message */}
            {fomoMessage && (
              <div className={`transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                <div className="bg-background rounded-xl p-6 shadow-sm border">
                  <div className="flex items-center justify-center gap-2 text-primary mb-2">
                    <Users className="h-5 w-5" />
                    <span className="text-sm font-medium">Recent Activity</span>
                  </div>
                  <p className="text-lg">
                    <span className="font-semibold">{fomoMessage.name}</span> reserved a table for{" "}
                    <span className="font-semibold">{fomoMessage.pax}</span>
                  </p>
                  <p className="text-muted-foreground">
                    for {fomoMessage.dateLabel}
                  </p>
                </div>
              </div>
            )}

            {/* Demand indicator */}
            <div className="mt-6 inline-flex items-center gap-2 text-primary font-medium">
              <Flame className="h-5 w-5 text-destructive" />
              <span>Tables filling fast this weekend</span>
            </div>
          </div>
        </div>
      </section>

      {/* Spacer to push footer down */}
      <div className="flex-1" />

      <Footer />
    </div>
  );
}
