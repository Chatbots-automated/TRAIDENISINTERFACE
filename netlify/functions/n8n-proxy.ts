import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import https from 'https';

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

    // Create custom HTTPS agent that accepts self-signed certificates (only for HTTPS)
    const isHttps = webhookUrl.startsWith('https://');
    const fetchOptions: any = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

    if (isHttps) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false, // Accept self-signed certificates
      });
      // @ts-ignore - agent is valid for node-fetch
      fetchOptions.agent = httpsAgent;
    }

    // Forward the request to n8n webhook
    const response = await fetch(webhookUrl, fetchOptions);

    // Get response body
    let responseData;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Log response status
    console.log(`[n8n-proxy] Response status: ${response.status}`);

    // Forward the response from n8n
    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'X-Proxied-By': 'netlify-n8n-proxy',
        'X-Original-Status': String(response.status),
      },
      body: JSON.stringify({
        success: response.ok,
        status: response.status,
        data: responseData,
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
