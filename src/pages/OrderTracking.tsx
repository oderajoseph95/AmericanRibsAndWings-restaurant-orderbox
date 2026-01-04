import { useParams, Navigate } from "react-router-dom";

// Redirect old tracking URLs to unified thank-you page
export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  
  // Redirect to the unified thank-you page
  return <Navigate to={`/thank-you/${orderId}`} replace />;
}
