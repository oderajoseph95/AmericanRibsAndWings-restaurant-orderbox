-- Enable realtime for analytics_events and abandoned_checkouts tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_checkouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_checkout_reminders;