-- Enable realtime for drivers table only (orders already added)
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;