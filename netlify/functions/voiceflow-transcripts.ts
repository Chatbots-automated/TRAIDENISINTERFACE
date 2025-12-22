import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const VOICEFLOW_API_KEY = process.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = process.env.VITE_VOICEFLOW_PROJECT_ID;
const VOICEFLOW_ANALYTICS_API_BASE = 'https://analytics-api.voiceflow.com';
const VOICEFLOW_V2_API_BASE = 'https://api.voiceflow.com/v2';

// Handler for fetching transcripts list
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Voiceflow API configuration missing' }),
    };
  }

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const action = params.action || 'list';
    const transcriptId = params.transcriptId;

    if (action === 'list') {
      // Fetch transcript list from Analytics API
      const take = params.take || '100';
      const skip = params.skip || '0';
      const order = params.order || 'DESC';

      const apiUrl = `${VOICEFLOW_ANALYTICS_API_BASE}/v1/transcript/project/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=${order}`;

      console.log('[Proxy] Fetching transcripts from:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VOICEFLOW_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Proxy] Analytics API error:', response.status, errorText);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `Analytics API error: ${response.status}`, details: errorText }),
        };
      }

      const data = await response.json();
      console.log('[Proxy] Fetched transcripts count:', data.transcripts?.length || 'unknown');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };

    } else if (action === 'dialog' && transcriptId) {
      // Fetch individual transcript dialog
      // Try Analytics API first
      let apiUrl = `${VOICEFLOW_ANALYTICS_API_BASE}/v1/transcript/${transcriptId}/dialog`;

      console.log('[Proxy] Fetching transcript dialog from:', apiUrl);

      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${VOICEFLOW_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      // Fall back to v2 API if Analytics API fails
      if (!response.ok) {
        console.log('[Proxy] Analytics API failed, trying v2 API');
        apiUrl = `${VOICEFLOW_V2_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptId}`;

        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': VOICEFLOW_API_KEY,
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Proxy] Dialog API error:', response.status, errorText);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `Dialog API error: ${response.status}`, details: errorText }),
        };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action or missing transcriptId' }),
      };
    }

  } catch (error: any) {
    console.error('[Proxy] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};

export { handler };
