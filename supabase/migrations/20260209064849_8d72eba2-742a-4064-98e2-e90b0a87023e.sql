-- Create RPC function for reservation analytics with server-side aggregation
CREATE OR REPLACE FUNCTION get_reservation_analytics(
  start_date DATE,
  end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- Core counts
    'total', (SELECT COUNT(*) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'pending', (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND reservation_date >= start_date AND reservation_date <= end_date),
    'confirmed', (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled' AND reservation_date >= start_date AND reservation_date <= end_date),
    'cancelled_by_customer', (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled_by_customer' AND reservation_date >= start_date AND reservation_date <= end_date),
    'completed', (SELECT COUNT(*) FROM reservations WHERE status = 'completed' AND reservation_date >= start_date AND reservation_date <= end_date),
    'no_show', (SELECT COUNT(*) FROM reservations WHERE status = 'no_show' AND reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Pax stats
    'total_pax', (SELECT COALESCE(SUM(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'avg_pax', (SELECT COALESCE(ROUND(AVG(pax)::numeric, 1), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'min_pax', (SELECT COALESCE(MIN(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    'max_pax', (SELECT COALESCE(MAX(pax), 0) FROM reservations WHERE reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Pax distribution buckets
    'pax_1_2', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 1 AND 2 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_3_4', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 3 AND 4 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_5_6', (SELECT COUNT(*) FROM reservations WHERE pax BETWEEN 5 AND 6 AND reservation_date >= start_date AND reservation_date <= end_date),
    'pax_7_plus', (SELECT COUNT(*) FROM reservations WHERE pax >= 7 AND reservation_date >= start_date AND reservation_date <= end_date),
    
    -- Day of week distribution (0 = Sunday, 6 = Saturday)
    'day_distribution', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          EXTRACT(DOW FROM reservation_date)::int as day_of_week,
          COUNT(*) as count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY EXTRACT(DOW FROM reservation_date)
        ORDER BY day_of_week
      ) t
    ),
    
    -- Hourly distribution
    'hour_distribution', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          EXTRACT(HOUR FROM reservation_time)::int as hour,
          COUNT(*) as count
        FROM reservations
        WHERE reservation_date >= start_date AND reservation_date <= end_date
        GROUP BY EXTRACT(HOUR FROM reservation_time)
        ORDER BY hour
      ) t
    ),
    
    -- Daily trend
    'daily_trend', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT 
          reservation_date::text as date,
          COUNT(*) as count
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