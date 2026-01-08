import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MenuModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MenuModal({ open, onOpenChange }: MenuModalProps) {
  // Fetch menu images
  const { data: menuImages, isLoading } = useQuery({
    queryKey: ["menu-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_images")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch PDF URL from settings
  const { data: pdfSetting } = useQuery({
    queryKey: ["menu-pdf-url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "menu_pdf_url")
        .maybeSingle();
      if (error) throw error;
      return data?.value as string | null;
    },
    enabled: open,
  });

  const handleDownloadPdf = () => {
    if (pdfSetting) {
      window.open(pdfSetting, "_blank");
    }
  };

  const handleOrderNow = () => {
    onOpenChange(false);
    window.location.href = "/order";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 [&>button]:hidden">
        <DialogHeader className="p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Our Menu</DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleOrderNow}>
                Order Now
              </Button>
              {pdfSetting && (
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                className="h-10 w-10 rounded-full hover:bg-muted"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-6 w-6" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-80px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : menuImages && menuImages.length > 0 ? (
            <div className="space-y-0">
              {menuImages.map((img) => (
                <img
                  key={img.id}
                  src={img.image_url}
                  alt="Menu"
                  className="w-full"
                  loading="lazy"
                />
              ))}
              {/* Order Now button at bottom of images */}
              <div className="p-4 border-t bg-background">
                <Button 
                  className="w-full"
                  size="lg"
                  onClick={handleOrderNow}
                >
                  Order Now
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground">
                Menu images coming soon. You can still order online!
              </p>
              <Button 
                className="mt-4" 
                onClick={handleOrderNow}
              >
                Order Now
              </Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
