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

const DIRECTUS_UPLOAD_MAX_BYTES = 45 * 1024 * 1024;

exports.handler = async function handler(event) {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY
    || process.env.LLAMAPARSE_API_KEY;

  if (!apiKey) {
    return jsonResponse(500, {
        message: 'LLAMA_CLOUD_API_KEY or LLAMAPARSE_API_KEY is not configured in Netlify.',
    });
  }

  const path = event.path
    .replace(/^\/api\/llamacloud\/?/, '')
    .replace(/^\/\.netlify\/functions\/llamacloud-proxy\/?/, '');
  if (!path || path.includes('..')) {
    return jsonResponse(400, { message: 'Invalid LlamaCloud path.' });
  }

  if (path === 'directus-file-upload') {
    return uploadDirectusFileToLlamaCloud(event, apiKey);
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

async function uploadDirectusFileToLlamaCloud(event, apiKey) {
  if ((event.httpMethod || 'GET').toUpperCase() !== 'POST') {
    return jsonResponse(405, { message: 'Method not allowed.' });
  }

  const directusUrl = (process.env.DIRECTUS_URL || 'https://sql.traidenis.org').trim();
  const directusToken = (process.env.DIRECTUS_TOKEN || '').trim();
  if (!directusToken) {
    return jsonResponse(500, { message: 'DIRECTUS_TOKEN is not configured in Netlify.' });
  }

  let payload;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '{}');
    payload = JSON.parse(body);
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON body.' });
  }

  const fileId = String(payload.directus_file_id || '').trim();
  if (!fileId || fileId.includes('/') || fileId.includes('..')) {
    return jsonResponse(400, { message: 'directus_file_id is required.' });
  }

  try {
    const metaRes = await fetch(`${directusUrl.replace(/\/$/, '')}/files/${encodeURIComponent(fileId)}`, {
      headers: { authorization: `Bearer ${directusToken}`, accept: 'application/json' },
    });
    if (!metaRes.ok) {
      return jsonResponse(metaRes.status, {
        message: `Failed to read Directus file metadata (${metaRes.status}).`,
        details: await metaRes.text().catch(() => ''),
      });
    }
    const metaJson = await metaRes.json();
    const meta = metaJson?.data || {};
    const fileName = meta.filename_download || meta.title || payload.file_name || 'document';
    const mimeType = meta.type || payload.file_type || 'application/octet-stream';
    const fileSize = Number(meta.filesize || payload.file_size || 0);
    if (fileSize > DIRECTUS_UPLOAD_MAX_BYTES) {
      return jsonResponse(413, {
        message: `File is too large for the Netlify LlamaCloud proxy (${formatBytes(fileSize)}).`,
        limit: formatBytes(DIRECTUS_UPLOAD_MAX_BYTES),
      });
    }

    const assetRes = await fetch(`${directusUrl.replace(/\/$/, '')}/assets/${encodeURIComponent(fileId)}?download`, {
      headers: { authorization: `Bearer ${directusToken}` },
    });
    if (!assetRes.ok) {
      return jsonResponse(assetRes.status, {
        message: `Failed to download Directus asset (${assetRes.status}).`,
        details: await assetRes.text().catch(() => ''),
      });
    }

    const bytes = Buffer.from(await assetRes.arrayBuffer());
    if (bytes.length > DIRECTUS_UPLOAD_MAX_BYTES) {
      return jsonResponse(413, {
        message: `File is too large for the Netlify LlamaCloud proxy (${formatBytes(bytes.length)}).`,
        limit: formatBytes(DIRECTUS_UPLOAD_MAX_BYTES),
      });
    }

    const { body, contentType } = buildMultipartUploadBody({
      fieldName: 'file',
      fileName,
      mimeType,
      bytes,
      fields: { purpose: 'parse' },
    });

    const uploadRes = await fetch(`${LLAMA_BASE_URL}/api/v1/beta/files`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'content-type': contentType,
        'content-length': String(body.length),
      },
      body,
    });

    const responseContentType = uploadRes.headers.get('content-type') || 'application/json';
    const responseBytes = Buffer.from(await uploadRes.arrayBuffer());
    return {
      statusCode: uploadRes.status,
      headers: {
        'content-type': responseContentType,
        'cache-control': 'no-store',
      },
      body: responseBytes.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    return jsonResponse(502, {
      message: error instanceof Error ? error.message : 'Directus to LlamaCloud upload failed.',
    });
  }
}

function buildMultipartUploadBody({ fieldName, fileName, mimeType, bytes, fields = {} }) {
  const boundary = `----traidenis-llamacloud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const safeFileName = String(fileName || 'document')
    .replace(/[\r\n"]/g, '_')
    .slice(0, 180);
  const safeMimeType = String(mimeType || 'application/octet-stream').replace(/[\r\n]/g, '');

  const fieldParts = Object.entries(fields).map(([name, value]) => (
    `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="${String(name).replace(/[\r\n"]/g, '_')}"\r\n\r\n`
    + `${String(value).replace(/\r\n/g, '\n')}\r\n`
  )).join('');

  const prefix = Buffer.from(
    fieldParts
    + `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="${fieldName}"; filename="${safeFileName}"\r\n`
    + `Content-Type: ${safeMimeType}\r\n\r\n`,
    'utf8'
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    body: Buffer.concat([prefix, bytes, suffix]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

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
