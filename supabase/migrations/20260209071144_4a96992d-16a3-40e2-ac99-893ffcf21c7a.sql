-- Add dedicated columns for completion tracking (R5.2)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);