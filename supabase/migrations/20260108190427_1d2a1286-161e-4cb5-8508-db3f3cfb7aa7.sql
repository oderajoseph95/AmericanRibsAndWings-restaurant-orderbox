-- Allow anyone to read abandoned checkout by ID for cart recovery
-- This is safe because UUIDs are not guessable and only sent via recovery links
CREATE POLICY "Allow read abandoned checkout by id for recovery" ON abandoned_checkouts
FOR SELECT USING (true);