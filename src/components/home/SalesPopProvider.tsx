import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { useSalesPop } from "@/hooks/useSalesPop";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSalesPopContext } from "@/contexts/SalesPopContext";

interface SalesPopProviderProps {
  children: React.ReactNode;
}

export function SalesPopProvider({ children }: SalesPopProviderProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const lastMessageRef = useRef<string | null>(null);
  const { isCheckoutOpen } = useSalesPopContext();

  // Only show on homepage and order page
  const allowedPaths = ["/", "/order"];
  const isAllowedPath = allowedPaths.includes(location.pathname);

  // Pause when checkout is open
  const isPaused = isCheckoutOpen;

  const { currentMessage, clearMessage } = useSalesPop({
    enabled: isAllowedPath,
    paused: isPaused,
  });

  useEffect(() => {
    if (!currentMessage) return;

    // Prevent duplicate toasts
    const messageKey = `${currentMessage.name}-${currentMessage.productName}-${currentMessage.minutesAgo}`;
    if (messageKey === lastMessageRef.current) return;
    lastMessageRef.current = messageKey;

    // Dismiss any existing sales pop toasts first
    toast.dismiss();

    // Show the toast with custom styling
    toast.custom(
      (t) => (
        <div
          className="flex items-center gap-3 bg-gradient-to-r from-primary to-accent rounded-lg px-4 py-3 shadow-xl max-w-sm animate-in slide-in-from-bottom-5 fade-in duration-300"
          style={{
            boxShadow: "0 10px 30px -5px rgba(185, 28, 28, 0.4), 0 8px 15px -6px rgba(234, 88, 12, 0.3)",
          }}
        >
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">
              <span className="font-semibold">{currentMessage.name}</span>
              <span className="text-white/80"> from </span>
              <span className="font-semibold">{currentMessage.location}</span>
            </p>
            <p className="text-sm text-white/90 truncate">
              ordered <span className="font-medium text-white">{currentMessage.productName}</span>
            </p>
            <p className="text-xs text-white/70 mt-0.5">
              {currentMessage.minutesAgo} minutes ago
            </p>
          </div>
        </div>
      ),
      {
        duration: 10000,
        position: isMobile ? "top-center" : "bottom-left",
        id: "sales-pop",
        onDismiss: clearMessage,
        onAutoClose: clearMessage,
      }
    );
  }, [currentMessage, clearMessage, isMobile]);

  return <>{children}</>;
}
