import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const VOICEFLOW_API_KEY = process.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = process.env.VITE_VOICEFLOW_PROJECT_ID;
const VOICEFLOW_ANALYTICS_API = 'https://analytics-api.voiceflow.com';
const VOICEFLOW_V2_API = 'https://api.voiceflow.com/v2';

const MAX_TURNS = 500;

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Voiceflow API configuration missing',
        hasKey: !!VOICEFLOW_API_KEY,
        hasProjectId: !!VOICEFLOW_PROJECT_ID
      }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'list';
    const transcriptId = params.transcriptId;

    if (action === 'list') {
      const take = params.take || '100';
      const skip = params.skip || '0';

      // Try Analytics API first (has all transcripts)
      const analyticsUrl = `${VOICEFLOW_ANALYTICS_API}/v1/transcript/project/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=DESC`;

      console.log('[Proxy] Trying Analytics API:', analyticsUrl);
      console.log('[Proxy] Auth header format: Bearer <key>');

      const analyticsResponse = await fetch(analyticsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VOICEFLOW_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      });

      console.log('[Proxy] Analytics API status:', analyticsResponse.status);

      if (analyticsResponse.ok) {
        const data = await analyticsResponse.json();
        console.log('[Proxy] Analytics API success, transcripts:', data.transcripts?.length || 0);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...data,
            source: 'analytics_api'
          }),
        };
      }

      // Log why Analytics API failed
      const analyticsError = await analyticsResponse.text();
      console.log('[Proxy] Analytics API failed:', analyticsResponse.status, analyticsError);

      // Fall back to v2 API
      console.log('[Proxy] Falling back to v2 API');
      const v2Url = `${VOICEFLOW_V2_API}/transcripts/${VOICEFLOW_PROJECT_ID}?limit=${take}&offset=${skip}`;

      const v2Response = await fetch(v2Url, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!v2Response.ok) {
        const errorText = await v2Response.text();
        return {
          statusCode: v2Response.status,
          headers,
          body: JSON.stringify({
            error: 'Both APIs failed',
            analyticsStatus: analyticsResponse.status,
            analyticsError: analyticsError.substring(0, 500),
            v2Status: v2Response.status,
            v2Error: errorText.substring(0, 500)
          }),
        };
      }

      const data = await v2Response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          transcripts: Array.isArray(data) ? data : (data.transcripts || []),
          source: 'v2_api'
        }),
      };

    } else if (action === 'dialog' && transcriptId) {
      const apiUrl = `${VOICEFLOW_V2_API}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptId}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `Dialog API error: ${response.status}`, details: errorText }),
        };
      }

      let data = await response.json();

      if (Array.isArray(data) && data.length > MAX_TURNS) {
        data = data.slice(-MAX_TURNS);
      }

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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};

export { handler };
