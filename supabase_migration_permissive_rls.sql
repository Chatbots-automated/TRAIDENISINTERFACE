-- TEMPORARY FIX: More permissive RLS policies for testing
-- This allows any authenticated user to create/read/update/delete conversations
-- Once working, you can make policies more restrictive

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own SDK conversations" ON sdk_conversations;
DROP POLICY IF EXISTS "Users can create SDK conversations" ON sdk_conversations;
DROP POLICY IF EXISTS "Users can update their own SDK conversations" ON sdk_conversations;
DROP POLICY IF EXISTS "Users can delete their own SDK conversations" ON sdk_conversations;

-- Create permissive policies (any authenticated user)
CREATE POLICY "Authenticated users can view SDK conversations"
  ON sdk_conversations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create SDK conversations"
  ON sdk_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update SDK conversations"
  ON sdk_conversations
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete SDK conversations"
  ON sdk_conversations
  FOR DELETE
  TO authenticated
  USING (true);

-- Optional: Add a more restrictive policy later once working
-- You can check author_id or author_email matches the current user
-- Example:
-- CREATE POLICY "Users can only modify their own conversations"
--   ON sdk_conversations
--   FOR ALL
--   TO authenticated
--   USING (author_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
