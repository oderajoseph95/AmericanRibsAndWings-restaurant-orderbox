import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function FeaturedMenu() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      // Fetch products prioritizing bundles and popular items (Rice Meals, Racks, Wings)
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

  return (
    <section id="menu" className="py-20 bg-background">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Flame className="h-3 w-3 mr-1" />
            Popular Items
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Our Best Sellers
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover our most loved dishes, from smoky ribs to crispy wings with 
            signature sauces that keep our customers coming back.
          </p>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-8 w-1/3" />
                </CardContent>
              </Card>
            ))
          ) : (
            products?.map((product) => (
              <Card 
                key={product.id} 
                className="overflow-hidden group hover:shadow-lg transition-all duration-300 border-border/50"
              >
                {/* Image placeholder */}
                <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-6xl opacity-50">🍖</div>
                  )}
                  
                  {/* Category badge */}
                  {product.categories && (
                    <Badge 
                      className="absolute top-3 left-3 bg-card/90 text-foreground"
                    >
                      {product.categories.name}
                    </Badge>
                  )}
                  
                  {/* Product type badge */}
                  {product.product_type && product.product_type !== "simple" && (
                    <Badge 
                      className="absolute top-3 right-3 bg-accent text-accent-foreground"
                    >
                      {product.product_type === "flavored" ? "Choose Flavor" : 
                       product.product_type === "bundle" ? "Bundle" : 
                       product.product_type === "unlimited" ? "Unlimited" : ""}
                    </Badge>
                  )}
                </div>

                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {product.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">
                      ₱{product.price.toFixed(2)}
                    </span>
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/order">
                        Order Now
                      </Link>
                    </Button>
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
    </section>
  );
}
