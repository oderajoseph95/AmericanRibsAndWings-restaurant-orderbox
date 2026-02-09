

# Add Valentine's Day Floating Hearts with Admin Kill Switch

## Overview

Add subtle floating Valentine's Day elements (hearts, sparkles) across the store pages - similar to Christmas snowfall effects. The elements will float around without blocking any user interaction (`pointer-events: none`). An admin toggle in Settings will allow enabling/disabling without redeployment.

---

## Technical Implementation

### 1. Database - Add Setting for Valentine Mode

Add a new setting in the `settings` table:

```sql
INSERT INTO settings (key, value) VALUES ('valentine_mode_enabled', 'true')
ON CONFLICT DO NOTHING;
```

The setting will use the existing `settings` table pattern (already has RLS policies for admin access).

---

### 2. Create Valentine Hearts Component

**File:** `src/components/home/ValentineHearts.tsx`

A component that renders floating hearts with CSS animations:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ValentineHearts() {
  // Fetch setting from database
  const { data: isEnabled } = useQuery({
    queryKey: ["valentine-mode"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "valentine_mode_enabled")
        .maybeSingle();
      return data?.value === true || data?.value === "true";
    },
  });

  if (!isEnabled) return null;

  // Render 15-20 floating heart elements
  const hearts = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 10}s`,
    animationDuration: `${15 + Math.random() * 10}s`,
    size: 12 + Math.random() * 20,
    opacity: 0.15 + Math.random() * 0.25,
  }));

  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-[5]"
      aria-hidden="true"
    >
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute animate-float-heart text-pink-400"
          style={{
            left: heart.left,
            animationDelay: heart.animationDelay,
            animationDuration: heart.animationDuration,
            fontSize: `${heart.size}px`,
            opacity: heart.opacity,
          }}
        >
          ♥
        </div>
      ))}
    </div>
  );
}
```

Key features:
- `pointer-events: none` - won't block any user interaction
- `z-[5]` - low z-index so it's behind modals, toasts, etc.
- Very subtle opacity (0.15 - 0.4)
- Randomized positions, sizes, and animation timings

---

### 3. Add CSS Animations

**File:** `src/index.css`

Add keyframes for floating hearts:

```css
/* Valentine floating hearts */
@keyframes float-heart {
  0% {
    transform: translateY(100vh) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(-100px) rotate(360deg);
    opacity: 0;
  }
}

.animate-float-heart {
  animation: float-heart linear infinite;
}
```

The animation:
- Starts from bottom of screen
- Floats upward with gentle rotation
- Fades in at start, fades out near top
- Infinitely repeating

---

### 4. Add to App Layout

**File:** `src/App.tsx`

Add the ValentineHearts component inside the SalesPopProvider (so it shows on all customer-facing pages):

```tsx
import { ValentineHearts } from "@/components/home/ValentineHearts";

// Inside the Routes, add as sibling to Routes:
<SalesPopProvider>
  <ValentineHearts />  {/* Add this */}
  <Routes>
    ...
  </Routes>
</SalesPopProvider>
```

---

### 5. Admin Kill Switch in Settings

**File:** `src/pages/admin/Settings.tsx`

Add a toggle in the Settings page (after Sales Pop section):

```tsx
{/* Valentine Mode Section */}
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Heart className="h-5 w-5 text-pink-500" />
      Valentine's Day Mode
    </CardTitle>
    <CardDescription>
      Enable floating hearts for the Valentine season
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <Label>Enable Valentine Hearts</Label>
        <p className="text-xs text-muted-foreground">
          Show subtle floating hearts on customer pages
        </p>
      </div>
      <Switch
        checked={getSetting('valentine_mode_enabled') === 'true' || getSetting('valentine_mode_enabled') === true}
        onCheckedChange={(checked) =>
          saveSettingMutation.mutate({
            key: 'valentine_mode_enabled',
            value: checked,
          })
        }
      />
    </div>
  </CardContent>
</Card>
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/home/ValentineHearts.tsx` | **Create** - New component for floating hearts |
| `src/index.css` | Add `@keyframes float-heart` animation |
| `src/App.tsx` | Add `<ValentineHearts />` component |
| `src/pages/admin/Settings.tsx` | Add Valentine mode toggle switch |
| Database | Insert default setting `valentine_mode_enabled = true` |

---

## Result

**Customer Experience:**
- Subtle floating pink hearts drift upward across the page
- Very low opacity (15-40%) so they don't distract
- Cannot be clicked/blocked (pointer-events: none)
- Works on all pages (homepage, order page, etc.)

**Admin Control:**
- Toggle in Admin > Settings to enable/disable
- Changes take effect immediately (no redeploy needed)
- Can turn off after Valentine's Day ends

---

## What This Protects

- Customer checkout flow unchanged
- Cart behavior unchanged
- All existing functionality unchanged
- Elements don't interfere with any UI interactions
- Mobile experience unchanged (hearts still float but very subtle)

