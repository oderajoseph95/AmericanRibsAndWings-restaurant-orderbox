import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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
  return (
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

        {/* Description */}
        {product.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
            {product.description}
          </p>
        )}

        {/* Price and add button */}
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-primary">
            ₱{product.price.toFixed(2)}
          </span>
          <Button size="sm" onClick={onAdd} className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
