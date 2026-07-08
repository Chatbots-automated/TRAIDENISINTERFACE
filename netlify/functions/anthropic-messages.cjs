const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}

function getApiKey() {
  return (process.env.ANTHROPIC_API_KEY || '').trim();
}

function parseBody(event) {
  const body = event.body || '';
  const bytes = Buffer.byteLength(body, event.isBase64Encoded ? 'base64' : 'utf8');
  if (bytes > MAX_BODY_BYTES) {
    const err = new Error('Request body is too large.');
    err.statusCode = 413;
    throw err;
  }
  return JSON.parse(event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body);
}

function sanitizeRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Missing Anthropic request payload.');
  const allowedKeys = new Set(['model', 'max_tokens', 'messages', 'system', 'tools', 'thinking', 'temperature', 'top_p', 'top_k', 'metadata', 'stop_sequences']);
  const sanitized = {};
  for (const [key, value] of Object.entries(request)) {
    if (allowedKeys.has(key)) sanitized[key] = value;
  }
  if (!sanitized.model || typeof sanitized.model !== 'string') throw new Error('Anthropic model is required.');
  if (!Array.isArray(sanitized.messages)) throw new Error('Anthropic messages array is required.');
  const maxTokens = Number(sanitized.max_tokens);
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32000) throw new Error('Anthropic max_tokens must be between 1 and 32000.');
  sanitized.max_tokens = maxTokens;
  return sanitized;
}

function normalizeAnthropicError(err) {
  const status = err && (err.status || err.statusCode) ? Number(err.status || err.statusCode) : 500;
  return {
    statusCode: Number.isFinite(status) ? status : 500,
    message: err && err.message ? err.message : 'Anthropic proxy request failed.',
    type: err && err.name ? err.name : 'AnthropicProxyError',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed.' });

  const apiKey = getApiKey();
  if (!apiKey) return json(500, { message: 'ANTHROPIC_API_KEY is not configured in Netlify.' });

  let payload;
  try {
    payload = parseBody(event);
  } catch (err) {
    return json(err.statusCode || 400, { message: err.message || 'Invalid JSON body.' });
  }

  const mode = payload && payload.mode;
  let request;
  try {
    request = sanitizeRequest(payload && payload.request);
  } catch (err) {
    return json(400, { message: err.message });
  }

  const client = new Anthropic({ apiKey });

  if (mode === 'create') {
    try {
      const response = await client.messages.create(request);
      return json(200, response);
    } catch (err) {
      const normalized = normalizeAnthropicError(err);
      return json(normalized.statusCode, normalized);
    }
  }

  if (mode === 'stream') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messageStream = client.messages.stream(request);
          for await (const streamEvent of messageStream) {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'event', event: streamEvent })}\n`));
          }
          const finalMessage = await messageStream.finalMessage();
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'final', message: finalMessage })}\n`));
          controller.close();
        } catch (err) {
          const normalized = normalizeAnthropicError(err);
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', ...normalized })}\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return json(400, { message: 'Unsupported Anthropic proxy mode.' });
};
