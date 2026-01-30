-- Migration to add token tracking to sdk_conversations table
-- Run this AFTER creating the sdk_conversations table

-- Add token tracking columns to sdk_conversations table
ALTER TABLE sdk_conversations
ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cache_creation_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cache_read_tokens INTEGER DEFAULT 0;

-- Add comments explaining the token fields
COMMENT ON COLUMN sdk_conversations.total_input_tokens IS 'Total input tokens used across all messages in this conversation';
COMMENT ON COLUMN sdk_conversations.total_output_tokens IS 'Total output tokens generated across all messages in this conversation';
COMMENT ON COLUMN sdk_conversations.total_cache_creation_tokens IS 'Total tokens used for prompt cache creation';
COMMENT ON COLUMN sdk_conversations.total_cache_read_tokens IS 'Total tokens read from prompt cache';

-- Update the comment on messages column to document the expected structure
COMMENT ON COLUMN sdk_conversations.messages IS 'JSONB array of messages. Each message should have: role, content, timestamp, and optional fields: thinking, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens';

-- Create a function to calculate total tokens from messages JSONB
CREATE OR REPLACE FUNCTION calculate_conversation_tokens(conversation_id UUID)
RETURNS TABLE(
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens INTEGER
) AS $$
DECLARE
  msg JSONB;
  total_input INTEGER := 0;
  total_output INTEGER := 0;
  total_cache_creation INTEGER := 0;
  total_cache_read INTEGER := 0;
BEGIN
  -- Loop through all messages in the conversation
  FOR msg IN
    SELECT jsonb_array_elements(messages)
    FROM sdk_conversations
    WHERE id = conversation_id
  LOOP
    -- Sum up token counts from each message
    total_input := total_input + COALESCE((msg->>'input_tokens')::INTEGER, 0);
    total_output := total_output + COALESCE((msg->>'output_tokens')::INTEGER, 0);
    total_cache_creation := total_cache_creation + COALESCE((msg->>'cache_creation_input_tokens')::INTEGER, 0);
    total_cache_read := total_cache_read + COALESCE((msg->>'cache_read_input_tokens')::INTEGER, 0);
  END LOOP;

  RETURN QUERY SELECT total_input, total_output, total_cache_creation, total_cache_read;
END;
$$ LANGUAGE plpgsql;

-- Create a function to update conversation token totals
CREATE OR REPLACE FUNCTION update_conversation_token_totals(conversation_id UUID)
RETURNS VOID AS $$
DECLARE
  token_counts RECORD;
BEGIN
  -- Calculate totals
  SELECT * INTO token_counts FROM calculate_conversation_tokens(conversation_id);

  -- Update the conversation record
  UPDATE sdk_conversations
  SET
    total_input_tokens = token_counts.input_tokens,
    total_output_tokens = token_counts.output_tokens,
    total_cache_creation_tokens = token_counts.cache_creation_tokens,
    total_cache_read_tokens = token_counts.cache_read_tokens,
    updated_at = NOW()
  WHERE id = conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Create a view for easy access to conversation statistics
CREATE OR REPLACE VIEW sdk_conversation_stats AS
SELECT
  c.id,
  c.project_id,
  c.title,
  c.author_id,
  c.author_email,
  c.created_at,
  c.updated_at,
  c.message_count,
  c.last_message_at,
  c.total_input_tokens,
  c.total_output_tokens,
  c.total_cache_creation_tokens,
  c.total_cache_read_tokens,
  (c.total_input_tokens + c.total_output_tokens) as total_tokens,
  CASE
    WHEN c.total_output_tokens > 0
    THEN ROUND((c.total_input_tokens::DECIMAL / c.total_output_tokens), 2)
    ELSE 0
  END as input_output_ratio,
  CASE
    WHEN (c.total_input_tokens + c.total_output_tokens) > 0
    THEN ROUND((c.total_cache_read_tokens::DECIMAL / (c.total_input_tokens + c.total_output_tokens)) * 100, 2)
    ELSE 0
  END as cache_hit_percentage
FROM sdk_conversations c;

-- Grant access to the view (adjust role as needed)
-- GRANT SELECT ON sdk_conversation_stats TO authenticated;

-- Add index on token columns for analytics queries
CREATE INDEX IF NOT EXISTS idx_sdk_conversations_tokens ON sdk_conversations(total_input_tokens, total_output_tokens);
CREATE INDEX IF NOT EXISTS idx_sdk_conversations_created_at ON sdk_conversations(created_at DESC);

-- Example: How to query conversation statistics
-- SELECT * FROM sdk_conversation_stats WHERE author_id = auth.uid() ORDER BY created_at DESC;

-- Example: How to get total token usage for a user
-- SELECT
--   author_email,
--   SUM(total_input_tokens) as total_input,
--   SUM(total_output_tokens) as total_output,
--   SUM(total_input_tokens + total_output_tokens) as total_tokens,
--   COUNT(*) as conversation_count
-- FROM sdk_conversations
-- WHERE author_id = auth.uid()
-- GROUP BY author_email;
