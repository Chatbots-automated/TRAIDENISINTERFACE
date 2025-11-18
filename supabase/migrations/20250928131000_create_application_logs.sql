/*
  # Create Application Logs Table

  ## Overview
  This migration creates a unified application_logs table for comprehensive logging
  with flexible JSONB metadata storage and efficient querying capabilities.

  ## New Tables

  ### application_logs
  A unified logging table that captures all application events with flexible metadata
  - `id` (uuid, primary key)
  - `level` (text) - Log level: debug, info, warn, error, critical
  - `category` (text) - Event category: auth, chat, document, user_management, system, api, error
  - `action` (text) - Specific action being logged
  - `message` (text) - Human-readable log message
  - `session_id` (text) - Session identifier for request tracking
  - `user_id` (uuid) - References app_users table
  - `user_email` (text) - User email for easy filtering
  - `metadata` (jsonb) - Flexible JSON storage for additional context
  - `timestamp` (timestamptz) - When the event occurred
  - `created_at` (timestamptz) - When the log was created

  ## Security
  - Enable RLS on application_logs table
  - Users can view their own logs
  - Admins can view all logs
  - System can insert logs (any authenticated user can log)

  ## Indexes
  - Indexes on level, category, action for fast filtering
  - Index on user_id for user-specific queries
  - Index on session_id for request tracing
  - Indexes on timestamp fields for time-based queries
  - Composite index for common query patterns
  - GIN index on metadata JSONB for flexible querying
*/

-- Create application_logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS application_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Log identification
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
    category TEXT NOT NULL CHECK (category IN ('auth', 'chat', 'document', 'user_management', 'system', 'api', 'error')),
    action TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Context
    session_id TEXT,
    user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    user_email TEXT,

    -- Metadata (JSONB for flexible storage and querying)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_application_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_application_logs_category ON application_logs(category);
CREATE INDEX IF NOT EXISTS idx_application_logs_action ON application_logs(action);
CREATE INDEX IF NOT EXISTS idx_application_logs_user_id ON application_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_application_logs_session_id ON application_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_application_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_created_at ON application_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_category_level_timestamp ON application_logs(category, level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_metadata ON application_logs USING GIN (metadata);

-- Enable Row Level Security
ALTER TABLE application_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own logs" ON application_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON application_logs;
DROP POLICY IF EXISTS "System can insert logs" ON application_logs;

-- Policy: System can insert logs (for application logging)
CREATE POLICY "System can insert logs"
    ON application_logs
    FOR INSERT
    WITH CHECK (true);

-- Policy: Users can view own logs
CREATE POLICY "Users can view own logs"
    ON application_logs
    FOR SELECT
    USING (user_id::text = auth.uid()::text OR user_email = auth.email());

-- Policy: Admins can view all logs
CREATE POLICY "Admins can view all logs"
    ON application_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.id::text = auth.uid()::text
            AND app_users.is_admin = true
        )
    );
