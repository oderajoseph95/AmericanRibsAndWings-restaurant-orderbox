import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/home/Navbar";
import { Hero } from "@/components/home/Hero";
import { FeaturedMenu } from "@/components/home/FeaturedMenu";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { VideoSection } from "@/components/home/VideoSection";
import { Gallery } from "@/components/home/Gallery";
import { About } from "@/components/home/About";
import { Location } from "@/components/home/Location";
import { Footer } from "@/components/home/Footer";
import { SEOHead } from "@/components/SEOHead";

interface SectionConfig {
  section_key: string;
  is_visible: boolean;
  sort_order: number;
}

const Index = () => {
  // Fetch section visibility config
  const { data: sections } = useQuery({
    queryKey: ["homepage-sections-visibility"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("section_key, is_visible, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as SectionConfig[];
    },
  });

  const isVisible = (key: string) => {
    const section = sections?.find((s) => s.section_key === key);
    return section?.is_visible ?? true;
  };

  return (
    <div className="min-h-screen">
      <SEOHead 
        pagePath="/" 
        fallbackTitle="American Ribs & Wings - Floridablanca | Best BBQ in Pampanga"
        fallbackDescription="Savor authentic American-style BBQ ribs and wings in Floridablanca, Pampanga. All you can eat, outdoor seating, free Wi-Fi. Order online!"
      />
      <Navbar />
      {isVisible("hero") && <Hero />}
      {isVisible("featured_menu") && <FeaturedMenu />}
      {isVisible("category_showcase") && <CategoryShowcase />}
      {isVisible("videos") && <VideoSection />}
      {isVisible("gallery") && <Gallery />}
      {isVisible("about") && (
        <section id="about">
          <About />
        </section>
      )}
      {isVisible("location") && (
        <section id="location">
          <Location />
        </section>
      )}
      {isVisible("footer") && <Footer />}
    </div>
  );
};

export default Index;
