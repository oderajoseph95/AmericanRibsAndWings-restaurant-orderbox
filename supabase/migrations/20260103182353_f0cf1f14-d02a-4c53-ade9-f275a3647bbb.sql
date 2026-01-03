-- Create function to get user ID by email (for adding roles)
-- Only owners can use this function
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Only allow owners to use this function
  IF NOT has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owners can look up users by email';
  END IF;
  
  -- Look up the user in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(p_email))
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that email address. Make sure they have signed up first.';
  END IF;
  
  RETURN v_user_id;
END;
$$;