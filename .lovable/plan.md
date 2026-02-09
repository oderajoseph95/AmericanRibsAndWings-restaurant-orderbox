
# Plan: Add PDF Download to Tracking Page + Email Links

## Problem

1. **Tracking Page**: Users who track their reservation can't download the PDF ticket - the download button only exists on the initial confirmation page
2. **Emails**: Reservation emails don't have a link to download the reservation ticket or track the reservation

---

## Solution Overview

| Issue | Fix |
|-------|-----|
| No PDF on tracking page | Add `ReservationTicket` component to reservation details section |
| No link in emails | Add "Track & Download Ticket" button in all reservation emails |

---

## Part 1: Add PDF Download to Tracking Page

### File: `src/pages/ReservationTracking.tsx`

**Changes:**

1. Import the `ReservationTicket` component
2. Add it to the reservation details section (after the Pre-Order card, before Need Help)

**Location:** After line 521 (Pre-Order Card closing), before Store Contact Card

```tsx
// Import at top
import { ReservationTicket } from "@/components/reservation/ReservationTicket";

// Add after Pre-Order Card, before Need Help Card
{/* Download Ticket */}
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-base">Download Ticket</CardTitle>
  </CardHeader>
  <CardContent>
    <ReservationTicket
      reservationCode={reservation.reservation_code}
      name={reservation.name}
      pax={reservation.pax}
      date={formatReservationDate(reservation.reservation_date)}
      time={formatReservationTime(reservation.reservation_time)}
    />
    <p className="text-xs text-muted-foreground text-center mt-3">
      Present this ticket on arrival
    </p>
  </CardContent>
</Card>
```

---

## Part 2: Add Tracking Link to Reservation Emails

### File: `supabase/functions/send-email-notification/index.ts`

**Add tracking button to these email types:**

1. `new_reservation` - "Track Your Reservation" button
2. `reservation_confirmed` - "View & Download Ticket" button  
3. `reservation_reminder` - "Track Your Reservation" button

**Button HTML (to be added to each template):**

```html
<div style="text-align: center; margin: 25px 0;">
  <a href="https://arwfloridablanca.lovable.app/reserve/track?code=${payload.reservationCode}" 
     style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
    📱 Track & Download Ticket
  </a>
</div>
<p style="text-align: center; color: #6b7280; font-size: 13px;">
  Save the PDF ticket to present on arrival
</p>
```

**Placement in each template:**

| Email Type | Add After |
|------------|-----------|
| `new_reservation` | After the location section, before closing div |
| `reservation_confirmed` | After location section, before the "arrive on time" note |
| `reservation_reminder` | After location section, before the "We look forward" message |

---

## Visual Result

### Tracking Page (with PDF button)

```
┌─────────────────────────────────────────┐
│ Status Card                             │
├─────────────────────────────────────────┤
│ Reservation Details                     │
├─────────────────────────────────────────┤
│ Pre-Order                               │
├─────────────────────────────────────────┤
│ Download Ticket                    NEW! │
│ ┌─────────────────────────────────────┐ │
│ │  📥 Download Reservation Ticket     │ │
│ └─────────────────────────────────────┘ │
│ Present this ticket on arrival          │
├─────────────────────────────────────────┤
│ Need Help?                              │
└─────────────────────────────────────────┘
```

### Email (with tracking link)

```
┌─────────────────────────────────────────┐
│ Your reservation is confirmed! 🎉       │
├─────────────────────────────────────────┤
│ ARW-RSV-1234                            │
│ ✅ Confirmed                            │
├─────────────────────────────────────────┤
│ 📅 February 15, 2026 | 6:00 PM          │
│ Party Size: 4 guests                    │
├─────────────────────────────────────────┤
│ 📍 American Ribs & Wings               │
│ Floridablanca, Pampanga                 │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │  📱 Track & Download Ticket         │ │  ← NEW!
│ └─────────────────────────────────────┘ │
│ Save the PDF ticket to present on arrival│
└─────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ReservationTracking.tsx` | Import ReservationTicket, add Download Ticket card |
| `supabase/functions/send-email-notification/index.ts` | Add tracking buttons to reservation email templates |

---

## Technical Notes

1. **ReservationTicket component** already handles:
   - QR code generation pointing to tracking URL
   - PDF generation with jsPDF
   - All reservation details formatting

2. **Tracking URL format**: `https://arwfloridablanca.lovable.app/reserve/track?code=ARW-RSV-XXXX`

3. **PDF cannot be attached to email** because:
   - PDF is generated client-side with jsPDF
   - Would require server-side PDF generation which is complex
   - The link approach is simpler and lets users track status too

---

## Summary

| Before | After |
|--------|-------|
| PDF download only on initial confirmation | PDF download available anytime via tracking page |
| Emails have no way to get ticket | Emails have prominent "Track & Download Ticket" button |
| Users must remember to save PDF immediately | Users can get PDF anytime by tracking reservation |
