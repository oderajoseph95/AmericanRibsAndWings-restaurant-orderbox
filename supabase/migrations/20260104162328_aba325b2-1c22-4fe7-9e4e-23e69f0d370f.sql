-- Add refund tracking columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_proof_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_refunded boolean DEFAULT false;