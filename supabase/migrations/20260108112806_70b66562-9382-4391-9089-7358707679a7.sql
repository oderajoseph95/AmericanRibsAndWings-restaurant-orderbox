-- Add display_name column to user_roles table
ALTER TABLE public.user_roles 
ADD COLUMN display_name TEXT;

-- Set default display names from existing usernames
UPDATE public.user_roles 
SET display_name = COALESCE(username, 'User');