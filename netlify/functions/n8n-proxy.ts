import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import https from 'https';
import http from 'http';

/**
 * Netlify Function to proxy requests to n8n webhooks with self-signed SSL certificates
 *
 * SECURITY WARNING: This function disables SSL certificate verification to bypass
 * self-signed certificate errors. This is acceptable for development/internal use
 * but should NOT be used in production without proper SSL certificates.
 *
 * TODO: Replace with proper SSL certificates (Let's Encrypt or valid CA) for production
 *
 * Usage:
 * POST /.netlify/functions/n8n-proxy
 * Body: {
 *   "webhookUrl": "https://n8n.traidenis.lt:5678/webhook-test/...",
 *   "data": { ... your payload ... }
 * }
 */

// Disable SSL certificate verification for self-signed certificates
// WARNING: This makes the connection vulnerable to MITM attacks
// Only use for internal/development environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Helper function to make HTTP/HTTPS requests using native Node.js modules
 */
function makeRequest(url: string, data: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // For HTTPS, accept self-signed certificates
      ...(isHttps && {
        rejectUnauthorized: false,
      }),
    };

    const req = requestModule.request(requestOptions, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        // Try to parse as JSON, fallback to text
        let parsedData;
        try {
          parsedData = JSON.parse(responseData);
        } catch (e) {
          parsedData = responseData;
        }

        resolve({
          statusCode: res.statusCode || 500,
          data: parsedData,
        });
      });
    });

    req.on('error', (error) => {
      console.error('[n8n-proxy] Request error:', error);
      reject(error);
    });

    // Write the request body
    req.write(JSON.stringify(data));
    req.end();
  });
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight CORS requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.error('[n8n-proxy] Invalid method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        status: 405,
        error: 'Method not allowed. Use POST.'
      }),
    };
  }

  try {
    console.log('[n8n-proxy] Received request, body length:', event.body?.length);

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('[n8n-proxy] JSON parse error:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          status: 400,
          error: 'Invalid JSON in request body'
        }),
      };
    }

    const { webhookUrl, data } = body;

    console.log('[n8n-proxy] Parsed request:', {
      webhookUrl,
      hasData: !!data,
      dataType: typeof data
    });

    // Validate required parameters
    if (!webhookUrl) {
      console.error('[n8n-proxy] Missing webhookUrl');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          status: 400,
          error: 'Missing required parameter: webhookUrl'
        }),
      };
    }

    if (data === undefined || data === null) {
      console.error('[n8n-proxy] Missing data');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          status: 400,
          error: 'Missing required parameter: data'
        }),
      };
    }

    // Validate webhook URL format (allow both HTTP and HTTPS)
    if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
      console.error('[n8n-proxy] Invalid webhook URL format:', webhookUrl);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          status: 400,
          error: 'Invalid webhookUrl: Must be an HTTP or HTTPS URL'
        }),
      };
    }

    console.log(`[n8n-proxy] Forwarding request to: ${webhookUrl}`);

    // Make the HTTP/HTTPS request using native Node.js modules
    const responseResult = await makeRequest(webhookUrl, data);

    console.log(`[n8n-proxy] Response status: ${responseResult.statusCode}`);

    // Forward the response from n8n
    return {
      statusCode: responseResult.statusCode,
      headers: {
        ...headers,
        'X-Proxied-By': 'netlify-n8n-proxy',
        'X-Original-Status': String(responseResult.statusCode),
      },
      body: JSON.stringify({
        success: responseResult.statusCode >= 200 && responseResult.statusCode < 300,
        status: responseResult.statusCode,
        data: responseResult.data,
      }),
    };

  } catch (error: any) {
    console.error('[n8n-proxy] Error:', error);
    console.error('[n8n-proxy] Error stack:', error.stack);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        status: 500,
        error: 'Proxy request failed',
        message: error.message || 'Internal server error',
        details: error.cause?.message,
      }),
    };
  }
};

export { handler };
