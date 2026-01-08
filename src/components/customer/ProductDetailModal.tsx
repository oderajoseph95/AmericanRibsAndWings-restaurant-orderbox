import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Link2 } from "lucide-react";
import { shareProduct } from "@/lib/productUtils";
import type { Tables } from "@/integrations/supabase/types";

type ProductWithCategory = Tables<"products"> & {
  categories: { name: string } | null;
  slug?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

const productTypeLabels: Record<string, string> = {
  flavored: "Choose Flavor",
  bundle: "Bundle",
  unlimited: "Unlimited",
};

interface ProductDetailModalProps {
  product: ProductWithCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
  returnPath?: string;
}

export function ProductDetailModal({ 
  product, 
  open, 
  onOpenChange, 
  onAdd,
  returnPath = "/order"
}: ProductDetailModalProps) {
  const navigate = useNavigate();

  // Update SEO meta tags when product modal opens
  useEffect(() => {
    if (open && product) {
      const title = product.seo_title || `${product.name} | American Ribs & Wings`;
      const description = product.seo_description || product.description || '';
      const slug = product.slug || product.id;
      const canonicalUrl = `${window.location.origin}/product/${slug}`;

      // Update document title
      document.title = title;

      // Update meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', description);

      // Update OG tags
      const ogTags = {
        'og:title': product.name,
        'og:description': description,
        'og:image': product.image_url || '',
        'og:url': canonicalUrl,
        'og:type': 'product',
      };

      Object.entries(ogTags).forEach(([property, content]) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      });

      // Update canonical link
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);

      // Fire Meta Pixel ViewContent event
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'ViewContent', {
          content_name: product.name,
          content_ids: [product.id],
          content_type: 'product',
          content_category: product.categories?.name || 'Uncategorized',
          contents: [{
            id: product.id,
            quantity: 1,
            item_price: product.price
          }],
          value: product.price,
          currency: 'PHP',
        });
        console.log('Meta Pixel ViewContent:', product.name, product.id);
      }
    }
  }, [open, product]);

  const handleClose = () => {
    onOpenChange(false);
    // Navigate back to return path without reload
    navigate(returnPath, { replace: true });
  };

  const handleShare = () => {
    if (product) {
      shareProduct({
        name: product.name,
        slug: product.slug || null,
        id: product.id,
      });
    }
  };

  const handleAddToCart = () => {
    onAdd();
    handleClose();
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Product Image - Square 1:1 */}
          {product.image_url && (
            <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Category & Type */}
          <div className="flex gap-2 flex-wrap">
            {product.categories && (
              <Badge variant="secondary">{product.categories.name}</Badge>
            )}
            {product.product_type && product.product_type !== "simple" && (
              <Badge className="bg-accent text-accent-foreground">
                {productTypeLabels[product.product_type] || product.product_type}
              </Badge>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <h4 className="font-medium text-foreground mb-2">Description</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {product.description}
              </p>
            </div>
          )}

          {/* Price and actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-2xl font-bold text-primary">
              ₱{product.price.toFixed(2)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleShare}>
                <Link2 className="h-4 w-4 mr-1" />
                Share
              </Button>
              <Button onClick={handleAddToCart} className="gap-1">
                <Plus className="h-4 w-4" />
                Add to Order
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
