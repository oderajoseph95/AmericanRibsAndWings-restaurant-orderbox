

# Plan: Fix Reservation Tracking Loading State with Fun Messages

## Problem

When looking up a reservation, the "Not Found" screen flashes briefly before showing the actual reservation. This happens because:

```tsx
// Current broken condition (line 339):
) : lookupAttempted && !reservation ? (
  /* NOT FOUND - but this shows DURING loading too! */
```

During loading, `lookupAttempted = true` and `reservation = null`, so the "Not Found" state renders while the API is still fetching.

---

## Solution

Add a dedicated **loading state** with fun restaurant-themed messages and animations. Never show "Not Found" until loading is complete.

### New Rendering Logic

```
┌─────────────────────────────────────────────┐
│  State Flow                                 │
├─────────────────────────────────────────────┤
│                                             │
│  1. !lookupAttempted → Show Lookup Form     │
│                                             │
│  2. isLoading → Show Loading Animation      │
│     with rotating fun messages              │
│                                             │
│  3. !isLoading && !reservation → Not Found  │
│                                             │
│  4. reservation → Show Details              │
│                                             │
└─────────────────────────────────────────────┘
```

### Loading State Visual Design

```
┌─────────────────────────────────────────┐
│                                         │
│           🏃‍♂️ (running animation)        │
│                                         │
│      "Checking with Chef..."            │
│                                         │
│      ━━━━━━━━━━━━━ (progress bar)       │
│                                         │
│      Please wait while we find your     │
│      reservation details                │
│                                         │
└─────────────────────────────────────────┘
```

### Fun Loading Messages

Rotating every 1.5-2 seconds:

1. "Checking with Chef..." 👨‍🍳
2. "Asking Ma'am..." 👩‍💼
3. "Checking with Princess..." 👸
4. "Wait a bit..." ⏳
5. "Checking with Boss..." 🧑‍💼
6. "Looking through the reservation book..." 📖
7. "Almost there..." 🎯
8. "Running to the back..." 🏃

---

## Technical Implementation

### File: `src/pages/ReservationTracking.tsx`

**1. Add state for loading message rotation:**

```typescript
const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

const loadingMessages = [
  { text: "Checking with Chef...", emoji: "👨‍🍳" },
  { text: "Asking Ma'am...", emoji: "👩‍💼" },
  { text: "Checking with Princess...", emoji: "👸" },
  { text: "Wait a bit...", emoji: "⏳" },
  { text: "Checking with Boss...", emoji: "🧑‍💼" },
  { text: "Looking through the book...", emoji: "📖" },
  { text: "Almost there...", emoji: "🎯" },
  { text: "Running to the back...", emoji: "🏃" },
];
```

**2. Add useEffect for message rotation during loading:**

```typescript
useEffect(() => {
  if (!isLoading) return;
  
  const interval = setInterval(() => {
    setLoadingMessageIndex((prev) => 
      (prev + 1) % loadingMessages.length
    );
  }, 1800); // Change message every 1.8 seconds
  
  return () => clearInterval(interval);
}, [isLoading]);
```

**3. Fix the conditional rendering logic:**

```tsx
{/* Main Content */}
<main className="flex-1 container px-4 py-6 max-w-md mx-auto">
  {isLoading ? (
    /* NEW: Loading State with Fun Messages */
    <Card className="text-center py-12">
      <CardContent className="space-y-6">
        {/* Animated emoji or runner icon */}
        <div className="text-6xl animate-bounce">
          {loadingMessages[loadingMessageIndex].emoji}
        </div>
        
        {/* Rotating message */}
        <div className="space-y-2">
          <p className="text-lg font-medium text-primary">
            {loadingMessages[loadingMessageIndex].text}
          </p>
          <p className="text-sm text-muted-foreground">
            Finding your reservation...
          </p>
        </div>
        
        {/* Progress indicator */}
        <div className="w-48 h-1 bg-muted rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-primary animate-pulse rounded-full" 
               style={{ width: '60%' }} />
        </div>
      </CardContent>
    </Card>
  ) : !reservation && !lookupAttempted ? (
    /* Lookup Form - unchanged */
  ) : lookupAttempted && !reservation ? (
    /* Not Found - only shows AFTER loading completes */
  ) : reservation ? (
    /* Reservation Details - unchanged */
  ) : null}
</main>
```

---

## Animation Details

### Bouncing Emoji Animation

Using Tailwind's built-in `animate-bounce` class for the emoji icon.

### Progress Bar Pulse

Using `animate-pulse` for a subtle loading indicator.

### Message Transition

Optional: Add fade transition between messages using CSS:

```css
.loading-message {
  transition: opacity 0.3s ease-in-out;
}
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ReservationTracking.tsx` | **Modify** | Fix conditional logic, add loading state with fun messages |

---

## Summary of Changes

| Current | Fixed |
|---------|-------|
| Shows "Not Found" during loading | Shows loading state with rotating fun messages |
| Confusing UX | Engaging, branded experience |
| No visual feedback during fetch | Animated emoji + progress bar + rotating text |

This ensures users NEVER see "Not Found" while the query is still running, and instead see a delightful, on-brand loading experience.

