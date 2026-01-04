-- Enable REPLICA IDENTITY FULL for real-time updates to work properly
-- This ensures complete row data is sent during UPDATE events
ALTER TABLE public.orders REPLICA IDENTITY FULL;