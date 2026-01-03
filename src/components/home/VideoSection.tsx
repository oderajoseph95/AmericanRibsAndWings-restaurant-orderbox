import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Play, Video as VideoIcon, Loader2, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

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
      <section className="py-12 bg-gradient-to-b from-muted/30 to-background">
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
    <section className="py-12 bg-gradient-to-b from-muted/30 to-background">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5">
            <VideoIcon className="h-3 w-3 mr-1" />
            Videos
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            {content.title || "See What We're Cooking"}
          </h2>
          {content.subtitle && (
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              {content.subtitle}
            </p>
          )}
        </div>

        {/* Video grid - optimized for vertical/reel format */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {videos.map((video) => (
            <Card
              key={video.id}
              className="overflow-hidden cursor-pointer group border-0 shadow-md hover:shadow-xl transition-all"
              onClick={() => setSelectedVideo(video)}
            >
              <div className="aspect-[9/16] relative bg-muted">
                {/* Autoplay muted preview */}
                {video.thumbnail_url ? (
                  <img
                    src={video.thumbnail_url}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(video.id, el);
                    }}
                    src={video.video_url}
                    muted
                    loop
                    playsInline
                    autoPlay
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform shadow-lg">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Video player modal - vertical aspect ratio with audio */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-0">
          {selectedVideo && (
            <div className="aspect-[9/16] max-h-[85vh]">
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
