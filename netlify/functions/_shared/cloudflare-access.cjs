const crypto = require('crypto');
const { getEnv, jsonResponse } = require('./http.cjs');

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
let jwksCache = { expiresAt: 0, keys: [] };

function unauthorized(message = 'Cloudflare Access authorization required.') {
  return jsonResponse(401, { message });
}

function forbidden(message = 'Cloudflare Access authorization denied.') {
  return jsonResponse(403, { message });
}

function getCookie(headers, name) {
  const cookieHeader = headers.cookie || headers.Cookie || '';
  const match = String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return match ? decodeURIComponent(match).replace(/^\"|\"$/g, '') : undefined;
}

function getAccessJwt(event) {
  const headers = event.headers || {};
  return headers['cf-access-jwt-assertion']
    || headers['CF-Access-Jwt-Assertion']
    || headers['Cf-Access-Jwt-Assertion']
    || getCookie(headers, 'CF_Authorization')
    || '';
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function decodeJwtPart(value) {
  return JSON.parse(base64UrlDecode(value).toString('utf8'));
}

async function getCloudflareJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache.expiresAt > now && jwksCache.keys.length > 0) return jwksCache.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to fetch Cloudflare Access certs (${response.status}).`);

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (keys.length === 0) throw new Error('Cloudflare Access cert response did not include keys.');
  jwksCache = { expiresAt: now + JWKS_CACHE_TTL_MS, keys };
  return keys;
}

function verifySignature(token, key) {
  const [header, payload, signature] = token.split('.');
  const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  return crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    publicKey,
    base64UrlDecode(signature)
  );
}

function assertClaims(payload, { aud, teamDomain }) {
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) throw forbidden('Cloudflare Access token audience is not allowed.');
  if (typeof payload.exp === 'number' && payload.exp <= now) throw unauthorized('Cloudflare Access token has expired.');
  if (typeof payload.nbf === 'number' && payload.nbf > now) throw unauthorized('Cloudflare Access token is not active yet.');
  const expectedIssuer = `https://${teamDomain}`;
  if (payload.iss && payload.iss !== expectedIssuer) throw forbidden('Cloudflare Access token issuer is not allowed.');
}

function getAccessIdentity(payload) {
  return {
    sub: payload.sub || null,
    email: payload.email || payload.common_name || null,
    name: payload.name || null,
    aud: payload.aud || null,
    iss: payload.iss || null,
  };
}

async function requireCloudflareAccess(event) {
  const teamDomain = getEnv('CLOUDFLARE_ACCESS_TEAM_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = getEnv('CLOUDFLARE_ACCESS_AUD');
  if (!teamDomain || !aud) {
    return {
      ok: false,
      response: jsonResponse(500, { message: 'Cloudflare Access JWT verification is not configured in Netlify.' }),
    };
  }

  const token = getAccessJwt(event);
  if (!token) return { ok: false, response: unauthorized() };

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) return { ok: false, response: unauthorized('Invalid Cloudflare Access token format.') };

    const header = decodeJwtPart(encodedHeader);
    const payload = decodeJwtPart(encodedPayload);
    if (header.alg !== 'RS256' || !header.kid) return { ok: false, response: forbidden('Unsupported Cloudflare Access token header.') };

    const keys = await getCloudflareJwks(teamDomain);
    const key = keys.find((candidate) => candidate.kid === header.kid);
    if (!key) return { ok: false, response: unauthorized('Cloudflare Access signing key was not found.') };
    if (!verifySignature(token, key)) return { ok: false, response: unauthorized('Cloudflare Access token signature is invalid.') };

    const claimError = (() => {
      try {
        assertClaims(payload, { aud, teamDomain });
        return null;
      } catch (err) {
        return err;
      }
    })();
    if (claimError) return { ok: false, response: claimError };

    return { ok: true, identity: getAccessIdentity(payload) };
  } catch (err) {
    return { ok: false, response: unauthorized(err && err.message ? err.message : 'Invalid Cloudflare Access token.') };
  }
}

module.exports = { requireCloudflareAccess };
