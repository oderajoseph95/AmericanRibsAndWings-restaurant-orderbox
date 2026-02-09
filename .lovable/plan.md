
# ISSUE R3.4 — Reservation Tracking Page (Customer)

## Overview

Create a public, read-only customer-facing page where customers can view their reservation status using their confirmation code. This page is accessible without login and displays reservation details, status, and pre-orders.

---

## Route Design

| Route | Purpose |
|-------|---------|
| `/reserve/track/:confirmationCode` | Customer reservation tracking page |

**Key behaviors:**
- Public access (no authentication required)
- Case-insensitive code lookup (query using `ilike` or lowercase comparison)
- Returns reservation data from `confirmation_code` field

---

## Technical Implementation

### 1. Create New Page Component

**File: `src/pages/ReservationTracking.tsx`**

A new page that:
- Extracts `confirmationCode` from URL params
- Queries reservations by `confirmation_code` (case-insensitive)
- Displays reservation status, details, and pre-orders
- Shows friendly error for invalid codes

### 2. Add Route to App.tsx

Add new route in the public routes section:
```tsx
<Route path="/reserve/track/:confirmationCode" element={<ReservationTracking />} />
```

---

## Page Sections

### A. Status Section
- Large, prominent status badge
- Human-readable status labels:
  - `pending` → "Pending Confirmation"
  - `confirmed` → "Confirmed"
  - `cancelled` → "Not Approved"
  - `completed` → "Completed"
  - `no_show` → "No Show"

### B. Reservation Details Card
- Confirmation code (prominent display)
- Date (formatted: "February 12, 2026")
- Time (formatted: "7:00 PM")
- Party size ("4 guests")

### C. Pre-Order Summary Card (conditional)
- If pre-orders exist: List items with quantities
- Label: "Pre-order (not paid)"
- If none: "No pre-orders selected"

### D. Guidance Text (status-based)
| Status | Message |
|--------|---------|
| pending | "Your reservation is awaiting confirmation. You will receive an SMS once confirmed." |
| confirmed | "Please arrive on time. Present your confirmation code if asked." |
| cancelled | "Your reservation was not approved. Please contact the store." |
| completed | "Thank you for dining with us!" |
| no_show | "This reservation was marked as no-show." |

---

## Error State

When confirmation code is not found:
- Show "Reservation Not Found" heading
- Message: "We couldn't find a reservation with this code. Please check your SMS or email for the correct code."
- Link back to home
- No technical error details exposed

---

## Data Access (RLS)

The page needs to read reservations by `confirmation_code`. Current RLS policies may not allow public SELECT. Options:

**Option A: Public RLS Policy (Recommended)**
Add a SELECT policy that allows reading reservations by confirmation_code:
```sql
CREATE POLICY "Allow public read by confirmation_code"
ON reservations FOR SELECT
USING (confirmation_code IS NOT NULL);
```

This only exposes reservations that have been confirmed (have a confirmation code). Pending/cancelled reservations without codes cannot be queried.

**Option B: Use RPC Function**
Create a secure RPC that returns only necessary fields:
```sql
CREATE FUNCTION get_reservation_tracking(p_confirmation_code text)
RETURNS json
```

We will use **Option A** as it's simpler and the confirmation code acts as a "password" - only people with the code can access the data.

---

## Design Guidelines

- Mobile-first layout
- Clean, minimal design matching existing customer pages
- Uses existing UI components (Card, Badge, Button)
- No admin styling or actions
- Calm, reassuring tone
- Back button to home
- Footer included

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/ReservationTracking.tsx` | NEW - Customer tracking page |
| `src/App.tsx` | Add route for `/reserve/track/:confirmationCode` |
| **Database** | Add RLS policy for public read by confirmation_code |

---

## Component Structure

```tsx
ReservationTracking
├── SEOHead (meta tags)
├── Header
│   ├── Back button (→ home)
│   └── Title: "Reservation Status"
├── Main content (max-w-md centered)
│   ├── Status Card (prominent status badge + guidance)
│   ├── Reservation Details Card
│   │   ├── Confirmation Code
│   │   ├── Date
│   │   ├── Time
│   │   └── Party Size
│   └── Pre-Order Card (conditional)
│       └── Item list or "No pre-orders"
└── Footer
```

---

## Status Styling

| Status | Badge Color | Background |
|--------|-------------|------------|
| pending | Yellow | Warning tint |
| confirmed | Green | Success tint |
| cancelled | Red | Destructive tint |
| completed | Emerald | Success tint |
| no_show | Gray | Muted tint |

---

## Security Considerations

- Confirmation code acts as access token
- Only reservations WITH confirmation codes are queryable
- Pending reservations (no code yet) cannot be looked up
- No PII exposed beyond what customer already knows
- Read-only - no mutations allowed
- No admin links or actions visible

---

## What This Creates

- Public reservation tracking page
- Route: `/reserve/track/:confirmationCode`
- Status display with human-readable labels
- Reservation details (date, time, pax)
- Pre-order summary when applicable
- Friendly error state for invalid codes
- RLS policy for public read access

---

## What This Does NOT Create

- Editing capabilities
- Payment processing
- Cancellation functionality
- Admin controls
- Notifications or reminders
- Resend functionality

---

## Verification Checklist

After implementation:
- [ ] Valid code shows reservation details
- [ ] Invalid code shows friendly error
- [ ] Case-insensitive lookup works (ARW-RES-12345 = arw-res-12345)
- [ ] Status displays correctly for all states
- [ ] Pre-orders show when present
- [ ] No edit/cancel buttons visible
- [ ] Mobile responsive design
- [ ] Page loads without login
