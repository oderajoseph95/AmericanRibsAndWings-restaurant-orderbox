import { useState, useEffect, useCallback } from "react";
import type { CartItem } from "@/pages/Order";

const CART_STORAGE_KEY = "arw_cart_data";
const CART_EXPIRY_HOURS = 72;
const WELCOME_BACK_KEY = "arw_welcome_shown";

interface PersistedCart {
  items: CartItem[];
  savedAt: number;
}

export function usePersistedCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed: PersistedCart = JSON.parse(stored);
        const now = Date.now();
        const expiryMs = CART_EXPIRY_HOURS * 60 * 60 * 1000;
        
        // Check if cart is still valid (not expired)
        if (now - parsed.savedAt < expiryMs && parsed.items.length > 0) {
          // CRITICAL: Recalculate lineTotal values to prevent stale/incorrect totals
          const recalculatedItems = parsed.items.map(item => ({
            ...item,
            lineTotal: (item.product.price * item.quantity) 
              + (item.flavors?.reduce((s, f) => s + (f.surcharge || 0), 0) || 0)
              + (item.includedItems?.reduce((s, i) => s + (i.surcharge || 0), 0) || 0)
          }));
          setCart(recalculatedItems);
          
          // Check if we should show welcome back message (once per session)
          const alreadyShown = sessionStorage.getItem(WELCOME_BACK_KEY);
          
          if (!alreadyShown) {
            setShowWelcomeBack(true);
            sessionStorage.setItem(WELCOME_BACK_KEY, "true");
          }
        } else {
          // Cart expired, clear it
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading cart:", error);
    }
    setIsLoaded(true);
  }, []);

  // Save cart to localStorage on every change
  useEffect(() => {
    if (isLoaded) {
      if (cart.length > 0) {
        const data: PersistedCart = {
          items: cart,
          savedAt: Date.now(),
        };
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    }
  }, [cart, isLoaded]);

  const dismissWelcomeBack = useCallback(() => {
    setShowWelcomeBack(false);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  }, []);

  return {
    cart,
    setCart,
    isLoaded,
    showWelcomeBack,
    dismissWelcomeBack,
    clearCart,
  };
}
