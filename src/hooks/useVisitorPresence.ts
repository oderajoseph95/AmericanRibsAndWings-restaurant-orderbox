import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "visitor_session_id";
const PING_INTERVAL = 30000; // 30 seconds

function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function useVisitorPresence(pagePath: string) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionId = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    const updatePresence = async () => {
      try {
        const { error } = await supabase
          .from("visitor_sessions")
          .upsert(
            {
              session_id: sessionId.current,
              page_path: pagePath,
              user_agent: navigator.userAgent,
              is_active: true,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "session_id" }
          );

        if (error) {
          console.error("Presence update error:", error);
        }
      } catch (err) {
        console.error("Presence error:", err);
      }
    };

    // Initial ping
    updatePresence();

    // Setup interval for periodic updates
    intervalRef.current = setInterval(updatePresence, PING_INTERVAL);

    // Cleanup on unmount or page change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Mark as inactive (fire and forget)
      supabase
        .from("visitor_sessions")
        .update({ is_active: false })
        .eq("session_id", sessionId.current)
        .then(() => {});
    };
  }, [pagePath]);

  return sessionId.current;
}
