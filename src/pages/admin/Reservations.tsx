import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { CalendarDays, Users, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MobileCard, MobileCardRow } from '@/components/admin/MobileCard';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Database } from '@/integrations/supabase/types';

type ReservationStatus = Database['public']['Enums']['reservation_status'];

const ITEMS_PER_PAGE = 15;

const statusColors: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-700 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-700 border-red-500/30',
  cancelled_by_customer: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  no_show: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  cancelled_by_customer: 'Cancelled by Customer',
  completed: 'Completed',
  no_show: 'No Show',
};

type DateFilter = 'all' | 'upcoming' | 'today' | 'past';

export default function Reservations() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('upcoming');
  const [currentPage, setCurrentPage] = useState(1);
  
  const canViewAnalytics = role === 'owner' || role === 'manager';

  const { data: reservationsData, isLoading } = useQuery({
    queryKey: ['admin-reservations', statusFilter, dateFilter, currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('reservations')
        .select('*', { count: 'exact' })
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true })
        .range(from, to);

      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Date filter
      const today = format(new Date(), 'yyyy-MM-dd');
      if (dateFilter === 'upcoming') {
        query = query.gte('reservation_date', today);
      } else if (dateFilter === 'today') {
        query = query.eq('reservation_date', today);
      } else if (dateFilter === 'past') {
        query = query.lt('reservation_date', today);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { reservations: data, totalCount: count || 0 };
    },
  });

  const reservations = reservationsData?.reservations || [];
  const totalCount = reservationsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleRowClick = (id: string) => {
    navigate(`/admin/reservations/${id}`);
  };

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
      return format(new Date(dateStr), 'MMM d, yyyy');
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
      return format(date, 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const StatusBadge = ({ status }: { status: ReservationStatus }) => (
    <Badge variant="outline" className={`${statusColors[status]} border`}>
      {statusLabels[status]}
    </Badge>
  );

  const resetFilters = () => {
    setStatusFilter('all');
    setDateFilter('upcoming');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reservations</h1>
          <p className="text-muted-foreground">Manage table reservations</p>
        </div>
        {canViewAnalytics && (
          <Button variant="outline" asChild>
            <Link to="/admin/reservations/analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Date Filter Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {(['upcoming', 'today', 'past', 'all'] as DateFilter[]).map((filter) => (
            <Button
              key={filter}
              variant={dateFilter === filter ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setDateFilter(filter);
                setCurrentPage(1);
              }}
              className="capitalize"
            >
              {filter === 'all' ? 'All Dates' : filter}
            </Button>
          ))}
        </div>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as ReservationStatus | 'all');
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>

        {(statusFilter !== 'all' || dateFilter !== 'upcoming') && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && reservations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No reservations yet</p>
          <p className="text-sm mt-1">
            Reservations submitted by customers will appear here
          </p>
        </div>
      )}

      {/* Mobile Cards */}
      {!isLoading && reservations.length > 0 && isMobile && (
        <div className="space-y-3">
          {reservations.map((reservation) => (
            <MobileCard
              key={reservation.id}
              onClick={() => handleRowClick(reservation.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold">
                    {formatDate(reservation.reservation_date)} at {formatTime(reservation.reservation_time)}
                  </p>
                  <p className="text-sm text-muted-foreground">{reservation.name}</p>
                </div>
                <StatusBadge status={reservation.status} />
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{reservation.pax} guests</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatCreatedAt(reservation.created_at || '')}
                </span>
              </div>
            </MobileCard>
          ))}
        </div>
      )}

      {/* Desktop Table */}
      {!isLoading && reservations.length > 0 && !isMobile && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Guests</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.map((reservation) => (
                <TableRow
                  key={reservation.id}
                  onClick={() => handleRowClick(reservation.id)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-medium">
                    {formatDate(reservation.reservation_date)}
                  </TableCell>
                  <TableCell>{formatTime(reservation.reservation_time)}</TableCell>
                  <TableCell>{reservation.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{reservation.pax}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={reservation.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatCreatedAt(reservation.created_at || '')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} reservations
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
