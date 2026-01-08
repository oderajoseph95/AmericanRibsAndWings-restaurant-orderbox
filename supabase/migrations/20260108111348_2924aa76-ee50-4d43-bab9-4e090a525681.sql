-- Add username column for admin login and is_super_owner flag
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_super_owner BOOLEAN DEFAULT false;

-- Create index for fast username lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_username ON public.user_roles(username);

-- Create function to generate a random username
CREATE OR REPLACE FUNCTION public.generate_random_username(role_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives text[] := ARRAY['swift', 'blazing', 'cosmic', 'golden', 'silver', 'royal', 'stellar', 'prime', 'ace', 'alpha', 'bold', 'brave', 'quick', 'sharp', 'wise'];
  random_adj text;
  random_num int;
  generated_username text;
  attempts int := 0;
BEGIN
  LOOP
    random_adj := adjectives[1 + floor(random() * array_length(adjectives, 1))::int];
    random_num := floor(random() * 900 + 100)::int;
    generated_username := lower(role_name) || '_' || random_adj || '_' || random_num;
    
    -- Check if username already exists
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE username = generated_username) THEN
      RETURN generated_username;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      -- Fallback with timestamp
      RETURN lower(role_name) || '_' || extract(epoch from now())::bigint;
    END IF;
  END LOOP;
END;
$$;