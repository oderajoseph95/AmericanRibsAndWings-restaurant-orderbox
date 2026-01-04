import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "visitor_session_id";

type EventType = 
  | "page_view"
  | "view_product"
  | "add_to_cart"
  | "checkout_start"
  | "checkout_complete";

export function useAnalytics() {
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    sessionId.current = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, sessionId.current);
    }
  }, []);

  const trackEvent = useCallback(
    async (
      eventType: EventType,
      eventData?: Record<string, any>,
      pagePath?: string
    ) => {
      try {
        await supabase.from("analytics_events").insert({
          session_id: sessionId.current,
          event_type: eventType,
          event_data: eventData || {},
          page_path: pagePath || window.location.pathname,
        });
      } catch (err) {
        // Non-blocking, fail silently
        console.error("Analytics error:", err);
      }
    },
    []
  );

  return { trackEvent };
}

// Standalone function for use outside of hooks
export async function trackAnalyticsEvent(
  eventType: EventType,
  eventData?: Record<string, any>,
  pagePath?: string
) {
  const sessionId = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
  
  try {
    await supabase.from("analytics_events").insert({
      session_id: sessionId,
      event_type: eventType,
      event_data: eventData || {},
      page_path: pagePath || window.location.pathname,
    });
  } catch (err) {
    console.error("Analytics error:", err);
  }
}
