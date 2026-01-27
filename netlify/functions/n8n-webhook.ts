import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify function to proxy requests to n8n webhooks.
 * This solves CORS issues when calling n8n webhooks from the browser.
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
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const body = JSON.parse(event.body);
    const { webhookUrl, ...payload } = body;

    if (!webhookUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing webhookUrl in request body',
          receivedKeys: Object.keys(body)
        }),
      };
    }

    // Validate URL format
    try {
      new URL(webhookUrl);
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid URL format',
          webhookUrl: webhookUrl
        }),
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

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: `n8n webhook error: ${response.status}`,
          details: errorText,
          webhookUrl: webhookUrl
        }),
      };
    }

    // Get and return the response
    const responseText = await response.text();

    // Try to parse as JSON, return raw text if not JSON
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : { success: true };
    } catch {
      data = { message: responseText || 'Success', rawResponse: true };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };

  } catch (error: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
        type: error.name || 'Error'
      }),
    };
  }
};

export { handler };
