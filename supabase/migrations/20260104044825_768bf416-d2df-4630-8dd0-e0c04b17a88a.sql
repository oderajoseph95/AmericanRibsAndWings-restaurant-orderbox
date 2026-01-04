-- =====================================================
-- Driver Payout System - Complete Schema
-- =====================================================

-- 1. Driver Payment Information Table
CREATE TABLE public.driver_payment_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('gcash', 'maya', 'bank')),
  account_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text, -- Only for bank transfers
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(driver_id, payment_method)
);

-- 2. Driver Earnings Table (one record per completed delivery)
CREATE TABLE public.driver_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_fee numeric NOT NULL DEFAULT 0,
  distance_km numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'requested', 'processing', 'paid')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(order_id)
);

-- 3. Payout Requests Table
CREATE TABLE public.driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  account_details jsonb NOT NULL, -- Snapshot of account info at request time
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid, -- Admin who processed
  payment_proof_url text, -- Admin uploads proof
  admin_notes text,
  created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS on all tables
ALTER TABLE public.driver_payment_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for driver_payment_info
CREATE POLICY "Drivers can view own payment info"
ON public.driver_payment_info FOR SELECT
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Drivers can insert own payment info"
ON public.driver_payment_info FOR INSERT
WITH CHECK (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Drivers can update own payment info"
ON public.driver_payment_info FOR UPDATE
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Drivers can delete own payment info"
ON public.driver_payment_info FOR DELETE
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can view all payment info"
ON public.driver_payment_info FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage all payment info"
ON public.driver_payment_info FOR ALL
USING (is_admin(auth.uid()));

-- 6. RLS Policies for driver_earnings
CREATE POLICY "Drivers can view own earnings"
ON public.driver_earnings FOR SELECT
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can view all earnings"
ON public.driver_earnings FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert earnings"
ON public.driver_earnings FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update earnings"
ON public.driver_earnings FOR UPDATE
USING (is_admin(auth.uid()));

-- 7. RLS Policies for driver_payouts
CREATE POLICY "Drivers can view own payouts"
ON public.driver_payouts FOR SELECT
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE user_id = auth.uid()
));

CREATE POLICY "Drivers can request payouts"
ON public.driver_payouts FOR INSERT
WITH CHECK (
  driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  AND status = 'pending'
);

CREATE POLICY "Admins can view all payouts"
ON public.driver_payouts FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage all payouts"
ON public.driver_payouts FOR ALL
USING (is_admin(auth.uid()));

-- 8. Trigger function to auto-create earnings when order is completed
CREATE OR REPLACE FUNCTION public.create_driver_earning_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes to 'delivered' or 'completed' and has driver_id
  IF (OLD.status IS DISTINCT FROM NEW.status) 
     AND NEW.status IN ('delivered', 'completed')
     AND NEW.driver_id IS NOT NULL 
     AND NEW.order_type = 'delivery' THEN
    
    -- Check if earning already exists for this order
    IF NOT EXISTS (SELECT 1 FROM driver_earnings WHERE order_id = NEW.id) THEN
      INSERT INTO driver_earnings (
        driver_id,
        order_id,
        delivery_fee,
        distance_km,
        status
      ) VALUES (
        NEW.driver_id,
        NEW.id,
        COALESCE(NEW.delivery_fee, 0),
        COALESCE(NEW.delivery_distance_km, 0),
        'available'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 9. Create trigger for auto-creating earnings
CREATE TRIGGER trigger_create_driver_earning
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_driver_earning_on_delivery();

-- 10. Create payout-proofs storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payout-proofs', 'payout-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 11. Storage policies for payout-proofs bucket
CREATE POLICY "Admins can upload payout proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payout-proofs' 
  AND is_admin(auth.uid())
);

CREATE POLICY "Anyone can view payout proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'payout-proofs');

CREATE POLICY "Admins can delete payout proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payout-proofs' 
  AND is_admin(auth.uid())
);

-- 12. Update trigger for timestamps
CREATE TRIGGER update_driver_payment_info_updated_at
BEFORE UPDATE ON public.driver_payment_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_driver_earnings_updated_at
BEFORE UPDATE ON public.driver_earnings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_earnings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_payouts;