import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProductWithCategory = Tables<"products"> & {
  categories: { name: string } | null;
  product_flavor_rules?: Tables<"product_flavor_rules">[] | Tables<"product_flavor_rules"> | null;
};

interface ProductCardProps {
  product: ProductWithCategory;
  onAdd: () => void;
}

const productTypeLabels: Record<string, string> = {
  flavored: "Choose Flavor",
  bundle: "Bundle",
  unlimited: "Unlimited",
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Meta Pixel ViewContent event when product details modal opens
  useEffect(() => {
    if (showDetails && typeof (window as any).fbq === 'function') {
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
  }, [showDetails, product]);

  return (
    <>
      <Card className="overflow-hidden group hover:shadow-md transition-shadow">
        {/* Image */}
        <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-5xl opacity-40">🍖</div>
          )}

          {/* Product type badge */}
          {product.product_type && product.product_type !== "simple" && (
            <Badge className="absolute top-2 right-2 bg-accent text-accent-foreground text-xs">
              {productTypeLabels[product.product_type] || product.product_type}
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          {/* Category */}
          {product.categories && (
            <p className="text-xs text-muted-foreground mb-1">
              {product.categories.name}
            </p>
          )}

          {/* Name */}
          <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
            {product.name}
          </h3>

          {/* Description preview */}
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
              {product.description}
            </p>
          )}

          {/* Price and buttons */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xl font-bold text-primary">
              ₱{product.price.toFixed(2)}
            </span>
            <div className="flex gap-1">
              {product.description && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowDetails(true)}
                  className="px-2"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" onClick={onAdd} className="gap-1">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Product Image */}
            {product.image_url && (
              <div className="w-full h-48 rounded-lg overflow-hidden">
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

            {/* Price */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-2xl font-bold text-primary">
                ₱{product.price.toFixed(2)}
              </span>
              <Button onClick={() => { onAdd(); setShowDetails(false); }} className="gap-1">
                <Plus className="h-4 w-4" />
                Add to Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
