

# Plan: Fix Back Button Navigation Across the Site

## Overview

The issue is that back buttons (the arrow icon in page headers) currently hardcode navigation to `/` (homepage), instead of taking users back to where they came from. This breaks the user's expected flow.

## Current Problem

When a user:
1. Goes to `/reservenow`
2. Clicks "Reserve a Table" to go to `/reserve`
3. Clicks the back arrow button

**Expected:** Return to `/reservenow`
**Actual:** Goes to homepage `/`

This is confusing and disrupts the user experience.

---

## Solution: Use Browser History Navigation

Replace hardcoded `<Link to="/">` back buttons with `navigate(-1)` to properly use browser history, taking users back to their previous page.

### Pages to Update

| File | Current Behavior | New Behavior |
|------|------------------|--------------|
| `src/pages/Reserve.tsx` | Back → `/` | Back → Previous page |
| `src/pages/Order.tsx` | Back → `/` | Back → Previous page |
| `src/pages/MyOrders.tsx` | Back → `/` | Back → Previous page |
| `src/components/reservation/ReservationConfirmation.tsx` | Back → `/` | Back → Previous page |

### What NOT to Change

The following "Back to Home" buttons are **intentional CTAs** (not navigation back buttons) and should remain as links to `/`:

- `src/pages/ThankYou.tsx` - "Back to Home" button (line 1155)
- `src/components/customer/OrderConfirmation.tsx` - "Back to Home" button (line 126)
- `src/components/reservation/ReservationConfirmation.tsx` - "Back to Home" CTA button (line 118)
- Logo links in Navbar - Should always go to homepage

---

## Technical Implementation

### Pattern Change

**Before:**
```tsx
<Button variant="ghost" size="icon" asChild>
  <Link to="/">
    <ArrowLeft className="h-5 w-5" />
  </Link>
</Button>
```

**After:**
```tsx
<Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
  <ArrowLeft className="h-5 w-5" />
</Button>
```

### Required Import Change

Each file needs `useNavigate` from `react-router-dom`:
```tsx
import { useNavigate } from "react-router-dom";

// Inside component:
const navigate = useNavigate();
```

---

## File-by-File Changes

### 1. `src/pages/Reserve.tsx`
- Add `useNavigate` import (already imports from react-router-dom)
- Add `const navigate = useNavigate();` inside component
- Change back button from `Link to="/"` to `onClick={() => navigate(-1)}`

### 2. `src/pages/Order.tsx`
- Already has `useNavigate` imported and `navigate` defined
- Only change the back button from `Link to="/"` to `onClick={() => navigate(-1)}`

### 3. `src/pages/MyOrders.tsx`
- Add `useNavigate` to imports
- Add `const navigate = useNavigate();` inside component
- Change back button from `Link to="/"` to `onClick={() => navigate(-1)}`

### 4. `src/components/reservation/ReservationConfirmation.tsx`
- Add `useNavigate` to imports
- Add `const navigate = useNavigate();` inside component
- Change header back button from `Link to="/"` to `onClick={() => navigate(-1)}`
- Keep the "Back to Home" CTA button as `Link to="/"` (intentional)

---

## Consistency with Existing Patterns

This aligns with the admin pages that already have contextual back navigation (e.g., ReservationDetail goes back to reservations list). The customer-facing pages should follow the same principle of respecting user navigation flow.

---

## Summary of Changes

| File | Lines Affected | Change |
|------|----------------|--------|
| `src/pages/Reserve.tsx` | ~2, ~24, ~64-68 | Add navigate, update back button |
| `src/pages/Order.tsx` | ~674-678 | Update back button (navigate already exists) |
| `src/pages/MyOrders.tsx` | ~2, ~22, ~202-206 | Add navigate, update back button |
| `src/components/reservation/ReservationConfirmation.tsx` | ~1, ~17, ~35-39 | Add navigate, update header back button only |

