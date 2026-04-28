const LLAMA_BASE_URL = 'https://api.cloud.llamaindex.ai';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

exports.handler = async function handler(event) {
  const apiKey = process.env.LLAMAPARSE_API_KEY || process.env.VITE_LLAMAPARSE_API_KEY;

  if (!apiKey) {
    return jsonResponse(500, {
      message: 'LLAMAPARSE_API_KEY or VITE_LLAMAPARSE_API_KEY is not configured in Netlify.',
    });
  }

  const path = event.path
    .replace(/^\/api\/llamacloud\/?/, '')
    .replace(/^\/\.netlify\/functions\/llamacloud-proxy\/?/, '');
  if (!path || path.includes('..')) {
    return jsonResponse(400, { message: 'Invalid LlamaCloud path.' });
  }

  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  const targetUrl = `${LLAMA_BASE_URL}/${path}${query}`;
  const method = event.httpMethod || 'GET';

  const headers = {};
  for (const [key, value] of Object.entries(event.headers || {})) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && value) {
      headers[normalized] = value;
    }
  }
  headers.authorization = `Bearer ${apiKey}`;
  headers.accept = headers.accept || 'application/json';

  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && event.body) {
    init.body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
  }

  try {
    const response = await fetch(targetUrl, init);
    const contentType = response.headers.get('content-type') || 'application/json';
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    return {
      statusCode: response.status,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
      body: body.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    return jsonResponse(502, {
      message: error instanceof Error ? error.message : 'LlamaCloud proxy request failed.',
    });
  }
};

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
