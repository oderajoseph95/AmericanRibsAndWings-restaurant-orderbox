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
        .maybeSingle();
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
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
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

        {/* Video grid - optimized for vertical/reel format */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {videos.map((video) => (
            <Card
              key={video.id}
              className="overflow-hidden cursor-pointer group border-0 shadow-lg"
              onClick={() => setSelectedVideo(video)}
            >
              <div className="aspect-[9/16] relative bg-muted">
                {video.thumbnail_url ? (
                  <img
                    src={video.thumbnail_url}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                    <VideoIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform shadow-lg">
                    <Play className="h-6 w-6 text-primary-foreground ml-1" fill="currentColor" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Video player modal - vertical aspect ratio */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-black">
          {selectedVideo && (
            <div className="aspect-[9/16] max-h-[80vh]">
              <video
                src={selectedVideo.video_url}
                controls
                autoPlay
                className="w-full h-full object-contain bg-black"
                playsInline
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
