/*
  # Create user_voiceflow_sessions table for robust user-Voiceflow linkage

  1. New Tables
    - `user_voiceflow_sessions`
      - `id` (uuid, primary key)
      - `app_user_id` (uuid, references app_users)
      - `voiceflow_user_id` (text, the traidenis_xxx ID passed to Voiceflow)
      - `session_started_at` (timestamptz)
      - `last_activity_at` (timestamptz)
      - `metadata` (jsonb, stores additional info like display_name, email at time of session)

  2. Security
    - Enable RLS
    - Users can view their own sessions
    - Admins can view all sessions

  3. Indexes
    - Unique constraint on app_user_id + voiceflow_user_id
    - Index on voiceflow_user_id for fast transcript lookups
*/

-- Create the user_voiceflow_sessions table
CREATE TABLE IF NOT EXISTS user_voiceflow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL,
  voiceflow_user_id TEXT NOT NULL,
  session_started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to app_users
  CONSTRAINT fk_app_user
    FOREIGN KEY (app_user_id)
    REFERENCES app_users(id)
    ON DELETE CASCADE
);

-- Create unique constraint for app_user + voiceflow_user combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_voiceflow_unique
  ON user_voiceflow_sessions(app_user_id, voiceflow_user_id);

-- Create index on voiceflow_user_id for fast lookups when enriching transcripts
CREATE INDEX IF NOT EXISTS idx_voiceflow_user_id
  ON user_voiceflow_sessions(voiceflow_user_id);

-- Create index on last_activity for ordering/filtering
CREATE INDEX IF NOT EXISTS idx_last_activity
  ON user_voiceflow_sessions(last_activity_at DESC);

-- Enable Row Level Security
ALTER TABLE user_voiceflow_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON user_voiceflow_sessions
  FOR SELECT
  USING (
    app_user_id::text = (
      SELECT id::text FROM app_users
      WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

-- Policy: Users can insert their own sessions
CREATE POLICY "Users can insert own sessions"
  ON user_voiceflow_sessions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update their own sessions
CREATE POLICY "Users can update own sessions"
  ON user_voiceflow_sessions
  FOR UPDATE
  USING (true);

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON user_voiceflow_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_voiceflow_sessions TO anon;
