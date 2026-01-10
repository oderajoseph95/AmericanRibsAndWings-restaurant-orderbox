import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ShoppingCart, Filter, Search, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/customer/ProductCard";
import { ProductDetailModal } from "@/components/customer/ProductDetailModal";
import { Cart } from "@/components/customer/Cart";
import { FlavorModal } from "@/components/customer/FlavorModal";
import { BundleWizard } from "@/components/customer/BundleWizard";
import { CheckoutSheet } from "@/components/customer/CheckoutSheet";
import { SEOHead } from "@/components/SEOHead";
import { useSalesPopContext } from "@/contexts/SalesPopContext";
import { useVisitorPresence } from "@/hooks/useVisitorPresence";
import { trackAnalyticsEvent } from "@/hooks/useAnalytics";
import { usePersistedCart } from "@/hooks/usePersistedCart";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export type CartItemFlavor = {
  id: string;
  name: string;
  quantity: number;
  surcharge: number;
  category?: string; // wings, drinks, fries
};

export type CartItem = {
  id: string;
  product: Tables<"products">;
  quantity: number;
  flavors?: CartItemFlavor[];
  lineTotal: number;
};

export type OrderType = "dine_in" | "pickup" | "delivery";

const Order = () => {
  // Track visitor presence
  useVisitorPresence("/order");

  // Track page view on mount
  useEffect(() => {
    trackAnalyticsEvent("page_view", { page: "order" }, "/order");
  }, []);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { setIsCheckoutOpen: setSalesPopCheckoutOpen } = useSalesPopContext();
  const { cart, setCart, showWelcomeBack, dismissWelcomeBack, clearCart } = usePersistedCart();
  
  // Recovery mode state
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const recoverId = searchParams.get("recover");
  const [selectedProduct, setSelectedProduct] = useState<Tables<"products"> | null>(null);
  const [isFlavorModalOpen, setIsFlavorModalOpen] = useState(false);
  const [isBundleWizardOpen, setIsBundleWizardOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [processedAddToCart, setProcessedAddToCart] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Product detail modal state (for /product/:slug route)
  const [detailProduct, setDetailProduct] = useState<(Tables<"products"> & { categories: { name: string } | null; slug?: string | null; seo_title?: string | null; seo_description?: string | null }) | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Sync checkout state with sales pop context
  useEffect(() => {
    setSalesPopCheckoutOpen(isCheckoutOpen);
  }, [isCheckoutOpen, setSalesPopCheckoutOpen]);

  // Handle recovery URL - restore abandoned cart (enterprise-grade)
  useEffect(() => {
    if (recoverId && !isRecoveryMode) {
      const recoverCart = async () => {
        try {
          // Fetch the abandoned checkout - allow abandoned OR recovering status
          const { data: checkout, error } = await supabase
            .from("abandoned_checkouts")
            .select("*")
            .eq("id", recoverId)
            .maybeSingle();

          if (error) {
            console.error("Failed to recover cart:", error);
            toast.error("Could not recover your cart. Please try again.");
            return;
          }

          // Handle various edge cases with helpful messages
          if (!checkout) {
            toast.error("This recovery link has expired or is invalid.", {
              description: "Please contact us if you need help with your order.",
            });
            return;
          }

          // Check if already recovered
          if (checkout.status === "recovered") {
            toast.info("Great news! This cart was already completed. 🎉", {
              description: "Check your order history or contact us for details.",
            });
            return;
          }

          // Check if expired
          if (checkout.status === "expired") {
            toast.error("This recovery link has expired.", {
              description: "Your cart session has ended. Please add items again.",
            });
            return;
          }

          // Check if cart is too old (72 hours)
          const createdAt = new Date(checkout.created_at || 0);
          const now = new Date();
          const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceCreated > 72) {
            toast.error("This recovery link has expired.", {
              description: "Cart sessions are valid for 72 hours. Please add items again.",
            });
            return;
          }

          // Track the link click event for timeline
          try {
            await supabase.from("abandoned_checkout_events").insert({
              abandoned_checkout_id: recoverId,
              event_type: "link_clicked",
              metadata: { user_agent: navigator.userAgent, browser: navigator.platform }
            });
          } catch (e) {
            console.error("Failed to track link click:", e);
          }

          // Validate and parse cart_items
          let cartItems = checkout.cart_items;
          if (typeof cartItems === 'string') {
            try { cartItems = JSON.parse(cartItems); } catch { cartItems = []; }
          }
          
          if (!Array.isArray(cartItems) || cartItems.length === 0) {
            toast.error("Your saved cart is empty.", {
              description: "Please add items to your cart to continue.",
            });
            return;
          }

          // Map abandoned cart items to proper cart format
          const recoveredItems = cartItems.map((item: any) => ({
            id: crypto.randomUUID(),
            product: item.product || item,
            quantity: item.quantity || 1,
            flavors: item.flavors || [],
            lineTotal: item.lineTotal || (item.product?.price || 0) * (item.quantity || 1),
          }));

          setCart(recoveredItems);
          setIsRecoveryMode(true);

          toast.success("Welcome back! 🎉", {
            description: "We've restored your cart. Ready to complete your order?",
            duration: 5000,
            action: {
              label: "Checkout",
              onClick: () => setIsCheckoutOpen(true),
            },
          });

          // Track cart restored event
          try {
            await supabase.from("abandoned_checkout_events").insert({
              abandoned_checkout_id: recoverId,
              event_type: "cart_restored",
              metadata: { items_count: recoveredItems.length, cart_total: checkout.cart_total }
            });
          } catch (e) {
            console.error("Failed to track cart restore:", e);
          }

          // Update to recovering status - DO NOT mark as recovered yet
          // Will only mark as recovered when order is actually placed
          await supabase
            .from("abandoned_checkouts")
            .update({ 
              status: "recovering",
              recovery_started_at: new Date().toISOString()
            })
            .eq("id", recoverId);

          // Clear recover param from URL
          const newParams = new URLSearchParams(searchParams);
          newParams.delete("recover");
          newParams.delete("utm_source");
          newParams.delete("utm_medium");
          newParams.delete("utm_campaign");
          setSearchParams(newParams, { replace: true });
        } catch (err) {
          console.error("Recovery error:", err);
          toast.error("Something went wrong. Please try again or contact support.");
        }
      };

      recoverCart();
    }
  }, [recoverId, isRecoveryMode, searchParams, setSearchParams, setCart]);

  // Show welcome back toast for returning users with saved cart
  useEffect(() => {
    if (showWelcomeBack && !isRecoveryMode) {
      toast("Welcome back! 👋", {
        description: "We saved your cart so you can continue where you left off.",
        duration: 5000,
        action: {
          label: "View Cart",
          onClick: () => setIsCartOpen(true),
        },
      });
      dismissWelcomeBack();
    }
  }, [showWelcomeBack, dismissWelcomeBack, isRecoveryMode]);

  // Handle openCheckout URL param - auto-open checkout sheet when coming from homepage cart
  useEffect(() => {
    const openCheckout = searchParams.get('openCheckout');
    if (openCheckout === 'true' && cart.length > 0) {
      // Small delay to ensure page is ready
      setTimeout(() => {
        setIsCheckoutOpen(true);
        // Remove the param to prevent re-triggering
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('openCheckout');
        setSearchParams(newParams, { replace: true });
      }, 300);
    }
  }, [searchParams, cart.length, setSearchParams]);

  const activeCategory = searchParams.get("category") || "all";
  const addToCartId = searchParams.get("addToCart");

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

  // Handle /product/:slug route - open product detail modal
  useEffect(() => {
    if (slug && products) {
      // Find product by slug or id
      const product = products.find(
        (p) => (p as any).slug === slug || p.id === slug
      );
      if (product) {
        setDetailProduct(product as any);
        setIsDetailModalOpen(true);
      } else {
        // Product not found, redirect to order page
        navigate("/order", { replace: true });
      }
    }
  }, [slug, products, navigate]);

  // Filter products by category and search (exclude combo components from customer menu)
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    // Exclude combo component products (internal bundle items with ₱0 price)
    let visibleProducts = products.filter(
      (p) => !(p.name.toLowerCase().startsWith("combo ") && p.price === 0)
    );
    
    // Apply category filter
    if (activeCategory !== "all") {
      visibleProducts = visibleProducts.filter(
        (p) => p.categories?.name.toLowerCase() === activeCategory.toLowerCase()
      );
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      visibleProducts = visibleProducts.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.categories?.name.toLowerCase().includes(query)
      );
    }
    
    return visibleProducts;
  }, [products, activeCategory, searchQuery]);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Add to cart handler
  const handleAddToCart = (product: Tables<"products">) => {
    // Track analytics event
    trackAnalyticsEvent("add_to_cart", { 
      product_id: product.id, 
      product_name: product.name,
      price: product.price 
    }, "/order");

    // Fire Meta Pixel AddToCart event
    if (typeof (window as any).fbq === 'function') {
      (window as any).fbq('track', 'AddToCart', {
        content_name: product.name,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'PHP',
      });
      console.log('Meta Pixel AddToCart event fired:', product.name);
    }

    // Fire Google Analytics 4 add_to_cart event
    if (typeof gtag === 'function') {
      gtag('event', 'add_to_cart', {
        currency: 'PHP',
        value: product.price,
        items: [{
          item_id: product.id,
          item_name: product.name,
          price: product.price,
          quantity: 1,
        }]
      });
      console.log('GA4 add_to_cart event fired:', product.name);
    }

    if (product.product_type === "bundle") {
      // Bundle products use the BundleWizard for step-by-step selection
      setSelectedProduct(product);
      setIsBundleWizardOpen(true);
    } else if (product.product_type === "flavored") {
      // Flavored products use FlavorModal
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
      
      // Show toast notification for simple products
      toast.success(`${product.name} added to cart!`, {
        duration: 2000,
        action: {
          label: "View Cart",
          onClick: () => setIsCartOpen(true),
        },
      });
    }
  };

  // Handle addToCart query param from homepage - placed after handleAddToCart definition
  useEffect(() => {
    if (addToCartId && products && addToCartId !== processedAddToCart) {
      const product = products.find((p) => p.id === addToCartId);
      if (product) {
        handleAddToCart(product);
        setProcessedAddToCart(addToCartId);
        // Clear the query param
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("addToCart");
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [addToCartId, products, processedAddToCart]);

  // Add flavored item to cart
  const handleAddFlavoredItem = (
    product: Tables<"products">,
    selectedFlavors: { id: string; name: string; quantity: number; surcharge: number }[]
  ) => {
    // Surcharge is per distinct flavor, NOT per piece - just sum them directly
    const flavorSurcharge = selectedFlavors.reduce(
      (sum, f) => sum + f.surcharge,
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
  
  // Show toast notification for flavored products
  toast.success(`${product.name} added to cart!`, {
    duration: 2000,
    action: {
      label: "View Cart",
      onClick: () => setIsCartOpen(true),
    },
  });
  };

  // Update cart item quantity
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id !== itemId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          // Surcharge is per distinct flavor, NOT per piece - just sum them directly
          const flavorSurcharge = item.flavors?.reduce(
            (sum, f) => sum + f.surcharge,
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

  // Clear cart - use the hook's clearCart which also clears localStorage

  // Handle order confirmation - redirect to tracking page
  const handleOrderConfirmed = async (
    orderNumber: string, 
    orderId: string, 
    orderType: OrderType,
    pickupDate?: string,
    pickupTime?: string
  ) => {
    // Track checkout completed event for recovery
    if (recoverId) {
      try {
        await supabase.from("abandoned_checkout_events").insert({
          abandoned_checkout_id: recoverId,
          event_type: "checkout_completed",
          metadata: { order_id: orderId, order_number: orderNumber }
        });
      } catch (e) {
        console.error("Failed to track checkout completion:", e);
      }
    }
    
    setIsCheckoutOpen(false);
    clearCart();
    // Navigate to the order tracking page
    navigate(`/order/${orderId}`);
  };

  // Track when checkout sheet opens
  const handleCheckoutOpen = async () => {
    setIsCheckoutOpen(true);
    
    // Track checkout started event for recovery
    if (recoverId) {
      try {
        await supabase.from("abandoned_checkout_events").insert({
          abandoned_checkout_id: recoverId,
          event_type: "checkout_started",
          metadata: { cart_total: cartTotal, items_count: cart.length }
        });
      } catch (e) {
        console.error("Failed to track checkout start:", e);
      }
    }
  };

  // Handle add from detail modal
  const handleAddFromDetailModal = () => {
    if (detailProduct) {
      handleAddToCart(detailProduct);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        pagePath="/order" 
        fallbackTitle="Order Online | American Ribs & Wings Floridablanca"
        fallbackDescription="Order delicious BBQ ribs, wings, and more online from American Ribs & Wings Floridablanca."
      />
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

          {/* Cart button - visible on ALL devices */}
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-xs">
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0" onInteractOutside={(e) => e.preventDefault()}>
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Your Cart ({cartItemCount})</SheetTitle>
              </SheetHeader>
              <Cart
                items={cart}
                onUpdateQuantity={updateCartItemQuantity}
                onRemove={removeFromCart}
                onClearCart={clearCart}
                onCheckout={() => {
                  setIsCartOpen(false);
                  // Small delay to allow cart drawer to close before checkout opens
                  setTimeout(() => setIsCheckoutOpen(true), 100);
                }}
                onClose={() => setIsCartOpen(false)}
                total={cartTotal}
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Category selector - Mobile dropdown */}
        <div className="sm:hidden border-t border-border px-4 py-3">
          {/* Search bar - Mobile */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-4 w-4 text-primary" />
            <label className="text-sm font-bold text-foreground">
              Filter by Category
            </label>
          </div>
          <Select 
            value={activeCategory} 
            onValueChange={(v) => setSearchParams({ category: v })}
          >
            <SelectTrigger className="w-full bg-primary/5 border-primary/30 ring-2 ring-primary/20 animate-[pulse_2s_ease-in-out_3] font-medium">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.name.toLowerCase()}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Category tabs - Desktop */}
        <div className="hidden sm:block border-t border-border">
          <div className="container px-4 py-2">
            <div className="flex items-center gap-4">
              {/* Search bar - Desktop */}
              <div className="relative w-64 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              
              <ScrollArea className="flex-1">
                <Tabs
                  value={activeCategory}
                  onValueChange={(v) => setSearchParams({ category: v })}
                  className="w-full"
                >
                  <TabsList className="h-10 bg-transparent gap-2 justify-start w-max">
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
              </ScrollArea>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className={cn("container px-4 py-6", cartItemCount > 0 && "pb-28 lg:pb-6")}>
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
                  {searchQuery 
                    ? `No products found for "${searchQuery}"`
                    : "No products found in this category."}
                </p>
                {searchQuery && (
                  <Button variant="link" onClick={() => setSearchQuery("")}>
                    Clear search
                  </Button>
                )}
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
                  onClearCart={clearCart}
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
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-card border-t border-border p-4 shadow-lg z-50">
          <Button
            className="w-full animate-glow-pulse"
            size="lg"
            onClick={() => setIsCheckoutOpen(true)}
          >
            Checkout ({cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}) · ₱{cartTotal.toFixed(2)}
          </Button>
        </div>
      )}

      {/* Product Detail Modal (for /product/:slug route) */}
      <ProductDetailModal
        product={detailProduct}
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
        onAdd={handleAddFromDetailModal}
        returnPath="/order"
      />

      {/* Flavor selection modal for flavored products */}
      {selectedProduct && flavors && selectedProduct.product_type === "flavored" && (
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

      {/* Bundle wizard for bundle products */}
      {selectedProduct && flavors && selectedProduct.product_type === "bundle" && (
        <BundleWizard
          open={isBundleWizardOpen}
          onOpenChange={(open) => {
            setIsBundleWizardOpen(open);
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
        onOrderConfirmed={handleOrderConfirmed}
      />
    </div>
  );
};

export default Order;
