
# ISSUE R4.3 — Customer Reservation Lookup & Status Page

## Overview

Transform the existing reservation tracking page from URL-based lookup (code only) to form-based secure lookup requiring BOTH reservation code AND phone number. This prevents information disclosure and enables customers to independently verify their reservation status.

---

## Current State Analysis

### Existing Infrastructure
- **Route**: `/reserve/track/:confirmationCode` - URL param lookup (insecure)
- **Page**: `src/pages/ReservationTracking.tsx` - Already has nice UI, status badges, pre-order display
- **Lookup**: Direct Supabase query with just confirmation code (no phone verification)
- **Phone Normalization**: Already exists in `ReservationForm.tsx` (can reuse)
- **Analytics**: `analytics_events` table exists but event types are limited

### Security Gap
Current implementation allows anyone with a reservation code to view details without phone verification. This exposes customer data.

---

## Technical Implementation

### 1. Database Changes

#### A. Create Secure Lookup Function

A database function that:
- Requires BOTH code AND phone
- Normalizes phone before matching
- Returns null if either doesn't match (no information disclosure)
- Logs lookup attempts internally

```sql
CREATE OR REPLACE FUNCTION public.lookup_reservation(
  p_code TEXT,
  p_phone TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation RECORD;
  v_normalized_phone TEXT;
BEGIN
  -- Normalize phone: strip non-digits, handle +63/0 prefix
  v_normalized_phone := regexp_replace(TRIM(p_phone), '[^0-9]', '', 'g');
  
  -- Handle +63 prefix conversion to 0
  IF TRIM(p_phone) LIKE '+63%' THEN
    v_normalized_phone := '0' || RIGHT(v_normalized_phone, 10);
  END IF;
  
  -- If starts with 63 (12 digits), convert to 0 prefix
  IF LENGTH(v_normalized_phone) = 12 AND LEFT(v_normalized_phone, 2) = '63' THEN
    v_normalized_phone := '0' || RIGHT(v_normalized_phone, 10);
  END IF;
  
  -- If starts with 9 (10 digits), add 0 prefix
  IF LENGTH(v_normalized_phone) = 10 AND LEFT(v_normalized_phone, 1) = '9' THEN
    v_normalized_phone := '0' || v_normalized_phone;
  END IF;
  
  -- Lookup by code (case-insensitive) AND phone (normalized match)
  SELECT 
    r.id,
    r.reservation_code,
    r.confirmation_code,
    r.name,
    r.pax,
    r.reservation_date,
    r.reservation_time,
    r.status,
    r.preorder_items,
    r.created_at
  INTO v_reservation
  FROM reservations r
  WHERE (
    UPPER(r.confirmation_code) = UPPER(TRIM(p_code))
    OR UPPER(r.reservation_code) = UPPER(TRIM(p_code))
  )
  AND (
    -- Match normalized phone in various formats
    regexp_replace(r.phone, '[^0-9]', '', 'g') = v_normalized_phone
    OR regexp_replace(r.phone, '[^0-9]', '', 'g') = RIGHT(v_normalized_phone, 10)
    OR RIGHT(regexp_replace(r.phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_normalized_phone, 10)
  )
  LIMIT 1;
  
  -- If not found, return null (no information disclosure)
  IF v_reservation IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Return safe reservation data (no sensitive admin fields)
  RETURN json_build_object(
    'reservation_code', COALESCE(v_reservation.confirmation_code, v_reservation.reservation_code),
    'name', v_reservation.name,
    'pax', v_reservation.pax,
    'reservation_date', v_reservation.reservation_date,
    'reservation_time', v_reservation.reservation_time,
    'status', v_reservation.status,
    'preorder_items', v_reservation.preorder_items
  );
END;
$$;
```

#### B. Add Lookup Event Types to Analytics

The existing `analytics_events` table can accept any event type string. We'll add:
- `reservation_lookup_success`
- `reservation_lookup_failed`

No schema changes needed - just new event types.

### 2. Route Changes

**App.tsx updates:**
```
OLD: /reserve/track/:confirmationCode
NEW: /reserve/track (no params)
```

The old URL-param route should be removed for security.

### 3. Page Rewrite: ReservationTracking.tsx

Transform from URL-param lookup to form-based lookup:

**States:**
1. **Initial**: Show lookup form (code + phone inputs)
2. **Loading**: Show skeleton while looking up
3. **Found**: Show reservation details (current UI)
4. **Not Found**: Show error message with retry option

**UI Flow:**
```
┌─────────────────────────────────────┐
│ Header: "Check Reservation Status"  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Reservation Code            │    │
│  │ [ARW-RSV-XXXX             ] │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Phone Number                │    │
│  │ [09171234567              ] │    │
│  └─────────────────────────────┘    │
│                                     │
│  [       Check Status        ]      │
│                                     │
└─────────────────────────────────────┘
```

After successful lookup, show existing reservation details UI with added store contact info section.

### 4. Security Features

- **No code exposure in URL**: Form-based lookup prevents sharing/leaking
- **Dual verification**: Both code AND phone required
- **Normalized matching**: Handles various phone formats
- **No information disclosure**: Same error for invalid code or invalid phone
- **Rate limiting**: Frontend debounce + future server-side rate limiting

### 5. Store Contact Info Section

Add a card at the bottom with:
- Store name: "American Ribs & Wings"
- Phone: From constants (STORE_PHONE)
- Address: From constants (STORE_ADDRESS_LINE1-3)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | CREATE | Create `lookup_reservation` function |
| `src/App.tsx` | MODIFY | Change route from `/reserve/track/:confirmationCode` to `/reserve/track` |
| `src/pages/ReservationTracking.tsx` | REWRITE | Add lookup form, use RPC instead of direct query |
| `src/hooks/useAnalytics.ts` | MODIFY | Add new event types for lookup tracking |

---

## Phone Normalization Logic

Reuse existing pattern from `ReservationForm.tsx`:

| Input | Normalized |
|-------|------------|
| `09171234567` | `09171234567` |
| `9171234567` | `09171234567` |
| `+639171234567` | `09171234567` |
| `639171234567` | `09171234567` |

The database function handles normalization for matching.

---

## Status Badge Configuration

Already exists in current code - no changes needed:

| Status | Label | Color | Message |
|--------|-------|-------|---------|
| pending | "Pending Confirmation" | Yellow | "Your reservation is awaiting confirmation..." |
| confirmed | "Confirmed" | Green | "Please arrive on time..." |
| cancelled | "Not Approved" | Red | "Your reservation was not approved..." |
| completed | "Completed" | Emerald | "Thank you for dining with us!" |
| no_show | "No Show" | Gray | "This reservation was marked as no-show." |

---

## Event Logging

Track lookup attempts for abuse monitoring:

```typescript
// On successful lookup
trackAnalyticsEvent('reservation_lookup_success', {
  reservation_code: code,
  // NO phone logged for privacy
});

// On failed lookup
trackAnalyticsEvent('reservation_lookup_failed', {
  attempted_code: code,
  // NO phone logged
});
```

---

## UI/UX Details

### Mobile-First Layout
- Single column, max-width 448px (max-w-md)
- Large touch targets
- Clear typography
- Status badge visually prominent

### Error State
```
┌─────────────────────────────────────┐
│  [!] Reservation Not Found          │
│                                     │
│  We couldn't find a reservation     │
│  with those details. Please check   │
│  your code and phone number.        │
│                                     │
│  [        Try Again        ]        │
└─────────────────────────────────────┘
```

### Store Contact Card
```
┌─────────────────────────────────────┐
│  Need Help?                         │
│                                     │
│  📍 American Ribs & Wings           │
│     GF Unit 11-14 Hony Arcade       │
│     Floridablanca, Pampanga         │
│                                     │
│  📞 0976 207 4276                   │
└─────────────────────────────────────┘
```

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Customers can reliably find their reservation | Secure RPC with dual verification |
| Status is accurate and up-to-date | Direct database query |
| Incorrect lookups fail safely | Same error for any mismatch |
| UI works cleanly on mobile | Mobile-first, single column |
| No private data leaks | No URL params, no disclosure on mismatch |
| Read-only display | No edit/cancel buttons |
| Status-specific messaging | Existing statusConfig remains |

---

## What This Creates

1. `lookup_reservation` database function (secure, normalized)
2. Redesigned `/reserve/track` page with form-based lookup
3. Lookup event tracking for abuse monitoring
4. Store contact info display
5. Removal of insecure URL-param route

---

## What This Does NOT Create

- Reservation cancellation (R4.4)
- Editing reservation details
- Payment processing
- Menu browsing
- Admin tools on customer page

---

## Technical Notes

### Why Database Function?
- Prevents phone enumeration attacks
- Handles normalization server-side
- Returns safe subset of fields only
- No RLS bypass concerns

### Why Not Direct Query?
- Direct query would require exposing phone matching logic client-side
- More attack surface for enumeration
- Harder to rate limit
