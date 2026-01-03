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
      <section className="py-20 bg-secondary/10">
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
    <section className="py-20 bg-secondary/10 overflow-hidden">
      <div className="container px-4 mb-12">
        {/* Section header */}
        <div className="text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
            <ImageIcon className="h-3 w-3 mr-1" />
            Gallery
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {content.title || "Our Food Gallery"}
          </h2>
          {content.subtitle && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Scrolling gallery - Desktop: 2 rows, Mobile: 1 row */}
      <div className="space-y-4">
        {/* Row 1 - scrolls left */}
        <div className="relative">
          <div className="flex gap-4 animate-scroll-left">
            {scrollImages.map((image, index) => (
              <div
                key={`row1-${image.id}-${index}`}
                className="flex-shrink-0 w-64 md:w-80 h-48 md:h-56 rounded-xl overflow-hidden cursor-pointer group"
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

        {/* Row 2 - scrolls right (hidden on mobile) */}
        <div className="relative hidden md:block">
          <div className="flex gap-4 animate-scroll-right">
            {row2Images.map((image, index) => (
              <div
                key={`row2-${image.id}-${index}`}
                className="flex-shrink-0 w-80 h-56 rounded-xl overflow-hidden cursor-pointer group"
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
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90">
          {selectedImage && (
            <div className="relative">
              <img
                src={selectedImage.image_url}
                alt={selectedImage.title || "Gallery image"}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              {selectedImage.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                  <h3 className="text-white text-xl font-semibold">
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
