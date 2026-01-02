-- Create webhooks table for managing webhook endpoints
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_key VARCHAR(100) UNIQUE NOT NULL,
    webhook_name VARCHAR(255) NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    last_test_status INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Admins can read webhooks" ON webhooks;
DROP POLICY IF EXISTS "Admins can update webhooks" ON webhooks;
DROP POLICY IF EXISTS "Admins can insert webhooks" ON webhooks;

-- Policy: Only admins can read webhooks
CREATE POLICY "Admins can read webhooks" ON webhooks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.email = current_setting('request.jwt.claims', true)::json->>'email'
            AND app_users.is_admin = true
        )
    );

-- Policy: Only admins can update webhooks
CREATE POLICY "Admins can update webhooks" ON webhooks
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.email = current_setting('request.jwt.claims', true)::json->>'email'
            AND app_users.is_admin = true
        )
    );

-- Policy: Only admins can insert webhooks
CREATE POLICY "Admins can insert webhooks" ON webhooks
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.email = current_setting('request.jwt.claims', true)::json->>'email'
            AND app_users.is_admin = true
        )
    );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_webhooks_key ON webhooks(webhook_key);

-- Insert default webhooks if they don't exist
INSERT INTO webhooks (webhook_key, webhook_name, description, url) VALUES
    ('instructions', 'Instrukcijos Webhook', 'Triggered when instruction variables are updated or reverted', 'https://n8n-self-host-gedarta.onrender.com/webhook-test/3961e6fa-4199-4f85-82f5-4e7e036f7e18'),
    ('chat_n8n', 'Chat N8N Webhook', 'Main chat webhook for AI responses and commercial offers', 'https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6'),
    ('vector_search', 'Vector Search Webhook', 'Webhook for vector search and document retrieval', 'https://209f05431d92.ngrok-free.app/webhook-test/8a667605-f58f-42e0-a8f1-5ce633954009')
ON CONFLICT (webhook_key) DO NOTHING;
