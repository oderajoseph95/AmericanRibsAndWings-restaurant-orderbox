-- ============================================
-- AMERICAN RIBS & WINGS - COMPLETE DATABASE SCHEMA
-- ============================================

-- 1. ENUMS
-- ============================================

-- App roles enum (admin system)
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'cashier');

-- Product types enum
CREATE TYPE public.product_type AS ENUM ('simple', 'flavored', 'bundle', 'unlimited');

-- Flavor types enum
CREATE TYPE public.flavor_type AS ENUM ('all_time', 'special');

-- Order types enum
CREATE TYPE public.order_type AS ENUM ('dine_in', 'pickup', 'delivery');

-- Order status enum
CREATE TYPE public.order_status AS ENUM ('pending', 'for_verification', 'approved', 'rejected', 'completed');

-- Stock adjustment types enum
CREATE TYPE public.adjustment_type AS ENUM ('manual_add', 'manual_deduct', 'order_approved', 'order_cancelled');

-- ============================================
-- 2. CORE TABLES
-- ============================================

-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ DEFAULT NULL
);

-- Flavors table
CREATE TABLE public.flavors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  flavor_type public.flavor_type DEFAULT 'all_time',
  surcharge NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ DEFAULT NULL
);

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sku TEXT,
  image_url TEXT,
  product_type public.product_type DEFAULT 'simple',
  is_active BOOLEAN DEFAULT true,
  stock_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ DEFAULT NULL
);

-- Product flavor rules table (for flavored products)
CREATE TABLE public.product_flavor_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  total_units INTEGER NOT NULL,
  units_per_flavor INTEGER NOT NULL,
  required_flavors INTEGER GENERATED ALWAYS AS (total_units / units_per_flavor) STORED,
  min_flavors INTEGER DEFAULT 1,
  max_flavors INTEGER,
  allow_special_flavors BOOLEAN DEFAULT true,
  special_flavor_surcharge NUMERIC(10,2) DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

-- Bundle components table (for bundle products)
CREATE TABLE public.bundle_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  has_flavor_selection BOOLEAN DEFAULT false,
  total_units INTEGER,
  units_per_flavor INTEGER,
  required_flavors INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN units_per_flavor IS NOT NULL AND units_per_flavor > 0 AND total_units IS NOT NULL 
      THEN total_units / units_per_flavor 
      ELSE NULL 
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stock table
CREATE TABLE public.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  current_stock INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

-- Stock adjustments table (audit trail)
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID REFERENCES public.stock(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  adjustment_type public.adjustment_type NOT NULL,
  quantity_change INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  order_id UUID,
  adjusted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. CUSTOMER & ORDER TABLES
-- ============================================

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent NUMERIC(10,2) DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_type public.order_type DEFAULT 'dine_in',
  status public.order_status DEFAULT 'pending',
  subtotal NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  status_changed_at TIMESTAMPTZ DEFAULT now()
);

-- Add order_id FK to stock_adjustments after orders table exists
ALTER TABLE public.stock_adjustments 
ADD CONSTRAINT stock_adjustments_order_id_fkey 
FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- Order items table (with price snapshots)
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  flavor_surcharge_total NUMERIC(10,2) DEFAULT 0,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (subtotal + COALESCE(flavor_surcharge_total, 0)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Order item flavors table (with snapshots)
CREATE TABLE public.order_item_flavors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  flavor_id UUID REFERENCES public.flavors(id) ON DELETE SET NULL,
  flavor_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  surcharge_applied NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payment proofs table
CREATE TABLE public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  UNIQUE(order_id)
);

-- ============================================
-- 4. ADMIN & SETTINGS TABLES
-- ============================================

-- User roles table (secure implementation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. DATABASE FUNCTIONS
-- ============================================

-- Security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user has any admin role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number = 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
    LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Validate order status transitions
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Validate flavor rule math (total_units must divide evenly by units_per_flavor)
CREATE OR REPLACE FUNCTION public.validate_flavor_rule_math()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.units_per_flavor IS NOT NULL AND NEW.units_per_flavor > 0 THEN
    IF NEW.total_units % NEW.units_per_flavor != 0 THEN
      RAISE EXCEPTION 'total_units (%) must divide evenly by units_per_flavor (%). Got remainder: %', 
        NEW.total_units, NEW.units_per_flavor, NEW.total_units % NEW.units_per_flavor;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. TRIGGERS
-- ============================================

-- Updated_at triggers for all tables
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flavors_updated_at BEFORE UPDATE ON public.flavors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_flavor_rules_updated_at BEFORE UPDATE ON public.product_flavor_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bundle_components_updated_at BEFORE UPDATE ON public.bundle_components
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order number generation trigger
CREATE TRIGGER generate_order_number_trigger BEFORE INSERT ON public.orders
FOR EACH ROW WHEN (NEW.order_number IS NULL)
EXECUTE FUNCTION public.generate_order_number();

-- Order status transition validation trigger
CREATE TRIGGER validate_order_status_trigger BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_status_transition();

-- Flavor rule math validation triggers
CREATE TRIGGER validate_product_flavor_rule_math BEFORE INSERT OR UPDATE ON public.product_flavor_rules
FOR EACH ROW EXECUTE FUNCTION public.validate_flavor_rule_math();

CREATE TRIGGER validate_bundle_component_flavor_rule_math BEFORE INSERT OR UPDATE ON public.bundle_components
FOR EACH ROW EXECUTE FUNCTION public.validate_flavor_rule_math();

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_flavor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Categories policies
CREATE POLICY "Admins can view all categories" ON public.categories
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert categories" ON public.categories
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update categories" ON public.categories
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete categories" ON public.categories
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Flavors policies
CREATE POLICY "Admins can view all flavors" ON public.flavors
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert flavors" ON public.flavors
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update flavors" ON public.flavors
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete flavors" ON public.flavors
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Products policies
CREATE POLICY "Admins can view all products" ON public.products
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert products" ON public.products
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update products" ON public.products
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete products" ON public.products
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Product flavor rules policies
CREATE POLICY "Admins can view all product_flavor_rules" ON public.product_flavor_rules
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert product_flavor_rules" ON public.product_flavor_rules
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update product_flavor_rules" ON public.product_flavor_rules
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete product_flavor_rules" ON public.product_flavor_rules
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Bundle components policies
CREATE POLICY "Admins can view all bundle_components" ON public.bundle_components
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert bundle_components" ON public.bundle_components
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update bundle_components" ON public.bundle_components
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete bundle_components" ON public.bundle_components
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Stock policies
CREATE POLICY "Admins can view all stock" ON public.stock
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert stock" ON public.stock
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can update stock" ON public.stock
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete stock" ON public.stock
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Stock adjustments policies
CREATE POLICY "Admins can view all stock_adjustments" ON public.stock_adjustments
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can insert stock_adjustments" ON public.stock_adjustments
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Customers policies
CREATE POLICY "Admins can view all customers" ON public.customers
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert customers" ON public.customers
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Owner/Manager can update customers" ON public.customers
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Owner/Manager can delete customers" ON public.customers
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
);

-- Orders policies
CREATE POLICY "Admins can view all orders" ON public.orders
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert orders" ON public.orders
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update orders" ON public.orders
FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Order items policies
CREATE POLICY "Admins can view all order_items" ON public.order_items
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert order_items" ON public.order_items
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- Order item flavors policies
CREATE POLICY "Admins can view all order_item_flavors" ON public.order_item_flavors
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert order_item_flavors" ON public.order_item_flavors
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- Payment proofs policies
CREATE POLICY "Admins can view all payment_proofs" ON public.payment_proofs
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert payment_proofs when order pending or for_verification" ON public.payment_proofs
FOR INSERT TO authenticated WITH CHECK (
  public.is_admin(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE id = order_id AND status IN ('pending', 'for_verification')
  )
);

CREATE POLICY "Admins can update payment_proofs when order pending or for_verification" ON public.payment_proofs
FOR UPDATE TO authenticated USING (
  public.is_admin(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE id = order_id AND status IN ('pending', 'for_verification')
  )
);

-- User roles policies
CREATE POLICY "Owner can view all user_roles" ON public.user_roles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view own role" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Owner can insert user_roles" ON public.user_roles
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner can update user_roles" ON public.user_roles
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner can delete user_roles" ON public.user_roles
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Settings policies
CREATE POLICY "Admins can view all settings" ON public.settings
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Owner can insert settings" ON public.settings
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner can update settings" ON public.settings
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- ============================================
-- 8. INDEXES
-- ============================================

CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_type ON public.products(product_type);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE archived_at IS NULL;
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created ON public.orders(created_at);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_stock_product ON public.stock(product_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

-- ============================================
-- 9. STORAGE BUCKET FOR PAYMENT PROOFS
-- ============================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-proofs', 'payment-proofs', false);

-- Storage policies for payment proofs
CREATE POLICY "Admins can upload payment proofs" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'payment-proofs' AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can view payment proofs" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'payment-proofs' AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can update payment proofs" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'payment-proofs' AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can delete payment proofs" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'payment-proofs' AND public.is_admin(auth.uid())
);