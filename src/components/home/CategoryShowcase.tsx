import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, UtensilsCrossed } from "lucide-react";

const categoryEmojis: Record<string, string> = {
  "rice meal": "🍚",
  "breakfast": "🍳",
  "ala carte": "🍖",
  "sides": "🍟",
  "add-ons": "➕",
  "unlimited": "♾️",
  "groups": "👥",
  "drinks": "🥤",
};

const categoryDescriptions: Record<string, string> = {
  "rice meal": "Complete meals with steamed rice",
  "breakfast": "Start your day right",
  "ala carte": "Wings and ribs to share",
  "sides": "Perfect accompaniments",
  "add-ons": "Extra toppings and sauces",
  "unlimited": "All you can eat options",
  "groups": "Perfect for gatherings",
  "drinks": "Refreshing beverages",
};

export function CategoryShowcase() {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["public-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("sort_order");
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4">
        {/* Section header */}
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4">
            <UtensilsCrossed className="h-3 w-3 mr-1" />
            Explore Our Menu
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Browse by Category
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From hearty rice meals to refreshing drinks, we've got something 
            for everyone. Click a category to start ordering.
          </p>
        </div>

        {/* Categories grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-6">
                  <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
                  <Skeleton className="h-6 w-3/4 mx-auto mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))
          ) : (
            categories?.map((category) => {
              const lowerName = category.name.toLowerCase();
              const emoji = categoryEmojis[lowerName] || "🍽️";
              const description = categoryDescriptions[lowerName] || "Delicious options await";

              return (
                <Link
                  key={category.id}
                  to={`/order?category=${encodeURIComponent(category.name)}`}
                >
                  <Card className="h-full overflow-hidden group hover:shadow-lg hover:border-primary/50 transition-all duration-300 cursor-pointer">
                    <CardContent className="p-6 text-center">
                      {/* Emoji icon */}
                      <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
                        {emoji}
                      </div>
                      
                      {/* Category name */}
                      <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                        {category.name}
                      </h3>
                      
                      {/* Description */}
                      <p className="text-sm text-muted-foreground mb-3">
                        {description}
                      </p>
                      
                      {/* Browse link */}
                      <span className="inline-flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Browse
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
