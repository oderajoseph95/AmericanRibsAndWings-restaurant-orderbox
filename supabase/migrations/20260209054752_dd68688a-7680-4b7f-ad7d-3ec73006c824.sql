-- Create reservation_notes table for internal admin notes
CREATE TABLE reservation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  admin_display_name TEXT,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups by reservation
CREATE INDEX idx_reservation_notes_reservation_id ON reservation_notes(reservation_id);

-- Enable RLS
ALTER TABLE reservation_notes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admin users to read notes
CREATE POLICY "Admins can read reservation notes" ON reservation_notes
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- Allow authenticated admin users to insert notes
CREATE POLICY "Admins can insert reservation notes" ON reservation_notes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));