
# ISSUE R3.2 — Customer Reservation Confirmation (Email)

## Overview

Send transactional emails to customers when their reservation status changes from `pending` to `confirmed` or `pending` to `cancelled` (rejected). This builds on the confirmation code generation from R3.1 and leverages the existing email notification infrastructure.

---

## Current System Analysis

### Existing Email Infrastructure
- **Edge Function**: `supabase/functions/send-email-notification/index.ts` handles all email sending
- **Hook**: `src/hooks/useEmailNotifications.ts` provides `sendEmailNotification()` function
- **Existing Types**: `new_reservation` already exists for admin notification on new reservations
- **Email Flow**: Admin emails always sent to general notification email, customer emails only if `recipientEmail` is provided

### Key Fields Available in Reservations
- `confirmation_code` - Generated on pending → confirmed (from R3.1)
- `email` - Customer email (nullable)
- `name` - Customer name
- `reservation_date`, `reservation_time`, `pax`
- `preorder_items` - JSON array of pre-order selections

---

## Technical Implementation

### 1. Add New Email Types

**File: `src/hooks/useEmailNotifications.ts`**

Add two new email types to the `EmailType` union:
```typescript
| "reservation_confirmed"
| "reservation_cancelled"
```

Add new payload fields for pre-orders:
```typescript
preorderItems?: Array<{ productName: string; quantity: number }>;
```

---

### 2. Update Edge Function - Add Email Templates

**File: `supabase/functions/send-email-notification/index.ts`**

#### A. Add to trigger event labels (~line 162):
```typescript
reservation_confirmed: 'Reservation Confirmed',
reservation_cancelled: 'Reservation Cancelled',
```

#### B. Add to email type labels (~line 477):
```typescript
reservation_confirmed: 'Reservation Confirmed',
reservation_cancelled: 'Reservation Cancelled',
```

#### C. Add customer email subjects (~line 633):
```typescript
reservation_confirmed: `✅ Your Reservation is Confirmed! - ${payload?.reservationCode}`,
reservation_cancelled: `Reservation Update - ${payload?.reservationCode}`,
```

#### D. Add pre-order summary helper function:
```typescript
function generatePreorderSummaryHtml(preorderItems?: Array<{ productName: string; quantity: number }>): string {
  if (!preorderItems || preorderItems.length === 0) return '';
  
  let html = `
    <div style="margin: 20px 0; padding: 15px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;">
      <h3 style="margin: 0 0 10px; font-size: 14px; color: #92400e;">📋 Pre-order Selections (Not Paid)</h3>
      <ul style="margin: 0; padding-left: 20px;">
  `;
  
  for (const item of preorderItems) {
    html += `<li style="margin: 5px 0;">${item.quantity}x ${item.productName}</li>`;
  }
  
  html += `
      </ul>
      <p style="margin: 10px 0 0; font-size: 12px; color: #78350f; font-style: italic;">
        Payment will be collected at the restaurant
      </p>
    </div>
  `;
  
  return html;
}
```

#### E. Add customer templates in `getDefaultTemplate()` (~line 654):

**Reservation Confirmed Template:**
```typescript
case 'reservation_confirmed':
  const preorderHtml = generatePreorderSummaryHtml(payload.preorderItems);
  content = `
    <div class="content">
      <h2>Your reservation is confirmed! 🎉</h2>
      <p>Hi ${customerName},</p>
      <p>Great news! Your table reservation has been <strong>confirmed</strong>.</p>
      
      <div class="order-box" style="background: #dcfce7; border-color: #bbf7d0;">
        <div class="order-number" style="color: #166534;">${payload.reservationCode || ''}</div>
        <span class="status-badge status-approved">Confirmed</span>
      </div>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px; color: #1e40af;">📅 Reservation Details</h3>
        <table style="width: 100%;">
          <tr><td style="padding: 5px 0; color: #6b7280; width: 100px;">Date:</td><td style="font-weight: 600;">${payload.reservationDate}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Time:</td><td style="font-weight: 600;">${payload.reservationTime}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Party Size:</td><td style="font-weight: 600;">${payload.pax} ${(payload.pax || 0) === 1 ? 'guest' : 'guests'}</td></tr>
        </table>
      </div>

      ${preorderHtml}

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <h3 style="margin: 0 0 10px; color: #166534;">📍 Location</h3>
        <p style="margin: 0; font-size: 16px; font-weight: 600;">${BUSINESS_NAME}</p>
        <p style="margin: 5px 0 0;">${BUSINESS_ADDRESS}</p>
        <p style="margin: 5px 0 0; color: #6b7280;">${BUSINESS_PHONE}</p>
      </div>

      <p style="margin-top: 20px; color: #6b7280;">
        Please arrive on time. If you need to make any changes, contact us at ${BUSINESS_PHONE}.
      </p>
    </div>
  `;
  break;
```

**Reservation Cancelled Template:**
```typescript
case 'reservation_cancelled':
  content = `
    <div class="content">
      <h2>Reservation Update</h2>
      <p>Hi ${customerName},</p>
      <p>We regret to inform you that we were unable to confirm your reservation at this time.</p>
      
      <div class="order-box">
        <div class="order-number">${payload.reservationCode || ''}</div>
        <span class="status-badge status-rejected">Not Confirmed</span>
      </div>

      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px; color: #374151;">📅 Requested Details</h3>
        <table style="width: 100%;">
          <tr><td style="padding: 5px 0; color: #6b7280; width: 100px;">Date:</td><td>${payload.reservationDate}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Time:</td><td>${payload.reservationTime}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Party Size:</td><td>${payload.pax} ${(payload.pax || 0) === 1 ? 'guest' : 'guests'}</td></tr>
        </table>
      </div>

      <p>We apologize for any inconvenience. Please contact us if you would like to book a different time.</p>
      <p><strong>Contact:</strong> ${BUSINESS_PHONE}</p>
    </div>
  `;
  break;
```

---

### 3. Update ReservationDetail.tsx - Trigger Emails

**File: `src/pages/admin/ReservationDetail.tsx`**

#### A. Add import:
```typescript
import { sendEmailNotification } from '@/hooks/useEmailNotifications';
import { format } from 'date-fns';
```

#### B. Update `updateStatusMutation` to send emails after status change:

After the successful database update and admin logging, add:

```typescript
// Send customer email notification (only if customer has email)
if (reservation?.email && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
  const emailType = newStatus === 'confirmed' ? 'reservation_confirmed' : 'reservation_cancelled';
  
  // Format date and time for email
  const formattedDate = format(new Date(reservation.reservation_date), 'MMMM d, yyyy');
  const [hours, minutes] = reservation.reservation_time.split(':');
  const timeDate = new Date();
  timeDate.setHours(parseInt(hours), parseInt(minutes));
  const formattedTime = format(timeDate, 'h:mm a');
  
  // Prepare pre-order items
  const preorderItems = reservation.preorder_items as unknown as PreorderItem[] | null;
  
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
    preorderItems: preorderItems?.map(item => ({
      productName: item.productName,
      quantity: item.quantity,
    })),
  }).then(result => {
    if (!result.success) {
      console.error('Failed to send reservation email:', result.error);
    }
  }).catch(err => {
    console.error('Email notification error:', err);
  });
}
```

---

### 4. Update EmailNotificationPayload Interface

**File: `src/hooks/useEmailNotifications.ts`**

Add `preorderItems` field:
```typescript
preorderItems?: Array<{ productName: string; quantity: number }>;
```

---

### 5. Update Edge Function Payload Interface

**File: `supabase/functions/send-email-notification/index.ts`**

Add to `EmailPayload` interface (~line 79):
```typescript
preorderItems?: Array<{ productName: string; quantity: number }>;
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useEmailNotifications.ts` | Add `reservation_confirmed`, `reservation_cancelled` types, add `preorderItems` field |
| `src/pages/admin/ReservationDetail.tsx` | Add email sending after status change |
| `supabase/functions/send-email-notification/index.ts` | Add email templates, subjects, labels for reservation confirmation/cancellation |

---

## Trigger Conditions

| Status Change | Send Email? | Email Type |
|---------------|-------------|------------|
| pending → confirmed | YES (if email exists) | `reservation_confirmed` |
| pending → cancelled | YES (if email exists) | `reservation_cancelled` |
| confirmed → completed | NO | - |
| confirmed → no_show | NO | - |
| Creation (pending) | NO | - |

---

## Email Content Summary

### Confirmed Email
- Confirmation code (ARW-RES-XXXXX)
- Customer name greeting
- Status: Confirmed
- Date, time, party size
- Pre-order summary (if exists) with "Not Paid" label
- Business location and phone
- Calm, transactional tone

### Cancelled Email
- Reservation code
- Customer name greeting
- Status: Not Confirmed
- Original requested date, time, party size
- Apology message
- Contact information
- No pre-orders shown

---

## Failure Handling

```text
Admin clicks "Confirm Reservation"
     ↓
Database updated (status + confirmation_code)
     ↓
[Success?]───NO──→ Show error toast, stop
     ↓ YES
Log admin action
     ↓
Toast success shown
     ↓
Send email (async, non-blocking)
     ↓
[Email fails?]───YES──→ Log error (no user impact)
     ↓ NO
Email delivered
```

Key principle: **Email failure does NOT block status change**. The reservation is confirmed/cancelled regardless of email delivery.

---

## What This Creates

- Two new email types: `reservation_confirmed`, `reservation_cancelled`
- Customer email templates with reservation details
- Pre-order summary section in emails
- Non-blocking email sending on status change
- Email logging for audit trail

---

## What This Does NOT Create

- SMS notifications (R3.3)
- Tracking pages (R3.4)
- Admin resend controls (R3.5)
- Admin notification emails for confirmation
- Any changes to existing order emails

---

## Visibility Rules

- Email sent ONLY if customer provided an email
- No email if `reservation.email` is null/empty
- No error shown to admin if no email exists
- SMS will handle communication in R3.3 for customers without email

---

## Logging

Email logs recorded in `email_logs` table:
- `recipient_email`
- `email_type` (reservation_confirmed / reservation_cancelled)
- `status` (sent / failed)
- `reservation_id` (via order_id field, repurposed)
- `created_at`
