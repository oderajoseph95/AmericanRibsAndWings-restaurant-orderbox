
-- 1. Drop old check constraint and add expanded one
ALTER TABLE public.reservation_reminders DROP CONSTRAINT reservation_reminders_reminder_type_check;
ALTER TABLE public.reservation_reminders ADD CONSTRAINT reservation_reminders_reminder_type_check 
  CHECK (reminder_type = ANY (ARRAY['24h','12h','6h','3h','1h','30min','15min','immediate']));

-- 2. Update trigger function (already created, just re-create to be safe)
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
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    v_reservation_dt := (NEW.reservation_date || ' ' || NEW.reservation_time)::timestamp 
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
        VALUES (NEW.id, v_intervals.rtype, v_reminder_time, 'pending')
        ON CONFLICT (reservation_id, reminder_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Backfill reminders for currently confirmed reservations
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
