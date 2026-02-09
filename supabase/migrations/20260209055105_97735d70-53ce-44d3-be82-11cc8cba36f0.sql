-- Add confirmation_code field to reservations (nullable, unique)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS confirmation_code TEXT;

-- Create unique partial index for confirmation codes (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_confirmation_code 
ON reservations(confirmation_code) 
WHERE confirmation_code IS NOT NULL;