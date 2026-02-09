import { format } from 'date-fns';
import { 
  Plus, 
  CheckCircle, 
  XCircle, 
  UserCheck, 
  UserX, 
  Bell, 
  Send,
  Clock,
  type LucideIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  eventType: 
    | 'created'
    | 'confirmed'
    | 'rejected'
    | 'cancelled_by_customer'
    | 'checked_in'
    | 'completed'
    | 'no_show'
    | 'notification_sent'
    | 'reminder_sent';
  triggerSource: 'system' | 'admin' | 'customer';
  adminName?: string;
  details?: string;
}

interface EventConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const eventConfig: Record<string, EventConfig> = {
  created: { 
    label: 'Reservation Created', 
    icon: Plus, 
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800'
  },
  confirmed: { 
    label: 'Confirmed', 
    icon: CheckCircle, 
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30'
  },
  rejected: { 
    label: 'Rejected', 
    icon: XCircle, 
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30'
  },
  cancelled_by_customer: { 
    label: 'Cancelled by Customer', 
    icon: XCircle, 
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30'
  },
  checked_in: { 
    label: 'Checked In', 
    icon: UserCheck, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
  completed: { 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30'
  },
  no_show: { 
    label: 'Marked as No-Show', 
    icon: UserX, 
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-800'
  },
  reminder_sent: { 
    label: 'Reminder Sent', 
    icon: Bell, 
    color: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30'
  },
  notification_sent: { 
    label: 'Notification Sent', 
    icon: Send, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
};

const getAttributionText = (event: TimelineEvent): string => {
  switch (event.triggerSource) {
    case 'admin':
      return event.adminName 
        ? `by Admin (${event.adminName})` 
        : 'by Admin';
    case 'system':
      return event.details ? `by System (${event.details})` : 'by System';
    case 'customer':
      return 'by Customer';
    default:
      return '';
  }
};

interface ReservationTimelineProps {
  events: TimelineEvent[];
  isLoading?: boolean;
  error?: Error | null;
}

export function ReservationTimeline({ events, isLoading, error }: ReservationTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Timeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Chronological history of this reservation
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive text-center py-4">
            Failed to load timeline. Please try refreshing the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No timeline events recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Timeline
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Chronological history of this reservation
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line connecting events */}
          <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-border" />
          
          <div className="space-y-6">
            {events.map((event, index) => {
              const config = eventConfig[event.eventType] || {
                label: event.eventType,
                icon: Clock,
                color: 'text-gray-500',
                bgColor: 'bg-gray-100 dark:bg-gray-800'
              };
              const Icon = config.icon;
              const isAdminAction = event.triggerSource === 'admin';
              const isLastEvent = index === events.length - 1;
              
              return (
                <div key={event.id} className="relative flex gap-4">
                  {/* Icon circle */}
                  <div 
                    className={`
                      relative z-10 flex items-center justify-center w-8 h-8 rounded-full shrink-0
                      ${isAdminAction ? config.bgColor : 'bg-muted border-2 border-background'}
                      ${isAdminAction ? 'ring-2 ring-background' : ''}
                    `}
                  >
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  
                  {/* Content */}
                  <div className={`flex-1 min-w-0 ${isLastEvent ? '' : 'pb-2'}`}>
                    <p className={`font-medium ${config.color}`}>
                      {config.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.timestamp), 'MMM d, yyyy \'at\' h:mm a')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getAttributionText(event)}
                    </p>
                    {event.details && event.triggerSource !== 'system' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
