import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const VOICEFLOW_API_KEY = process.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = process.env.VITE_VOICEFLOW_PROJECT_ID;
const VOICEFLOW_V2_API_BASE = 'https://api.voiceflow.com/v2';

// Max turns to return (Netlify has ~6MB response limit)
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

      // Use v2 API for transcript list
      const apiUrl = `${VOICEFLOW_V2_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}?limit=${take}&offset=${skip}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: `API error: ${response.status}`, details: errorText }),
        };
      }

      const data = await response.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          transcripts: Array.isArray(data) ? data : (data.transcripts || data.data || []),
          source: 'v2_api'
        }),
      };

    } else if (action === 'dialog' && transcriptId) {
      const apiUrl = `${VOICEFLOW_V2_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptId}`;

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

      // Limit turns to avoid exceeding Netlify response size limit
      if (Array.isArray(data) && data.length > MAX_TURNS) {
        data = data.slice(-MAX_TURNS); // Keep most recent turns
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
