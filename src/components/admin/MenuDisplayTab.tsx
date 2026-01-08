import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  FileText,
  Download,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

interface MenuImage {
  id: string;
  image_url: string;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string | null;
}

export function MenuDisplayTab() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Fetch menu images
  const { data: menuImages, isLoading: imagesLoading } = useQuery({
    queryKey: ["admin-menu-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_images")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as MenuImage[];
    },
  });

  // Fetch PDF URL setting
  const { data: pdfSetting } = useQuery({
    queryKey: ["admin-menu-pdf-url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("key", "menu_pdf_url")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Add menu image
  const addMenuImage = useMutation({
    mutationFn: async (image_url: string) => {
      const maxOrder = menuImages?.reduce((max, img) => Math.max(max, img.sort_order || 0), 0) || 0;
      const { error } = await supabase.from("menu_images").insert({
        image_url,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-images"] });
      queryClient.invalidateQueries({ queryKey: ["menu-images"] });
      toast.success("Menu image added");
    },
    onError: () => {
      toast.error("Failed to add menu image");
    },
  });

  // Toggle image visibility
  const toggleImageVisibility = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("menu_images").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-images"] });
      queryClient.invalidateQueries({ queryKey: ["menu-images"] });
    },
  });

  // Delete menu image
  const deleteMenuImage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-images"] });
      queryClient.invalidateQueries({ queryKey: ["menu-images"] });
      setDeleteImageId(null);
      toast.success("Menu image deleted");
    },
    onError: () => {
      toast.error("Failed to delete menu image");
    },
  });

  // Reorder menu image
  const reorderImage = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      if (!menuImages) return;
      
      const currentIndex = menuImages.findIndex((img) => img.id === id);
      if (currentIndex === -1) return;
      
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= menuImages.length) return;
      
      const currentImage = menuImages[currentIndex];
      const targetImage = menuImages[targetIndex];
      
      // Swap sort orders
      const { error: error1 } = await supabase
        .from("menu_images")
        .update({ sort_order: targetImage.sort_order })
        .eq("id", currentImage.id);
      
      const { error: error2 } = await supabase
        .from("menu_images")
        .update({ sort_order: currentImage.sort_order })
        .eq("id", targetImage.id);
      
      if (error1 || error2) throw error1 || error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-images"] });
      queryClient.invalidateQueries({ queryKey: ["menu-images"] });
    },
  });

  // Update PDF URL
  const updatePdfUrl = useMutation({
    mutationFn: async (url: string) => {
      if (pdfSetting) {
        const { error } = await supabase
          .from("settings")
          .update({ value: url })
          .eq("key", "menu_pdf_url");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ key: "menu_pdf_url", value: url });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-pdf-url"] });
      queryClient.invalidateQueries({ queryKey: ["menu-pdf-url"] });
      toast.success("PDF URL updated");
    },
    onError: () => {
      toast.error("Failed to update PDF URL");
    },
  });

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `menu_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("menu-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("menu-images").getPublicUrl(filePath);

      addMenuImage.mutate(urlData.publicUrl);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  // Handle PDF upload
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploadingPdf(true);
    try {
      const fileName = `menu_${Date.now()}.pdf`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("menu-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("menu-images").getPublicUrl(filePath);

      updatePdfUrl.mutate(urlData.publicUrl);
    } catch (error) {
      console.error("PDF upload error:", error);
      toast.error("Failed to upload PDF");
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      {/* Menu Images Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Menu Images
            </CardTitle>
            <CardDescription>
              Upload menu images that customers will see when clicking "View Menu". 
              Images are displayed in order from top to bottom.
            </CardDescription>
          </div>
          <Button onClick={() => imageInputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Image
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </CardHeader>
        <CardContent>
          {imagesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : menuImages && menuImages.length > 0 ? (
            <div className="space-y-3">
              {menuImages.map((image, index) => (
                <div
                  key={image.id}
                  className="flex items-center gap-4 p-3 border rounded-lg"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => reorderImage.mutate({ id: image.id, direction: "up" })}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === menuImages.length - 1}
                      onClick={() => reorderImage.mutate({ id: image.id, direction: "down" })}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="w-20 h-20 rounded-lg overflow-hidden border shrink-0">
                    <img
                      src={image.image_url}
                      alt="Menu"
                      className={`w-full h-full object-cover ${!image.is_active ? "opacity-50" : ""}`}
                    />
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Position: {index + 1}
                    </p>
                    {image.is_active ? (
                      <Badge variant="default" className="gap-1 mt-1">
                        <Eye className="h-3 w-3" /> Visible
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 mt-1">
                        <EyeOff className="h-3 w-3" /> Hidden
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={image.is_active ?? true}
                      onCheckedChange={(checked) =>
                        toggleImageVisibility.mutate({ id: image.id, is_active: checked })
                      }
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => setDeleteImageId(image.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No menu images uploaded yet</p>
              <p className="text-sm">Upload images to display in the "View Menu" modal</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Download Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Menu PDF Download
          </CardTitle>
          <CardDescription>
            Upload a PDF version of your menu for customers to download
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pdfSetting?.value ? (
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <FileText className="h-10 w-10 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Menu PDF uploaded</p>
                  <a 
                    href={pdfSetting.value as string} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Preview PDF
                  </a>
                </div>
                <Button
                  variant="outline"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Replace PDF
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">No PDF uploaded yet</p>
                <Button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload PDF
                </Button>
              </div>
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteImageId} onOpenChange={() => setDeleteImageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu image?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The image will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteImageId && deleteMenuImage.mutate(deleteImageId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
