-- Webhooks table migration (safe to run even if table exists)
-- This adds missing webhook entries for the admin panel

-- Insert default webhooks if they don't exist
INSERT INTO webhooks (webhook_key, webhook_name, description, url) VALUES
    ('instructions', 'Instrukcijos Webhook', 'Triggered when instruction variables are updated or reverted', 'https://n8n-self-host-gedarta.onrender.com/webhook-test/3961e6fa-4199-4f85-82f5-4e7e036f7e18'),
    ('chat_n8n', 'Chat N8N Webhook', 'Main chat webhook for AI responses and commercial offers', 'https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6'),
    ('vector_search', 'Vector Search Webhook', 'Webhook for vector search and document retrieval', 'https://209f05431d92.ngrok-free.app/webhook-test/8a667605-f58f-42e0-a8f1-5ce633954009')
ON CONFLICT (webhook_key) DO NOTHING;
