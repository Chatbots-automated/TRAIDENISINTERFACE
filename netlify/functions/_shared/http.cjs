const DEFAULT_DIRECTUS_URL = 'https://sql.traidenis.org';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

function jsonResponse(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function noContent() {
  return {
    statusCode: 204,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: '',
  };
}

function getEnv(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getDirectusUrl() {
  return getEnv('DIRECTUS_URL', DEFAULT_DIRECTUS_URL).replace(/\/+$/, '');
}

function forwardableHeaders(sourceHeaders = {}, { dropAuthorization = true } = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) continue;
    if (dropAuthorization && normalized === 'authorization') continue;
    if (value) headers[normalized] = value;
  }
  return headers;
}

function bodyBuffer(event, maxBytes) {
  const body = event.body || '';
  const bytes = Buffer.byteLength(body, event.isBase64Encoded ? 'base64' : 'utf8');
  if (maxBytes && bytes > maxBytes) {
    const err = new Error('Request body is too large.');
    err.statusCode = 413;
    throw err;
  }
  return event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body);
}

function parseJsonBody(event, maxBytes) {
  const body = bodyBuffer(event, maxBytes).toString('utf8') || '{}';
  return JSON.parse(body || '{}');
}

async function binaryProxyResponse(response, extraHeaders = {}) {
  const body = Buffer.from(await response.arrayBuffer());
  const headers = {
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  };
  const disposition = response.headers.get('content-disposition');
  if (disposition) headers['content-disposition'] = disposition;
  return {
    statusCode: response.status,
    headers,
    body: body.toString('base64'),
    isBase64Encoded: true,
  };
}

function assertPublicHttpUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) URLs are supported.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('Local/private hostnames are not allowed.');
  }
  if (/^(10|127|169\.254|192\.168)\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
    throw new Error('Private network URLs are not allowed.');
  }
}

module.exports = {
  DEFAULT_DIRECTUS_URL,
  HOP_BY_HOP_HEADERS,
  jsonResponse,
  noContent,
  getEnv,
  getDirectusUrl,
  forwardableHeaders,
  bodyBuffer,
  parseJsonBody,
  binaryProxyResponse,
  assertPublicHttpUrl,
};
