

# Add SMS/Email Notifications for Check-In, No-Show, and Completed

## What's Missing

Currently, when an admin marks a reservation as **Checked In**, **No Show**, or **Completed**, no SMS or email is sent to the customer. Only a system log entry is created. This means customers get no communication for these important status changes.

## Changes

### 1. Add New SMS Types (`src/hooks/useSmsNotifications.ts`)

Add three new SMS types to the `SmsType` union:
- `reservation_checked_in`
- `reservation_no_show`
- `reservation_completed`

### 2. Add Default SMS Messages (`supabase/functions/send-sms-notification/index.ts`)

Add default message templates for the three new types:

- **Check-In**: "Welcome to American Ribs & Wings! You're checked in for your reservation. Code: [code]. Enjoy your meal!"
- **No-Show**: "We missed you! Your reservation [code] on [date] at [time] has been marked as a no-show. We hope to see you next time. - American Ribs & Wings"
- **Completed**: "Thank you for dining with us, [name]! It was wonderful having you. We hope you enjoyed your meal. See you again soon! - American Ribs & Wings"

### 3. Add SMS Templates to Database (Migration)

Insert three new rows into `sms_templates` so admins can customize the content later:
- `reservation_checked_in`
- `reservation_no_show`
- `reservation_completed`

### 4. Expand Notification Triggers in `ReservationDetail.tsx`

Currently lines 277 and 329 only send notifications for `confirmed` or `cancelled`. Expand this to also cover `checked_in`, `no_show`, and `completed`:

- **Email**: Change the condition from `(newStatus === 'confirmed' || newStatus === 'cancelled')` to also include `checked_in`, `no_show`, `completed`
- **SMS**: Same expansion
- Map each status to its correct email/SMS type
- All notifications are logged to `reservation_notifications` for the audit trail (already visible in Reservation Details)

### 5. Invalidate Notification Logs on Status Change

After sending notifications, invalidate the `reservation-notifications` query so the Notification History card in Reservation Details updates immediately.

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useSmsNotifications.ts` | Add 3 new SMS types |
| `supabase/functions/send-sms-notification/index.ts` | Add 3 default messages |
| `src/pages/admin/ReservationDetail.tsx` | Expand notification triggers to cover check_in, no_show, completed |
| New migration | Insert 3 new `sms_templates` rows |

### SMS Content

**reservation_checked_in:**
```
Welcome, {{customer_name}}! You're checked in.
Code: {{reservation_code}}
Enjoy your meal at American Ribs & Wings!
```

**reservation_no_show:**
```
Hi {{customer_name}}, we missed you for your reservation ({{reservation_code}}) on {{reservation_date}} at {{reservation_time}}.
We hope to see you next time!
- American Ribs & Wings
```

**reservation_completed:**
```
Thank you for dining with us, {{customer_name}}!
It was wonderful having you and your group of {{pax}}.
We hope to see you again soon!
- American Ribs & Wings
```

### Notification Flow for Each Status

**Check-In**: Admin clicks "Check In" -> SMS + Email sent to customer -> Admin copy SMS -> Logged to reservation_notifications

**No-Show**: Admin clicks "No Show" -> SMS + Email sent to customer -> Admin copy SMS -> Logged to reservation_notifications

**Completed**: Admin clicks "Complete" -> SMS + Email sent to customer (thank-you message) -> Admin copy SMS -> Logged to reservation_notifications

All of these will appear in the Notification History card that already exists in Reservation Details.

