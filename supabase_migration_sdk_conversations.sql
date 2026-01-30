-- Create sdk_conversations table
CREATE TABLE IF NOT EXISTS sdk_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Naujas pokalbis',
  author_id UUID NOT NULL,
  author_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  messages JSONB DEFAULT '[]'::jsonb,
  artifact JSONB DEFAULT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sdk_conversations_project_id ON sdk_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_sdk_conversations_author_id ON sdk_conversations(author_id);
CREATE INDEX IF NOT EXISTS idx_sdk_conversations_last_message ON sdk_conversations(last_message_at DESC);

-- Enable Row Level Security
ALTER TABLE sdk_conversations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own conversations
CREATE POLICY "Users can view their own SDK conversations"
  ON sdk_conversations
  FOR SELECT
  USING (author_id = auth.uid() OR author_email = auth.email());

-- Create policy to allow users to create conversations
CREATE POLICY "Users can create SDK conversations"
  ON sdk_conversations
  FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Create policy to allow users to update their own conversations
CREATE POLICY "Users can update their own SDK conversations"
  ON sdk_conversations
  FOR UPDATE
  USING (author_id = auth.uid());

-- Create policy to allow users to delete their own conversations
CREATE POLICY "Users can delete their own SDK conversations"
  ON sdk_conversations
  FOR DELETE
  USING (author_id = auth.uid());

-- Add comment
COMMENT ON TABLE sdk_conversations IS 'Stores SDK chat conversations with messages and artifacts for commercial offers';
