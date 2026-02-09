import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ValentineHearts() {
  // Fetch setting from database
  const { data: isEnabled } = useQuery({
    queryKey: ["valentine-mode"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "valentine_mode_enabled")
        .maybeSingle();
      return data?.value === true || data?.value === "true";
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Generate hearts only once using useMemo
  const hearts = useMemo(() => 
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 10}s`,
      animationDuration: `${15 + Math.random() * 10}s`,
      size: 12 + Math.random() * 20,
      opacity: 0.15 + Math.random() * 0.25,
    })), 
  []);

  if (!isEnabled) return null;

  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-[5]"
      aria-hidden="true"
    >
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute animate-float-heart"
          style={{
            left: heart.left,
            animationDelay: heart.animationDelay,
            animationDuration: heart.animationDuration,
            fontSize: `${heart.size}px`,
            opacity: heart.opacity,
            color: 'hsl(340, 82%, 65%)',
          }}
        >
          ♥
        </div>
      ))}
    </div>
  );
}
