import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, CalendarDays, Users, Phone, Mail, MessageSquare, Clock, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Database } from '@/integrations/supabase/types';

type ReservationStatus = Database['public']['Enums']['reservation_status'];

interface PreorderItem {
  productId: string;
  productName: string;
  quantity: number;
}

const statusColors: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-700 border-red-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  no_show: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
};

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: reservation, isLoading, error } = useQuery({
    queryKey: ['admin-reservation', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const formatTime = (time: string) => {
    try {
      const [hours, minutes] = time.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return format(date, 'h:mm a');
    } catch {
      return time;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatCreatedAt = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return formatDistanceToNow(date, { addSuffix: true });
      }
      return format(date, 'MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Not found state
  if (error || !reservation) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold mb-2">Reservation not found</h2>
        <p className="text-muted-foreground mb-4">
          The reservation you're looking for doesn't exist or has been removed.
        </p>
        <Button asChild>
          <Link to="/admin/reservations">Back to Reservations</Link>
        </Button>
      </div>
    );
  }

  const preorderItems = reservation.preorder_items as unknown as PreorderItem[] | null;
  const hasPreorders = preorderItems && preorderItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/reservations">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Reservation Details</h1>
            <p className="text-muted-foreground text-sm">{reservation.reservation_code}</p>
          </div>
        </div>
        <Badge variant="outline" className={`${statusColors[reservation.status]} border w-fit`}>
          {statusLabels[reservation.status]}
        </Badge>
      </div>

      {/* Reservation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Reservation Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Reservation Code</p>
                <p className="font-medium">{reservation.reservation_code}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{formatDate(reservation.reservation_date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Time</p>
                <p className="font-medium">{formatTime(reservation.reservation_time)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Party Size</p>
                <p className="font-medium">{reservation.pax} {reservation.pax === 1 ? 'guest' : 'guests'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Customer Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{reservation.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{reservation.phone}</p>
              </div>
            </div>
            {reservation.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{reservation.email}</p>
                </div>
              </div>
            )}
          </div>
          {reservation.notes && (
            <div className="pt-2 border-t">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="font-medium">{reservation.notes}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pre-Order Selections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pre-order Selections</CardTitle>
          <p className="text-sm text-muted-foreground">(Not paid - for reference only)</p>
        </CardHeader>
        <CardContent>
          {hasPreorders ? (
            <ul className="space-y-2">
              {preorderItems.map((item, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium">{item.quantity}x</span>
                  <span>{item.productName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No pre-orders selected</p>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <div className="text-sm text-muted-foreground">
        Created {formatCreatedAt(reservation.created_at || '')}
        {reservation.updated_at && reservation.updated_at !== reservation.created_at && (
          <span> · Updated {formatCreatedAt(reservation.updated_at)}</span>
        )}
      </div>
    </div>
  );
}
