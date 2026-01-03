import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Play, Video as VideoIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface VideoItem {
  id: string;
  title: string | null;
  video_url: string;
  thumbnail_url: string | null;
  video_type: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

interface VideoContent {
  title?: string;
  subtitle?: string;
}

// Helper to extract YouTube video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// Helper to get YouTube thumbnail
function getYouTubeThumbnail(url: string): string {
  const videoId = getYouTubeId(url);
  return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : "";
}

// Helper to get embed URL
function getEmbedUrl(url: string, type: string | null): string {
  if (type === "youtube" || url.includes("youtube") || url.includes("youtu.be")) {
    const videoId = getYouTubeId(url);
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : url;
  }
  if (type === "vimeo" || url.includes("vimeo")) {
    const vimeoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
    return vimeoId ? `https://player.vimeo.com/video/${vimeoId}?autoplay=1` : url;
  }
  return url;
}

export function VideoSection() {
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  // Fetch section config
  const { data: sectionConfig } = useQuery({
    queryKey: ["homepage-section", "videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "videos")
        .eq("is_visible", true)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch videos
  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as VideoItem[];
    },
  });

  if (!sectionConfig) return null;

  const content = (sectionConfig.content as VideoContent) || {};

  if (isLoading) {
    return (
      <section className="py-20 bg-secondary/30">
        <div className="container px-4 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4">
            <VideoIcon className="h-3 w-3 mr-1" />
            Videos
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            {content.title || "See What We're Cooking"}
          </h2>
          {content.subtitle && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {content.subtitle}
            </p>
          )}
        </div>

        {/* Video grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => {
            const thumbnail = video.thumbnail_url || getYouTubeThumbnail(video.video_url);
            
            return (
              <Card
                key={video.id}
                className="overflow-hidden cursor-pointer group"
                onClick={() => setSelectedVideo(video)}
              >
                <div className="aspect-video relative bg-muted">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={video.title || "Video thumbnail"}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform">
                      <Play className="h-8 w-8 text-primary-foreground ml-1" fill="currentColor" />
                    </div>
                  </div>
                </div>
                {video.title && (
                  <div className="p-4">
                    <h3 className="font-semibold text-foreground truncate">
                      {video.title}
                    </h3>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Video player modal */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {selectedVideo && (
            <div className="aspect-video">
              {selectedVideo.video_type === "upload" ? (
                <video
                  src={selectedVideo.video_url}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              ) : (
                <iframe
                  src={getEmbedUrl(selectedVideo.video_url, selectedVideo.video_type)}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
