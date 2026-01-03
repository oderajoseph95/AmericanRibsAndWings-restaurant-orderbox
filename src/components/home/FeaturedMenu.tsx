import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Flame, Loader2, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FeaturedMenuContent {
  title?: string;
  subtitle?: string;
  badge?: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  product_type: string | null;
  categories: { name: string } | null;
}

export function FeaturedMenu() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const { data: sectionConfig } = useQuery({
    queryKey: ["homepage-section", "featured_menu"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("section_key", "featured_menu")
        .eq("is_visible", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("is_active", true)
        .is("archived_at", null)
        .or("product_type.eq.bundle,name.ilike.%rice%,name.ilike.%rack%,name.ilike.%wing%,name.ilike.%rib%")
        .order("product_type", { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return data;
    },
  });

  const content = (sectionConfig?.content as FeaturedMenuContent) || {};

  return (
    <section id="menu" className="py-12 bg-background">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-3">
            <Flame className="h-3 w-3 mr-1" />
            {content.badge || "Popular Items"}
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            {content.title || "Our Best Sellers"}
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            {content.subtitle || "Discover our most loved dishes, from smoky ribs to crispy wings with signature sauces."}
          </p>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-3" />
                  <Skeleton className="h-7 w-1/3" />
                </CardContent>
              </Card>
            ))
          ) : (
            products?.map((product) => (
              <Card 
                key={product.id} 
                className="overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50"
              >
                {/* Image */}
                <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-5xl opacity-50">🍖</div>
                  )}
                  
                  {/* Category badge */}
                  {product.categories && (
                    <Badge 
                      className="absolute top-2 left-2 bg-card/90 text-foreground text-xs"
                    >
                      {product.categories.name}
                    </Badge>
                  )}
                  
                  {/* Product type badge */}
                  {product.product_type && product.product_type !== "simple" && (
                    <Badge 
                      className="absolute top-2 right-2 bg-accent text-accent-foreground text-xs"
                    >
                      {product.product_type === "flavored" ? "Choose Flavor" : 
                       product.product_type === "bundle" ? "Bundle" : 
                       product.product_type === "unlimited" ? "Unlimited" : ""}
                    </Badge>
                  )}
                </div>

                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {product.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-primary">
                      ₱{product.price.toFixed(2)}
                    </span>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedProduct(product as Product)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/order">
                          Order
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* View all button */}
        <div className="text-center">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link to="/order">
              View Full Menu
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Product Details Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {/* Product Image */}
              <div className="aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                {selectedProduct.image_url ? (
                  <img 
                    src={selectedProduct.image_url} 
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-6xl opacity-50">🍖</div>
                )}
              </div>
              
              {/* Product Info */}
              <div>
                {selectedProduct.categories && (
                  <Badge variant="secondary" className="mb-2">
                    {selectedProduct.categories.name}
                  </Badge>
                )}
                {selectedProduct.description && (
                  <p className="text-muted-foreground">
                    {selectedProduct.description}
                  </p>
                )}
              </div>
              
              {/* Price and CTA */}
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-2xl font-bold text-primary">
                  ₱{selectedProduct.price.toFixed(2)}
                </span>
                <Button asChild>
                  <Link to="/order" onClick={() => setSelectedProduct(null)}>
                    Order Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
