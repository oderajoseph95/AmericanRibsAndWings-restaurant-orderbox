-- Create RPC function for accurate funnel counts (bypasses 1000 row limit)
CREATE OR REPLACE FUNCTION get_funnel_counts(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
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
    'visits', (
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE event_type = 'page_view'
        AND created_at >= start_date
        AND created_at <= end_date
    ),
    'view_product', (
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE event_type = 'view_product'
        AND created_at >= start_date
        AND created_at <= end_date
    ),
    'add_to_cart', (
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE event_type = 'add_to_cart'
        AND created_at >= start_date
        AND created_at <= end_date
    ),
    'checkout_start', (
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE event_type = 'checkout_start'
        AND created_at >= start_date
        AND created_at <= end_date
    ),
    'checkout_complete', (
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE event_type = 'checkout_complete'
        AND created_at >= start_date
        AND created_at <= end_date
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create RPC function for top viewed products
CREATE OR REPLACE FUNCTION get_top_viewed_products(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  limit_count INTEGER DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT 
        (event_data->>'product_id') as id,
        (event_data->>'product_name') as name,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'view_product'
        AND created_at >= start_date
        AND created_at <= end_date
        AND event_data->>'product_id' IS NOT NULL
      GROUP BY event_data->>'product_id', event_data->>'product_name'
      ORDER BY count DESC
      LIMIT limit_count
    ) t
  );
END;
$$;

-- Create RPC function for top added to cart products
CREATE OR REPLACE FUNCTION get_top_added_to_cart(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  limit_count INTEGER DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT 
        (event_data->>'product_id') as id,
        (event_data->>'product_name') as name,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type = 'add_to_cart'
        AND created_at >= start_date
        AND created_at <= end_date
        AND event_data->>'product_id' IS NOT NULL
      GROUP BY event_data->>'product_id', event_data->>'product_name'
      ORDER BY count DESC
      LIMIT limit_count
    ) t
  );
END;
$$;

-- Create RPC function for top categories
CREATE OR REPLACE FUNCTION get_top_categories(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  limit_count INTEGER DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT 
        COALESCE(event_data->>'category', event_data->>'category_name') as name,
        COUNT(*) as count
      FROM analytics_events
      WHERE event_type IN ('view_product', 'add_to_cart')
        AND created_at >= start_date
        AND created_at <= end_date
        AND (event_data->>'category' IS NOT NULL OR event_data->>'category_name' IS NOT NULL)
        AND COALESCE(event_data->>'category', event_data->>'category_name') != 'Uncategorized'
      GROUP BY COALESCE(event_data->>'category', event_data->>'category_name')
      ORDER BY count DESC
      LIMIT limit_count
    ) t
  );
END;
$$;