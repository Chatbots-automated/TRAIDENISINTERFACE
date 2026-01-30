-- Fix RLS policies to also check email (for cases where auth.uid() might not work)
-- Run this if you're getting RLS policy violations

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create SDK conversations" ON sdk_conversations;
DROP POLICY IF EXISTS "Users can update their own SDK conversations" ON sdk_conversations;
DROP POLICY IF EXISTS "Users can delete their own SDK conversations" ON sdk_conversations;

-- Recreate with email fallback
CREATE POLICY "Users can create SDK conversations"
  ON sdk_conversations
  FOR INSERT
  WITH CHECK (author_id = auth.uid() OR author_email = auth.email());

CREATE POLICY "Users can update their own SDK conversations"
  ON sdk_conversations
  FOR UPDATE
  USING (author_id = auth.uid() OR author_email = auth.email());

CREATE POLICY "Users can delete their own SDK conversations"
  ON sdk_conversations
  FOR DELETE
  USING (author_id = auth.uid() OR author_email = auth.email());
