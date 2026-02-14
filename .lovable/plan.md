

# Add Manual Reminder Button and Scheduled Reminders Display

## Changes to `src/pages/admin/ReservationDetail.tsx`

### 1. New Query: Fetch Scheduled Reminders
Add a query to fetch all `reservation_reminders` rows for this reservation, ordered by `scheduled_for`. This shows admins the full reminder schedule with statuses (pending, sent, failed, cancelled).

### 2. "Send Reminder Now" Button
Add a button in the Actions/Notifications area for confirmed reservations that:
- Sends an immediate SMS reminder to the customer with clear reminder content (e.g., "REMINDER: Your reservation is today/on [date] at [time] for [pax] guests. Code: [code]")
- Logs the notification to `reservation_notifications` audit table
- Logs the admin action to `admin_logs`
- Shows loading state while sending
- Only visible when reservation status is `confirmed`

### 3. Scheduled Reminders Card
A new card section (placed before Notification History) displaying all reminder entries:
- Shows each reminder type (12h, 6h, 3h, 1h, 30min, 15min)
- Status badge: Pending (yellow), Sent (green), Failed (red), Cancelled (gray)
- Scheduled time formatted nicely
- Sent time if already sent
- Error message if failed

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/pages/admin/ReservationDetail.tsx` | Add reminders query, "Send Reminder Now" button, Scheduled Reminders card |

### New State Variables
- `sendingReminder` (boolean) - loading state for manual reminder button

### New Query
```typescript
const { data: scheduledReminders = [] } = useQuery({
  queryKey: ['reservation-reminders', id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('reservation_reminders')
      .select('*')
      .eq('reservation_id', id!)
      .order('scheduled_for', { ascending: true });
    if (error) throw error;
    return data;
  },
  enabled: !!id,
});
```

### Manual Reminder Handler
- Calls `sendSmsNotification` with type `reservation_reminder` and clear reminder message content
- The edge function `send-sms-notification` already supports `reservation_reminder` type
- Logs to both `reservation_notifications` and `admin_logs`
- Invalidates the reminders and notifications queries on success

### Scheduled Reminders Card UI
- Table/list showing: Reminder Type | Scheduled For | Status | Sent At
- Color-coded status badges
- Placed between "Resend Notifications" and "Notification History" cards
- Only shown for confirmed/checked_in reservations or when reminders exist

### Import Addition
- Add `Bell` icon from lucide-react for the reminder sections

