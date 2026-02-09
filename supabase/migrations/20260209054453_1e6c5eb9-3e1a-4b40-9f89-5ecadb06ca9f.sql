-- Add status_changed_at to track when status was last changed
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Add status_changed_by to track who changed the status (admin user ID)
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS status_changed_by UUID;