const {
  assertPublicHttpUrl,
  binaryProxyResponse,
  getDirectusUrl,
  getEnv,
  jsonResponse,
  noContent,
  parseJsonBody,
} = require('./_shared/http.cjs');
const { requireCloudflareAccess } = require('./_shared/cloudflare-access.cjs');

const CATALOG_WEBHOOK_PATHS = new Set([
  '/webhook/91307d0b-16c6-4de5-b349-ea274dd9259d',
  '/webhook/60d19a37-65b1-492f-ad35-3bbb474f3cd9',
  '/webhook/77887f94-dfa2-48fe-8b13-8798b693a55a',
]);

const ALLOWED_WEBHOOK_KEYS = new Set([
  'n8n_get_products',
  'n8n_get_prices',
  'n8n_get_multiplier',
  'n8n_derva_vectorize',
  'n8n_similar_tanks',
  'n8n_update_talpos_description',
  'n8n_price_estimation',
  'n8n_derva_select',
  'ndk_manual_upload',
]);
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function getDirectusToken() {
  return getEnv('DIRECTUS_ADMIN_TOKEN') || getEnv('DIRECTUS_TOKEN');
}

function getWebhookKey(eventPath) {
  let key = String(eventPath || '');
  key = key.replace(/^\/api\/webhooks\/?/, '');
  key = key.replace(/^\/\.netlify\/functions\/webhook-proxy\/?/, '');
  key = key.replace(/^\/+/, '').split('/')[0];
  return decodeURIComponent(key || '').trim();
}

function maybeRewriteCatalogApiUrl(url) {
  const catalogApiBase = getEnv('CATALOG_API_BASE');
  if (!catalogApiBase) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname !== 'n8n.traidenis.org') return url;
  if (!CATALOG_WEBHOOK_PATHS.has(parsed.pathname)) return url;

  const base = catalogApiBase.replace(/\/+$/, '');
  return `${base}${parsed.pathname}${parsed.search}`;
}

async function readWebhookUrl(webhookKey) {
  const directusToken = getDirectusToken();
  if (!directusToken) throw new Error('DIRECTUS_ADMIN_TOKEN or DIRECTUS_TOKEN is not configured in Netlify.');

  const params = new URLSearchParams();
  params.set('filter[webhook_key][_eq]', webhookKey);
  params.set('filter[is_active][_eq]', 'true');
  params.set('limit', '1');
  params.set('fields', 'url,is_active');

  const response = await fetch(`${getDirectusUrl()}/items/webhooks?${params.toString()}`, {
    headers: { authorization: `Bearer ${directusToken}`, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to read webhook configuration (${response.status}).`);
  const json = await response.json();
  const url = String(json?.data?.[0]?.url || '').trim();
  if (!url) throw new Error(`Webhook "${webhookKey}" not found or inactive.`);
  return maybeRewriteCatalogApiUrl(url);
}

async function forwardWebhook(url, payload) {
  assertPublicHttpUrl(url);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json,text/plain,*/*' },
    body: JSON.stringify(payload),
  });
  return binaryProxyResponse(response, {
    'content-type': response.headers.get('content-type') || 'application/json',
  });
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return noContent();
  if (method !== 'POST') return jsonResponse(405, { message: 'Method not allowed.' });

  const access = await requireCloudflareAccess(event);
  if (!access.ok) return access.response;

  let payload;
  try {
    payload = parseJsonBody(event, MAX_BODY_BYTES);
  } catch (err) {
    return jsonResponse(err.statusCode || 400, { message: err.statusCode === 413 ? err.message : 'Invalid JSON body.' });
  }

  try {
    const webhookKey = getWebhookKey(event.path || '');
    if (webhookKey === 'test') {
      const url = String(payload.url || '').trim();
      if (!url) return jsonResponse(400, { message: 'Webhook test URL is required.' });
      return await forwardWebhook(url, payload.payload || { message: 'Test request from Traidenis admin panel' });
    }

    if (!ALLOWED_WEBHOOK_KEYS.has(webhookKey)) {
      return jsonResponse(400, { message: 'Webhook key is not allowed.' });
    }

    return await forwardWebhook(await readWebhookUrl(webhookKey), payload);
  } catch (err) {
    return jsonResponse(502, { message: err && err.message ? err.message : String(err) });
  }
};
