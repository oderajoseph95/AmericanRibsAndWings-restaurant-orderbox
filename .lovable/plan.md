

# Fix: Ensure Automated Reservation Reminders Are Always Scheduled

## The Problem

The cron job to **send** reminders runs every 15 minutes -- that part is working. However, **no reminders are being created** for confirmed reservations because:

- Reminder rows are only inserted from the admin frontend (ReservationDetail.tsx) when an admin manually clicks "Confirm"
- If the admin confirms via a different flow, or the insert silently fails due to RLS, no reminders get scheduled
- Right now, all 3 confirmed Feb 14 reservations have **zero reminder rows** in the database

## The Fix

Create a **database trigger** on the `reservations` table that automatically inserts reminder rows whenever a reservation status changes to `confirmed`. This guarantees reminders are always created regardless of how the confirmation happens.

### Database Trigger: `schedule_reminders_on_confirm`

When `reservations.status` changes to `'confirmed'`:

1. Calculate the reservation datetime (date + time in Philippine timezone)
2. For each of the 6 reminder intervals (12h, 6h, 3h, 1h, 30min, 15min):
   - Calculate the scheduled send time
   - Only insert if the send time is in the future
3. Insert all applicable reminders into `reservation_reminders` with status `'pending'`
4. Use `ON CONFLICT DO NOTHING` to avoid duplicates if reminders already exist

### RLS Policy Update

Add a policy allowing the service role (used by triggers) to insert reminders. The trigger runs as `SECURITY DEFINER` so it bypasses RLS, but we also need to ensure the edge function (which uses the service role key) can update reminder statuses.

Add a policy: "Service role can manage reminders" -- or simply ensure the trigger function is `SECURITY DEFINER`.

### Backfill Existing Confirmed Reservations

Run an immediate backfill to create reminders for the 3 currently confirmed Feb 14 reservations that are missing their reminder rows.

## Technical Details

### New Migration SQL

```sql
-- 1. Create trigger function to auto-schedule reminders
CREATE OR REPLACE FUNCTION public.schedule_reminders_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation_dt TIMESTAMPTZ;
  v_reminder_time TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_intervals RECORD;
BEGIN
  -- Only fire when status changes TO 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    
    -- Build reservation datetime in Philippine timezone
    v_reservation_dt := (NEW.reservation_date || ' ' || NEW.reservation_time)::timestamp 
                        AT TIME ZONE 'Asia/Manila';
    
    -- Insert reminders for each interval (skip if already past)
    FOR v_intervals IN 
      SELECT unnest(ARRAY['12h','6h','3h','1h','30min','15min']) AS rtype,
             unnest(ARRAY[12,6,3,1,0,0]::int[]) AS hours,
             unnest(ARRAY[0,0,0,0,30,15]::int[]) AS mins
    LOOP
      v_reminder_time := v_reservation_dt 
                         - (v_intervals.hours || ' hours')::interval 
                         - (v_intervals.mins || ' minutes')::interval;
      
      IF v_reminder_time > v_now THEN
        INSERT INTO reservation_reminders (reservation_id, reminder_type, scheduled_for, status)
        VALUES (NEW.id, v_intervals.rtype, v_reminder_time, 'pending')
        ON CONFLICT (reservation_id, reminder_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Attach trigger to reservations table
DROP TRIGGER IF EXISTS trg_schedule_reminders_on_confirm ON public.reservations;
CREATE TRIGGER trg_schedule_reminders_on_confirm
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_reminders_on_confirm();

-- 3. Backfill reminders for currently confirmed reservations with future dates
-- (This handles the 3 Feb 14 reservations that are missing reminders)
DO $$
DECLARE
  r RECORD;
  v_reservation_dt TIMESTAMPTZ;
  v_reminder_time TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_intervals RECORD;
BEGIN
  FOR r IN 
    SELECT id, reservation_date, reservation_time 
    FROM reservations 
    WHERE status = 'confirmed' 
      AND reservation_date >= CURRENT_DATE
  LOOP
    v_reservation_dt := (r.reservation_date || ' ' || r.reservation_time)::timestamp 
                        AT TIME ZONE 'Asia/Manila';
    
    FOR v_intervals IN 
      SELECT unnest(ARRAY['12h','6h','3h','1h','30min','15min']) AS rtype,
             unnest(ARRAY[12,6,3,1,0,0]::int[]) AS hours,
             unnest(ARRAY[0,0,0,0,30,15]::int[]) AS mins
    LOOP
      v_reminder_time := v_reservation_dt 
                         - (v_intervals.hours || ' hours')::interval 
                         - (v_intervals.mins || ' minutes')::interval;
      
      IF v_reminder_time > v_now THEN
        INSERT INTO reservation_reminders (reservation_id, reminder_type, scheduled_for, status)
        VALUES (r.id, v_intervals.rtype, v_reminder_time, 'pending')
        ON CONFLICT (reservation_id, reminder_type) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
```

## How It All Works Together

```text
Reservation confirmed (any method)
        |
        v
Database Trigger fires automatically
        |
        v
Inserts 6 reminder rows (12h, 6h, 3h, 1h, 30min, 15min)
(only future ones)
        |
        v
Cron job runs every 15 minutes
        |
        v
Calls send-reservation-reminder edge function
        |
        v
Edge function finds due reminders (scheduled_for <= now, status = pending)
        |
        v
Sends SMS + Email to customer + admin copies
```

## Summary

| Component | Status | Action |
|-----------|--------|--------|
| Cron job (every 15 min) | Already exists and running | No change needed |
| Edge function (send-reservation-reminder) | Already deployed and working | No change needed |
| Reminder row creation | MISSING - only done from frontend | Add database trigger |
| Existing confirmed reservations | 0 reminders scheduled | Backfill in migration |

