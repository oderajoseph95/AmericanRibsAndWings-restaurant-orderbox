-- Drop the duplicate 8-parameter create_reservation function
-- This resolves the "Could not choose the best candidate function" error
-- by leaving only the 9-parameter version with p_idempotency_hash DEFAULT NULL
DROP FUNCTION IF EXISTS public.create_reservation(
  text, text, text, integer, date, time without time zone, text, jsonb
);