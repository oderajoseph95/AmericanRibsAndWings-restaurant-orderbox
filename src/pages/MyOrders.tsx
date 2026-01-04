import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  ArrowRight, 
  Package, 
  Loader2,
  Calendar,
  Clock,
  Mail,
  Phone,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { SEOHead } from "@/components/SEOHead";
import { useToast } from "@/hooks/use-toast";
import type { Enums } from "@/integrations/supabase/types";

interface OrderResult {
  id: string;
  order_number: string;
  status: Enums<'order_status'>;
  order_type: Enums<'order_type'>;
  total_amount: number;
  created_at: string;
  pickup_date: string | null;
  pickup_time: string | null;
}

const statusColors: Record<Enums<'order_status'>, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  for_verification: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  approved: 'bg-green-500/20 text-green-700 border-green-500/30',
  preparing: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
  ready_for_pickup: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  waiting_for_rider: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  picked_up: 'bg-indigo-500/20 text-indigo-700 border-indigo-500/30',
  in_transit: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  delivered: 'bg-green-500/20 text-green-700 border-green-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<Enums<'order_status'>, string> = {
  pending: 'Pending',
  for_verification: 'Verifying',
  approved: 'Approved',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready',
  waiting_for_rider: 'Waiting Rider',
  picked_up: 'Picked Up',
  in_transit: 'On the Way',
  delivered: 'Delivered',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function MyOrders() {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState<'email' | 'phone'>('phone');
  const [contactValue, setContactValue] = useState('');
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Restore from sessionStorage on mount
  useEffect(() => {
    const savedContact = sessionStorage.getItem('myorders_contact');
    const savedType = sessionStorage.getItem('myorders_type') as 'email' | 'phone' | null;
    const savedOrders = sessionStorage.getItem('myorders_orders');
    
    if (savedContact && savedType) {
      setContactValue(savedContact);
      setSearchType(savedType);
      if (savedOrders) {
        setOrders(JSON.parse(savedOrders));
        setHasSearched(true);
      }
    }
  }, []);

  const validateInput = (): boolean => {
    if (!contactValue.trim()) {
      toast({
        title: "Required",
        description: searchType === 'email' ? "Please enter your email address" : "Please enter your phone number",
        variant: "destructive",
      });
      return false;
    }

    if (searchType === 'email') {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(contactValue.trim())) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return false;
      }
    } else {
      // Normalize phone: handle +63 prefix
      let normalized = contactValue.trim();
      if (normalized.startsWith('+63')) {
        normalized = '0' + normalized.slice(3);
      }
      const digitsOnly = normalized.replace(/[^0-9]/g, '');
      
      if (digitsOnly.length !== 11) {
        toast({
          title: "Invalid Phone",
          description: "Phone number must be exactly 11 digits (e.g., 09171234567)",
          variant: "destructive",
        });
        return false;
      }
      
      if (!digitsOnly.startsWith('09')) {
        toast({
          title: "Invalid Phone",
          description: "Phone number must start with 09",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSearch = async () => {
    if (!validateInput()) return;

    setIsLoading(true);
    try {
      const params = searchType === 'email' 
        ? { p_email: contactValue.trim() }
        : { p_phone: contactValue.trim() };

      const { data, error } = await supabase.rpc('get_orders_by_contact', params);

      if (error) throw error;

      const result = data as unknown as { orders: OrderResult[]; found: boolean };
      setOrders(result.orders || []);
      setHasSearched(true);

      // Save to sessionStorage
      sessionStorage.setItem('myorders_contact', contactValue);
      sessionStorage.setItem('myorders_type', searchType);
      sessionStorage.setItem('myorders_orders', JSON.stringify(result.orders || []));

      if (!result.found) {
        toast({
          title: "No Orders Found",
          description: `No orders found for this ${searchType}`,
        });
      }
    } catch (error: unknown) {
      console.error('Error fetching orders:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch orders",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setContactValue('');
    setOrders([]);
    setHasSearched(false);
    sessionStorage.removeItem('myorders_contact');
    sessionStorage.removeItem('myorders_type');
    sessionStorage.removeItem('myorders_orders');
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        pagePath="/my-orders" 
        fallbackTitle="Track My Orders | American Ribs & Wings"
        fallbackDescription="Track your order history at American Ribs & Wings Floridablanca."
      />
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-lg">Track My Orders</h1>
            <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
          </div>
        </div>
      </header>

      <div className="container px-4 py-6 max-w-2xl mx-auto">
        {/* Search Form */}
        {!hasSearched && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <Package className="h-12 w-12 text-primary mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Find Your Orders</h2>
                <p className="text-muted-foreground text-sm">
                  Enter the email or phone number you used when placing your order
                </p>
              </div>

              {/* Toggle between email and phone */}
              <div className="flex gap-2 mb-4">
                <Button
                  type="button"
                  variant={searchType === 'phone' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSearchType('phone')}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Phone
                </Button>
                <Button
                  type="button"
                  variant={searchType === 'email' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSearchType('email')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="contact">
                    {searchType === 'email' ? 'Email Address' : 'Phone Number'}
                  </Label>
                  <Input
                    id="contact"
                    type={searchType === 'email' ? 'email' : 'tel'}
                    placeholder={searchType === 'email' ? 'your@email.com' : '09171234567'}
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="mt-1"
                  />
                  {searchType === 'phone' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be 11 digits starting with 09 (e.g., 09171234567)
                    </p>
                  )}
                </div>

                <Button 
                  onClick={handleSearch} 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Find My Orders
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {hasSearched && (
          <div className="space-y-4">
            {/* Search info bar */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                {searchType === 'email' ? (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Phone className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">Orders for:</span>
                <span className="font-medium">{contactValue}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Change
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-6 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">No Orders Found</h2>
                  <p className="text-muted-foreground mb-6">
                    We couldn't find any orders with this {searchType}. Try a different one or place your first order!
                  </p>
                  <Button asChild>
                    <Link to="/order">
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Place Your First Order
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {orders.length} order{orders.length !== 1 ? 's' : ''} found
                </p>
                {orders.map((order) => (
                  <Card key={order.id} className="hover:border-primary/50 transition-colors">
                    <Link to={`/order/${order.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-mono font-bold text-primary">
                              {order.order_number}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              {order.created_at && format(new Date(order.created_at), 'MMM d, yyyy')}
                              <Clock className="h-3 w-3 ml-1" />
                              {order.created_at && format(new Date(order.created_at), 'h:mm a')}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={statusColors[order.status || 'pending']}
                          >
                            {statusLabels[order.status || 'pending']}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="capitalize text-muted-foreground">
                              {order.order_type?.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="font-bold">
                            ₱{order.total_amount?.toFixed(2)}
                          </p>
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
