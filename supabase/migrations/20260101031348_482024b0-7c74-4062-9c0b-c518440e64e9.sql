-- Fix function search path security warnings
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.order_number = 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
    LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- If status hasn't changed, allow
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Validate transitions
  IF OLD.status = 'pending' AND NEW.status IN ('for_verification', 'rejected') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'for_verification' AND NEW.status IN ('approved', 'rejected') THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status = 'approved' AND NEW.status = 'completed' THEN
    NEW.status_changed_at = now();
    RETURN NEW;
  ELSIF OLD.status IN ('completed', 'rejected') THEN
    RAISE EXCEPTION 'Cannot change status from % - it is terminal', OLD.status;
  ELSE
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_flavor_rule_math()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.units_per_flavor IS NOT NULL AND NEW.units_per_flavor > 0 THEN
    IF NEW.total_units % NEW.units_per_flavor != 0 THEN
      RAISE EXCEPTION 'total_units (%) must divide evenly by units_per_flavor (%). Got remainder: %', 
        NEW.total_units, NEW.units_per_flavor, NEW.total_units % NEW.units_per_flavor;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;