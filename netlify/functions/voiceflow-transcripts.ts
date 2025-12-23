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
      body: JSON.stringify({ error: 'Voiceflow API configuration missing' }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'list';
    const transcriptId = params.transcriptId;

    if (action === 'list') {
      const take = params.take || '100';
      const skip = params.skip || '0';

      // Use Analytics API (no Bearer prefix)
      const analyticsUrl = `${VOICEFLOW_ANALYTICS_API}/v1/transcript/project/${VOICEFLOW_PROJECT_ID}?take=${take}&skip=${skip}&order=DESC`;

      const response = await fetch(analyticsUrl, {
        method: 'POST',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `Analytics API error: ${response.status}`, details: errorText }),
        };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...data,
          source: 'analytics_api'
        }),
      };

    } else if (action === 'dialog' && transcriptId) {
      // Try Analytics API first for dialog
      const analyticsDialogUrl = `${VOICEFLOW_ANALYTICS_API}/v1/transcript/${transcriptId}/dialog`;

      let response = await fetch(analyticsDialogUrl, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Accept': 'application/json',
        },
      });

      // If Analytics API fails, try v2 API as fallback
      if (!response.ok) {
        const v2Url = `${VOICEFLOW_V2_API}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptId}`;

        response = await fetch(v2Url, {
          method: 'GET',
          headers: {
            'Authorization': VOICEFLOW_API_KEY,
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `Dialog API error: ${response.status}`, details: errorText }),
        };
      }

      let data = await response.json();

      // Handle turns array - limit if too large
      let turns = Array.isArray(data) ? data : (data.turns || data.dialog || []);
      if (turns.length > MAX_TURNS) {
        turns = turns.slice(-MAX_TURNS);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(Array.isArray(data) ? turns : { ...data, turns }),
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
