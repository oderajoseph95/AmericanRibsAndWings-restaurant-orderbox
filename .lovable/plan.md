

# Fix: Reservation Date Picker - Allow Today & Auto-Close

## Problem 1: Today's Date is Always Disabled

**Root Cause**: Line 164 sets the minimum selectable date to **tomorrow**:
```typescript
const minDate = addDays(startOfDay(new Date()), 1); // ALWAYS tomorrow
```

This means Feb 14 is never selectable on Feb 14, regardless of the time.

**Fix**: Change the logic so that today is selectable if the current time is before 11 PM (23:00):
```typescript
const now = new Date();
const currentHour = now.getHours();
// Allow today if before 11 PM, otherwise start from tomorrow
const minDate = currentHour < 23 ? startOfDay(now) : addDays(startOfDay(now), 1);
```

## Problem 2: Date Picker Doesn't Auto-Close

**Root Cause**: The `Popover` is uncontrolled -- there's no state to close it when a date is selected.

**Fix**: Add controlled `open` state and close the popover on date selection:
```typescript
const [dateOpen, setDateOpen] = useState(false);

// In onSelect handler:
onSelect={(d) => { setDate(d); setDateOpen(false); }}
```

Also add `pointer-events-auto` to the Calendar className (required for proper interaction inside popovers).

## File to Modify

**`src/components/reservation/ReservationForm.tsx`**:
- Change `minDate` calculation to allow today before 11 PM
- Add `dateOpen` state for controlled popover
- Close popover on date selection
- Add `pointer-events-auto` to Calendar

