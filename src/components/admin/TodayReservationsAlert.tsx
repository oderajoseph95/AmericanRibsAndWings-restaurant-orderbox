import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarCheck, Users, ChevronRight, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Reservation {
  id: string;
  name: string;
  pax: number;
  reservation_time: string;
  status: 'pending' | 'confirmed';
}

export function TodayReservationsAlert() {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem('todayReservationsAlertOpen');
    return stored !== 'false'; // Default to open
  });

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem('todayReservationsAlertOpen', String(isOpen));
  }, [isOpen]);

  const { data: todayReservations = [], isLoading } = useQuery({
    queryKey: ['today-reservations-alert'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('reservations')
        .select('id, name, pax, reservation_time, status')
        .eq('reservation_date', today)
        .in('status', ['pending', 'confirmed'])
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      return (data || []) as Reservation[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const confirmedReservations = todayReservations.filter(r => r.status === 'confirmed');
  const pendingReservations = todayReservations.filter(r => r.status === 'pending');
  const totalGuests = todayReservations.reduce((sum, r) => sum + r.pax, 0);
  const confirmedGuests = confirmedReservations.reduce((sum, r) => sum + r.pax, 0);

  // Don't show if no reservations
  if (!isLoading && todayReservations.length === 0) {
    return null;
  }

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

  const hasPending = pendingReservations.length > 0;

  return (
    <Card className={cn(
      "border-2 transition-all duration-300",
      hasPending 
        ? "border-orange-500/50 bg-gradient-to-r from-orange-500/5 to-amber-500/5" 
        : "border-primary/30 bg-gradient-to-r from-primary/5 to-blue-500/5"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              hasPending ? "bg-orange-500/10" : "bg-primary/10"
            )}>
              <CalendarCheck className={cn(
                "h-5 w-5",
                hasPending ? "text-orange-600" : "text-primary"
              )} />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm sm:text-base">Reservations Today</h3>
              {hasPending && (
                <Badge 
                  variant="outline" 
                  className="bg-orange-500/10 text-orange-700 border-orange-500/30 animate-pulse"
                >
                  {pendingReservations.length} pending
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground mr-2">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {totalGuests} guests
              </span>
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
              <Link to="/admin/reservations?filter=today">
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading reservations...</div>
            ) : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-green-600">{confirmedReservations.length}</span> confirmed ({confirmedGuests} guests)
                  </span>
                  {hasPending && (
                    <span className="flex items-center gap-1 text-orange-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span className="font-medium">{pendingReservations.length}</span> need confirmation
                    </span>
                  )}
                </div>

                {/* Upcoming reservations list */}
                <div className="flex flex-wrap gap-2">
                  {todayReservations.slice(0, 8).map((reservation) => (
                    <Link
                      key={reservation.id}
                      to={`/admin/reservations/${reservation.id}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                        reservation.status === 'pending'
                          ? "bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 border border-orange-500/20"
                          : "bg-green-500/10 text-green-700 hover:bg-green-500/20 border border-green-500/20"
                      )}
                    >
                      <span className="font-semibold">{formatTime(reservation.reservation_time)}</span>
                      <span>-</span>
                      <span className="truncate max-w-[80px]">{reservation.name}</span>
                      <span className="text-muted-foreground">({reservation.pax})</span>
                    </Link>
                  ))}
                  {todayReservations.length > 8 && (
                    <Link
                      to="/admin/reservations?filter=today"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                    >
                      +{todayReservations.length - 8} more
                    </Link>
                  )}
                </div>

                {/* Mobile view all button */}
                <Button variant="outline" size="sm" asChild className="w-full sm:hidden">
                  <Link to="/admin/reservations?filter=today">
                    View All Reservations
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
