import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  ArrowRight, 
  Package, 
  Loader2,
  Calendar,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Order = Tables<'orders'>;

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
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="container px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-lg">My Orders</h1>
            <p className="text-xs text-muted-foreground">American Ribs & Wings</p>
          </div>
        </div>
      </header>

      <div className="container px-4 py-6 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-6 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Orders Yet</h2>
              <p className="text-muted-foreground mb-6">
                You haven't placed any orders yet. Start ordering to see your order history here!
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
          <div className="space-y-4">
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
    </div>
  );
}