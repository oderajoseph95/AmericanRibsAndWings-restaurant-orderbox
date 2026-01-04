import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FILIPINO_NAMES } from "@/data/filipinoNames";
import { SALES_POP_LOCATIONS } from "@/data/salesPopLocations";

interface SalesPopMessage {
  name: string;
  location: string;
  productName: string;
  minutesAgo: number;
}

interface UseSalesPopOptions {
  enabled?: boolean;
  paused?: boolean;
}

// Helper to get random item from array
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random number between min and max (inclusive)
const getRandomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Excluded category names (lowercase for comparison)
const EXCLUDED_CATEGORIES = ["add-ons", "drinks", "sides", "beverages"];

export function useSalesPop({ enabled = true, paused = false }: UseSalesPopOptions = {}) {
  const [currentMessage, setCurrentMessage] = useState<SalesPopMessage | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRun = useRef(true);

  // Fetch products once and cache them
  const { data: products } = useQuery({
    queryKey: ["sales-pop-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("name, categories(name)")
        .eq("is_active", true)
        .is("archived_at", null);
      
      if (error) throw error;
      
      // Filter out excluded categories and combo components
      return data?.filter((p) => {
        const categoryName = (p.categories as any)?.name?.toLowerCase() || "";
        const isExcludedCategory = EXCLUDED_CATEGORIES.some(exc => categoryName.includes(exc));
        const isComboComponent = p.name.toLowerCase().startsWith("combo ") && p.name.includes("(");
        return !isExcludedCategory && !isComboComponent;
      }) || [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: enabled,
  });

  const generateMessage = useCallback((): SalesPopMessage | null => {
    if (!products || products.length === 0) return null;

    return {
      name: getRandomItem(FILIPINO_NAMES),
      location: getRandomItem(SALES_POP_LOCATIONS),
      productName: getRandomItem(products).name,
      minutesAgo: getRandomBetween(10, 30),
    };
  }, [products]);

  const scheduleNextPop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Fixed 30 second delay between toasts
    const delay = 30000;

    timeoutRef.current = setTimeout(() => {
      if (!paused && products && products.length > 0) {
        setCurrentMessage(generateMessage());
      }
      scheduleNextPop();
    }, delay);
  }, [paused, products, generateMessage]);

  // Start/stop the loop based on enabled and products availability
  useEffect(() => {
    if (!enabled || !products || products.length === 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Show first pop after 10 seconds
    if (isFirstRun.current) {
      isFirstRun.current = false;
      timeoutRef.current = setTimeout(() => {
        if (!paused) {
          setCurrentMessage(generateMessage());
        }
        scheduleNextPop();
      }, 10000);
    } else {
      scheduleNextPop();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, products, scheduleNextPop, generateMessage, paused]);

  // Clear message after it's shown (handled by toast duration)
  const clearMessage = useCallback(() => {
    setCurrentMessage(null);
  }, []);

  return {
    currentMessage,
    clearMessage,
  };
}
