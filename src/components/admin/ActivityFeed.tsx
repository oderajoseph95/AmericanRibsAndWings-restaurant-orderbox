import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, CheckCircle, Truck, XCircle, CreditCard } from 'lucide-react';

interface ActivityOrder {
  id: string;
  order_number: string | null;
  status: string | null;
  status_changed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface ActivityFeedProps {
  orders: ActivityOrder[];
  limit?: number;
}

const statusConfig: Record<string, { label: string; icon: typeof Package; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', icon: Clock, variant: 'secondary' },
  for_verification: { label: 'Awaiting Verification', icon: CreditCard, variant: 'outline' },
  approved: { label: 'Approved', icon: CheckCircle, variant: 'default' },
  preparing: { label: 'Preparing', icon: Package, variant: 'default' },
  ready_for_pickup: { label: 'Ready', icon: Package, variant: 'default' },
  waiting_for_rider: { label: 'Waiting for Rider', icon: Truck, variant: 'outline' },
  picked_up: { label: 'Picked Up', icon: Truck, variant: 'default' },
  in_transit: { label: 'In Transit', icon: Truck, variant: 'default' },
  delivered: { label: 'Delivered', icon: CheckCircle, variant: 'default' },
  completed: { label: 'Completed', icon: CheckCircle, variant: 'default' },
  rejected: { label: 'Rejected', icon: XCircle, variant: 'destructive' },
  cancelled: { label: 'Cancelled', icon: XCircle, variant: 'destructive' },
};

export function ActivityFeed({ orders, limit = 5 }: ActivityFeedProps) {
  const recentOrders = orders
    .sort((a, b) => new Date(b.status_changed_at || b.updated_at || b.created_at!).getTime() - 
                    new Date(a.status_changed_at || a.updated_at || a.created_at!).getTime())
    .slice(0, limit);

  if (recentOrders.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentOrders.map((order) => {
        const config = statusConfig[order.status || 'pending'];
        const Icon = config?.icon || Package;
        const timeAgo = order.status_changed_at || order.updated_at || order.created_at;
        
        return (
          <div 
            key={order.id} 
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {order.order_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo ? format(new Date(timeAgo), 'MMM d, h:mm a') : 'Unknown'}
              </p>
            </div>
            <Badge variant={config?.variant || 'secondary'} className="flex-shrink-0">
              {config?.label || order.status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
