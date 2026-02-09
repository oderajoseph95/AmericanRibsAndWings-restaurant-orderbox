import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, CalendarDays, Users, Phone, Mail, MessageSquare, Clock, Hash, Check, X, CheckCircle, UserX, Loader2, StickyNote, Send, Ticket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/adminLogger';
import { useAuth } from '@/contexts/AuthContext';
import { sendEmailNotification } from '@/hooks/useEmailNotifications';
import { sendSmsNotification } from '@/hooks/useSmsNotifications';
import type { Database } from '@/integrations/supabase/types';

type ReservationStatus = Database['public']['Enums']['reservation_status'];

interface PreorderItem {
  productId: string;
  productName: string;
  quantity: number;
}

// Generate unique confirmation code for customer communication
const generateConfirmationCode = async (): Promise<string> => {
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate code: ARW-RES-XXXXX (5 digits)
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const code = `ARW-RES-${randomNum}`;
    
    // Check if code already exists
    const { data, error } = await supabase
      .from('reservations')
      .select('id')
      .eq('confirmation_code', code)
      .maybeSingle();
    
    if (error) throw error;
    
    // If no existing reservation with this code, it's unique
    if (!data) {
      return code;
    }
  }
  
  throw new Error('Failed to generate unique confirmation code after maximum attempts');
};

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
  const queryClient = useQueryClient();
  const { user, displayName } = useAuth();
  const [noteText, setNoteText] = useState('');

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus }: { newStatus: ReservationStatus }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Only generate confirmation code for pending → confirmed transition
      let confirmationCode: string | undefined;
      if (reservation?.status === 'pending' && newStatus === 'confirmed') {
        confirmationCode = await generateConfirmationCode();
      }

      const updateData: Record<string, unknown> = {
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        status_changed_by: user?.id || null,
      };

      // Only include confirmation_code if we generated one
      if (confirmationCode) {
        updateData.confirmation_code = confirmationCode;
      }

      const { error } = await supabase
        .from('reservations')
        .update(updateData)
        .eq('id', id!);
      
      if (error) throw error;

      // Log admin action
      await logAdminAction({
        action: 'status_change',
        entityType: 'reservation',
        entityId: id,
        entityName: reservation?.reservation_code,
        oldValues: { status: reservation?.status },
        newValues: { status: newStatus, confirmation_code: confirmationCode },
        details: `Changed reservation status from ${reservation?.status} to ${newStatus}${confirmationCode ? ` (Confirmation: ${confirmationCode})` : ''}`,
      });

      // Send customer email notification (only if customer has email and status is confirmed or cancelled)
      if (reservation?.email && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        const emailType = newStatus === 'confirmed' ? 'reservation_confirmed' : 'reservation_cancelled';
        
        // Format date and time for email
        const formattedDate = format(new Date(reservation.reservation_date), 'MMMM d, yyyy');
        const [hours, minutes] = reservation.reservation_time.split(':');
        const timeDate = new Date();
        timeDate.setHours(parseInt(hours), parseInt(minutes));
        const formattedTime = format(timeDate, 'h:mm a');
        
        // Prepare pre-order items
        const preorderItemsData = reservation.preorder_items as unknown as PreorderItem[] | null;
        
        // Send email (fire and forget - don't block status update)
        sendEmailNotification({
          type: emailType,
          recipientEmail: reservation.email,
          reservationId: reservation.id,
          reservationCode: confirmationCode || reservation.confirmation_code || reservation.reservation_code,
          customerName: reservation.name,
          customerPhone: reservation.phone,
          customerEmail: reservation.email,
          reservationDate: formattedDate,
          reservationTime: formattedTime,
          pax: reservation.pax,
          notes: reservation.notes || undefined,
          preorderItems: preorderItemsData?.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
          })),
        }).then(result => {
          if (!result.success) {
            console.error('Failed to send reservation email:', result.error);
          } else {
            console.log('Reservation email sent successfully');
          }
        }).catch(err => {
          console.error('Email notification error:', err);
        });
      }

      // Send customer SMS notification (always - phone is required)
      if (reservation?.phone && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        const smsType = newStatus === 'confirmed' ? 'reservation_confirmed' : 'reservation_cancelled';
        
        // Format date and time for SMS (shorter format)
        const smsFormattedDate = format(new Date(reservation.reservation_date), 'MMM d');
        const [smsHours, smsMinutes] = reservation.reservation_time.split(':');
        const smsTimeDate = new Date();
        smsTimeDate.setHours(parseInt(smsHours), parseInt(smsMinutes));
        const smsFormattedTime = format(smsTimeDate, 'h:mm a');
        
        // Send SMS (fire and forget - don't block status update)
        sendSmsNotification({
          type: smsType,
          recipientPhone: reservation.phone,
          reservationId: reservation.id,
          reservationCode: confirmationCode || reservation.confirmation_code || reservation.reservation_code,
          customerName: reservation.name,
          reservationDate: smsFormattedDate,
          reservationTime: smsFormattedTime,
          pax: reservation.pax,
        }).then(result => {
          if (!result.success) {
            console.error('Failed to send reservation SMS:', result.error);
          } else {
            console.log('Reservation SMS sent successfully');
          }
        }).catch(err => {
          console.error('SMS notification error:', err);
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-reservations'] });
      toast.success('Reservation status updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });

  // Query for internal notes
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['reservation-notes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservation_notes')
        .select('*')
        .eq('reservation_id', id!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Mutation for adding notes
  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) return;
      
      const { error } = await supabase
        .from('reservation_notes')
        .insert({
          reservation_id: id!,
          admin_id: user?.id,
          admin_display_name: displayName || user?.email || 'Admin',
          note_text: noteText.trim(),
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation-notes', id] });
      setNoteText('');
      toast.success('Note added');
    },
    onError: (error: Error) => {
      toast.error('Failed to add note: ' + error.message);
    },
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
            {reservation.confirmation_code && (
              <div className="flex items-center gap-3">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Confirmation Code</p>
                  <p className="font-medium font-mono">{reservation.confirmation_code}</p>
                </div>
              </div>
            )}
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

      {/* Status Actions */}
      {reservation.status !== 'completed' && 
       reservation.status !== 'cancelled' && 
       reservation.status !== 'no_show' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {reservation.status === 'pending' && (
                <>
                  <Button
                    onClick={() => updateStatusMutation.mutate({ newStatus: 'confirmed' })}
                    disabled={updateStatusMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Confirm Reservation
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => updateStatusMutation.mutate({ newStatus: 'cancelled' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Reject
                  </Button>
                </>
              )}
              {reservation.status === 'confirmed' && (
                <>
                  <Button
                    onClick={() => updateStatusMutation.mutate({ newStatus: 'completed' })}
                    disabled={updateStatusMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Mark Completed
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ newStatus: 'no_show' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserX className="h-4 w-4 mr-2" />
                    )}
                    Mark No-Show
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Internal Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-muted-foreground" />
            Internal Notes
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Private notes visible to staff only
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add note form */}
          <div className="space-y-2">
            <Textarea
              placeholder="Add an internal note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[80px] text-sm"
              disabled={addNoteMutation.isPending}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => addNoteMutation.mutate()}
                disabled={!noteText.trim() || addNoteMutation.isPending}
              >
                {addNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Add Note
              </Button>
            </div>
          </div>
          
          {/* Notes list */}
          {notesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : notes.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="bg-muted/50 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs">
                      {note.admin_display_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatCreatedAt(note.created_at || '')}
                    </span>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {note.note_text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              No internal notes yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p>Created {formatCreatedAt(reservation.created_at || '')}</p>
        {reservation.status_changed_at && (
          <p>Status changed {formatCreatedAt(reservation.status_changed_at)}</p>
        )}
      </div>
    </div>
  );
}
