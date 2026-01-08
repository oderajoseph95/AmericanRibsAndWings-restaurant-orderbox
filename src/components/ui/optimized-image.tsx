import { useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  priority?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  showSkeleton?: boolean;
}

/**
 * Optimized Image Component
 * - Uses Supabase Image Transform API for automatic resizing
 * - Lazy loading by default (use priority for above-the-fold images)
 * - Placeholder skeleton while loading
 * - WebP support via Supabase transforms
 */
export function OptimizedImage({
  src,
  alt,
  priority = false,
  width,
  height,
  quality = 75,
  showSkeleton = true,
  className,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Transform Supabase storage URLs to use render API
  const getOptimizedUrl = (originalUrl: string): string => {
    if (!originalUrl) return originalUrl;

    // Check if it's a Supabase storage URL
    const supabaseStoragePattern = /\/storage\/v1\/object\/public\//;
    
    if (supabaseStoragePattern.test(originalUrl)) {
      // Convert to render URL with transforms
      const renderUrl = originalUrl.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      
      const params = new URLSearchParams();
      if (width) params.set('width', width.toString());
      if (height) params.set('height', height.toString());
      params.set('quality', quality.toString());
      
      const separator = renderUrl.includes('?') ? '&' : '?';
      return `${renderUrl}${separator}${params.toString()}`;
    }

    // For external URLs (like Unsplash), just return as-is
    // They usually already have optimization parameters
    return originalUrl;
  };

  const optimizedSrc = getOptimizedUrl(src);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Animated skeleton placeholder */}
      {isLoading && showSkeleton && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
          <Skeleton className="absolute inset-0" />
          <span className="relative text-2xl animate-pulse z-10">🍗</span>
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={optimizedSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        {...props}
      />
      
      {/* Error fallback */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-2xl opacity-50">🍖</span>
        </div>
      )}
    </div>
  );
}
