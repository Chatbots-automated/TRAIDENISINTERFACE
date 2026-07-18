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

const ALLOWED_PREFIXES = ['/items/', '/files', '/files/', '/assets/', '/users', '/users/'];
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'HEAD']);

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

function getDirectusToken(isAdmin) {
  const mainToken = (process.env.DIRECTUS_TOKEN || '').trim();
  const adminToken = (process.env.DIRECTUS_ADMIN_TOKEN || '').trim();
  return isAdmin ? (adminToken || mainToken) : mainToken;
}

function resolvePath(eventPath) {
  let path = eventPath || '';
  path = path.replace(/^\/\.netlify\/functions\/directus-proxy\/?/, '');
  path = path.replace(/^\/directus-proxy\/?/, '');
  path = path.replace(/^\/api\/directus-admin\/?/, 'directus-admin/');
  path = path.replace(/^\/api\/directus-assets\/?/, 'assets/');
  path = path.replace(/^\/api\/directus\/?/, '');
  path = path.replace(/^\/+/, '');
  path = path.replace(/^directus-admin\/?/, '');
  path = path.replace(/^directus-assets\/?/, 'assets/');
  return `/${path}`;
}

function isAllowedPath(path) {
  if (!path || path.includes('..') || path.includes('://')) return false;
  return ALLOWED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
  }
  if (!ALLOWED_METHODS.has(method)) {
    return jsonResponse(405, { message: 'Method not allowed.' });
  }

  const eventPath = event.path || '';
  const isAdmin = eventPath.includes('/api/directus-admin/') || eventPath.includes('/.netlify/functions/directus-proxy/directus-admin/');
  const targetPath = resolvePath(eventPath);
  if (!isAllowedPath(targetPath)) {
    return jsonResponse(400, { message: 'Directus path is not allowed.' });
  }

  const token = getDirectusToken(isAdmin);
  if (!token) {
    return jsonResponse(500, { message: isAdmin ? 'DIRECTUS_ADMIN_TOKEN or DIRECTUS_TOKEN is not configured in Netlify.' : 'DIRECTUS_TOKEN is not configured in Netlify.' });
  }

  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  const targetUrl = `${getDirectusUrl()}${targetPath}${query}`;

  const headers = {};
  for (const [key, value] of Object.entries(event.headers || {})) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== 'authorization' && value) {
      headers[normalized] = value;
    }
  }
  headers.authorization = `Bearer ${token}`;
  headers.accept = headers.accept || 'application/json';

  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method) && event.body) {
    init.body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
  }

  try {
    const response = await fetch(targetUrl, init);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const disposition = response.headers.get('content-disposition');
    const body = Buffer.from(await response.arrayBuffer());
    const responseHeaders = {
      'content-type': contentType,
      'cache-control': 'no-store',
    };
    if (disposition) responseHeaders['content-disposition'] = disposition;

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: body.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return jsonResponse(502, {
      message: 'Failed to proxy Directus request.',
      details: err && err.message ? err.message : String(err),
    });
  }
};
