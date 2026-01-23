-- Nestandartiniai Gaminiai Webhooks Setup
-- Run this SQL in your Supabase SQL Editor to populate the webhooks table

-- 1. Upload New EML (without search) - "Tiesiog įkelti naują įrašą"
INSERT INTO webhooks (
  id,
  webhook_key,
  webhook_name,
  description,
  url,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'n8n_upload_new',
  'Upload New EML',
  'Uploads .eml file to knowledge base without searching for similar products. Used when "Tiesiog įkelti naują įrašą" is selected.',
  'http://n8n.traidenis.lt:5678/webhook-test/4929719e-8f1b-45da-9b0e-2427184f67eb',
  true,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 2. Find Similar Products - "Rasti panašius gaminius"
INSERT INTO webhooks (
  id,
  webhook_key,
  webhook_name,
  description,
  url,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'n8n_find_similar',
  'Find Similar Products',
  'Searches for similar products and returns .eml file + PDF/Word attachments. Used when "Rasti panašius gaminius" is selected or when searching by project.',
  'http://n8n.traidenis.lt:5678/webhook/find-similar',
  false,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 3. Upload Solution (Commercial Offer)
INSERT INTO webhooks (
  id,
  webhook_key,
  webhook_name,
  description,
  url,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'n8n_upload_solution',
  'Upload Commercial Offer',
  'Uploads commercial offer file (PDF, Word, etc.) for a selected project. Used in "Įkelti Sprendimą" mode.',
  'http://n8n.traidenis.lt:5678/webhook/upload-solution',
  false,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify the webhooks were created
SELECT
  webhook_key,
  webhook_name,
  url,
  is_active,
  description
FROM webhooks
ORDER BY webhook_key;
