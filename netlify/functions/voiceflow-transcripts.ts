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
    console.error('[Proxy] Missing config - API_KEY:', !!VOICEFLOW_API_KEY, 'PROJECT_ID:', !!VOICEFLOW_PROJECT_ID);
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
      const take = params.take || '100';
      const skip = params.skip || '0';
      const order = params.order || 'DESC';

      // Try multiple Analytics API endpoint formats
      const analyticsEndpoints = [
        // Format 1: /v1/transcript/project/{id}
        `${VOICEFLOW_ANALYTICS_API_BASE}/v1/transcript/project/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=${order}`,
        // Format 2: /v1/transcripts/project/{id} (plural)
        `${VOICEFLOW_ANALYTICS_API_BASE}/v1/transcripts/project/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=${order}`,
        // Format 3: /v1/transcript/agent/{id}
        `${VOICEFLOW_ANALYTICS_API_BASE}/v1/transcript/agent/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=${order}`,
      ];

      let analyticsData = null;
      let analyticsSuccess = false;

      // Try each Analytics API endpoint
      for (const apiUrl of analyticsEndpoints) {
        console.log('[Proxy] Trying Analytics API:', apiUrl);

        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${VOICEFLOW_API_KEY}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({}),
          });

          console.log('[Proxy] Response status:', response.status);

          if (response.ok) {
            analyticsData = await response.json();
            analyticsSuccess = true;
            console.log('[Proxy] Analytics API success! Transcripts:', analyticsData.transcripts?.length || 0);
            break;
          } else {
            const errorText = await response.text();
            console.log('[Proxy] Analytics endpoint failed:', response.status, errorText.substring(0, 200));
          }
        } catch (err: any) {
          console.log('[Proxy] Analytics endpoint error:', err.message);
        }
      }

      // If Analytics API worked, return that data
      if (analyticsSuccess && analyticsData) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(analyticsData),
        };
      }

      // Fall back to v2 API (works but may have limited date range)
      console.log('[Proxy] All Analytics endpoints failed, falling back to v2 API');
      const v2Url = `${VOICEFLOW_V2_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}?limit=${take}&offset=${skip}`;

      console.log('[Proxy] Trying v2 API:', v2Url);

      const v2Response = await fetch(v2Url, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log('[Proxy] v2 API response status:', v2Response.status);

      if (!v2Response.ok) {
        const errorText = await v2Response.text();
        console.error('[Proxy] v2 API also failed:', v2Response.status, errorText);
        return {
          statusCode: v2Response.status,
          headers,
          body: JSON.stringify({
            error: `All APIs failed. v2 status: ${v2Response.status}`,
            details: errorText,
            note: 'Both Analytics API and v2 API failed. Check API key and project ID.'
          }),
        };
      }

      const v2Data = await v2Response.json();
      console.log('[Proxy] v2 API success! Transcripts:', Array.isArray(v2Data) ? v2Data.length : 'object');

      // Wrap array in object for consistent response format
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          transcripts: Array.isArray(v2Data) ? v2Data : (v2Data.transcripts || v2Data.data || []),
          source: 'v2_api'
        }),
      };

    } else if (action === 'dialog' && transcriptId) {
      // Fetch individual transcript dialog - go directly to v2 API which is known to work
      const apiUrl = `${VOICEFLOW_V2_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptId}`;

      console.log('[Proxy] Fetching transcript dialog from v2 API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
        },
      });

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
