
# ISSUE R4.7 — Reservation Settings Panel (Admin)

## Overview

Create a centralized, admin-only Reservation Settings page at `/admin/reservations/settings` where owners can configure reservation behavior without code changes. All currently hardcoded values will be made configurable and stored in the `settings` table.

---

## Current State Analysis

### Existing Infrastructure
- **Settings Table**: Generic key-value store with JSON value field
- **Existing Reservation Settings**:
  - `store_hours`: `{open: "11:00", close: "21:00", timezone: "Asia/Manila"}`
  - `reservation_capacity`: `{max_pax_per_slot: 40}`
- **logAdminAction**: Audit logging helper already used in Settings.tsx

### Hardcoded Values to Make Configurable

| Setting | Current Location | Hardcoded Value |
|---------|-----------------|-----------------|
| Store Hours | Settings table | 11:00-21:00 (already configurable) |
| Capacity per Slot | Settings table | 40 pax (exists but not editable in UI) |
| Slot Duration | ReservationForm.tsx | 30 minutes |
| Cancellation Cutoff | SQL function | 2 hours |
| No-Show Grace Period | process-no-shows Edge Function | 30 minutes |
| First Reminder | ReservationDetail.tsx | 24 hours before |
| Second Reminder | ReservationDetail.tsx | 3 hours before |

---

## Technical Implementation

### 1. Settings Data Structure

Store all reservation settings under a single key for atomic updates:

```typescript
// Key: 'reservation_settings'
{
  // Store Hours (for reservation context)
  store_open: "11:00",
  store_close: "21:00",
  
  // Capacity
  max_pax_per_slot: 40,
  slot_duration_minutes: 30,
  
  // Reminders
  reminder_first_hours: 24,      // 24h before
  reminder_second_hours: 3,      // 3h before
  reminders_enabled: true,
  
  // Cancellation
  cancellation_cutoff_hours: 2,  // 2h before
  
  // No-Show
  no_show_grace_minutes: 30      // 30 min after
}
```

### 2. Create New Page: `src/pages/admin/ReservationSettings.tsx`

New settings page following the existing Settings.tsx patterns:

**Layout Structure:**
```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Reservations                                       │
│ Reservation Settings                                         │
│ Configure reservation rules and behavior                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Store Hours (Reservation Context)                            │
│ Set when reservations are available                          │
│ ┌─────────────────────┐ ┌─────────────────────┐              │
│ │ Opening Time        │ │ Closing Time        │              │
│ │ [11:00        ▼]    │ │ [21:00        ▼]    │              │
│ └─────────────────────┘ └─────────────────────┘              │
│ 🌏 Timezone: Asia/Manila (Philippines, UTC+8)                │
│ ⓘ These hours control the time picker for reservations       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Capacity Settings                                            │
│ Control how many guests can book per time slot               │
│ ┌─────────────────────┐ ┌─────────────────────┐              │
│ │ Max Guests per Slot │ │ Time Slot Duration  │              │
│ │ [40            ]    │ │ [30 minutes   ▼]    │              │
│ └─────────────────────┘ └─────────────────────┘              │
│ ⓘ Reservations exceeding slot capacity will be rejected      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Reminder Settings                                            │
│ When to send reminder notifications to guests                │
│ ┌─────────────────────────────────────────────┐              │
│ │ [✓] Enable Automatic Reminders              │              │
│ └─────────────────────────────────────────────┘              │
│ ┌─────────────────────┐ ┌─────────────────────┐              │
│ │ First Reminder      │ │ Second Reminder     │              │
│ │ [24      ] hours    │ │ [3       ] hours    │              │
│ │ before reservation  │ │ before reservation  │              │
│ └─────────────────────┘ └─────────────────────┘              │
│ ⓘ Changes apply to future reservations only                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Cancellation Policy                                          │
│ How close to reservation time customers can cancel           │
│ ┌─────────────────────┐                                      │
│ │ Cancellation Cutoff │                                      │
│ │ [2       ] hours    │                                      │
│ │ before reservation  │                                      │
│ └─────────────────────┘                                      │
│ ⓘ After this cutoff, customers must contact the store        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ No-Show Handling                                             │
│ Grace period before marking as no-show                       │
│ ┌─────────────────────┐                                      │
│ │ Grace Period        │                                      │
│ │ [30      ] minutes  │                                      │
│ │ after reservation   │                                      │
│ └─────────────────────┘                                      │
│ ⓘ Confirmed reservations not checked in will be marked       │
│   as no-show after this grace period                         │
└──────────────────────────────────────────────────────────────┘
```

**Role-Based Access:**
- Owner: Full edit access
- Manager: View-only (show notice, disable inputs)
- Others: Access denied

### 3. Route Registration

Add to `App.tsx`:
```tsx
<Route path="reservations/settings" element={<ReservationSettings />} />
```

Must be before `reservations/:id` to avoid conflict.

### 4. Update Edge Functions to Read Settings

#### A. `process-no-shows/index.ts`
- Read `no_show_grace_minutes` from settings table
- Fallback to 30 if not set

#### B. `cancel_reservation_by_customer` SQL Function
- Read `cancellation_cutoff_hours` from settings
- Replace hardcoded `INTERVAL '2 hours'`

#### C. ReservationDetail.tsx (Reminder Scheduling)
- Read `reminder_first_hours` and `reminder_second_hours` from settings
- Replace hardcoded 24 and 3

#### D. ReservationForm.tsx (Time Slots)
- Read `slot_duration_minutes` and store hours from settings
- Replace hardcoded 30-minute increment

### 5. Navigation Updates

Add "Settings" link to `/admin/reservations` page header:
```tsx
<Button variant="outline" asChild>
  <Link to="/admin/reservations/settings">
    <Settings className="h-4 w-4 mr-2" />
    Settings
  </Link>
</Button>
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/admin/ReservationSettings.tsx` | CREATE | New settings page with all controls |
| `src/App.tsx` | MODIFY | Add route for `/admin/reservations/settings` |
| `src/pages/admin/Reservations.tsx` | MODIFY | Add "Settings" button in header |
| `supabase/functions/process-no-shows/index.ts` | MODIFY | Read grace period from settings |
| **Database Migration** | CREATE | Update `cancel_reservation_by_customer` to read settings |
| `src/pages/admin/ReservationDetail.tsx` | MODIFY | Read reminder timing from settings |
| `src/components/reservation/ReservationForm.tsx` | MODIFY | Read slot duration from settings |

---

## Settings Retrieval Pattern

For frontend components, use React Query to fetch settings:

```typescript
const { data: reservationSettings } = useQuery({
  queryKey: ['reservation-settings'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'reservation_settings')
      .maybeSingle();
    
    if (error) throw error;
    return data?.value as ReservationSettingsType || DEFAULT_SETTINGS;
  },
});
```

For Edge Functions, query directly with service role:

```typescript
const { data: settings } = await supabase
  .from('settings')
  .select('value')
  .eq('key', 'reservation_settings')
  .maybeSingle();

const gracePeriodMinutes = settings?.value?.no_show_grace_minutes || 30;
```

---

## Default Values (Fallbacks)

If settings are not found, use these defaults:

| Setting | Default |
|---------|---------|
| store_open | "11:00" |
| store_close | "21:00" |
| max_pax_per_slot | 40 |
| slot_duration_minutes | 30 |
| reminder_first_hours | 24 |
| reminder_second_hours | 3 |
| reminders_enabled | true |
| cancellation_cutoff_hours | 2 |
| no_show_grace_minutes | 30 |

---

## Audit Logging

All settings changes are logged via `logAdminAction`:

```typescript
await logAdminAction({
  action: 'update',
  entityType: 'reservation_settings',
  entityName: settingKey,
  oldValues: { [settingKey]: oldValue },
  newValues: { [settingKey]: newValue },
  details: `Updated ${settingLabel} from ${oldValue} to ${newValue}`,
});
```

---

## Validation Rules

| Setting | Validation |
|---------|------------|
| Store hours | Close must be after open |
| Max pax per slot | Positive integer, 1-200 |
| Slot duration | 15, 30, 45, or 60 minutes |
| Reminder first | 1-72 hours |
| Reminder second | 1-24 hours, less than first |
| Cancellation cutoff | 0-24 hours |
| No-show grace | 5-120 minutes |

---

## SQL Function Update

Modify `cancel_reservation_by_customer` to read settings:

```sql
-- Fetch cutoff setting
SELECT (value->>'cancellation_cutoff_hours')::INT 
INTO v_cutoff_hours
FROM settings 
WHERE key = 'reservation_settings';

v_cutoff_hours := COALESCE(v_cutoff_hours, 2);
v_cutoff := v_reservation_datetime - (v_cutoff_hours || ' hours')::INTERVAL;
```

---

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| All listed settings are editable | Settings page with all 9 controls |
| Role access is enforced | Owner: edit, Manager: view-only |
| Changes apply immediately | Direct DB update, components re-query |
| Audit logs are accurate | logAdminAction on every save |
| No hardcoded reservation rules | All functions read from settings table |

---

## What This Creates

1. `/admin/reservations/settings` page with full settings UI
2. `reservation_settings` key in settings table
3. Dynamic reading of settings in all reservation logic
4. Audit trail for all changes
5. Navigation link from Reservations list

---

## What This Does NOT Create

- Per-day schedule overrides
- Holiday schedules
- Special event rules
- Table assignment logic
- Customer-facing settings UI
