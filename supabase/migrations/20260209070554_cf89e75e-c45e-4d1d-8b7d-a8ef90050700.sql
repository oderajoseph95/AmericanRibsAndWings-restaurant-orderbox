-- ISSUE R5.1: Add checked_in status and tracking columns for reservation check-in control

-- Add checked_in to reservation_status enum
ALTER TYPE reservation_status ADD VALUE 'checked_in' AFTER 'confirmed';

-- Add dedicated columns for check-in tracking
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id);

-- Update get_reservation_analytics RPC to include checked_in count
CREATE OR REPLACE FUNCTION get_reservation_analytics(start_date date, end_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'pending', (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND reservation_date >= start_date AND reservation_date <= end_date),
    'confirmed', (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'checked_in', (SELECT COUNT(*) FROM reservations WHERE status = 'checked_in' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled_by_customer', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled_by_customer' AND reservation_date >= start_date AND reservation_date <= end_date),
    'completed', (SELECT COUNT(*) FROM reservations WHERE status = 'completed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'no_show', (SELECT COUNT(*) FROM reservations WHERE status = 'no_show' AND reservation_date >= start_date AND reservation_date <= end_date),
    'total_pax', (SELECT COALESCE(SUM(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'avg_pax', (SELECT ROUND(COALESCE(AVG(pax), 0)) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'min_pax', (SELECT COALESCE(MIN(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'max_pax', (SELECT COALESCE(MAX(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'pax_1_2', (SELECT COUNT(*) FROM reservations WHERE pax <= 2 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_3_4', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 3 AND 4 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_5_6', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 5 AND 6 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_7_plus', (SELECT COUNT(*) FROM reservations WHERE pax >= 7 AND reservation_date >= start_date AND reservation_date <= end_date),
    'day_distribution', (
      SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json)
      FROM (
        SELECT EXTRACT(DOW FROM reservation_date)::int AS day_of_week, COUNT(*) AS count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY day_of_week
        ORDER BY day_of_week
      ) d
    ),
    'hour_distribution', (
      SELECT COALESCE(json_agg(row_to_json(h)), '[]'::json)
      FROM (
        SELECT EXTRACT(HOUR FROM reservation_time)::int AS hour, COUNT(*) AS count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY hour
        ORDER BY hour
      ) h
    ),
    'daily_trend', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT reservation_date::text AS date, COUNT(*) AS count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY reservation_date
        ORDER BY reservation_date
      ) t
    )
  ) INTO result;
  
  RETURN result;
END;
$$;