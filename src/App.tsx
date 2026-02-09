import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SalesPopContextProvider } from "@/contexts/SalesPopContext";
import { SalesPopProvider } from "@/components/home/SalesPopProvider";
import { ValentineHearts } from "@/components/home/ValentineHearts";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DriverProtectedRoute from "@/components/driver/DriverProtectedRoute";
import AuthPage from "./pages/Auth";
import NoAccess from "./pages/NoAccess";
import Index from "./pages/Index";
import Order from "./pages/Order";
import OrderTracking from "./pages/OrderTracking";
import ThankYou from "./pages/ThankYou";
import MyOrders from "./pages/MyOrders";
import Reserve from "./pages/Reserve";
import ReservationTracking from "./pages/ReservationTracking";
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
import DriverOrders from "./pages/driver/Orders";
import DriverProfile from "./pages/driver/Profile";
import DriverEarnings from "./pages/driver/Earnings";
import EmployeeAuth from "./pages/employee/Auth";
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeProtectedRoute from "./components/employee/EmployeeProtectedRoute";
import EmployeeLayout from "./layouts/EmployeeLayout";
import Payouts from "./pages/admin/Payouts";
import Logs from "./pages/admin/Logs";
import Users from "./pages/admin/Users";
import EmailTemplates from "./pages/admin/EmailTemplates";
import Sms from "./pages/admin/Sms";
import AbandonedCheckouts from "./pages/admin/AbandonedCheckouts";
import Sitemap from "./pages/admin/Sitemap";
import Employees from "./pages/admin/Employees";
import Reservations from "./pages/admin/Reservations";
import ReservationDetail from "./pages/admin/ReservationDetail";
import ReservationAnalytics from "./pages/admin/ReservationAnalytics";
import ReservationSettings from "./pages/admin/ReservationSettings";
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
          <SalesPopContextProvider>
            <SalesPopProvider>
              <ValentineHearts />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/order" element={<Order />} />
                <Route path="/product/:slug" element={<Order />} />
                <Route path="/order/:orderId" element={<OrderTracking />} />
                <Route path="/thank-you/:orderId" element={<ThankYou />} />
                <Route path="/my-orders" element={<MyOrders />} />
                <Route path="/reserve" element={<Reserve />} />
                <Route path="/reserve/track" element={<ReservationTracking />} />
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
                  <Route path="reservations" element={<Reservations />} />
                  <Route path="reservations/settings" element={<ReservationSettings />} />
                  <Route path="reservations/analytics" element={<ReservationAnalytics />} />
                  <Route path="reservations/:id" element={<ReservationDetail />} />
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
                  <Route path="email-templates" element={<EmailTemplates />} />
                  <Route path="sms" element={<Sms />} />
                  <Route path="abandoned-checkouts" element={<AbandonedCheckouts />} />
                  <Route path="employees" element={<Employees />} />
                  <Route path="sitemap" element={<Sitemap />} />
                  <Route path="users" element={<Users />} />
                  <Route path="logs" element={<Logs />} />
                  <Route path="settings" element={<Settings />} />
                </Route>

                {/* Employee Routes */}
                <Route path="/employee/auth" element={<EmployeeAuth />} />
                <Route
                  path="/employee"
                  element={
                    <EmployeeProtectedRoute>
                      <EmployeeLayout />
                    </EmployeeProtectedRoute>
                  }
                >
                  <Route index element={<EmployeeDashboard />} />
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
                  <Route path="orders" element={<DriverOrders />} />
                  <Route path="earnings" element={<DriverEarnings />} />
                  <Route path="profile" element={<DriverProfile />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </SalesPopProvider>
          </SalesPopContextProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
