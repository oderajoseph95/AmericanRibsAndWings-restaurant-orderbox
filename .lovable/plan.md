
# ISSUE R5.4 — Reservation Entry Landing Page (/reservenow)

## Overview

Create a public landing page at `/reservenow` that serves as a clean entry point for reservations. This page frames the reservation experience, creates urgency through cosmetic FOMO elements, and routes users to either make a new reservation or check an existing one.

---

## Current State Analysis

### Existing Infrastructure to Reuse

1. **Gallery Component** (`src/components/home/Gallery.tsx`):
   - Auto-scrolling image gallery with `animate-scroll-left` / `animate-scroll-right` animations
   - Fetches images from `gallery_images` table with placeholder fallback
   - Perfect pattern for the hero image slider

2. **Filipino Names** (`src/data/filipinoNames.ts`):
   - 190+ randomized Filipino names ready to use for FOMO feed

3. **SalesPop Pattern** (`src/hooks/useSalesPop.ts`):
   - Existing pattern for rotating activity feed with interval timing
   - Uses `getRandomItem` and `getRandomBetween` helpers

4. **Hero Component** (`src/components/home/Hero.tsx`):
   - Design patterns for gradient overlays, badges, and CTA buttons
   - Premium styling with accent colors

5. **SEOHead Component** - Already used for meta tags

6. **Navbar Component** - Navigation structure to update

---

## Technical Implementation

### 1. Create New Page: `src/pages/ReserveNow.tsx`

**Page Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ [Navbar - existing]                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │            HERO SECTION                                 │ │
│ │  ┌─────────────────────────────────────────────────┐    │ │
│ │  │  Scrolling Image Gallery (reuse Gallery)        │    │ │
│ │  └─────────────────────────────────────────────────┘    │ │
│ │                                                         │ │
│ │     "Reserve Your Experience"                           │ │
│ │     Premium BBQ dining awaits                           │ │
│ │                                                         │ │
│ │  [ Reserve a Table ]  [ Check My Reservation ]          │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │  FOMO ACTIVITY FEED (rotating)                         │ │
│ │                                                         │ │
│ │  "Marco reserved a table for 4"                         │ │
│ │  "for Saturday, Feb 15"                                 │ │
│ │                                                         │ │
│ │  [🔥 High demand this weekend]                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Footer - existing]                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2. FOMO Activity Feed Logic

Create a hook or inline logic that generates fake reservation activity:

```typescript
interface ReservationFomoMessage {
  name: string;          // Random from FILIPINO_NAMES
  pax: number;           // 1-6
  dateLabel: string;     // "tomorrow", "this Saturday", "next Monday"
}

// Generate dates: tomorrow to 7 days out
const generateFutureDate = (): string => {
  const daysAhead = getRandomBetween(1, 7);
  const futureDate = addDays(new Date(), daysAhead);
  
  // Format as "tomorrow", "Saturday", "next Tuesday", etc.
  if (daysAhead === 1) return "tomorrow";
  if (daysAhead <= 6) return format(futureDate, "EEEE"); // "Saturday"
  return format(futureDate, "'next' EEEE"); // "next Monday"
};
```

**Rotation Logic:**
- Auto-rotate every 10-20 seconds (randomized)
- Fade animation between messages
- No actual data fetching - purely cosmetic

### 3. Image Slider

Reuse the same pattern from Gallery component but simplified for the hero section:
- Single row of scrolling images
- Pull from `gallery_images` table (same source as homepage)
- Fallback to placeholder images if none exist

### 4. CTA Buttons

Two prominent buttons with instant routing:

| Button | Label | Route | Style |
|--------|-------|-------|-------|
| Primary | "Reserve a Table" | `/reserve` | Accent background, large |
| Secondary | "Check My Reservation" | `/reserve/track` | Outline, large |

### 5. Navigation Update

Update `src/components/home/Navbar.tsx`:
- Add "Reserve" link to desktop nav between "Location" and "Order Now"
- Add "Reserve" link to mobile hamburger menu
- Link points to `/reservenow`

### 6. Route Registration

Update `src/App.tsx`:
- Import `ReserveNow` page
- Add route: `<Route path="/reservenow" element={<ReserveNow />} />`

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ReserveNow.tsx` | CREATE | New landing page with hero, CTAs, FOMO feed |
| `src/App.tsx` | MODIFY | Add `/reservenow` route |
| `src/components/home/Navbar.tsx` | MODIFY | Add "Reserve" nav link |

---

## Component Details

### ReserveNow.tsx Structure

```typescript
export default function ReserveNow() {
  // FOMO message state
  const [fomoMessage, setFomoMessage] = useState<ReservationFomoMessage | null>(null);
  
  // Query gallery images (same as Gallery component)
  const { data: images } = useQuery({...});
  
  // FOMO rotation effect
  useEffect(() => {
    const generateMessage = () => ({
      name: getRandomItem(FILIPINO_NAMES),
      pax: getRandomBetween(1, 6),
      dateLabel: generateFutureDate(),
    });
    
    // Initial message
    setFomoMessage(generateMessage());
    
    // Rotate every 10-20 seconds
    const interval = setInterval(() => {
      setFomoMessage(generateMessage());
    }, getRandomBetween(10000, 20000));
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead pagePath="/reservenow" ... />
      <Navbar />
      
      {/* Hero with scrolling gallery */}
      <section className="relative min-h-[60vh] ...">
        {/* Scrolling images */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {/* Gallery scroll row */}
        </div>
        
        {/* Content overlay */}
        <div className="relative z-10 text-center">
          <h1>Reserve Your Experience</h1>
          <p>Premium BBQ dining awaits</p>
          
          {/* CTAs */}
          <Button asChild>
            <Link to="/reserve">Reserve a Table</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/reserve/track">Check My Reservation</Link>
          </Button>
        </div>
      </section>
      
      {/* FOMO Activity Feed */}
      <section className="py-8 bg-muted/30">
        <div className="text-center animate-fade-in">
          <p><strong>{fomoMessage.name}</strong> reserved a table for {fomoMessage.pax}</p>
          <p>for {fomoMessage.dateLabel}</p>
        </div>
        
        {/* Demand indicator */}
        <div className="mt-4 text-center">
          <span>🔥 Tables filling fast this weekend</span>
        </div>
      </section>
      
      <Footer />
    </div>
  );
}
```

### Navbar Update

```typescript
const navLinks = [
  { name: "Home", href: "/" },
  { name: "Menu", href: "#menu" },
  { name: "About", href: "#about" },
  { name: "Location", href: "#location" },
  { name: "Reserve", href: "/reservenow" }, // NEW
];
```

---

## SEO Configuration

```typescript
<SEOHead 
  pagePath="/reservenow" 
  fallbackTitle="Reserve a Table | American Ribs & Wings"
  fallbackDescription="Reserve your table for an unforgettable BBQ experience at American Ribs & Wings in Floridablanca, Pampanga."
/>
```

---

## Visual Design Notes

- **Hero**: Gradient overlay (primary to accent) matching homepage
- **Typography**: Large, bold headline; calm, premium tone
- **CTAs**: Full-width on mobile, side-by-side on desktop
- **FOMO Feed**: Subtle background, animated transitions between messages
- **Demand Indicator**: Static badge with fire emoji

---

## FOMO Data Rules (Strict)

| Field | Generation Rule |
|-------|-----------------|
| Name | Random from `FILIPINO_NAMES` |
| Pax | Random 1-6 |
| Date | Tomorrow to 7 days from today |
| Rotation | Every 10-20 seconds |

**Critical**: This is purely cosmetic. NO real reservation data is used or displayed.

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| `/reservenow` loads correctly | New route and page component |
| Both CTAs route instantly | Direct `<Link>` to `/reserve` and `/reserve/track` |
| FOMO feed rotates safely | useEffect with interval, random generation |
| Existing routes unchanged | No modifications to `/reserve` or `/reserve/track` |
| Page feels intentional and premium | Reuse hero styling patterns, gradient overlays |
| No forms or real data | Page is purely routing + cosmetic FOMO |

---

## What This Creates

1. New `/reservenow` public landing page
2. Hero section with scrolling gallery background
3. Two prominent CTAs routing to `/reserve` and `/reserve/track`
4. Cosmetic FOMO activity feed with fake reservation data
5. "Reserve" link in navbar (desktop + mobile)
6. SEO-optimized page with proper meta tags

---

## What This Does NOT Create

- Reservation form logic (exists at `/reserve`)
- Tracking implementation (exists at `/reserve/track`)
- Capacity or availability display
- Real reservation data exposure
- Analytics events (future issue)
- Admin configuration for this page
