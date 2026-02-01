-- Add 'employee' to the app_role enum
ALTER TYPE app_role ADD VALUE 'employee';

-- Create employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  employee_id text,
  date_hired date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all employees"
  ON public.employees FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Employees can view own record"
  ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Owner/Manager can insert employees"
  ON public.employees FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can update employees"
  ON public.employees FOR UPDATE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Owner/Manager can delete employees"
  ON public.employees FOR DELETE
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'));

-- Trigger for updated_at
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();