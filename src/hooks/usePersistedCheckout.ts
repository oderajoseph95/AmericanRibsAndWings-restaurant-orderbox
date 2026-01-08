import { useState, useEffect, useCallback, useRef } from "react";

const CHECKOUT_STORAGE_KEY = "arw_checkout_data";
const CHECKOUT_EXPIRY_HOURS = 72;

export interface PersistedCheckoutData {
  orderType?: "pickup" | "delivery";
  name?: string;
  phone?: string;
  email?: string;
  streetAddress?: string;
  city?: string;
  barangay?: string;
  landmark?: string;
  customerLat?: number;
  customerLng?: number;
  activeSection?: string;
  savedAt: number;
}

export function usePersistedCheckout() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [savedData, setSavedData] = useState<PersistedCheckoutData | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load checkout data from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (stored) {
        const parsed: PersistedCheckoutData = JSON.parse(stored);
        const now = Date.now();
        const expiryMs = CHECKOUT_EXPIRY_HOURS * 60 * 60 * 1000;
        
        // Check if data is still valid (not expired)
        if (now - parsed.savedAt < expiryMs) {
          // Check if there's meaningful data (at least name or phone)
          if (parsed.name || parsed.phone || parsed.email) {
            setSavedData(parsed);
          }
        } else {
          // Data expired, clear it
          localStorage.removeItem(CHECKOUT_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading checkout data:", error);
    }
    setIsLoaded(true);
  }, []);

  // Save checkout data to localStorage (debounced)
  const saveCheckoutData = useCallback((data: Omit<PersistedCheckoutData, "savedAt">) => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce the save to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const toSave: PersistedCheckoutData = {
          ...data,
          savedAt: Date.now(),
        };
        localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(toSave));
      } catch (error) {
        console.error("Error saving checkout data:", error);
      }
    }, 1000);
  }, []);

  // Clear checkout data (after successful order)
  const clearCheckoutData = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    setSavedData(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isLoaded,
    savedData,
    saveCheckoutData,
    clearCheckoutData,
  };
}
