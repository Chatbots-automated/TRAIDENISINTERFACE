const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const { getEnv, jsonResponse, noContent, parseJsonBody } = require('./_shared/http.cjs');
const { requireCloudflareAccess } = require('./_shared/cloudflare-access.cjs');

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


function synthesizeStreamEvents(message) {
  const events = [];
  const content = Array.isArray(message && message.content) ? message.content : [];
  content.forEach((contentBlock, index) => {
    events.push({ type: 'content_block_start', index, content_block: contentBlock });
    if (contentBlock.type === 'text' && contentBlock.text) {
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: contentBlock.text } });
    } else if (contentBlock.type === 'thinking' && contentBlock.thinking) {
      events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: contentBlock.thinking } });
    } else if (contentBlock.type === 'tool_use' && contentBlock.input) {
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(contentBlock.input) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({
    type: 'message_delta',
    delta: { stop_reason: message && message.stop_reason, stop_sequence: message && message.stop_sequence },
    usage: message && message.usage ? message.usage : {},
  });
  events.push({ type: 'message_stop' });
  return events;
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

  const access = await requireCloudflareAccess(event);
  if (!access.ok) return access.response;

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
    try {
      const finalMessage = await client.messages.create(request);
      const lines = synthesizeStreamEvents(finalMessage)
        .map((streamEvent) => JSON.stringify({ type: 'event', event: streamEvent }))
        .concat(JSON.stringify({ type: 'final', message: finalMessage }));
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
        body: `${lines.join('\n')}\n`,
      };
    } catch (err) {
      const normalized = normalizeAnthropicError(err);
      return jsonResponse(normalized.statusCode, normalized);
    }
  }

  return jsonResponse(400, { message: 'Unsupported Anthropic proxy mode.' });
};
