import { useState, useRef } from "react";
import type { Json } from "@/integrations/supabase/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Globe,
  Save,
  Loader2,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  Upload,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface HomepageSection {
  id: string;
  section_key: string;
  title: string | null;
  content: Record<string, unknown>;
  is_visible: boolean | null;
  sort_order: number | null;
}

interface GalleryImage {
  id: string;
  title: string | null;
  image_url: string;
  sort_order: number | null;
  is_active: boolean | null;
}

interface VideoItem {
  id: string;
  title: string | null;
  video_url: string;
  thumbnail_url: string | null;
  video_type: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

interface PageSeo {
  id: string;
  page_path: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
}

export default function Website() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("sections");
  const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);
  const [editingSeo, setEditingSeo] = useState<PageSeo | null>(null);
  const [addImageOpen, setAddImageOpen] = useState(false);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [newImageTitle, setNewImageTitle] = useState("");
  const [newVideoThumbnail, setNewVideoThumbnail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Fetch all sections
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["admin-homepage-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as HomepageSection[];
    },
  });

  // Fetch gallery images
  const { data: galleryImages, isLoading: galleryLoading } = useQuery({
    queryKey: ["admin-gallery-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gallery_images")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as GalleryImage[];
    },
  });

  // Fetch videos
  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ["admin-videos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").order("sort_order");
      if (error) throw error;
      return data as VideoItem[];
    },
  });

  // Fetch SEO data
  const { data: seoData, isLoading: seoLoading } = useQuery({
    queryKey: ["admin-page-seo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("page_seo").select("*").order("page_path");
      if (error) throw error;
      return data as PageSeo[];
    },
  });

  // Toggle section visibility
  const toggleVisibility = useMutation({
    mutationFn: async ({ id, is_visible }: { id: string; is_visible: boolean }) => {
      const { error } = await supabase
        .from("homepage_sections")
        .update({ is_visible })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-homepage-sections"] });
      queryClient.invalidateQueries({ queryKey: ["homepage-section"] });
      toast.success("Section visibility updated");
    },
    onError: () => {
      toast.error("Failed to update section");
    },
  });

  // Update section content
  const updateSection = useMutation({
    mutationFn: async (section: HomepageSection) => {
      const { error } = await supabase
        .from("homepage_sections")
        .update({ content: section.content as unknown as Json, title: section.title })
        .eq("id", section.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-homepage-sections"] });
      queryClient.invalidateQueries({ queryKey: ["homepage-section"] });
      setEditingSection(null);
      toast.success("Section updated successfully");
    },
    onError: () => {
      toast.error("Failed to update section");
    },
  });

  // Update SEO
  const updateSeo = useMutation({
    mutationFn: async (seo: PageSeo) => {
      const { error } = await supabase
        .from("page_seo")
        .update({ 
          title: seo.title, 
          description: seo.description,
          og_image_url: seo.og_image_url 
        })
        .eq("id", seo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-page-seo"] });
      queryClient.invalidateQueries({ queryKey: ["page-seo"] });
      setEditingSeo(null);
      toast.success("SEO updated successfully");
    },
    onError: () => {
      toast.error("Failed to update SEO");
    },
  });

  // Add gallery image
  const addGalleryImage = useMutation({
    mutationFn: async ({ title, image_url }: { title: string; image_url: string }) => {
      const maxOrder = galleryImages?.reduce((max, img) => Math.max(max, img.sort_order || 0), 0) || 0;
      const { error } = await supabase.from("gallery_images").insert({
        title,
        image_url,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-gallery-images"] });
      queryClient.invalidateQueries({ queryKey: ["gallery-images"] });
      setAddImageOpen(false);
      setNewImageTitle("");
      toast.success("Image added successfully");
    },
    onError: () => {
      toast.error("Failed to add image");
    },
  });

  // Toggle gallery image visibility
  const toggleImageVisibility = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("gallery_images").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-gallery-images"] });
      queryClient.invalidateQueries({ queryKey: ["gallery-images"] });
    },
  });

  // Delete gallery image
  const deleteGalleryImage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gallery_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-gallery-images"] });
      queryClient.invalidateQueries({ queryKey: ["gallery-images"] });
      setDeleteImageId(null);
      toast.success("Image deleted");
    },
    onError: () => {
      toast.error("Failed to delete image");
    },
  });

  // Add video (upload)
  const addVideo = useMutation({
    mutationFn: async ({ video_url, thumbnail_url }: { video_url: string; thumbnail_url?: string }) => {
      const maxOrder = videos?.reduce((max, v) => Math.max(max, v.sort_order || 0), 0) || 0;
      const { error } = await supabase.from("videos").insert({
        title: null,
        video_url,
        video_type: "upload",
        thumbnail_url: thumbnail_url || null,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setAddVideoOpen(false);
      setNewVideoThumbnail(null);
      toast.success("Video added successfully");
    },
    onError: () => {
      toast.error("Failed to add video");
    },
  });

  // Toggle video visibility
  const toggleVideoVisibility = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("videos").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
  });

  // Delete video
  const deleteVideo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setDeleteVideoId(null);
      toast.success("Video deleted");
    },
    onError: () => {
      toast.error("Failed to delete video");
    },
  });

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("gallery").getPublicUrl(filePath);

      addGalleryImage.mutate({ title: newImageTitle, image_url: urlData.publicUrl });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  // Handle video upload
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(filePath);

      addVideo.mutate({ 
        video_url: urlData.publicUrl,
        thumbnail_url: newVideoThumbnail || undefined
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload video");
    } finally {
      setUploadingVideo(false);
    }
  };

  // Handle thumbnail upload
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `thumb_${Date.now()}.${fileExt}`;
      const filePath = `thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(filePath);
      setNewVideoThumbnail(urlData.publicUrl);
      toast.success("Thumbnail uploaded");
    } catch (error) {
      console.error("Thumbnail upload error:", error);
      toast.error("Failed to upload thumbnail");
    }
  };

  const getSectionLabel = (key: string): string => {
    const labels: Record<string, string> = {
      hero: "Hero Section",
      featured_menu: "Featured Menu",
      category_showcase: "Category Showcase",
      videos: "Video Section",
      gallery: "Photo Gallery",
      about: "About Us",
      location: "Location & Hours",
      footer: "Footer",
    };
    return labels[key] || key;
  };

  const getPageLabel = (path: string): string => {
    const labels: Record<string, string> = {
      "/": "Homepage",
      "/order": "Order Page",
      "/my-orders": "My Orders",
      "/order-tracking": "Order Tracking",
    };
    return labels[path] || path;
  };

  if (sectionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-8 w-8" />
            Website Management
          </h1>
          <p className="text-muted-foreground">
            Manage your homepage sections, gallery, videos, and SEO
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Eye className="h-4 w-4 mr-2" />
            View Website
          </a>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        {/* Sections Tab */}
        <TabsContent value="sections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Homepage Sections</CardTitle>
              <CardDescription>
                Toggle visibility and edit content for each section
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sections?.map((section) => (
                  <div
                    key={section.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                      <div>
                        <h3 className="font-medium">{getSectionLabel(section.section_key)}</h3>
                        <p className="text-sm text-muted-foreground">
                          {section.section_key}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {section.is_visible ? (
                          <Badge variant="default" className="gap-1">
                            <Eye className="h-3 w-3" /> Visible
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </Badge>
                        )}
                        <Switch
                          checked={section.is_visible ?? true}
                          onCheckedChange={(checked) =>
                            toggleVisibility.mutate({ id: section.id, is_visible: checked })
                          }
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSection(section)}
                      >
                        Edit Content
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gallery Tab */}
        <TabsContent value="gallery" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Photo Gallery
                </CardTitle>
                <CardDescription>
                  Upload and manage gallery images
                </CardDescription>
              </div>
              <Button onClick={() => setAddImageOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Image
              </Button>
            </CardHeader>
            <CardContent>
              {galleryLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : galleryImages && galleryImages.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {galleryImages.map((image) => (
                    <div key={image.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden border">
                        <img
                          src={image.image_url}
                          alt={image.title || "Gallery image"}
                          className={`w-full h-full object-cover ${
                            !image.is_active ? "opacity-50" : ""
                          }`}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          onClick={() =>
                            toggleImageVisibility.mutate({
                              id: image.id,
                              is_active: !image.is_active,
                            })
                          }
                        >
                          {image.is_active ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8"
                          onClick={() => setDeleteImageId(image.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {image.title && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {image.title}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No gallery images yet</p>
                  <p className="text-sm">Upload images to display in your gallery</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Videos
                </CardTitle>
                <CardDescription>
                  Upload videos (vertical/reel format recommended)
                </CardDescription>
              </div>
              <Button onClick={() => setAddVideoOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            </CardHeader>
            <CardContent>
              {videosLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : videos && videos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {videos.map((video) => (
                    <div key={video.id} className="border rounded-lg overflow-hidden">
                      <div className="aspect-[9/16] bg-muted relative">
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title || "Video thumbnail"}
                            className={`w-full h-full object-cover ${
                              !video.is_active ? "opacity-50" : ""
                            }`}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                            <Video className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className="absolute top-2 left-2 capitalize text-xs"
                        >
                          {video.video_type || "upload"}
                        </Badge>
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm truncate">{video.title || "Untitled"}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={video.is_active ?? true}
                              onCheckedChange={(checked) =>
                                toggleVideoVisibility.mutate({
                                  id: video.id,
                                  is_active: checked,
                                })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {video.is_active ? "Visible" : "Hidden"}
                            </span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteVideoId(video.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No videos yet</p>
                  <p className="text-sm">Upload videos to display on your website</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                SEO Settings
              </CardTitle>
              <CardDescription>
                Manage meta titles, descriptions, and social sharing images for each page
              </CardDescription>
            </CardHeader>
            <CardContent>
              {seoLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : seoData && seoData.length > 0 ? (
                <div className="space-y-3">
                  {seoData.map((seo) => (
                    <div
                      key={seo.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{getPageLabel(seo.page_path)}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {seo.title || "No title set"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {seo.description?.substring(0, 80) || "No description set"}...
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSeo(seo)}
                      >
                        Edit SEO
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No SEO settings found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Section Dialog */}
      <Dialog open={!!editingSection} onOpenChange={() => setEditingSection(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Edit {editingSection && getSectionLabel(editingSection.section_key)}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {editingSection && (
              <SectionEditor
                section={editingSection}
                onUpdate={(content) =>
                  setEditingSection({ ...editingSection, content })
                }
              />
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSection(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingSection && updateSection.mutate(editingSection)}
              disabled={updateSection.isPending}
            >
              {updateSection.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit SEO Dialog */}
      <Dialog open={!!editingSeo} onOpenChange={() => setEditingSeo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit SEO for {editingSeo && getPageLabel(editingSeo.page_path)}
            </DialogTitle>
          </DialogHeader>
          {editingSeo && (
            <div className="space-y-4">
              <div>
                <Label>Page Title (for browser tab & search results)</Label>
                <Input
                  value={editingSeo.title || ""}
                  onChange={(e) => setEditingSeo({ ...editingSeo, title: e.target.value })}
                  placeholder="Page title..."
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingSeo.title?.length || 0}/60 characters (keep under 60 for best results)
                </p>
              </div>
              <div>
                <Label>Meta Description (for search results & social previews)</Label>
                <Textarea
                  value={editingSeo.description || ""}
                  onChange={(e) => setEditingSeo({ ...editingSeo, description: e.target.value })}
                  placeholder="Page description..."
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingSeo.description?.length || 0}/160 characters (keep under 160 for best results)
                </p>
              </div>
              <div>
                <Label>Social Share Image URL (Open Graph image)</Label>
                <Input
                  value={editingSeo.og_image_url || ""}
                  onChange={(e) => setEditingSeo({ ...editingSeo, og_image_url: e.target.value })}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Recommended size: 1200x630 pixels
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSeo(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingSeo && updateSeo.mutate(editingSeo)}
              disabled={updateSeo.isPending}
            >
              {updateSeo.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save SEO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Image Dialog */}
      <Dialog open={addImageOpen} onOpenChange={setAddImageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Gallery Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title (optional)</Label>
              <Input
                value={newImageTitle}
                onChange={(e) => setNewImageTitle(e.target.value)}
                placeholder="Image title"
              />
            </div>
            <div>
              <Label>Image</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full h-32 flex flex-col gap-2"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8" />
                    <span>Click to upload image</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Video Dialog */}
      <Dialog open={addVideoOpen} onOpenChange={setAddVideoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Thumbnail (optional)</Label>
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailUpload}
                className="hidden"
              />
              {newVideoThumbnail ? (
                <div className="relative w-24 h-40 border rounded overflow-hidden">
                  <img src={newVideoThumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => setNewVideoThumbnail(null)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => thumbnailInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Thumbnail
                </Button>
              )}
            </div>
            <div>
              <Label>Video File</Label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full h-32 flex flex-col gap-2"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideo}
              >
                {uploadingVideo ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8" />
                    <span>Click to upload video</span>
                    <span className="text-xs text-muted-foreground">Vertical format (9:16) recommended</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Image Confirmation */}
      <AlertDialog open={!!deleteImageId} onOpenChange={() => setDeleteImageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the image from the gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteImageId && deleteGalleryImage.mutate(deleteImageId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Video Confirmation */}
      <AlertDialog open={!!deleteVideoId} onOpenChange={() => setDeleteVideoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the video from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVideoId && deleteVideo.mutate(deleteVideoId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Section Editor Component
function SectionEditor({
  section,
  onUpdate,
}: {
  section: HomepageSection;
  onUpdate: (content: Record<string, unknown>) => void;
}) {
  const content = section.content as Record<string, unknown>;

  const updateField = (key: string, value: unknown) => {
    onUpdate({ ...content, [key]: value });
  };

  const updateHoursItem = (index: number, field: 'day' | 'time', value: string) => {
    const hours = [...((content.hours as { day: string; time: string }[]) || [])];
    hours[index] = { ...hours[index], [field]: value };
    updateField('hours', hours);
  };

  const addHoursItem = () => {
    const hours = [...((content.hours as { day: string; time: string }[]) || [])];
    hours.push({ day: '', time: '' });
    updateField('hours', hours);
  };

  const removeHoursItem = (index: number) => {
    const hours = [...((content.hours as { day: string; time: string }[]) || [])];
    hours.splice(index, 1);
    updateField('hours', hours);
  };

  switch (section.section_key) {
    case "hero":
      return (
        <div className="space-y-4">
          <div>
            <Label>Badge Text</Label>
            <Input
              value={(content.badge as string) || ""}
              onChange={(e) => updateField("badge", e.target.value)}
              placeholder="Now Open for Orders"
            />
          </div>
          <div>
            <Label>Headline</Label>
            <Input
              value={(content.headline as string) || ""}
              onChange={(e) => updateField("headline", e.target.value)}
              placeholder="American Ribs"
            />
          </div>
          <div>
            <Label>Headline Accent</Label>
            <Input
              value={(content.headlineAccent as string) || ""}
              onChange={(e) => updateField("headlineAccent", e.target.value)}
              placeholder="& Wings"
            />
          </div>
          <div>
            <Label>Tagline</Label>
            <Textarea
              value={(content.tagline as string) || ""}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="Your tagline here..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Primary CTA Text</Label>
              <Input
                value={(content.primaryCta as string) || ""}
                onChange={(e) => updateField("primaryCta", e.target.value)}
              />
            </div>
            <div>
              <Label>Primary CTA Link</Label>
              <Input
                value={(content.primaryCtaLink as string) || ""}
                onChange={(e) => updateField("primaryCtaLink", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Secondary CTA Text</Label>
              <Input
                value={(content.secondaryCta as string) || ""}
                onChange={(e) => updateField("secondaryCta", e.target.value)}
              />
            </div>
            <div>
              <Label>Secondary CTA Link</Label>
              <Input
                value={(content.secondaryCtaLink as string) || ""}
                onChange={(e) => updateField("secondaryCtaLink", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={(content.address as string) || ""}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
          <div>
            <Label>Hours</Label>
            <Input
              value={(content.hours as string) || ""}
              onChange={(e) => updateField("hours", e.target.value)}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={(content.phone as string) || ""}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </div>
        </div>
      );

    case "about":
      return (
        <div className="space-y-4">
          <div>
            <Label>Section Title</Label>
            <Input
              value={(content.title as string) || ""}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Our Story"
            />
          </div>
          <div>
            <Label>Story Text</Label>
            <Textarea
              value={(content.story as string) || ""}
              onChange={(e) => updateField("story", e.target.value)}
              rows={4}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Years in Business</Label>
              <Input
                value={(content.yearsInBusiness as string) || ""}
                onChange={(e) => updateField("yearsInBusiness", e.target.value)}
              />
            </div>
            <div>
              <Label>Menu Items</Label>
              <Input
                value={(content.menuItems as string) || ""}
                onChange={(e) => updateField("menuItems", e.target.value)}
              />
            </div>
            <div>
              <Label>Happy Customers</Label>
              <Input
                value={(content.happyCustomers as string) || ""}
                onChange={(e) => updateField("happyCustomers", e.target.value)}
              />
            </div>
          </div>
        </div>
      );

    case "location":
      const hours = (content.hours as { day: string; time: string }[]) || [];
      return (
        <div className="space-y-4">
          <div>
            <Label>Section Title</Label>
            <Input
              value={(content.title as string) || ""}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Address (use new lines for multiple lines)</Label>
            <Textarea
              value={(content.address as string) || ""}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="Purok 1 Ground Floor, Hony Arcade&#10;Floridablanca, 2006 Pampanga"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input
                value={(content.phone as string) || ""}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={(content.email as string) || ""}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Google Maps Embed URL</Label>
            <Input
              value={(content.mapEmbedUrl as string) || ""}
              onChange={(e) => updateField("mapEmbedUrl", e.target.value)}
              placeholder="https://www.google.com/maps/embed?..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste only the URL from the src attribute of the embed iframe (not the full HTML)
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Operating Hours</Label>
              <Button type="button" variant="outline" size="sm" onClick={addHoursItem}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {hours.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    value={item.day}
                    onChange={(e) => updateHoursItem(index, 'day', e.target.value)}
                    placeholder="Sunday"
                    className="flex-1"
                  />
                  <Input
                    value={item.time}
                    onChange={(e) => updateHoursItem(index, 'time', e.target.value)}
                    placeholder="12:00 PM - 9:00 PM"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => removeHoursItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Facebook URL</Label>
              <Input
                value={(content.facebookUrl as string) || ""}
                onChange={(e) => updateField("facebookUrl", e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </div>
            <div>
              <Label>Instagram URL</Label>
              <Input
                value={(content.instagramUrl as string) || ""}
                onChange={(e) => updateField("instagramUrl", e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>
        </div>
      );

    case "gallery":
    case "videos":
      return (
        <div className="space-y-4">
          <div>
            <Label>Section Title</Label>
            <Input
              value={(content.title as string) || ""}
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={(content.subtitle as string) || ""}
              onChange={(e) => updateField("subtitle", e.target.value)}
            />
          </div>
        </div>
      );

    case "featured_menu":
      return (
        <div className="space-y-4">
          <div>
            <Label>Badge Text</Label>
            <Input
              value={(content.badge as string) || ""}
              onChange={(e) => updateField("badge", e.target.value)}
              placeholder="Popular Items"
            />
          </div>
          <div>
            <Label>Section Title</Label>
            <Input
              value={(content.title as string) || ""}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Our Best Sellers"
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Textarea
              value={(content.subtitle as string) || ""}
              onChange={(e) => updateField("subtitle", e.target.value)}
              placeholder="Discover our most loved dishes..."
              rows={2}
            />
          </div>
        </div>
      );

    case "category_showcase":
      return (
        <div className="space-y-4">
          <div>
            <Label>Badge Text</Label>
            <Input
              value={(content.badge as string) || ""}
              onChange={(e) => updateField("badge", e.target.value)}
              placeholder="Explore Our Menu"
            />
          </div>
          <div>
            <Label>Section Title</Label>
            <Input
              value={(content.title as string) || ""}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Browse by Category"
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Textarea
              value={(content.subtitle as string) || ""}
              onChange={(e) => updateField("subtitle", e.target.value)}
              placeholder="From hearty rice meals to refreshing drinks..."
              rows={2}
            />
          </div>
        </div>
      );

    case "footer":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Brand Name</Label>
              <Input
                value={(content.brandName as string) || ""}
                onChange={(e) => updateField("brandName", e.target.value)}
                placeholder="American Ribs"
              />
            </div>
            <div>
              <Label>Brand Accent</Label>
              <Input
                value={(content.brandAccent as string) || ""}
                onChange={(e) => updateField("brandAccent", e.target.value)}
                placeholder="& Wings"
              />
            </div>
          </div>
          <div>
            <Label>Tagline</Label>
            <Textarea
              value={(content.tagline as string) || ""}
              onChange={(e) => updateField("tagline", e.target.value)}
              placeholder="Authentic American BBQ crafted with passion..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Facebook URL</Label>
              <Input
                value={(content.facebookUrl as string) || ""}
                onChange={(e) => updateField("facebookUrl", e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </div>
            <div>
              <Label>Instagram URL</Label>
              <Input
                value={(content.instagramUrl as string) || ""}
                onChange={(e) => updateField("instagramUrl", e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>
          <div>
            <Label>Copyright Text</Label>
            <Input
              value={(content.copyright as string) || ""}
              onChange={(e) => updateField("copyright", e.target.value)}
              placeholder="© 2024 American Ribs & Wings. All rights reserved."
            />
          </div>
        </div>
      );

    default:
      return (
        <div className="text-muted-foreground text-center py-8">
          No editor available for this section
        </div>
      );
  }
}
