-- Create reservation_status enum
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- Create reservations table
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  pax INTEGER NOT NULL CHECK (pax > 0 AND pax <= 20),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  notes TEXT,
  status reservation_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can insert reservations" ON public.reservations
  FOR INSERT WITH CHECK (status = 'pending');

CREATE POLICY "Public can view reservation by code" ON public.reservations
  FOR SELECT USING (true);

CREATE POLICY "Admins can view all reservations" ON public.reservations
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update reservations" ON public.reservations
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Owner can delete reservations" ON public.reservations
  FOR DELETE USING (has_role(auth.uid(), 'owner'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- Secure function to create reservation with unique code generation
CREATE OR REPLACE FUNCTION public.create_reservation(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_pax INTEGER DEFAULT 2,
  p_reservation_date DATE DEFAULT NULL,
  p_reservation_time TIME DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, reservation_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  -- Validate required fields
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone is required';
  END IF;
  
  IF p_pax < 1 OR p_pax > 20 THEN
    RAISE EXCEPTION 'Party size must be between 1 and 20';
  END IF;

  IF p_reservation_date IS NULL THEN
    RAISE EXCEPTION 'Reservation date is required';
  END IF;

  IF p_reservation_time IS NULL THEN
    RAISE EXCEPTION 'Reservation time is required';
  END IF;
  
  -- Generate unique code with retry
  LOOP
    v_code := 'ARW-RSV-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if code exists
    IF NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.reservation_code = v_code) THEN
      EXIT;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique reservation code';
    END IF;
  END LOOP;
  
  -- Insert reservation
  INSERT INTO reservations (
    reservation_code,
    name,
    phone,
    email,
    pax,
    reservation_date,
    reservation_time,
    notes,
    status
  ) VALUES (
    v_code,
    TRIM(p_name),
    TRIM(p_phone),
    NULLIF(TRIM(p_email), ''),
    p_pax,
    p_reservation_date,
    p_reservation_time,
    NULLIF(TRIM(p_notes), ''),
    'pending'
  )
  RETURNING reservations.id INTO v_reservation_id;
  
  RETURN QUERY SELECT v_reservation_id, v_code;
END;
$$;

-- Insert default SMS template for reservations
INSERT INTO public.sms_templates (type, name, content, is_active)
VALUES (
  'reservation_received',
  'Reservation Received',
  'American Ribs & Wings: Reservation {{reservation_code}} received for {{pax}} guests on {{reservation_date}} at {{reservation_time}}. We will confirm via SMS shortly.',
  true
)
ON CONFLICT DO NOTHING;