import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify function to proxy requests to n8n webhooks
 * This solves CORS issues when calling n8n webhooks from the browser
 */
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse the incoming request body
    const body = JSON.parse(event.body || '{}');

    // Extract the target webhook URL and the payload to forward
    const { webhookUrl, ...payload } = body;

    if (!webhookUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing webhookUrl in request body' }),
      };
    }

    // Validate that the URL is an n8n webhook (basic security check)
    const url = new URL(webhookUrl);
    if (!url.pathname.includes('webhook')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid webhook URL' }),
      };
    }

    // Forward the request to the n8n webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Get the response
    const responseText = await response.text();

    // Try to parse as JSON, fallback to text
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(responseData),
    };

  } catch (error: any) {
    console.error('n8n webhook proxy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
        details: 'Failed to forward request to n8n webhook'
      }),
    };
  }
};

export { handler };
