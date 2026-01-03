import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface GalleryImage {
  id: string;
  title: string | null;
  image_url: string;
  sort_order: number | null;
  is_active: boolean | null;
}

interface GalleryContent {
  title?: string;
  subtitle?: string;
}

export function Gallery() {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

  // Fetch section config
  const { data: sectionConfig } = useQuery({
    queryKey: ["homepage-section", "gallery"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "gallery")
        .eq("is_visible", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch gallery images
  const { data: images, isLoading } = useQuery({
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

  if (!sectionConfig) return null;

  const content = (sectionConfig.content as GalleryContent) || {};

  if (isLoading) {
    return (
      <section className="py-12 bg-background">
        <div className="container px-4 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  // Placeholder images when no real images exist
  const placeholderImages: GalleryImage[] = [
    { id: "p1", title: "Delicious Ribs", image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop", sort_order: 1, is_active: true },
    { id: "p2", title: "Crispy Wings", image_url: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=300&fit=crop", sort_order: 2, is_active: true },
    { id: "p3", title: "BBQ Feast", image_url: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=300&fit=crop", sort_order: 3, is_active: true },
    { id: "p4", title: "Grilled Perfection", image_url: "https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop", sort_order: 4, is_active: true },
    { id: "p5", title: "Smoky Goodness", image_url: "https://images.unsplash.com/photo-1504382262782-5b4ece78642b?w=400&h=300&fit=crop", sort_order: 5, is_active: true },
    { id: "p6", title: "Family Platter", image_url: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop", sort_order: 6, is_active: true },
    { id: "p7", title: "Hot Wings", image_url: "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=400&h=300&fit=crop", sort_order: 7, is_active: true },
    { id: "p8", title: "BBQ Ribs", image_url: "https://images.unsplash.com/photo-1623174479795-9d24ea3c2c4e?w=400&h=300&fit=crop", sort_order: 8, is_active: true },
  ];

  const displayImages = images && images.length > 0 ? images : placeholderImages;
  
  // Double the images for seamless infinite scroll
  const scrollImages = [...displayImages, ...displayImages];
  
  // For row 2, reverse direction
  const row2Images = [...scrollImages].reverse();

  return (
    <section className="py-12 bg-background overflow-hidden">
      <div className="container px-4 mb-8">
        {/* Section header */}
        <div className="text-center">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5">
            <ImageIcon className="h-3 w-3 mr-1" />
            Gallery
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            {content.title || "Our Food Gallery"}
          </h2>
          {content.subtitle && (
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              {content.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Scrolling gallery - Both mobile and desktop: 2 rows */}
      <div className="space-y-2 md:space-y-3">
        {/* Row 1 - scrolls left */}
        <div className="relative">
          <div className="flex gap-2 md:gap-3 animate-scroll-left">
            {scrollImages.map((image, index) => (
              <div
                key={`row1-${image.id}-${index}`}
                className="flex-shrink-0 w-36 md:w-72 h-28 md:h-48 rounded-lg md:rounded-xl overflow-hidden cursor-pointer group shadow-md"
                onClick={() => setSelectedImage(image)}
              >
                <img
                  src={image.image_url}
                  alt={image.title || "Gallery image"}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 - scrolls right (visible on both mobile and desktop) */}
        <div className="relative">
          <div className="flex gap-2 md:gap-3 animate-scroll-right">
            {row2Images.map((image, index) => (
              <div
                key={`row2-${image.id}-${index}`}
                className="flex-shrink-0 w-36 md:w-72 h-28 md:h-48 rounded-lg md:rounded-xl overflow-hidden cursor-pointer group shadow-md"
                onClick={() => setSelectedImage(image)}
              >
                <img
                  src={image.image_url}
                  alt={image.title || "Gallery image"}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-0">
          {selectedImage && (
            <div className="relative">
              <img
                src={selectedImage.image_url}
                alt={selectedImage.title || "Gallery image"}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              {selectedImage.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <h3 className="text-white text-lg font-semibold">
                    {selectedImage.title}
                  </h3>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
