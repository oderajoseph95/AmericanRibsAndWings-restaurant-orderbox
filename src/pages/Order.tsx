import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ShoppingCart, Home, MapPin } from "lucide-react";
import { ProductCard } from "@/components/customer/ProductCard";
import { Cart } from "@/components/customer/Cart";
import { FlavorModal } from "@/components/customer/FlavorModal";
import { CheckoutSheet } from "@/components/customer/CheckoutSheet";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import type { Tables } from "@/integrations/supabase/types";

export type CartItem = {
  id: string;
  product: Tables<"products">;
  quantity: number;
  flavors?: { id: string; name: string; quantity: number; surcharge: number }[];
  lineTotal: number;
};

export type OrderType = "pickup" | "delivery";

const Order = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("pickup");
  const [selectedProduct, setSelectedProduct] = useState<Tables<"products"> | null>(null);
  const [isFlavorModalOpen, setIsFlavorModalOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{ orderNumber: string; orderId: string } | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const activeCategory = searchParams.get("category") || "all";

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["order-categories"],
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

  // Fetch products with flavor rules
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["order-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), product_flavor_rules(*)")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch flavors
  const { data: flavors } = useQuery({
    queryKey: ["order-flavors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flavors")
        .select("*")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Filter products by category
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (activeCategory === "all") return products;
    return products.filter(
      (p) => p.categories?.name.toLowerCase() === activeCategory.toLowerCase()
    );
  }, [products, activeCategory]);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Add to cart handler
  const handleAddToCart = (product: Tables<"products">) => {
    if (product.product_type === "flavored" || product.product_type === "bundle") {
      setSelectedProduct(product);
      setIsFlavorModalOpen(true);
    } else {
      // Simple product - add directly
      const existingIndex = cart.findIndex(
        (item) => item.product.id === product.id && !item.flavors?.length
      );

      if (existingIndex >= 0) {
        const newCart = [...cart];
        newCart[existingIndex].quantity += 1;
        newCart[existingIndex].lineTotal = newCart[existingIndex].quantity * product.price;
        setCart(newCart);
      } else {
        setCart([
          ...cart,
          {
            id: crypto.randomUUID(),
            product,
            quantity: 1,
            lineTotal: product.price,
          },
        ]);
      }
    }
  };

  // Add flavored item to cart
  const handleAddFlavoredItem = (
    product: Tables<"products">,
    selectedFlavors: { id: string; name: string; quantity: number; surcharge: number }[]
  ) => {
    const flavorSurcharge = selectedFlavors.reduce(
      (sum, f) => sum + f.surcharge * f.quantity,
      0
    );
    const lineTotal = product.price + flavorSurcharge;

    setCart([
      ...cart,
      {
        id: crypto.randomUUID(),
        product,
        quantity: 1,
        flavors: selectedFlavors,
        lineTotal,
      },
    ]);
    setIsFlavorModalOpen(false);
    setSelectedProduct(null);
  };

  // Update cart item quantity
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id !== itemId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          const flavorSurcharge = item.flavors?.reduce(
            (sum, f) => sum + f.surcharge * f.quantity,
            0
          ) || 0;
          return {
            ...item,
            quantity: newQty,
            lineTotal: newQty * (item.product.price + flavorSurcharge),
          };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Remove from cart
  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
  };

  // Handle order confirmation
  const handleOrderConfirmed = (orderNumber: string, orderId: string) => {
    setConfirmedOrder({ orderNumber, orderId });
    setIsCheckoutOpen(false);
    clearCart();
  };

  // Reset for new order
  const handleNewOrder = () => {
    setConfirmedOrder(null);
  };

  // Show confirmation screen
  if (confirmedOrder) {
    return (
      <OrderConfirmation
        orderNumber={confirmedOrder.orderNumber}
        onNewOrder={handleNewOrder}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="font-bold text-lg">Order Online</h1>
              <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
            </div>
          </div>

          {/* Order type toggle */}
          <div className="hidden sm:flex items-center gap-2 bg-secondary rounded-full p-1">
            <button
              onClick={() => setOrderType("pickup")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                orderType === "pickup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Home className="h-4 w-4 inline mr-1" />
              Pickup
            </button>
            <button
              onClick={() => setOrderType("delivery")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                orderType === "delivery"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="h-4 w-4 inline mr-1" />
              Delivery
            </button>
          </div>

          {/* Mobile cart button */}
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-xs">
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Your Cart ({cartItemCount})</SheetTitle>
              </SheetHeader>
              <Cart
                items={cart}
                onUpdateQuantity={updateCartItemQuantity}
                onRemove={removeFromCart}
                onCheckout={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
                total={cartTotal}
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Category tabs */}
        <div className="border-t border-border">
          <ScrollArea className="w-full">
            <div className="container px-4">
              <Tabs
                value={activeCategory}
                onValueChange={(v) => setSearchParams({ category: v })}
                className="w-full"
              >
                <TabsList className="h-12 bg-transparent gap-2 justify-start w-max">
                  <TabsTrigger
                    value="all"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full"
                  >
                    All
                  </TabsTrigger>
                  {categories?.map((cat) => (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.name.toLowerCase()}
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full whitespace-nowrap"
                    >
                      {cat.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </ScrollArea>
        </div>
      </header>

      {/* Main content */}
      <div className="container px-4 py-6">
        <div className="flex gap-6">
          {/* Products grid */}
          <div className="flex-1">
            {productsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No products found in this category.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAdd={() => handleAddToCart(product)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Desktop cart sidebar */}
          <div className="hidden lg:block w-96 shrink-0">
            <div className="sticky top-36">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="font-semibold text-lg flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Your Cart ({cartItemCount})
                  </h2>
                </div>
                <Cart
                  items={cart}
                  onUpdateQuantity={updateCartItemQuantity}
                  onRemove={removeFromCart}
                  onCheckout={() => setIsCheckoutOpen(true)}
                  total={cartTotal}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile checkout bar */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-card border-t border-border p-4 shadow-lg">
          <Button
            className="w-full"
            size="lg"
            onClick={() => setIsCheckoutOpen(true)}
          >
            Checkout · ₱{cartTotal.toFixed(2)}
          </Button>
        </div>
      )}

      {/* Flavor selection modal */}
      {selectedProduct && flavors && (
        <FlavorModal
          open={isFlavorModalOpen}
          onOpenChange={(open) => {
            setIsFlavorModalOpen(open);
            if (!open) setSelectedProduct(null);
          }}
          product={selectedProduct}
          flavors={flavors}
          onConfirm={handleAddFlavoredItem}
        />
      )}

      {/* Checkout sheet */}
      <CheckoutSheet
        open={isCheckoutOpen}
        onOpenChange={setIsCheckoutOpen}
        cart={cart}
        total={cartTotal}
        orderType={orderType}
        onOrderConfirmed={handleOrderConfirmed}
      />
    </div>
  );
};

export default Order;
