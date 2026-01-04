import { useParams, Navigate } from "react-router-dom";
import { useVisitorPresence } from "@/hooks/useVisitorPresence";

// Redirect old tracking URLs to unified thank-you page
export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  useVisitorPresence("/order-tracking");
  
  // Redirect to the unified thank-you page
  return <Navigate to={`/thank-you/${orderId}`} replace />;
}
