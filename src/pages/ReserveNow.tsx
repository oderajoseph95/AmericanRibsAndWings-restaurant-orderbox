import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/home/Navbar";
import { Footer } from "@/components/home/Footer";
import { Gallery } from "@/components/home/Gallery";
import { SEOHead } from "@/components/SEOHead";
import { CalendarPlus, Search, Users, Flame, Sparkles } from "lucide-react";
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
  id: string;
  name: string;
  pax: number;
  dateLabel: string;
  timestamp: number;
}

// Helper functions
const getRandomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomBetween = (min: number, max: number): number => 
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateFutureDate = (): string => {
  const daysAhead = getRandomBetween(0, 7);
  const futureDate = addDays(new Date(), daysAhead);
  
  if (daysAhead === 0) return "today";
  if (daysAhead === 1) return "tomorrow";
  if (daysAhead <= 6) return format(futureDate, "EEEE");
  return format(futureDate, "'next' EEEE");
};

const generateFomoMessage = (): ReservationFomoMessage => ({
  id: Math.random().toString(36).substr(2, 9),
  name: getRandomItem(FILIPINO_NAMES),
  pax: getRandomBetween(2, 8),
  dateLabel: generateFutureDate(),
  timestamp: Date.now(),
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

const MAX_VISIBLE_MESSAGES = 5;

export default function ReserveNow() {
  const [fomoMessages, setFomoMessages] = useState<ReservationFomoMessage[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

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

  // Live feed FOMO effect
  useEffect(() => {
    // Initial batch of messages
    const initial = Array.from({ length: 4 }, () => generateFomoMessage());
    setFomoMessages(initial);

    // Add new message every 3-5 seconds
    const addMessage = () => {
      setFomoMessages(prev => {
        const newMessages = [...prev, generateFomoMessage()];
        return newMessages.slice(-MAX_VISIBLE_MESSAGES);
      });
    };

    const interval = setInterval(addMessage, getRandomBetween(2500, 4500));
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [fomoMessages]);

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
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden pt-16">
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

      {/* Scrolling Gallery - Same as Homepage */}
      <Gallery />

      {/* HYPED FOMO Live Feed Section */}
      <section className="py-8 md:py-12 bg-gradient-to-b from-muted/30 to-background overflow-hidden">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto">
            
            {/* Live Indicator Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center gap-2 bg-destructive text-white px-3 py-1.5 rounded-full text-sm font-bold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                  </span>
                  LIVE
                </div>
                <span className="text-sm text-muted-foreground font-medium">Reservations happening now</span>
              </div>
              <Sparkles className="h-5 w-5 text-accent animate-pulse" />
            </div>

            {/* Live Feed Container */}
            <div 
              ref={feedRef}
              className="bg-card border rounded-xl shadow-lg overflow-hidden mb-6"
            >
              <div className="max-h-[280px] overflow-y-auto p-4 space-y-3">
                {fomoMessages.map((msg, index) => (
                  <div
                    key={msg.id}
                    className="flex items-center gap-3 bg-muted/50 backdrop-blur-sm rounded-lg px-4 py-3 animate-slide-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {msg.name.charAt(0)}
                    </div>
                    
                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold text-foreground">{msg.name}</span>
                        <span className="text-muted-foreground"> reserved for </span>
                        <span className="font-semibold text-primary">{msg.pax} guests</span>
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {msg.dateLabel}
                      </p>
                    </div>
                    
                    {/* Timestamp indicator */}
                    <div className="flex-shrink-0">
                      <span className="text-xs text-muted-foreground">just now</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Urgency Banner */}
            <div className="relative bg-gradient-to-r from-destructive via-orange-500 to-destructive rounded-2xl p-6 md:p-8 text-center shadow-xl animate-urgency-pulse overflow-hidden">
              {/* Animated background sparkles */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-2 left-4 text-2xl animate-bounce" style={{ animationDelay: '0s' }}>🔥</div>
                <div className="absolute top-4 right-6 text-xl animate-bounce" style={{ animationDelay: '0.3s' }}>✨</div>
                <div className="absolute bottom-3 left-8 text-lg animate-bounce" style={{ animationDelay: '0.6s' }}>🔥</div>
                <div className="absolute bottom-4 right-4 text-2xl animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
              </div>
              
              {/* Main urgency text */}
              <div className="relative z-10">
                <div className="flex items-center justify-center gap-2 md:gap-3 text-white text-xl md:text-2xl lg:text-3xl font-extrabold mb-4 animate-blink-urgent">
                  <Flame className="h-6 w-6 md:h-8 md:w-8" />
                  <span>TABLES FILLING FAST!</span>
                  <Flame className="h-6 w-6 md:h-8 md:w-8" />
                </div>
                
                <p className="text-white/90 mb-6 text-sm md:text-base">
                  Weekend slots are going quick — don't miss out!
                </p>
                
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-white text-primary hover:bg-white/90 font-bold px-8 md:px-10 py-6 md:py-7 rounded-full shadow-2xl text-base md:text-lg transition-transform hover:scale-105"
                >
                  <Link to="/reserve">
                    <CalendarPlus className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                    RESERVE YOUR TABLE NOW
                  </Link>
                </Button>
              </div>
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
