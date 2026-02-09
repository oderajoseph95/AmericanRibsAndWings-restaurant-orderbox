
# Plan: Enhanced Reservation Confirmation with Details & PDF Ticket

## Problem Summary

The current reservation confirmation screen is missing critical information:

| Issue | Current State | Expected |
|-------|--------------|----------|
| Reservation Code | **NOT SHOWN** | Show `ARW-RSV-XXXX` prominently |
| Customer Details | Only name shown | Show name, phone, email, notes |
| Tracking Link | **NOT PROVIDED** | Give customers a way to track their reservation |
| PDF Ticket | **NOT AVAILABLE** | Downloadable ticket with QR code |

---

## Solution Overview

### Part 1: Update Confirmation Data Flow

**File: `src/pages/Reserve.tsx`**

Currently the `ConfirmationData` interface and `onSuccess` callback only pass:
- id, name, pax, date, time

Need to expand to include:
- `reservationCode` (ARW-RSV-XXXX)
- `phone`
- `email` (if provided)
- `notes` (if provided)

### Part 2: Update ReservationForm to Pass Full Data

**File: `src/components/reservation/ReservationForm.tsx`**

Update the `onSuccess` callback at line 269-275 to pass all customer details:
```typescript
onSuccess({
  id: reservation.id,
  reservationCode: reservation.reservation_code,
  name: name.trim(),
  phone: normalizePhone(phone),
  email: email.trim() || null,
  pax: pax,
  date: displayDate,
  time: time,
  notes: notes.trim() || null,
});
```

### Part 3: Redesign ReservationConfirmation Component

**File: `src/components/reservation/ReservationConfirmation.tsx`**

Expand the props interface and UI to show:

1. **Reservation Code Card** (prominent, centered)
   - Large `ARW-RSV-XXXX` code in a styled box
   - "Save this code to track your reservation"

2. **Customer Details Section**
   - Name
   - Phone (partially masked for privacy display)
   - Email (if provided)
   - Notes (if provided)

3. **Reservation Details Section** (existing)
   - Date, Time, Party Size

4. **Action Buttons**
   - "Download Ticket" → Generates PDF
   - "Track Reservation" → Links to `/reserve/track`
   - "Back to Home"
   - "Make Another Reservation"

### Part 4: Create PDF Ticket Generator Component

**New File: `src/components/reservation/ReservationTicket.tsx`**

Uses:
- `jspdf` - PDF generation library
- `qrcode.react` - QR code generation for React

The ticket will include:
- Restaurant logo/header
- Reservation code (large)
- QR code that links to tracking page
- Customer name
- Date, time, party size
- Restaurant address & phone
- "Present this ticket on arrival"

### Part 5: Install Required Dependencies

```bash
npm install jspdf qrcode.react
npm install -D @types/qrcode.react
```

---

## Detailed UI Design

### Confirmation Screen Layout

```
┌────────────────────────────────────────┐
│  ← Reservation Submitted               │
│     American Ribs & Wings              │
├────────────────────────────────────────┤
│                                        │
│            ✓ (success icon)            │
│                                        │
│      Reservation Submitted!            │
│  Thank you, [Name]. Your request       │
│  has been received.                    │
│                                        │
├────────────────────────────────────────┤
│  ┌────────────────────────────────┐    │
│  │     Your Reservation Code      │    │
│  │                                │    │
│  │     ARW-RSV-1234              │    │
│  │                                │    │
│  │  Save this code to track your  │    │
│  │  reservation status            │    │
│  └────────────────────────────────┘    │
├────────────────────────────────────────┤
│  Status: Pending Confirmation          │
│  We will contact you to confirm        │
├────────────────────────────────────────┤
│  YOUR DETAILS                          │
│  👤 Name: [Customer Name]              │
│  📱 Phone: 0917****567                 │
│  ✉️  Email: customer@email.com          │
│  📝 Notes: Near the window please      │
├────────────────────────────────────────┤
│  RESERVATION DETAILS                   │
│  📅 Date: February 17, 2026            │
│  🕐 Time: 1:30 PM                      │
│  👥 Party Size: 3 guests               │
├────────────────────────────────────────┤
│  ┌────────────────────────────────┐    │
│  │  📥 Download Reservation Ticket │    │
│  └────────────────────────────────┘    │
│  ┌────────────────────────────────┐    │
│  │  🔍 Track Your Reservation     │    │
│  └────────────────────────────────┘    │
│  ┌────────────────────────────────┐    │
│  │       Back to Home             │    │
│  └────────────────────────────────┘    │
│  ┌────────────────────────────────┐    │
│  │  ↺ Make Another Reservation    │    │
│  └────────────────────────────────┘    │
└────────────────────────────────────────┘
```

### PDF Ticket Layout

```
┌─────────────────────────────────────┐
│  🍗 AMERICAN RIBS & WINGS           │
│     Table Reservation Ticket        │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐                    │
│  │   QR CODE   │   ARW-RSV-1234    │
│  │             │                    │
│  │   (links    │   RESERVATION     │
│  │    to       │   CODE            │
│  │   tracking) │                    │
│  └─────────────┘                    │
│                                     │
├─────────────────────────────────────┤
│  Guest: Odera Joseph Echendu        │
│  Party Size: 3 guests               │
├─────────────────────────────────────┤
│  📅 February 17, 2026               │
│  🕐 1:30 PM                         │
├─────────────────────────────────────┤
│  Status: PENDING CONFIRMATION       │
│  (Subject to confirmation)          │
├─────────────────────────────────────┤
│  📍 LOCATION                        │
│  American Ribs & Wings              │
│  Floridablanca, Pampanga            │
│  📞 0917-XXX-XXXX                   │
├─────────────────────────────────────┤
│  Present this ticket on arrival     │
│  Track status: arwfloridablanca.    │
│  lovable.app/reserve/track          │
└─────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `jspdf` and `qrcode.react` dependencies |
| `src/pages/Reserve.tsx` | Modify | Expand ConfirmationData interface |
| `src/components/reservation/ReservationForm.tsx` | Modify | Pass reservationCode, phone, email, notes to onSuccess |
| `src/components/reservation/ReservationConfirmation.tsx` | Modify | Complete redesign with all details + download button |
| `src/components/reservation/ReservationTicket.tsx` | Create | New component for PDF generation |
| `src/lib/constants.ts` | Read | Get store details for ticket |

---

## Technical Notes

### PDF Generation Approach

Using `jspdf` for PDF creation and `qrcode.react` to generate a QR code, then converting it to base64 for embedding in the PDF:

```typescript
import jsPDF from 'jspdf';
import { QRCodeCanvas } from 'qrcode.react';

// 1. Render QR code to hidden canvas
// 2. Get canvas as base64 image
// 3. Add to PDF using doc.addImage()
// 4. Trigger download with doc.save()
```

### QR Code Content

The QR code will contain the tracking URL with pre-filled code:
```
https://arwfloridablanca.lovable.app/reserve/track?code=ARW-RSV-1234
```

This allows customers to scan and go directly to tracking (though they'll still need to enter their phone for security).

---

## Email Attachment Note

For PDF attachment in emails, this would require:
1. Generating PDF on server-side (edge function)
2. Base64 encoding the PDF
3. Attaching to email via Resend API

This is more complex and can be a Phase 2 enhancement. For now, the downloadable PDF on the confirmation screen provides the immediate value.
