const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const { getEnv, jsonResponse, noContent, parseJsonBody } = require('./_shared/http.cjs');

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function getApiKey() {
  return getEnv('ANTHROPIC_API_KEY');
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
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return noContent();
  if (method !== 'POST') return jsonResponse(405, { message: 'Method not allowed.' });

  const apiKey = getApiKey();
  if (!apiKey) return jsonResponse(500, { message: 'ANTHROPIC_API_KEY is not configured in Netlify.' });

  let payload;
  try {
    payload = parseJsonBody(event, MAX_BODY_BYTES);
  } catch (err) {
    return jsonResponse(err.statusCode || 400, { message: err.message || 'Invalid JSON body.' });
  }

  const mode = payload && payload.mode;
  let request;
  try {
    request = sanitizeRequest(payload && payload.request);
  } catch (err) {
    return jsonResponse(400, { message: err.message });
  }

  const client = new Anthropic({ apiKey });

  if (mode === 'create') {
    try {
      const response = await client.messages.create(request);
      return jsonResponse(200, response);
    } catch (err) {
      const normalized = normalizeAnthropicError(err);
      return jsonResponse(normalized.statusCode, normalized);
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

  return jsonResponse(400, { message: 'Unsupported Anthropic proxy mode.' });
};
