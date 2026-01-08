import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Flame, ShoppingCart, Eye, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuModal } from "./MenuModal";

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
  slug?: string | null;
}

export function FeaturedMenu() {
  const navigate = useNavigate();
  const [menuModalOpen, setMenuModalOpen] = useState(false);

  const handleOrderProduct = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    navigate(`/order?addToCart=${productId}`);
  };

  const handleViewProduct = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    handleCardClick(product);
  };

  const handleCardClick = (product: Product) => {
    const slug = product.slug || product.id;
    navigate(`/product/${slug}`);
  };
  
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
      // First try: Get admin-curated featured products
      const { data: featured, error: featuredError } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("is_active", true)
        .is("archived_at", null)
        .eq("is_featured", true)
        .order("featured_sort_order", { ascending: true })
        .limit(6);
      
      if (featuredError) throw featuredError;
      
      // If admin has set featured products, use those
      if (featured && featured.length > 0) {
        return featured as Product[];
      }
      
      // Fallback: Get bundles and popular items
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("is_active", true)
        .is("archived_at", null)
        .or("product_type.eq.bundle,name.ilike.%rice%,name.ilike.%rack%,name.ilike.%wing%,name.ilike.%rib%")
        .order("product_type", { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return data as Product[];
    },
  });

  const content = (sectionConfig?.content as FeaturedMenuContent) || {};

  return (
    <section id="menu" className="py-3 md:py-12 bg-background">
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
                className="overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50 cursor-pointer"
                onClick={() => handleCardClick(product)}
              >
                {/* Image */}
                <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
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
                        onClick={(e) => handleViewProduct(e, product)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={(e) => handleOrderProduct(e, product.id)}
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Order
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-3 flex-wrap">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link to="/order">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Order Now
            </Link>
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            className="rounded-full px-8"
            onClick={() => setMenuModalOpen(true)}
          >
            <FileText className="mr-2 h-5 w-5" />
            View Full Menu
          </Button>
        </div>
      </div>

      {/* Menu Modal */}
      <MenuModal open={menuModalOpen} onOpenChange={setMenuModalOpen} />
    </section>
  );
}
