import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, CalendarDays, Users, Phone, Mail, MessageSquare, Clock, Hash, Check, X, CheckCircle, UserX, Loader2, StickyNote, Send, Ticket, RefreshCw, History } from 'lucide-react';
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
import { useReservationSettings, DEFAULT_RESERVATION_SETTINGS } from '@/hooks/useReservationSettings';
import { ReservationTimeline, type TimelineEvent } from '@/components/admin/ReservationTimeline';
import type { Database } from '@/integrations/supabase/types';

type ReservationStatus = Database['public']['Enums']['reservation_status'];

interface PreorderItem {
  productId: string;
  productName: string;
  quantity: number;
}

// NOTE: We use a SINGLE code system - reservation_code is THE code for everything.
// No separate confirmation_code is generated. The reservation_code assigned at creation is used throughout.

const statusColors: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-700 border-green-500/30',
  checked_in: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-700 border-red-500/30',
  cancelled_by_customer: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
  completed: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  no_show: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const statusLabels: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  cancelled: 'Cancelled',
  cancelled_by_customer: 'Cancelled by Customer',
  completed: 'Completed',
  no_show: 'No Show',
};

// Helper to log reservation notification to the audit table
const logReservationNotification = async ({
  reservationId,
  channel,
  recipient,
  status,
  triggerType,
  messageType,
  errorMessage,
  adminId,
}: {
  reservationId: string;
  channel: 'email' | 'sms';
  recipient: string;
  status: 'sent' | 'failed';
  triggerType: 'automatic' | 'manual';
  messageType: string;
  errorMessage?: string;
  adminId?: string;
}) => {
  try {
    await supabase.from('reservation_notifications').insert({
      reservation_id: reservationId,
      channel,
      recipient,
      status,
      trigger_type: triggerType,
      message_type: messageType,
      error_message: errorMessage || null,
      sent_by_admin_id: adminId || null,
    });
  } catch (err) {
    console.error('Failed to log reservation notification:', err);
  }
};

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user, displayName } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendingSms, setResendingSms] = useState(false);

  // Fetch reservation settings
  const { data: reservationSettings } = useReservationSettings();

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
      
      // SINGLE CODE SYSTEM: Use reservation_code for everything, no separate confirmation code
      const reservationCode = reservation?.reservation_code;

      const updateData: Record<string, unknown> = {
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        status_changed_by: user?.id || null,
      };

      // Track check-in with dedicated columns
      if (newStatus === 'checked_in') {
        updateData.checked_in_at = new Date().toISOString();
        updateData.checked_in_by = user?.id || null;
      }

      // Track completion with dedicated columns (R5.2)
      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = user?.id || null;
      }

      const { error } = await supabase
        .from('reservations')
        .update(updateData)
        .eq('id', id!);
      
      if (error) throw error;

      // Log admin action
      const actionType = newStatus === 'checked_in' 
        ? 'reservation_checked_in' 
        : newStatus === 'completed'
          ? 'reservation_completed'
          : 'status_change';
      await logAdminAction({
        action: actionType,
        entityType: 'reservation',
        entityId: id,
        entityName: reservationCode,
        oldValues: { status: reservation?.status },
        newValues: { status: newStatus },
        details: newStatus === 'checked_in' 
          ? 'Customer physically arrived and was checked in'
          : newStatus === 'completed'
            ? 'Reservation service completed'
            : `Changed reservation status from ${reservation?.status} to ${newStatus}`,
      });

      // Log check-in to reservation_notifications for timeline
      if (newStatus === 'checked_in' && reservation) {
        await supabase.from('reservation_notifications').insert({
          reservation_id: reservation.id,
          channel: 'system',
          recipient: 'internal',
          status: 'sent',
          trigger_type: 'manual',
          message_type: 'check_in',
        });
      }

      // Log completion to reservation_notifications for timeline (R5.2)
      if (newStatus === 'completed' && reservation) {
        await supabase.from('reservation_notifications').insert({
          reservation_id: reservation.id,
          channel: 'system',
          recipient: 'internal',
          status: 'sent',
          trigger_type: 'manual',
          message_type: 'completed',
        });
      }

      // REMINDER SCHEDULING LOGIC - 6 intervals: 12h, 6h, 3h, 1h, 30min, 15min
      if (newStatus === 'confirmed' && reservation) {
        // Schedule reminders when reservation is confirmed
        try {
          // Parse reservation datetime
          const [hours, minutes] = reservation.reservation_time.split(':');
          const reservationDateTime = new Date(reservation.reservation_date);
          reservationDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          
          const now = new Date();
          
          // All 6 reminder intervals
          const reminderIntervals = [
            { hours: 12, minutes: 0, type: '12h' },
            { hours: 6, minutes: 0, type: '6h' },
            { hours: 3, minutes: 0, type: '3h' },
            { hours: 1, minutes: 0, type: '1h' },
            { hours: 0, minutes: 30, type: '30min' },
            { hours: 0, minutes: 15, type: '15min' },
          ];
          
          const remindersToInsert = [];
          
          for (const interval of reminderIntervals) {
            const reminderTime = new Date(reservationDateTime);
            reminderTime.setHours(reminderTime.getHours() - interval.hours);
            reminderTime.setMinutes(reminderTime.getMinutes() - interval.minutes);
            
            // Only schedule if reminder time is in the future
            if (reminderTime > now) {
              remindersToInsert.push({
                reservation_id: reservation.id,
                reminder_type: interval.type,
                scheduled_for: reminderTime.toISOString(),
                status: 'pending',
              });
            }
          }
          
          console.log(`Scheduling ${remindersToInsert.length} reminders for reservation ${reservation.id}`);
          
          // Insert all future reminders
          if (remindersToInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('reservation_reminders')
              .upsert(remindersToInsert, { onConflict: 'reservation_id,reminder_type' });
            
            if (insertError) {
              console.error('Error inserting reminders:', insertError);
            } else {
              console.log(`Successfully scheduled ${remindersToInsert.length} reminders`);
            }
          }
          
          // If reservation is very soon (less than 15 min), trigger immediate reminder
          const minutesUntilReservation = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60);
          if (minutesUntilReservation > 0 && minutesUntilReservation < 15) {
            console.log('Reservation is within 15 minutes - triggering immediate reminder');
            supabase.functions.invoke('send-reservation-reminder', { body: {} })
              .then(() => console.log('Immediate reminder triggered'))
              .catch(err => console.error('Failed to trigger immediate reminder:', err));
          }
        } catch (reminderError) {
          console.error('Error scheduling reminders:', reminderError);
          // Don't fail the status update if reminder scheduling fails
        }
      } else if ((newStatus === 'cancelled' || newStatus === 'cancelled_by_customer' || newStatus === 'no_show') && reservation) {
        // Cancel pending reminders when reservation is cancelled or marked no-show
        try {
          const { error: cancelError } = await supabase
            .from('reservation_reminders')
            .update({ status: 'cancelled' })
            .eq('reservation_id', reservation.id)
            .eq('status', 'pending');
          
          if (cancelError) {
            console.error('Error cancelling reminders:', cancelError);
          } else {
            console.log('Cancelled pending reminders for reservation');
          }
        } catch (reminderError) {
          console.error('Error cancelling reminders:', reminderError);
        }
      }

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
          reservationCode: reservation.reservation_code,
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
          // Log to reservation_notifications audit table
          logReservationNotification({
            reservationId: reservation.id,
            channel: 'email',
            recipient: reservation.email!,
            status: result.success ? 'sent' : 'failed',
            triggerType: 'automatic',
            messageType: emailType,
            errorMessage: result.error,
          });
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
          reservationCode: reservation.reservation_code,
          customerName: reservation.name,
          reservationDate: smsFormattedDate,
          reservationTime: smsFormattedTime,
          pax: reservation.pax,
        }).then(result => {
          // Log to reservation_notifications audit table
          logReservationNotification({
            reservationId: reservation.id,
            channel: 'sms',
            recipient: reservation.phone,
            status: result.success ? 'sent' : 'failed',
            triggerType: 'automatic',
            messageType: smsType,
            errorMessage: result.error,
          });
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

  // Query for notification history
  const { data: notificationLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['reservation-notifications', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservation_notifications')
        .select('*')
        .eq('reservation_id', id!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Query for check-in admin name (only when reservation has checked_in_by)
  const { data: checkedInByAdmin } = useQuery({
    queryKey: ['checked-in-by-admin', reservation?.checked_in_by],
    queryFn: async () => {
      if (!reservation?.checked_in_by) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('display_name, username')
        .eq('user_id', reservation.checked_in_by)
        .maybeSingle();
      
      if (error) throw error;
      return data?.display_name || data?.username || 'Admin';
    },
    enabled: !!reservation?.checked_in_by,
  });

  // Query for completion admin name (only when reservation has completed_by) - R5.2
  const { data: completedByAdmin } = useQuery({
    queryKey: ['completed-by-admin', reservation?.completed_by],
    queryFn: async () => {
      if (!reservation?.completed_by) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('display_name, username')
        .eq('user_id', reservation.completed_by)
        .maybeSingle();
      
      if (error) throw error;
      return data?.display_name || data?.username || 'Admin';
    },
    enabled: !!reservation?.completed_by,
  });

  // Query for timeline events - R5.3
  const { data: timelineEvents = [], isLoading: timelineLoading, error: timelineError } = useQuery({
    queryKey: ['reservation-timeline', id],
    queryFn: async () => {
      if (!reservation) return [];
      
      // 1. Get admin logs for this reservation
      const { data: adminLogs, error: logsError } = await supabase
        .from('admin_logs')
        .select('id, action, created_at, display_name, details, old_values, new_values')
        .eq('entity_type', 'reservation')
        .eq('entity_id', id!)
        .order('created_at', { ascending: true });
      
      if (logsError) throw logsError;
      
      // 2. Get system notifications for this reservation (for reminders and auto-closures)
      const { data: notifications, error: notifError } = await supabase
        .from('reservation_notifications')
        .select('id, created_at, channel, message_type, trigger_type')
        .eq('reservation_id', id!)
        .order('created_at', { ascending: true });
      
      if (notifError) throw notifError;
      
      // 3. Build unified timeline
      const events: TimelineEvent[] = [];
      
      // Add reservation creation event
      if (reservation?.created_at) {
        events.push({
          id: 'creation',
          timestamp: reservation.created_at,
          eventType: 'created',
          triggerSource: 'customer',
        });
      }
      
      // Map admin logs to timeline events
      adminLogs?.forEach(log => {
        let eventType: TimelineEvent['eventType'] | null = null;
        let details: string | undefined;
        
        // Parse action type
        if (log.action === 'reservation_checked_in') {
          eventType = 'checked_in';
        } else if (log.action === 'reservation_completed') {
          eventType = 'completed';
        } else if (log.action === 'status_change') {
          const newStatus = (log.new_values as Record<string, unknown>)?.status;
          if (newStatus === 'confirmed') {
            eventType = 'confirmed';
          } else if (newStatus === 'cancelled') {
            eventType = 'rejected';
          } else if (newStatus === 'no_show') {
            eventType = 'no_show';
          }
        } else if (log.action === 'resend_email' || log.action === 'resend_sms') {
          eventType = 'notification_sent';
          details = log.action === 'resend_email' ? 'Email resent' : 'SMS resent';
        }
        
        if (eventType) {
          events.push({
            id: log.id,
            timestamp: log.created_at || new Date().toISOString(),
            eventType,
            triggerSource: 'admin',
            adminName: log.display_name || undefined,
            details,
          });
        }
      });
      
      // Map system notifications (reminders and auto-closures only)
      notifications?.forEach(notif => {
        // Skip check_in and completed from notifications - they're already in admin_logs
        if (notif.message_type === 'check_in' || notif.message_type === 'completed') {
          return;
        }
        
        let eventType: TimelineEvent['eventType'] | null = null;
        let details: string | undefined;
        
        if (notif.message_type === 'no_show_auto_closure') {
          eventType = 'no_show';
          details = 'Auto-closed due to no-show';
        } else if (notif.message_type?.includes('reminder')) {
          eventType = 'reminder_sent';
          // Extract reminder type from message_type (e.g., "reminder_24h" → "24h reminder")
          const match = notif.message_type.match(/reminder_(\d+h?)/);
          if (match) {
            details = `${match[1]} reminder`;
          }
        }
        
        if (eventType) {
          events.push({
            id: notif.id,
            timestamp: notif.created_at || new Date().toISOString(),
            eventType,
            triggerSource: 'system',
            details,
          });
        }
      });
      
      // Add customer cancellation if applicable
      if (reservation.status === 'cancelled_by_customer' && reservation.status_changed_at) {
        // Check if this wasn't logged in admin_logs
        const hasCancellationLog = adminLogs?.some(
          log => log.action === 'status_change' && 
                 (log.new_values as Record<string, unknown>)?.status === 'cancelled_by_customer'
        );
        
        if (!hasCancellationLog) {
          events.push({
            id: 'customer-cancellation',
            timestamp: reservation.status_changed_at,
            eventType: 'cancelled_by_customer',
            triggerSource: 'customer',
          });
        }
      }
      
      // Sort by timestamp ascending (oldest first)
      return events.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    },
    enabled: !!id && !!reservation,
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

  // Resend Email Handler
  const handleResendEmail = async () => {
    if (!reservation?.email) return;
    
    setResendingEmail(true);
    try {
      const emailType = reservation.status === 'confirmed' 
        ? 'reservation_confirmed' 
        : 'reservation_cancelled';
      
      const formattedDate = format(new Date(reservation.reservation_date), 'MMMM d, yyyy');
      const formattedTime = formatTime(reservation.reservation_time);
      
      const preorderItemsData = reservation.preorder_items as unknown as PreorderItem[] | null;
      
      const result = await sendEmailNotification({
        type: emailType,
        recipientEmail: reservation.email,
        reservationId: reservation.id,
        reservationCode: reservation.confirmation_code || reservation.reservation_code,
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
      });
      
      // Log to reservation_notifications audit table
      await logReservationNotification({
        reservationId: reservation.id,
        channel: 'email',
        recipient: reservation.email,
        status: result.success ? 'sent' : 'failed',
        triggerType: 'manual',
        messageType: emailType,
        errorMessage: result.error,
        adminId: user?.id,
      });
      
      await logAdminAction({
        action: 'resend_email',
        entityType: 'reservation',
        entityId: reservation.id,
        entityName: reservation.reservation_code,
        details: `Resent ${emailType} email to ${reservation.email}`,
        newValues: { channel: 'email', status: result.success ? 'sent' : 'failed' },
      });
      
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['reservation-notifications', id] });
        toast.success('Email resent successfully');
      } else {
        toast.error('Failed to resend email: ' + result.error);
      }
    } catch (err) {
      toast.error('Failed to resend email');
      console.error('Resend email error:', err);
    } finally {
      setResendingEmail(false);
    }
  };

  // Resend SMS Handler
  const handleResendSms = async () => {
    if (!reservation?.phone) return;
    
    setResendingSms(true);
    try {
      const smsType = reservation.status === 'confirmed' 
        ? 'reservation_confirmed' 
        : 'reservation_cancelled';
      
      const smsFormattedDate = format(new Date(reservation.reservation_date), 'MMM d');
      const smsFormattedTime = formatTime(reservation.reservation_time);
      
      const result = await sendSmsNotification({
        type: smsType,
        recipientPhone: reservation.phone,
        reservationId: reservation.id,
        reservationCode: reservation.confirmation_code || reservation.reservation_code,
        customerName: reservation.name,
        reservationDate: smsFormattedDate,
        reservationTime: smsFormattedTime,
        pax: reservation.pax,
      });
      
      // Log to reservation_notifications audit table
      await logReservationNotification({
        reservationId: reservation.id,
        channel: 'sms',
        recipient: reservation.phone,
        status: result.success ? 'sent' : 'failed',
        triggerType: 'manual',
        messageType: smsType,
        errorMessage: result.error,
        adminId: user?.id,
      });
      
      await logAdminAction({
        action: 'resend_sms',
        entityType: 'reservation',
        entityId: reservation.id,
        entityName: reservation.reservation_code,
        details: `Resent ${smsType} SMS to ${reservation.phone}`,
        newValues: { channel: 'sms', status: result.success ? 'sent' : 'failed' },
      });
      
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['reservation-notifications', id] });
        toast.success('SMS resent successfully');
      } else {
        toast.error('Failed to resend SMS: ' + result.error);
      }
    } catch (err) {
      toast.error('Failed to resend SMS');
      console.error('Resend SMS error:', err);
    } finally {
      setResendingSms(false);
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
            {/* Check-in Attribution */}
            {reservation.checked_in_at && (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Checked In</p>
                  <p className="font-medium">
                    {format(new Date(reservation.checked_in_at), 'h:mm a')}
                    {checkedInByAdmin && ` by ${checkedInByAdmin}`}
                  </p>
                </div>
              </div>
            )}
            {/* Completion Attribution - R5.2 */}
            {reservation.completed_at && (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="font-medium">
                    {format(new Date(reservation.completed_at), 'h:mm a')}
                    {completedByAdmin && ` by ${completedByAdmin}`}
                  </p>
                </div>
              </div>
            )}
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
       reservation.status !== 'no_show' && 
       reservation.status !== 'cancelled_by_customer' && (
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
                    onClick={() => updateStatusMutation.mutate({ newStatus: 'checked_in' })}
                    disabled={updateStatusMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Check In
                  </Button>
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
              {reservation.status === 'checked_in' && (
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
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resend Notifications */}
      {(reservation.status === 'confirmed' || reservation.status === 'cancelled') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              Resend Notifications
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Re-send confirmation messages to customer
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {reservation.email && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendEmail}
                  disabled={resendingEmail}
                >
                  {resendingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Resend Email
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendSms}
                disabled={resendingSms}
              >
                {resendingSms ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Resend SMS
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notification History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Notification History
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Audit log of all emails and SMS sent for this reservation
          </p>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : notificationLogs.length > 0 ? (
            <div className="space-y-2">
              {notificationLogs.map((log) => (
                <div 
                  key={log.id}
                  className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm"
                >
                  {/* Channel Badge */}
                  <Badge variant="outline" className={
                    log.channel === 'email' 
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' 
                      : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                  }>
                    {log.channel === 'email' ? (
                      <Mail className="h-3 w-3 mr-1" />
                    ) : (
                      <MessageSquare className="h-3 w-3 mr-1" />
                    )}
                    {log.channel === 'email' ? 'Email' : 'SMS'}
                  </Badge>
                  
                  {/* Status Badge */}
                  <Badge variant="outline" className={
                    log.status === 'sent' 
                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' 
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                  }>
                    {log.status === 'sent' ? 'Sent' : 'Failed'}
                  </Badge>
                  
                  {/* Trigger Type Badge */}
                  <Badge variant="secondary" className="text-xs">
                    {log.trigger_type === 'automatic' ? 'Auto' : 'Manual'}
                  </Badge>
                  
                  {/* Recipient */}
                  <span className="text-muted-foreground">
                    → {log.recipient}
                  </span>
                  
                  {/* Timestamp */}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(log.created_at), 'MMM d, h:mm a')}
                  </span>
                  
                  {/* Error message if failed */}
                  {log.status === 'failed' && log.error_message && (
                    <div className="w-full mt-1 text-xs text-destructive">
                      Error: {log.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notifications have been sent for this reservation.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Timeline - R5.3 */}
      <ReservationTimeline 
        events={timelineEvents}
        isLoading={timelineLoading}
        error={timelineError}
      />

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
