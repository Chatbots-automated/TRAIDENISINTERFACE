'use strict';

const { NOT_FOUND_BODY, WEBHOOK_PATHS } = require('./config');
const {
  getProductByCode,
  getPriceById,
  getLatestMultiplier,
} = require('./queries');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 500, NOT_FOUND_BODY);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function createHandlers({ pool, webhookPaths = WEBHOOK_PATHS, notFoundBody = NOT_FOUND_BODY }) {
  async function handleGetProducts(body) {
    const productCode = String(body?.product_code ?? '').trim();
    if (!productCode) return null;
    return getProductByCode(pool, productCode);
  }

  async function handleGetPrices(body) {
    const rawId = body?.id;
    if (rawId == null || rawId === '') return null;
    const priceId = Number(rawId);
    if (!Number.isInteger(priceId) || priceId <= 0) return null;
    return getPriceById(pool, priceId);
  }

  async function handleGetMultiplier() {
    return getLatestMultiplier(pool);
  }

  const routes = {
  [webhookPaths.GET_PRODUCTS]: handleGetProducts,
  [webhookPaths.GET_PRICES]: handleGetPrices,
  [webhookPaths.GET_MULTIPLIER]: handleGetMultiplier,
  };

  async function handleRequest(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, accept',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'catalog-api' });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method not allowed.' });
      return;
    }

    const routeHandler = routes[req.url];
    if (!routeHandler) {
      sendJson(res, 404, { message: 'Not found.' });
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { message: 'Invalid JSON body.' });
      return;
    }

    try {
      const result = await routeHandler(body);
      if (!result) {
        sendJson(res, 500, notFoundBody);
        return;
      }
      sendJson(res, 200, result);
    } catch (err) {
      console.error('[catalog-api] request failed:', err);
      sendJson(res, 500, { message: 'Internal server error.' });
    }
  }

  return { handleRequest, routes };
}

module.exports = { createHandlers, sendJson, sendNotFound, readJsonBody };
