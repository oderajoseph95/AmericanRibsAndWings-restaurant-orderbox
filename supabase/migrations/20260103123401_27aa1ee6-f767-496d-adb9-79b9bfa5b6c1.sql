-- Add new columns to orders table for pickup scheduling and delivery
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time time;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text;