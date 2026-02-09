-- Nestandartiniai Gaminiai Webhooks Setup
-- Run this SQL in pgAdmin or psql to populate the webhooks table

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

-- 4. Get Products - SDK tool for querying products by code
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
  'n8n_get_products',
  'Get Products (SDK Tool)',
  'SDK chat tool: queries the products table by product_code. Used by the Anthropic AI assistant during commercial offer generation.',
  'https://n8n.traidenis.org/webhook/91307d0b-16c6-4de5-b349-ea274dd9259d',
  true,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 5. Get Prices - SDK tool for querying pricing by product ID
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
  'n8n_get_prices',
  'Get Prices (SDK Tool)',
  'SDK chat tool: queries the pricing table by product ID. Used by the Anthropic AI assistant during commercial offer generation.',
  'https://n8n.traidenis.org/webhook/60d19a37-65b1-492f-ad35-3bbb474f3cd9',
  true,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 6. Get Multiplier - SDK tool for fetching latest price multiplier
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
  'n8n_get_multiplier',
  'Get Multiplier (SDK Tool)',
  'SDK chat tool: fetches the latest price multiplier coefficient. Used by the Anthropic AI assistant for price calculations.',
  'https://n8n.traidenis.org/webhook/77887f94-dfa2-48fe-8b13-8798b693a55a',
  true,
  NOW(),
  NOW()
) ON CONFLICT (webhook_key) DO UPDATE SET
  url = EXCLUDED.url,
  webhook_name = EXCLUDED.webhook_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 7. Commercial Offer - Generate and send standard commercial offer document
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
  'n8n_commercial_offer',
  'Commercial Offer Generation',
  'Generates a standard commercial offer document from parsed YAML artifact data. Triggered by the "Generuoti" button in the SDK chat interface.',
  'https://n8n.traidenis.org/webhook/a80582f0-d42b-4490-b142-0494f0afff89',
  true,
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
