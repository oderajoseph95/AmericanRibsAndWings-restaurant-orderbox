-- Fix: Add recipientEmail to notify_new_order payload so customer emails are sent
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  customer_record RECORD;
  order_items_json JSONB;
  supabase_url TEXT;
  anon_key TEXT;
  payload JSONB;
BEGIN
  -- Only trigger for newly inserted orders
  IF TG_OP = 'INSERT' THEN
    -- Get Supabase URL and anon key
    supabase_url := 'https://saxwbdwmuzkmxztagfot.supabase.co';
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNheHdiZHdtdXprbXh6dGFnZm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjM0NDUsImV4cCI6MjA4Mjc5OTQ0NX0.cMcSJxeh3DcPYQtrDxC8x4VwMLApABa_nu_MCBZh9OA';
    
    -- Fetch customer details
    SELECT * INTO customer_record FROM customers WHERE id = NEW.customer_id;
    
    -- Fetch order items with flavors
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', oi.product_name,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price,
        'lineTotal', COALESCE(oi.line_total, oi.subtotal),
        'sku', oi.product_sku
      )
    ), '[]'::jsonb) INTO order_items_json
    FROM order_items oi
    WHERE oi.order_id = NEW.id;
    
    -- Build the payload as JSONB with recipientEmail for customer notifications
    payload := jsonb_build_object(
      'type', 'new_order',
      'orderId', NEW.id::text,
      'orderNumber', NEW.order_number,
      'recipientEmail', customer_record.email,
      'customerName', customer_record.name,
      'customerPhone', customer_record.phone,
      'customerEmail', customer_record.email,
      'totalAmount', NEW.total_amount,
      'subtotal', NEW.subtotal,
      'deliveryFee', COALESCE(NEW.delivery_fee, 0),
      'deliveryDistance', NEW.delivery_distance_km,
      'deliveryAddress', NEW.delivery_address,
      'orderType', NEW.order_type::text,
      'paymentMethod', NEW.payment_method,
      'pickupDate', NEW.pickup_date::text,
      'pickupTime', NEW.pickup_time::text,
      'notes', NEW.internal_notes,
      'orderItems', order_items_json,
      'source', 'database_trigger'
    );
    
    -- Call the edge function via pg_net with CORRECT syntax
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-email-notification',
      body := payload,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      timeout_milliseconds := 5000
    );
    
    -- Log the trigger execution for audit trail
    INSERT INTO admin_logs (user_id, user_email, action, entity_type, entity_id, entity_name, details, new_values)
    VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      'system@arwfloridablanca.shop',
      'trigger_notification',
      'order',
      NEW.id,
      NEW.order_number,
      'Database trigger fired for new order notification',
      jsonb_build_object(
        'order_type', NEW.order_type,
        'total_amount', NEW.total_amount,
        'customer_name', customer_record.name,
        'customer_email', customer_record.email
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;