import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthPage from "./pages/Auth";
import NoAccess from "./pages/NoAccess";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/no-access" element={<NoAccess />} />
            
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Dashboard />} />
              <Route path="products" element={<Dashboard />} />
              <Route path="categories" element={<Dashboard />} />
              <Route path="flavors" element={<Dashboard />} />
              <Route path="bundles" element={<Dashboard />} />
              <Route path="stock" element={<Dashboard />} />
              <Route path="customers" element={<Dashboard />} />
              <Route path="reports" element={<Dashboard />} />
              <Route path="settings" element={<Dashboard />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
