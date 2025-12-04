// Voiceflow API Service
// Handles fetching transcripts and conversation data from Voiceflow

const VOICEFLOW_API_KEY = import.meta.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = import.meta.env.VITE_VOICEFLOW_PROJECT_ID;
const VOICEFLOW_API_BASE = 'https://api.voiceflow.com/v2';

// Types for Voiceflow API responses
export interface VoiceflowTranscript {
  _id: string; // v2 uses _id
  id?: string; // v1 uses id
  projectID: string;
  sessionID: string;
  browser?: string;
  device?: string;
  os?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    name?: string;
    image?: string;
  };
  reportTags?: string[];
  unread?: boolean;
}

export interface VoiceflowTurnRequest {
  type: string;
  payload?: {
    query?: string;
    label?: string;
    [key: string]: any;
  };
}

export interface VoiceflowTurnResponse {
  type: string;
  payload?: {
    message?: string;
    slate?: {
      content: Array<{
        children: Array<{
          text?: string;
          [key: string]: any;
        }>;
      }>;
    };
    [key: string]: any;
  };
}

export interface VoiceflowTurn {
  turnID: string;
  type: 'request' | 'response';
  payload: VoiceflowTurnRequest | VoiceflowTurnResponse;
  startTime: string;
  format: string;
}

export interface VoiceflowTranscriptWithLogs extends VoiceflowTranscript {
  turns?: VoiceflowTurn[];
}

// Parsed message format for display
export interface ParsedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ParsedTranscript {
  id: string;
  sessionID: string;
  userName?: string;
  userImage?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  messages: ParsedMessage[];
  browser?: string;
  device?: string;
  os?: string;
  unread?: boolean;
}

// Fetch all transcripts for the project
export async function fetchTranscripts(): Promise<VoiceflowTranscript[]> {
  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    console.error('Voiceflow API key or Project ID not configured');
    throw new Error('Voiceflow API not configured');
  }

  // Debug logging
  console.log('[Voiceflow] Fetching transcripts...');
  console.log('[Voiceflow] API Key (first 20 chars):', VOICEFLOW_API_KEY?.substring(0, 20) + '...');
  console.log('[Voiceflow] Project ID:', VOICEFLOW_PROJECT_ID);
  console.log('[Voiceflow] API URL:', `${VOICEFLOW_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}`);

  // Use GET method for v2 transcripts API
  const response = await fetch(
    `${VOICEFLOW_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}`,
    {
      method: 'GET',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('[Voiceflow] Response status:', response.status);
  console.log('[Voiceflow] Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Voiceflow] Failed to fetch transcripts:', response.status, errorText);
    throw new Error(`Failed to fetch transcripts: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Voiceflow] Received data:', data);
  console.log('[Voiceflow] Number of transcripts:', Array.isArray(data) ? data.length : 'Not an array');

  // Normalize v1 API response (id) to match v2 format (_id) for compatibility
  if (Array.isArray(data)) {
    return data.map(transcript => ({
      ...transcript,
      _id: transcript.id || transcript._id, // Ensure _id exists
    }));
  }

  return data;
}

// Fetch a single transcript with conversation logs
export async function fetchTranscriptWithLogs(
  transcriptID: string
): Promise<VoiceflowTranscriptWithLogs> {
  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow] Fetching transcript with logs:', transcriptID);

  const response = await fetch(
    `${VOICEFLOW_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}/${transcriptID}`,
    {
      method: 'GET',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('[Voiceflow] Transcript response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Voiceflow] Failed to fetch transcript:', response.status, errorText);
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Voiceflow] Transcript data for', transcriptID, ':', data);

  // v2 API returns turns directly as an array, not wrapped in an object
  const turns = Array.isArray(data) ? data : (data.turns || []);
  console.log('[Voiceflow] Number of turns:', turns.length);

  // Return in expected format with turns property
  return {
    _id: transcriptID,
    projectID: VOICEFLOW_PROJECT_ID,
    sessionID: transcriptID, // v2 doesn't return metadata, use ID as sessionID
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turns: turns
  } as VoiceflowTranscriptWithLogs;
}

// Extract text content from Voiceflow slate format
function extractTextFromSlate(slate: any): string {
  if (!slate?.content) return '';

  return slate.content
    .map((block: any) => {
      if (block.children) {
        return block.children
          .map((child: any) => child.text || '')
          .join('');
      }
      return '';
    })
    .join('\n')
    .trim();
}

// Extract text from various response payload formats
function extractResponseText(payload: any): string {
  if (!payload) return '';

  // Direct message
  if (payload.message) return payload.message;

  // Slate format (rich text)
  if (payload.slate) return extractTextFromSlate(payload.slate);

  // Text traces
  if (payload.text) return payload.text;

  // Card/visual content
  if (payload.title) return payload.title;

  return '';
}

// Parse transcript turns into readable messages
export function parseTranscriptMessages(turns: VoiceflowTurn[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const turn of turns) {
    // User messages: type === 'request'
    if (turn.type === 'request') {
      const payload = turn.payload as VoiceflowTurnRequest;
      let content = '';

      if (payload.type === 'text' || payload.type === 'intent') {
        content = payload.payload?.query || payload.payload?.label || '';
      } else if (payload.type === 'launch') {
        content = '[Conversation started]';
      }

      if (content) {
        messages.push({
          id: turn.turnID + '-req',
          role: 'user',
          content,
          timestamp: turn.startTime,
        });
      }
    }
    // Assistant messages: type === 'text' (v2 API format)
    else if (turn.type === 'text') {
      const payload = turn.payload as any;

      // v2 API has nested payload structure: payload.payload.message
      const innerPayload = payload.payload || payload;
      const content = innerPayload.message || extractTextFromSlate(innerPayload.slate) || '';

      if (content) {
        messages.push({
          id: turn.turnID + '-text',
          role: 'assistant',
          content,
          timestamp: turn.startTime,
        });
      }
    }
    // Legacy format: type === 'response' (keeping for backwards compatibility)
    else if (turn.type === 'response') {
      const payload = turn.payload as VoiceflowTurnResponse;

      // Handle different response types
      if (payload.type === 'text' || payload.type === 'speak') {
        const content = extractResponseText(payload.payload);
        if (content) {
          messages.push({
            id: turn.turnID + '-res',
            role: 'assistant',
            content,
            timestamp: turn.startTime,
          });
        }
      }
    }
  }

  return messages;
}

// Parse a full transcript into a displayable format
export function parseTranscript(
  transcript: VoiceflowTranscriptWithLogs
): ParsedTranscript {
  const messages = transcript.turns
    ? parseTranscriptMessages(transcript.turns)
    : [];

  // Get first user message as preview
  const firstUserMessage = messages.find(m => m.role === 'user' && m.content !== '[Conversation started]');
  const preview = firstUserMessage?.content || 'No messages';

  return {
    id: transcript._id,
    sessionID: transcript.sessionID,
    userName: transcript.user?.name,
    userImage: transcript.user?.image,
    createdAt: transcript.createdAt,
    updatedAt: transcript.updatedAt,
    messageCount: messages.length,
    preview: preview.length > 100 ? preview.substring(0, 100) + '...' : preview,
    messages,
    browser: transcript.browser,
    device: transcript.device,
    os: transcript.os,
    unread: transcript.unread,
  };
}

// Fetch and parse all transcripts with their messages
export async function fetchParsedTranscripts(): Promise<ParsedTranscript[]> {
  const transcripts = await fetchTranscripts();

  // Fetch details for each transcript (with rate limiting)
  const parsedTranscripts: ParsedTranscript[] = [];

  for (const transcript of transcripts) {
    try {
      const withLogs = await fetchTranscriptWithLogs(transcript._id);
      parsedTranscripts.push(parseTranscript(withLogs));

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to fetch transcript ${transcript._id}:`, error);
      // Add basic info without messages
      parsedTranscripts.push({
        id: transcript._id,
        sessionID: transcript.sessionID,
        userName: transcript.user?.name,
        userImage: transcript.user?.image,
        createdAt: transcript.createdAt,
        updatedAt: transcript.updatedAt,
        messageCount: 0,
        preview: 'Failed to load messages',
        messages: [],
        browser: transcript.browser,
        device: transcript.device,
        os: transcript.os,
        unread: transcript.unread,
      });
    }
  }

  // Sort by most recent first
  return parsedTranscripts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// Generate a consistent userID from app user data
// This should match what we pass to the Voiceflow widget
export function generateVoiceflowUserId(userId: string): string {
  return `traidenis_${userId}`;
}

// Filter transcripts by userID (sessionID contains the userID)
export function filterTranscriptsByUser(
  transcripts: ParsedTranscript[],
  userId: string
): ParsedTranscript[] {
  const voiceflowUserId = generateVoiceflowUserId(userId);
  return transcripts.filter(t => t.sessionID.includes(voiceflowUserId));
}
