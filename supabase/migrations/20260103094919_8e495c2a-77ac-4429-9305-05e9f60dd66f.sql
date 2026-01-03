-- =============================================
-- PHASE 2: DATABASE TRIGGERS (with DROP IF EXISTS)
-- =============================================

-- 1. AUTO-UPDATE TIMESTAMPS TRIGGERS
-- Drop existing triggers first, then recreate

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
DROP TRIGGER IF EXISTS update_flavors_updated_at ON public.flavors;
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
DROP TRIGGER IF EXISTS update_stock_updated_at ON public.stock;
DROP TRIGGER IF EXISTS update_settings_updated_at ON public.settings;
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
DROP TRIGGER IF EXISTS update_product_flavor_rules_updated_at ON public.product_flavor_rules;
DROP TRIGGER IF EXISTS update_bundle_components_updated_at ON public.bundle_components;
DROP TRIGGER IF EXISTS generate_order_number_trigger ON public.orders;
DROP TRIGGER IF EXISTS validate_order_status_trigger ON public.orders;
DROP TRIGGER IF EXISTS validate_flavor_rule_trigger ON public.product_flavor_rules;
DROP TRIGGER IF EXISTS stock_deduction_trigger ON public.orders;
DROP TRIGGER IF EXISTS stock_restoration_trigger ON public.orders;
DROP TRIGGER IF EXISTS customer_stats_trigger ON public.orders;

-- Create all timestamp triggers
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flavors_updated_at
  BEFORE UPDATE ON public.flavors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_updated_at
  BEFORE UPDATE ON public.stock
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_flavor_rules_updated_at
  BEFORE UPDATE ON public.product_flavor_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bundle_components_updated_at
  BEFORE UPDATE ON public.bundle_components
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ORDER NUMBER GENERATION TRIGGER
CREATE TRIGGER generate_order_number_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

-- 3. ORDER STATUS VALIDATION TRIGGER
CREATE TRIGGER validate_order_status_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

-- 4. FLAVOR RULE MATH VALIDATION TRIGGER
CREATE TRIGGER validate_flavor_rule_trigger
  BEFORE INSERT OR UPDATE ON public.product_flavor_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_flavor_rule_math();

-- 5. STOCK DEDUCTION ON ORDER APPROVAL
CREATE OR REPLACE FUNCTION public.deduct_stock_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  stock_record RECORD;
  product_record RECORD;
BEGIN
  -- Only fire when status changes to 'approved'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    -- Loop through order items
    FOR item IN 
      SELECT oi.product_id, oi.quantity 
      FROM order_items oi 
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      -- Get product info
      SELECT * INTO product_record FROM products WHERE id = item.product_id;
      
      -- Skip if stock not enabled or product type is 'unlimited'
      IF product_record.stock_enabled = false OR product_record.product_type = 'unlimited' THEN
        CONTINUE;
      END IF;
      
      -- Get stock record
      SELECT * INTO stock_record FROM stock WHERE product_id = item.product_id AND is_enabled = true;
      
      IF stock_record IS NOT NULL THEN
        -- Update stock
        UPDATE stock 
        SET current_stock = current_stock - item.quantity
        WHERE id = stock_record.id;
        
        -- Log adjustment
        INSERT INTO stock_adjustments (
          stock_id, 
          product_id, 
          adjustment_type, 
          quantity_change, 
          previous_quantity, 
          new_quantity, 
          order_id, 
          notes
        ) VALUES (
          stock_record.id,
          item.product_id,
          'sale',
          -item.quantity,
          stock_record.current_stock,
          stock_record.current_stock - item.quantity,
          NEW.id,
          'Auto-deducted on order approval'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_deduction_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_approval();

-- 6. STOCK RESTORATION ON ORDER REJECTION (from approved)
CREATE OR REPLACE FUNCTION public.restore_stock_on_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  stock_record RECORD;
  product_record RECORD;
BEGIN
  -- Only fire when status changes FROM 'approved' TO 'rejected'
  IF OLD.status = 'approved' AND NEW.status = 'rejected' THEN
    -- Loop through order items
    FOR item IN 
      SELECT oi.product_id, oi.quantity 
      FROM order_items oi 
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
    LOOP
      -- Get product info
      SELECT * INTO product_record FROM products WHERE id = item.product_id;
      
      -- Skip if stock not enabled or product type is 'unlimited'
      IF product_record.stock_enabled = false OR product_record.product_type = 'unlimited' THEN
        CONTINUE;
      END IF;
      
      -- Get stock record
      SELECT * INTO stock_record FROM stock WHERE product_id = item.product_id AND is_enabled = true;
      
      IF stock_record IS NOT NULL THEN
        -- Restore stock
        UPDATE stock 
        SET current_stock = current_stock + item.quantity
        WHERE id = stock_record.id;
        
        -- Log adjustment
        INSERT INTO stock_adjustments (
          stock_id, 
          product_id, 
          adjustment_type, 
          quantity_change, 
          previous_quantity, 
          new_quantity, 
          order_id, 
          notes
        ) VALUES (
          stock_record.id,
          item.product_id,
          'manual_add',
          item.quantity,
          stock_record.current_stock,
          stock_record.current_stock + item.quantity,
          NEW.id,
          'Auto-restored on order rejection (was approved)'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_restoration_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_stock_on_rejection();

-- 7. CUSTOMER STATS UPDATE ON ORDER COMPLETION
CREATE OR REPLACE FUNCTION public.update_customer_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes to 'completed'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    -- Update customer stats if customer_id exists
    IF NEW.customer_id IS NOT NULL THEN
      UPDATE customers
      SET 
        total_orders = total_orders + 1,
        total_spent = total_spent + COALESCE(NEW.total_amount, 0),
        last_order_date = NOW()
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_stats_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_stats();