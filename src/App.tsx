import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DriverProtectedRoute from "@/components/driver/DriverProtectedRoute";
import AuthPage from "./pages/Auth";
import NoAccess from "./pages/NoAccess";
import Index from "./pages/Index";
import Order from "./pages/Order";
import OrderTracking from "./pages/OrderTracking";
import MyOrders from "./pages/MyOrders";
import AdminLayout from "./layouts/AdminLayout";
import DriverLayout from "./layouts/DriverLayout";
import Dashboard from "./pages/admin/Dashboard";
import Orders from "./pages/admin/Orders";
import Products from "./pages/admin/Products";
import Categories from "./pages/admin/Categories";
import Flavors from "./pages/admin/Flavors";
import Bundles from "./pages/admin/Bundles";
import Stock from "./pages/admin/Stock";
import Customers from "./pages/admin/Customers";
import Drivers from "./pages/admin/Drivers";
import Reports from "./pages/admin/Reports";
import Settings from "./pages/admin/Settings";
import Website from "./pages/admin/Website";
import DriverAuth from "./pages/driver/Auth";
import DriverDashboard from "./pages/driver/Dashboard";
import DriverProfile from "./pages/driver/Profile";
import DriverEarnings from "./pages/driver/Earnings";
import Payouts from "./pages/admin/Payouts";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/order" element={<Order />} />
            <Route path="/order/:orderId" element={<OrderTracking />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/no-access" element={<NoAccess />} />
            
            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="products" element={<Products />} />
              <Route path="categories" element={<Categories />} />
              <Route path="flavors" element={<Flavors />} />
              <Route path="bundles" element={<Bundles />} />
              <Route path="stock" element={<Stock />} />
              <Route path="customers" element={<Customers />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="payouts" element={<Payouts />} />
              <Route path="reports" element={<Reports />} />
              <Route path="website" element={<Website />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Driver Routes */}
            <Route path="/driver/auth" element={<DriverAuth />} />
            <Route
              path="/driver"
              element={
                <DriverProtectedRoute>
                  <DriverLayout />
                </DriverProtectedRoute>
              }
            >
              <Route index element={<DriverDashboard />} />
              <Route path="earnings" element={<DriverEarnings />} />
              <Route path="profile" element={<DriverProfile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
