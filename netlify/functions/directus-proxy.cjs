const {
  binaryProxyResponse,
  bodyBuffer,
  forwardableHeaders,
  getDirectusUrl,
  getEnv,
  jsonResponse,
  noContent,
} = require('./_shared/http.cjs');
const { requireCloudflareAccess } = require('./_shared/cloudflare-access.cjs');

const ALLOWED_PREFIXES = ['/items/', '/files', '/files/', '/assets/', '/users', '/users/'];
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'HEAD']);
const MAX_BODY_BYTES = 45 * 1024 * 1024;

function getDirectusToken(isAdmin) {
  const mainToken = getEnv('DIRECTUS_TOKEN');
  const adminToken = getEnv('DIRECTUS_ADMIN_TOKEN');
  return isAdmin ? (adminToken || mainToken) : mainToken;
}

function resolveDirectusRequestPath(eventPath) {
  let path = String(eventPath || '');
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
  if (!path || path.includes('..') || path.includes('://') || path.includes('\\')) return false;
  return ALLOWED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function isAdminRequest(eventPath) {
  return eventPath.includes('/api/directus-admin/')
    || eventPath.includes('/.netlify/functions/directus-proxy/directus-admin/');
}

exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return noContent();
  if (!ALLOWED_METHODS.has(method)) return jsonResponse(405, { message: 'Method not allowed.' });

  const access = await requireCloudflareAccess(event);
  if (!access.ok) return access.response;

  const eventPath = event.path || '';
  const isAdmin = isAdminRequest(eventPath);
  const targetPath = resolveDirectusRequestPath(eventPath);
  if (!isAllowedPath(targetPath)) {
    return jsonResponse(400, { message: 'Directus path is not allowed.' });
  }

  const token = getDirectusToken(isAdmin);
  if (!token) {
    return jsonResponse(500, {
      message: isAdmin
        ? 'DIRECTUS_ADMIN_TOKEN or DIRECTUS_TOKEN is not configured in Netlify.'
        : 'DIRECTUS_TOKEN is not configured in Netlify.',
    });
  }

  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  const targetUrl = `${getDirectusUrl()}${targetPath}${query}`;
  const headers = forwardableHeaders(event.headers, { dropAuthorization: true });
  headers.authorization = `Bearer ${token}`;
  headers.accept = headers.accept || 'application/json';

  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method) && event.body) {
    try {
      init.body = bodyBuffer(event, MAX_BODY_BYTES);
    } catch (err) {
      return jsonResponse(err.statusCode || 400, { message: err.message || 'Invalid request body.' });
    }
  }

  try {
    const response = await fetch(targetUrl, init);
    return await binaryProxyResponse(response);
  } catch (err) {
    return jsonResponse(502, {
      message: 'Failed to proxy Directus request.',
      details: err && err.message ? err.message : String(err),
    });
  }
};
