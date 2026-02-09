

# ISSUE R2.5 — Admin Sidebar Integration (Reservations)

## Status: ✅ MOSTLY COMPLETE

The Reservations sidebar entry already exists with correct placement, icon, and role visibility.

---

## What Already Works

| Requirement | ✅ Implemented |
|-------------|---------------|
| "Reservations" in sidebar | Line 47 of AdminSidebar.tsx |
| CalendarDays icon | Matches existing admin icon style |
| Route to `/admin/reservations` | Correctly configured |
| Placement after Orders | Position 3 in navItems array |
| Role visibility (owner, manager, cashier) | Properly filtered |
| Hidden from drivers/employees | Role check excludes them |

---

## Minor Fix Required

### Active State on Detail Pages

**Current behavior:**
```typescript
const isActive = location.pathname === item.url;
```
This uses exact match, so `/admin/reservations/abc-123` will NOT show Reservations as active.

**Required fix:**
```typescript
const isActive = location.pathname === item.url || 
                 location.pathname.startsWith(item.url + '/');
```

This ensures:
- `/admin/reservations` → Active ✓
- `/admin/reservations/:id` → Active ✓

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/AdminSidebar.tsx` | Update active state logic (1 line) |

---

## Implementation

Update line 112 in AdminSidebar.tsx:

**Before:**
```typescript
const isActive = location.pathname === item.url;
```

**After:**
```typescript
const isActive = location.pathname === item.url || 
                 location.pathname.startsWith(item.url + '/');
```

---

## Verification Checklist

After fix:
- [ ] Click "Reservations" → Opens `/admin/reservations`
- [ ] "Reservations" shows active styling on list page
- [ ] Click reservation row → Opens `/admin/reservations/:id`
- [ ] "Reservations" STILL shows active styling on detail page
- [ ] Navigation works on mobile sidebar

---

## Result

After implementation:
- Reservations is first-class in admin navigation
- Active state works on both list and detail views
- Role-based visibility properly enforced
- Answers: "Where do I go to manage reservations?" → Sidebar, right after Orders

