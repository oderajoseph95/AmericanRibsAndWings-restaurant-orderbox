import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, ShoppingBag, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/NotificationBell";
import { Cart } from "@/components/customer/Cart";
import { useAuth } from "@/contexts/AuthContext";
import { usePersistedCart } from "@/hooks/usePersistedCart";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import type { CartItem } from "@/pages/Order";

export function Navbar() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'manager';
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { cart, setCart } = usePersistedCart();
  const { isOpen: isStoreOpen, opensAt, isLoading: storeStatusLoading } = useStoreStatus();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Menu", href: "#menu" },
    { name: "About", href: "#about" },
    { name: "Location", href: "#location" },
  ];

  // Cart calculations
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);

  // Cart operations
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id !== itemId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
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

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white shadow-sm ${
        isScrolled ? "py-2" : "py-3"
      }`}
    >
      <div className="container px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img 
            src="/images/logo.jpg" 
            alt="American Ribs & Wings" 
            className="h-12 w-auto object-contain"
          />
        </Link>

        {/* Mobile Dynamic Store Status Badge - between logo and cart/hamburger */}
        <div className="flex md:hidden items-center flex-1 justify-center">
          {!storeStatusLoading && (
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
              isStoreOpen 
                ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                : "bg-muted text-muted-foreground"
            }`}>
              <span className="relative flex h-1.5 w-1.5">
                {isStoreOpen && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  isStoreOpen ? "bg-green-500" : "bg-muted-foreground"
                }`}></span>
              </span>
              {isStoreOpen ? "Now Taking Orders" : opensAt ? `Opens ${opensAt}` : "Closed"}
            </div>
          )}
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-foreground hover:text-primary transition-colors font-medium"
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* Desktop: Cart + Notification + Order Now */}
        <div className="hidden md:flex items-center gap-2">
          {/* Cart Icon - Desktop */}
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs">
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
                  // Small delay to allow cart drawer to close smoothly
                  setTimeout(() => navigate("/order"), 100);
                }}
                onClose={() => setIsCartOpen(false)}
                total={cartTotal}
              />
            </SheetContent>
          </Sheet>
          
          {isAdmin && (
            <NotificationBell userType="admin" />
          )}
          <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6">
            <Link to="/order">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Order Now
            </Link>
          </Button>
        </div>

        {/* Mobile: Cart Icon + Hamburger Menu */}
        <div className="flex md:hidden items-center gap-1">
          {/* Cart Icon - Mobile */}
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs">
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
                  // Small delay to allow cart drawer to close smoothly
                  setTimeout(() => navigate("/order"), 100);
                }}
                onClose={() => setIsCartOpen(false)}
                total={cartTotal}
              />
            </SheetContent>
          </Sheet>

          {/* Hamburger Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-white">
              <div className="flex flex-col gap-6 mt-8">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
                <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full mt-4">
                  <Link to="/order" onClick={() => setIsOpen(false)}>
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Order Now
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
