const DEFAULT_DIRECTUS_URL = 'https://sql.traidenis.org';

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

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}

function getDirectusUrl() {
  return (process.env.DIRECTUS_URL || DEFAULT_DIRECTUS_URL).trim().replace(/\/+$/, '');
}

function getDirectusToken() {
  return (process.env.DIRECTUS_ADMIN_TOKEN || process.env.DIRECTUS_TOKEN || '').trim();
}

function parseJsonBody(event) {
  const body = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '{}');
  return JSON.parse(body || '{}');
}

function getWebhookKey(eventPath) {
  let key = eventPath || '';
  key = key.replace(/^\/api\/webhooks\/?/, '');
  key = key.replace(/^\/\.netlify\/functions\/webhook-proxy\/?/, '');
  key = key.replace(/^\/+/, '').split('/')[0];
  return decodeURIComponent(key || '').trim();
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
  if (!response.ok) {
    throw new Error(`Failed to read webhook configuration (${response.status}).`);
  }
  const json = await response.json();
  const url = String(json?.data?.[0]?.url || '').trim();
  if (!url) throw new Error(`Webhook "${webhookKey}" not found or inactive.`);
  return url;
}

function assertPublicHttpUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) webhook URLs are supported.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
    throw new Error('Local webhook URLs are not allowed.');
  }
}

async function forwardWebhook(url, payload) {
  assertPublicHttpUrl(url);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json,text/plain,*/*' },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get('content-type') || 'application/json';
  const body = Buffer.from(await response.arrayBuffer());
  return {
    statusCode: response.status,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
    body: body.toString('base64'),
    isBase64Encoded: true,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(405, { message: 'Method not allowed.' });

  const webhookKey = getWebhookKey(event.path || '');
  let payload;
  try {
    payload = parseJsonBody(event);
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON body.' });
  }

  try {
    if (webhookKey === 'test') {
      const url = String(payload.url || '').trim();
      if (!url) return jsonResponse(400, { message: 'Webhook test URL is required.' });
      return await forwardWebhook(url, payload.payload || { message: 'Test request from Traidenis admin panel' });
    }

    if (!ALLOWED_WEBHOOK_KEYS.has(webhookKey)) {
      return jsonResponse(400, { message: 'Webhook key is not allowed.' });
    }

    const url = await readWebhookUrl(webhookKey);
    return await forwardWebhook(url, payload);
  } catch (err) {
    return jsonResponse(502, { message: err && err.message ? err.message : String(err) });
  }
};
