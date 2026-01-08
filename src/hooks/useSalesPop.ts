import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FILIPINO_NAMES } from "@/data/filipinoNames";
import { SALES_POP_LOCATIONS } from "@/data/salesPopLocations";

interface SalesPopMessage {
  name: string;
  location: string;
  productName: string;
  minutesAgo: number;
}

interface SalesPopConfig {
  enabled: boolean;
  initialDelaySeconds: number;
  displayDurationSeconds: number;
  intervalSeconds: number;
  minMinutesAgo: number;
  maxMinutesAgo: number;
  pages: string[];
  customNames: string[];
  locations: string[];
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

// Default configuration
const DEFAULT_CONFIG: SalesPopConfig = {
  enabled: true,
  initialDelaySeconds: 10,
  displayDurationSeconds: 6,
  intervalSeconds: 30,
  minMinutesAgo: 10,
  maxMinutesAgo: 30,
  pages: ["/", "/order"],
  customNames: [],
  locations: SALES_POP_LOCATIONS,
};

export function useSalesPop({ enabled = true, paused = false }: UseSalesPopOptions = {}) {
  const [currentMessage, setCurrentMessage] = useState<SalesPopMessage | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRun = useRef(true);
  const queryClient = useQueryClient();

  // Fetch sales pop configuration from database
  const { data: config } = useQuery({
    queryKey: ["sales-pop-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_pop_config")
        .select("key, value");
      
      if (error) throw error;
      
      // Convert array of key-value pairs to config object
      const configObj: SalesPopConfig = { ...DEFAULT_CONFIG };
      
      data?.forEach((item) => {
        const key = item.key;
        const value = item.value;
        
        switch (key) {
          case "enabled":
            configObj.enabled = value === true || value === "true";
            break;
          case "initial_delay_seconds":
            configObj.initialDelaySeconds = typeof value === "number" ? value : parseInt(String(value), 10) || DEFAULT_CONFIG.initialDelaySeconds;
            break;
          case "display_duration_seconds":
            configObj.displayDurationSeconds = typeof value === "number" ? value : parseInt(String(value), 10) || DEFAULT_CONFIG.displayDurationSeconds;
            break;
          case "interval_seconds":
            configObj.intervalSeconds = typeof value === "number" ? value : parseInt(String(value), 10) || DEFAULT_CONFIG.intervalSeconds;
            break;
          case "min_minutes_ago":
            configObj.minMinutesAgo = typeof value === "number" ? value : parseInt(String(value), 10) || DEFAULT_CONFIG.minMinutesAgo;
            break;
          case "max_minutes_ago":
            configObj.maxMinutesAgo = typeof value === "number" ? value : parseInt(String(value), 10) || DEFAULT_CONFIG.maxMinutesAgo;
            break;
          case "pages":
            configObj.pages = Array.isArray(value) ? (value as string[]) : DEFAULT_CONFIG.pages;
            break;
          case "custom_names":
            configObj.customNames = Array.isArray(value) ? (value as string[]) : [];
            break;
          case "locations":
            configObj.locations = Array.isArray(value) && value.length > 0 ? (value as string[]) : DEFAULT_CONFIG.locations;
            break;
        }
      });
      
      return configObj;
    },
    staleTime: 60000, // 1 minute cache
    enabled: enabled,
  });

  // Real-time subscription for config changes
  useEffect(() => {
    const channel = supabase
      .channel('sales-pop-config-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sales_pop_config'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['sales-pop-config'] });
      })
      .subscribe();
    
    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [queryClient]);

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
    if (!products || products.length === 0 || !config) return null;

    // Use custom names if provided, otherwise use default Filipino names
    const names = config.customNames && config.customNames.length > 0 
      ? config.customNames 
      : FILIPINO_NAMES;
    
    const locations = config.locations && config.locations.length > 0
      ? config.locations
      : SALES_POP_LOCATIONS;

    return {
      name: getRandomItem(names),
      location: getRandomItem(locations),
      productName: getRandomItem(products).name,
      minutesAgo: getRandomBetween(config.minMinutesAgo, config.maxMinutesAgo),
    };
  }, [products, config]);

  const scheduleNextPop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const delay = (config?.intervalSeconds || DEFAULT_CONFIG.intervalSeconds) * 1000;

    timeoutRef.current = setTimeout(() => {
      if (!paused && products && products.length > 0 && config?.enabled !== false) {
        setCurrentMessage(generateMessage());
      }
      scheduleNextPop();
    }, delay);
  }, [paused, products, generateMessage, config]);

  // Start/stop the loop based on enabled and products availability
  useEffect(() => {
    // Check if sales pop is disabled in config
    if (!enabled || !products || products.length === 0 || config?.enabled === false) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const initialDelay = (config?.initialDelaySeconds || DEFAULT_CONFIG.initialDelaySeconds) * 1000;

    // Show first pop after initial delay
    if (isFirstRun.current) {
      isFirstRun.current = false;
      timeoutRef.current = setTimeout(() => {
        if (!paused) {
          setCurrentMessage(generateMessage());
        }
        scheduleNextPop();
      }, initialDelay);
    } else {
      scheduleNextPop();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, products, scheduleNextPop, generateMessage, paused, config]);

  // Clear message after it's shown (handled by toast duration)
  const clearMessage = useCallback(() => {
    setCurrentMessage(null);
  }, []);

  return {
    currentMessage,
    clearMessage,
    config,
  };
}
