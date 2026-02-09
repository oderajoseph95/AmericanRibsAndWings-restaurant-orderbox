

# Plan: Enhance ReserveNow Page with Gallery, Hero Button, Back Navigation Fix & Hyped FOMO Section

## Overview

This plan addresses 4 improvements:
1. Add the same 2-row scrolling gallery component from homepage to /reservenow page (below hero)
2. Add "Reserve a Table" button to homepage hero alongside Order Now and View Menu
3. Fix back button on reservation tracking to go to /reservenow instead of homepage
4. Transform the FOMO section into a dynamic, exciting live feed with scrolling comments, blinking elements, and more visual urgency

---

## Issue #1: Add Scrolling Gallery to ReserveNow Page

### Current State
- The homepage has a beautiful 2-row scrolling gallery component (`Gallery.tsx`)
- ReserveNow page only has a single-row faded background gallery in the hero

### Solution
Import and add the Gallery component below the hero section, creating continuity with the homepage experience.

### File Changes
**`src/pages/ReserveNow.tsx`**
- Import the Gallery component from `@/components/home/Gallery`
- Add `<Gallery />` after the hero section and before the FOMO section

---

## Issue #2: Add "Reserve a Table" Button to Homepage Hero

### Current State
- Homepage hero has 2 CTAs: "Order Now" (primary) and "View Menu" (outline/opens modal)

### Solution
Add a third button "Reserve a Table" that routes to /reservenow. Layout will be:
- Mobile: 3 stacked buttons
- Desktop: 3 side-by-side buttons

### File Changes
**`src/components/home/Hero.tsx`**
- Import `CalendarPlus` icon from lucide-react
- Add third button after "View Menu" with outline styling that links to `/reservenow`

```tsx
<Button 
  asChild
  variant="outline" 
  size="lg"
  className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-base px-6 py-5 rounded-full"
>
  <Link to="/reservenow">
    <CalendarPlus className="mr-2 h-5 w-5" />
    Reserve a Table
  </Link>
</Button>
```

---

## Issue #3: Fix Back Navigation on Reservation Tracking

### Current State
- Back button on `/reserve/track` links to `/` (homepage)
- User came from `/reservenow` so clicking back should return there

### Solution
Change the back button link from `/` to `/reservenow` to maintain user flow continuity.

### File Changes
**`src/pages/ReservationTracking.tsx`** (Line 285)
- Change `<Link to="/">` to `<Link to="/reservenow">`

---

## Issue #4: Transform FOMO Section into Exciting Live Feed

### Current State
The FOMO section is static and boring:
- Single card showing one message at a time
- Small, quiet "Tables filling fast" indicator
- Fade transition every 10-20 seconds

### New Design
Transform into an exciting, YouTube Live Chat-style scrolling feed with:

1. **Live Feed Container**
   - Vertical scrolling list of 5-6 visible messages
   - New messages appear at bottom and push up
   - Each message has slide-in animation
   - Auto-generates new message every 3-5 seconds

2. **Urgency Banner**
   - Large, prominent "TABLES FILLING FAST" banner
   - Blinking/pulsing animation with fire emojis
   - Reserve button integrated right there

3. **Visual Enhancements**
   - Gradient background matching brand colors
   - Floating/animated decorative elements
   - Emojis and icons for visual excitement

### Technical Implementation

**New Animation Keyframes** (add to `src/index.css`):
```css
@keyframes scroll-up-fade {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-100%);
  }
}

@keyframes slide-in-right {
  0% {
    opacity: 0;
    transform: translateX(50px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes urgency-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.9;
  }
}

@keyframes blink-urgent {
  0%, 50%, 100% {
    opacity: 1;
  }
  25%, 75% {
    opacity: 0.4;
  }
}
```

**ReserveNow.tsx FOMO Section Redesign**:

```
Visual Layout:
┌─────────────────────────────────────────────────────────────────┐
│  🔴 LIVE                                             RESERVE NOW │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👤 Maria reserved for 4 • Saturday        [slide up]       │ │
│  │ 👤 John booked 6 guests • Tomorrow        [slide up]       │ │
│  │ 👤 Anna reserved for 2 • Friday           [slide up]       │ │
│  │ 👤 Miguel booked 3 guests • Sunday        [slide up]       │ │
│  │ 👤 *NEW MESSAGE SLIDING IN*               [slide in]       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  🔥🔥 TABLES FILLING FAST THIS WEEKEND 🔥🔥                 │ │
│  │       [RESERVE YOUR TABLE NOW]                              │ │
│  │         (button - large, pulsing)                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key State Management**:
```typescript
// Maintain array of messages (visible feed)
const [fomoMessages, setFomoMessages] = useState<ReservationFomoMessage[]>([]);
const MAX_VISIBLE_MESSAGES = 6;

// Generate new message every 3-5 seconds
useEffect(() => {
  // Initial batch of 4 messages
  const initial = Array.from({ length: 4 }, () => generateFomoMessage());
  setFomoMessages(initial);
  
  const addMessage = () => {
    setFomoMessages(prev => {
      const newMessages = [...prev, generateFomoMessage()];
      // Keep only last MAX_VISIBLE_MESSAGES
      return newMessages.slice(-MAX_VISIBLE_MESSAGES);
    });
  };
  
  const interval = setInterval(addMessage, getRandomBetween(3000, 5000));
  return () => clearInterval(interval);
}, []);
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ReserveNow.tsx` | Add Gallery component, redesign FOMO section with live feed |
| `src/components/home/Hero.tsx` | Add "Reserve a Table" button |
| `src/pages/ReservationTracking.tsx` | Change back button link from `/` to `/reservenow` |
| `src/index.css` | Add new animation keyframes for live feed effects |

---

## Technical Details

### Live Feed Message Component
Each message in the scrolling feed will be styled as a compact card:
```tsx
<div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 animate-slide-in-right">
  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
    <User className="h-4 w-4 text-primary" />
  </div>
  <div className="flex-1">
    <span className="font-semibold">{name}</span>
    <span className="text-muted-foreground"> reserved for </span>
    <span className="font-semibold">{pax}</span>
  </div>
  <span className="text-sm text-muted-foreground">{dateLabel}</span>
</div>
```

### Urgency Banner
```tsx
<div className="bg-gradient-to-r from-red-500 via-orange-500 to-red-500 rounded-xl p-6 text-center animate-urgency-pulse">
  <div className="flex items-center justify-center gap-2 text-white text-xl md:text-2xl font-bold mb-4 animate-blink-urgent">
    <Flame className="h-6 w-6" />
    <span>TABLES FILLING FAST THIS WEEKEND</span>
    <Flame className="h-6 w-6" />
  </div>
  <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-bold px-8 py-6 rounded-full shadow-xl animate-bounce-slow">
    <CalendarPlus className="mr-2 h-5 w-5" />
    RESERVE YOUR TABLE NOW
  </Button>
</div>
```

---

## Summary of Changes

1. **Gallery on ReserveNow**: Add the existing Gallery component after hero section
2. **Hero Reserve Button**: Add third CTA button linking to /reservenow with calendar icon
3. **Back Navigation Fix**: Simple link change from `/` to `/reservenow`
4. **FOMO Live Feed**: 
   - Multiple stacked messages in a scrolling container
   - New messages slide in from right every 3-5 seconds
   - Old messages fade up and out
   - Large blinking urgency banner with fire emojis
   - Prominent reserve button with pulsing animation
   - "LIVE" indicator badge
   - Overall exciting, social-proof driven design

