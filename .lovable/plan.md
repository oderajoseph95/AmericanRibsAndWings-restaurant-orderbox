

# ISSUE R3.5 — Admin Triggered Resend (Email & SMS)

## Overview

Add "Resend Email" and "Resend SMS" buttons to the admin reservation detail page, allowing staff to manually re-send confirmation or rejection messages without changing the reservation status.

---

## Current System Analysis

### Existing Infrastructure
- **Email Hook**: `sendEmailNotification()` in `src/hooks/useEmailNotifications.ts`
- **SMS Hook**: `sendSmsNotification()` in `src/hooks/useSmsNotifications.ts`
- **Email Types**: `reservation_confirmed`, `reservation_cancelled` already exist
- **SMS Types**: `reservation_confirmed`, `reservation_cancelled` already exist
- **Admin Logger**: `logAdminAction()` available for logging resend attempts

### Existing Page Structure
The `ReservationDetail.tsx` page has these sections:
1. Header with status badge
2. Reservation Summary card
3. Customer Information card
4. Pre-Order Selections card
5. Actions card (status buttons - only for pending/confirmed)
6. Internal Notes card
7. Metadata footer

---

## Technical Implementation

### 1. Add State for Resend Loading

**File: `src/pages/admin/ReservationDetail.tsx`**

Add loading states for resend buttons:
```typescript
const [resendingEmail, setResendingEmail] = useState(false);
const [resendingSms, setResendingSms] = useState(false);
```

---

### 2. Create Resend Handler Functions

Add two async handler functions:

**Resend Email Handler:**
```typescript
const handleResendEmail = async () => {
  if (!reservation?.email) return;
  
  setResendingEmail(true);
  try {
    const emailType = reservation.status === 'confirmed' 
      ? 'reservation_confirmed' 
      : 'reservation_cancelled';
    
    // Format date and time
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
    
    // Log admin action
    await logAdminAction({
      action: 'resend_email',
      entityType: 'reservation',
      entityId: reservation.id,
      entityName: reservation.reservation_code,
      details: `Resent ${emailType} email to ${reservation.email}`,
      newValues: { channel: 'email', status: result.success ? 'sent' : 'failed' },
    });
    
    if (result.success) {
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
```

**Resend SMS Handler:**
```typescript
const handleResendSms = async () => {
  if (!reservation?.phone) return;
  
  setResendingSms(true);
  try {
    const smsType = reservation.status === 'confirmed' 
      ? 'reservation_confirmed' 
      : 'reservation_cancelled';
    
    // Format date and time for SMS
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
    
    // Log admin action
    await logAdminAction({
      action: 'resend_sms',
      entityType: 'reservation',
      entityId: reservation.id,
      entityName: reservation.reservation_code,
      details: `Resent ${smsType} SMS to ${reservation.phone}`,
      newValues: { channel: 'sms', status: result.success ? 'sent' : 'failed' },
    });
    
    if (result.success) {
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
```

---

### 3. Add Resend Notifications Card

Add a new Card component after the Status Actions card and before Internal Notes. This card only appears for `confirmed` or `cancelled` statuses.

```tsx
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
        {/* Resend Email - only if email exists */}
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
        
        {/* Resend SMS - always visible (phone is required) */}
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
```

---

### 4. Add Required Import

Add `RefreshCw` to the lucide-react imports:
```typescript
import { ArrowLeft, CalendarDays, Users, Phone, Mail, MessageSquare, Clock, Hash, Check, X, CheckCircle, UserX, Loader2, StickyNote, Send, Ticket, RefreshCw } from 'lucide-react';
```

---

## UI Placement

```text
┌─────────────────────────────────────┐
│ ← Reservation Details      [Status] │
├─────────────────────────────────────┤
│ Reservation Summary Card            │
├─────────────────────────────────────┤
│ Customer Information Card           │
├─────────────────────────────────────┤
│ Pre-Order Selections Card           │
├─────────────────────────────────────┤
│ Actions Card (if pending/confirmed) │
├─────────────────────────────────────┤
│ 🔄 Resend Notifications Card  ← NEW │
│    [Resend Email] [Resend SMS]      │
├─────────────────────────────────────┤
│ Internal Notes Card                 │
├─────────────────────────────────────┤
│ Metadata                            │
└─────────────────────────────────────┘
```

---

## Visibility Rules

| Status | Resend Email | Resend SMS |
|--------|--------------|------------|
| pending | Hidden (card not shown) | Hidden (card not shown) |
| confirmed | Visible if email exists | Always visible |
| cancelled | Visible if email exists | Always visible |
| completed | Hidden (card not shown) | Hidden (card not shown) |
| no_show | Hidden (card not shown) | Hidden (card not shown) |

---

## Logging

Each resend attempt is logged via `logAdminAction()` with:
- `action`: 'resend_email' or 'resend_sms'
- `entityType`: 'reservation'
- `entityId`: reservation ID
- `entityName`: reservation code
- `details`: Human-readable description
- `newValues`: { channel, status }

These logs are stored in the `admin_logs` table for audit trail.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/admin/ReservationDetail.tsx` | Add resend state, handlers, and UI card |

---

## Error Handling

1. Button shows loading spinner during send
2. Success toast on successful resend
3. Error toast with message on failure
4. Admin can retry immediately (button re-enabled after attempt)
5. No confirmation modal (one click = one send)
6. Failures logged in admin_logs table

---

## What This Creates

- Resend Email button (visible only if email exists)
- Resend SMS button (always visible for valid statuses)
- Loading states during resend
- Success/error feedback via toast
- Audit logging of all resend attempts
- Subtle, outline-style buttons (not primary CTAs)

---

## What This Does NOT Create

- Message content editing
- Status changes
- Bulk send functionality
- Notification settings UI
- Automatic retry loops
- Confirmation code regeneration

---

## Design Guidelines Applied

- Buttons use `variant="outline"` (subtle, not primary)
- `size="sm"` for compact appearance
- Clear text labels: "Resend Email", "Resend SMS"
- Card has descriptive subtitle explaining purpose
- Recovery tool, not workflow driver

