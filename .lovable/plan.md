

# ISSUE R5.5 — Reservation Navigation & Discoverability

## Overview

Enhance the navigation component to properly highlight the "Reserve" link as active when users are on any reservation-related route (`/reservenow`, `/reserve`, `/reserve/track`).

---

## Current State Analysis

### Already Implemented (from R5.4)
- "Reserve" link exists in `navLinks` array pointing to `/reservenow`
- Visible in both desktop and mobile hamburger menu
- Mobile navigation already includes "Reserve"

### What's Missing for R5.5
1. **Active state highlighting** - The navbar uses plain `<a>` tags without active state detection
2. **Route-aware links** - The "Reserve" link uses `<a href>` instead of React Router's routing components
3. **Multi-route active detection** - Need to highlight "Reserve" when on `/reservenow`, `/reserve`, or `/reserve/track`

### Available Infrastructure
- `NavLink` component (`src/components/NavLink.tsx`) exists and wraps React Router's `NavLink` with `activeClassName` support
- Uses `useLocation` from react-router-dom for path detection

---

## Technical Implementation

### 1. Update Navbar to Use React Router for Route Links

Change the navigation links to distinguish between:
- **Hash links** (`#menu`, `#about`, `#location`) - Keep as `<a>` tags for scroll behavior
- **Route links** (`/`, `/reservenow`) - Use React Router `Link` or custom logic for active states

### 2. Add Active State Detection for Reserve Section

Use `useLocation` to detect if the current path is within the reservation journey:

```typescript
import { useLocation } from "react-router-dom";

// Inside component
const location = useLocation();

// Check if on any reservation route
const isReservationActive = ['/reservenow', '/reserve', '/reserve/track'].some(
  path => location.pathname === path || location.pathname.startsWith(path + '/')
);
```

### 3. Update Link Rendering Logic

Modify the navLinks rendering to:
- Use `<Link>` for route-based navigation
- Apply active styling based on current route
- Keep `<a>` for hash-based links (scrolling to sections)

```typescript
// Updated navLinks structure
const navLinks = [
  { name: "Home", href: "/", isRoute: true },
  { name: "Menu", href: "#menu", isRoute: false },
  { name: "About", href: "#about", isRoute: false },
  { name: "Location", href: "#location", isRoute: false },
  { name: "Reserve", href: "/reservenow", isRoute: true, matchPaths: ['/reservenow', '/reserve'] },
];

// Rendering logic
{navLinks.map((link) => {
  const isActive = link.isRoute 
    ? link.matchPaths 
      ? link.matchPaths.some(p => location.pathname.startsWith(p))
      : location.pathname === link.href
    : false;
  
  if (link.isRoute) {
    return (
      <Link
        key={link.name}
        to={link.href}
        className={cn(
          "text-foreground hover:text-primary transition-colors font-medium",
          isActive && "text-primary"
        )}
      >
        {link.name}
      </Link>
    );
  }
  
  return (
    <a key={link.name} href={link.href} className="...">
      {link.name}
    </a>
  );
})}
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/home/Navbar.tsx` | MODIFY | Add useLocation, update link rendering with active states |

---

## Active State Rules

| Route | "Reserve" Active |
|-------|------------------|
| `/reservenow` | Yes |
| `/reserve` | Yes |
| `/reserve/track` | Yes |
| `/reserve/track/ABC123` | Yes |
| `/order` | No |
| `/` | No |

---

## Visual Changes

### Desktop Navigation
- **Inactive**: `text-foreground` (default text color)
- **Active**: `text-primary` (brand color)
- **Hover**: `hover:text-primary` (already applied)

### Mobile Navigation
- Same active state styling applied in hamburger menu
- Clear visual distinction when on reservation routes

---

## Implementation Details

### Import Changes
```typescript
import { Link, useNavigate, useLocation } from "react-router-dom";
```

### NavLinks Data Structure Update
```typescript
interface NavLinkItem {
  name: string;
  href: string;
  isRoute?: boolean;
  matchPaths?: string[];
}

const navLinks: NavLinkItem[] = [
  { name: "Home", href: "/", isRoute: true },
  { name: "Menu", href: "#menu" },
  { name: "About", href: "#about" },
  { name: "Location", href: "#location" },
  { name: "Reserve", href: "/reservenow", isRoute: true, matchPaths: ["/reservenow", "/reserve"] },
];
```

### Active Check Function
```typescript
const isLinkActive = (link: NavLinkItem): boolean => {
  if (!link.isRoute) return false;
  if (link.matchPaths) {
    return link.matchPaths.some(path => 
      location.pathname === path || location.pathname.startsWith(path + '/')
    );
  }
  return location.pathname === link.href;
};
```

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| "Reserve" appears in global navigation | Already done in R5.4 |
| Clicking routes to /reservenow | Already done in R5.4, now using React Router Link |
| Active state highlights correctly | useLocation + matchPaths for `/reservenow`, `/reserve`, `/reserve/track` |
| Ordering flow remains untouched | No changes to Order Now button or cart |
| Mobile navigation includes "Reserve" | Already done in R5.4, active state added |

---

## What This Creates

1. Route-aware navigation links using React Router
2. Active state highlighting for "Reserve" across all reservation routes
3. Consistent visual feedback for current location
4. Clean separation between route links (React Router) and hash links (scroll)

---

## What This Does NOT Create

- Admin sidebar changes (out of scope)
- Footer links (out of scope)
- Analytics tracking (out of scope)
- Changes to Order Now or cart flow

