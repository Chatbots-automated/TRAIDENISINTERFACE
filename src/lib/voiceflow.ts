// Voiceflow API Service
// Handles fetching transcripts and conversation data from Voiceflow

import { supabase } from './supabase';
import type { AppUser } from '../types';

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

// App user info extracted from the interface database
export interface LinkedAppUser {
  id: string;
  email: string;
  display_name?: string;
  is_admin?: boolean;
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
  credits?: number;
  // Linked app user from interface database
  appUser?: LinkedAppUser;
  voiceflowUserId?: string;
}

// Fetch all transcripts for the project with proper pagination
// Voiceflow API uses limit/offset pagination - we need to loop through all pages
// Added range parameter to ensure we get recent transcripts
export async function fetchTranscripts(): Promise<VoiceflowTranscript[]> {
  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    console.error('Voiceflow API key or Project ID not configured');
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow] Fetching all transcripts with pagination...');

  const allTranscripts: VoiceflowTranscript[] = [];
  const pageSize = 100; // Reasonable page size for API calls
  let offset = 0;
  let hasMore = true;

  // Fetch transcripts from last 90 days to ensure we get recent ones
  // The range parameter tells Voiceflow to return transcripts from the last N days
  const rangeDays = 90;

  while (hasMore) {
    // Add range parameter to get recent transcripts
    const apiUrl = `${VOICEFLOW_API_BASE}/transcripts/${VOICEFLOW_PROJECT_ID}?limit=${pageSize}&offset=${offset}&range=${rangeDays}`;

    console.log(`[Voiceflow] Fetching page at offset ${offset} (range: ${rangeDays} days)...`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Voiceflow] Failed to fetch transcripts:', response.status, errorText);
      throw new Error(`Failed to fetch transcripts: ${response.status}`);
    }

    const data = await response.json();

    // Handle both array response and object with data property
    const transcripts = Array.isArray(data) ? data : (data.data || data.transcripts || []);

    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      hasMore = false;
      console.log('[Voiceflow] No more transcripts to fetch');
    } else {
      // Normalize transcript IDs for compatibility
      const normalizedTranscripts = transcripts.map((transcript: any) => ({
        ...transcript,
        _id: transcript._id || transcript.id || transcript.transcriptID,
      }));

      allTranscripts.push(...normalizedTranscripts);
      console.log(`[Voiceflow] Fetched ${transcripts.length} transcripts, total: ${allTranscripts.length}`);

      // Check if we got fewer than requested - means we've reached the end
      if (transcripts.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  console.log(`[Voiceflow] Total transcripts fetched: ${allTranscripts.length}`);
  return allTranscripts;
}

// Fetch a single transcript with conversation logs (turns/dialogs)
// The API returns an array of turns/traces for the conversation
export async function fetchTranscriptWithLogs(
  transcriptID: string,
  transcriptMetadata?: VoiceflowTranscript
): Promise<VoiceflowTranscriptWithLogs> {
  if (!VOICEFLOW_API_KEY || !VOICEFLOW_PROJECT_ID) {
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow] Fetching transcript dialog:', transcriptID);

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Voiceflow] Failed to fetch transcript dialog:', response.status, errorText);
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  const data = await response.json();

  // API can return turns as array directly or within an object
  // Handle multiple response formats for compatibility
  let turns: VoiceflowTurn[] = [];
  if (Array.isArray(data)) {
    turns = data;
  } else if (data.turns) {
    turns = data.turns;
  } else if (data.dialogs) {
    turns = data.dialogs;
  } else if (data.data && Array.isArray(data.data)) {
    turns = data.data;
  }

  console.log(`[Voiceflow] Transcript ${transcriptID} has ${turns.length} turns`);

  // Merge metadata from list call if provided, otherwise use what we can extract
  return {
    _id: transcriptID,
    projectID: transcriptMetadata?.projectID || VOICEFLOW_PROJECT_ID,
    sessionID: transcriptMetadata?.sessionID || data.sessionID || transcriptID,
    browser: transcriptMetadata?.browser || data.browser,
    device: transcriptMetadata?.device || data.device,
    os: transcriptMetadata?.os || data.os,
    createdAt: transcriptMetadata?.createdAt || data.createdAt || new Date().toISOString(),
    updatedAt: transcriptMetadata?.updatedAt || data.updatedAt || new Date().toISOString(),
    user: transcriptMetadata?.user || data.user,
    unread: transcriptMetadata?.unread || data.unread,
    turns: turns
  };
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
// Handles multiple Voiceflow turn/trace formats for maximum compatibility
export function parseTranscriptMessages(turns: VoiceflowTurn[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const turn of turns) {
    const turnId = turn.turnID || (turn as any).id || Math.random().toString(36);
    const timestamp = turn.startTime || (turn as any).time || (turn as any).timestamp || new Date().toISOString();

    // User messages: type === 'request'
    if (turn.type === 'request') {
      const payload = turn.payload as VoiceflowTurnRequest;
      let content = '';

      // Handle various request payload formats
      const innerPayload = (payload as any).payload || payload;
      if (payload.type === 'text' || payload.type === 'intent' || innerPayload?.type === 'text') {
        content = innerPayload?.query || innerPayload?.label || payload.payload?.query || '';
      } else if (payload.type === 'launch' || innerPayload?.type === 'launch') {
        content = '[Conversation started]';
      } else if (innerPayload?.message) {
        content = innerPayload.message;
      }

      if (content) {
        messages.push({
          id: turnId + '-req',
          role: 'user',
          content,
          timestamp,
        });
      }
    }
    // Assistant messages: type === 'text' (common trace type)
    else if (turn.type === 'text') {
      const payload = turn.payload as any;
      const innerPayload = payload?.payload || payload;
      const content = innerPayload?.message || extractTextFromSlate(innerPayload?.slate) || payload?.message || '';

      if (content) {
        messages.push({
          id: turnId + '-text',
          role: 'assistant',
          content,
          timestamp,
        });
      }
    }
    // Speak type (voice responses)
    else if (turn.type === 'speak') {
      const payload = turn.payload as any;
      const innerPayload = payload?.payload || payload;
      const content = innerPayload?.message || innerPayload?.text || payload?.message || '';

      if (content) {
        messages.push({
          id: turnId + '-speak',
          role: 'assistant',
          content,
          timestamp,
        });
      }
    }
    // Legacy format: type === 'response'
    else if (turn.type === 'response') {
      const payload = turn.payload as VoiceflowTurnResponse;

      // Handle nested response structures
      if (payload.type === 'text' || payload.type === 'speak') {
        const content = extractResponseText(payload.payload);
        if (content) {
          messages.push({
            id: turnId + '-res',
            role: 'assistant',
            content,
            timestamp,
          });
        }
      }
    }
    // Block type (can contain text)
    else if (turn.type === 'block') {
      const payload = turn.payload as any;
      if (payload?.blockID && payload?.paths) {
        // This is navigation data, skip it
        continue;
      }
    }
    // Visual/Card traces - extract any text content
    else if (turn.type === 'visual' || turn.type === 'card' || turn.type === 'cardV2') {
      const payload = turn.payload as any;
      const innerPayload = payload?.payload || payload;
      const content = innerPayload?.title || innerPayload?.description || '';

      if (content) {
        messages.push({
          id: turnId + '-visual',
          role: 'assistant',
          content,
          timestamp,
        });
      }
    }
    // Carousel type
    else if (turn.type === 'carousel') {
      const payload = turn.payload as any;
      const innerPayload = payload?.payload || payload;
      const cards = innerPayload?.cards || [];
      for (const card of cards) {
        const content = card.title || card.description;
        if (content) {
          messages.push({
            id: turnId + '-carousel-' + (card.id || Math.random()),
            role: 'assistant',
            content,
            timestamp,
          });
        }
      }
    }
  }

  return messages;
}

// Calculate total credit consumption from debug turns
function calculateCredits(turns: any[]): number {
  if (!turns || turns.length === 0) return 0;

  let totalCredits = 0;

  for (const turn of turns) {
    // Look for debug turns with credit consumption data
    if (turn.type === 'debug' && turn.payload?.payload?.metadata?.VoiceflowCreditConsumption) {
      const creditData = turn.payload.payload.metadata.VoiceflowCreditConsumption;
      if (creditData.total && typeof creditData.total === 'number') {
        totalCredits += creditData.total;
      }
    }
  }

  // Round to 3 decimal places
  return Math.round(totalCredits * 1000) / 1000;
}

// Parse a full transcript into a displayable format
export function parseTranscript(
  transcript: VoiceflowTranscriptWithLogs
): ParsedTranscript {
  const messages = transcript.turns
    ? parseTranscriptMessages(transcript.turns)
    : [];

  // Calculate actual credit consumption from debug turns
  const credits = transcript.turns ? calculateCredits(transcript.turns) : 0;

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
    credits,
  };
}

// Fetch and parse all transcripts with their messages
// Uses concurrent fetching with rate limiting for better performance
export async function fetchParsedTranscripts(): Promise<ParsedTranscript[]> {
  const transcripts = await fetchTranscripts();
  console.log(`[Voiceflow] Parsing ${transcripts.length} transcripts...`);

  // Fetch transcript details in batches to improve performance while respecting rate limits
  const parsedTranscripts: ParsedTranscript[] = [];
  const batchSize = 5; // Concurrent requests per batch
  const delayBetweenBatches = 200; // ms delay between batches

  for (let i = 0; i < transcripts.length; i += batchSize) {
    const batch = transcripts.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (transcript) => {
        try {
          // Pass the transcript metadata to preserve info from the list call
          const withLogs = await fetchTranscriptWithLogs(transcript._id, transcript);
          return parseTranscript(withLogs);
        } catch (error) {
          console.error(`Failed to fetch transcript ${transcript._id}:`, error);
          // Return partial transcript with available metadata
          return {
            id: transcript._id,
            sessionID: transcript.sessionID || transcript._id,
            userName: transcript.user?.name,
            userImage: transcript.user?.image,
            createdAt: transcript.createdAt || new Date().toISOString(),
            updatedAt: transcript.updatedAt || new Date().toISOString(),
            messageCount: 0,
            preview: 'Failed to load messages',
            messages: [],
            browser: transcript.browser,
            device: transcript.device,
            os: transcript.os,
            unread: transcript.unread,
          } as ParsedTranscript;
        }
      })
    );

    // Extract successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        parsedTranscripts.push(result.value);
      }
    }

    // Progress logging
    console.log(`[Voiceflow] Parsed ${Math.min(i + batchSize, transcripts.length)}/${transcripts.length} transcripts`);

    // Delay between batches (except for last batch)
    if (i + batchSize < transcripts.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Sort by most recent first (using createdAt or first message timestamp)
  return parsedTranscripts.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime; // Sort descending (newest first)
  });
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
  return transcripts.filter(t =>
    t.sessionID.includes(voiceflowUserId) ||
    t.voiceflowUserId === voiceflowUserId ||
    t.appUser?.id === userId
  );
}

// ============================================================================
// USER-VOICEFLOW SESSION MANAGEMENT
// ============================================================================

/**
 * Record or update a Voiceflow session for a user.
 * Called when Voiceflow chat widget initializes.
 */
export async function recordVoiceflowSession(user: AppUser): Promise<void> {
  const voiceflowUserId = generateVoiceflowUserId(user.id);

  try {
    const { error } = await supabase
      .from('user_voiceflow_sessions')
      .upsert({
        app_user_id: user.id,
        voiceflow_user_id: voiceflowUserId,
        last_activity_at: new Date().toISOString(),
        metadata: {
          display_name: user.display_name,
          email: user.email,
          recorded_at: new Date().toISOString()
        }
      }, {
        onConflict: 'app_user_id,voiceflow_user_id'
      });

    if (error) {
      console.error('[Voiceflow] Failed to record session:', error);
    } else {
      console.log('[Voiceflow] Session recorded for user:', user.email, 'VF ID:', voiceflowUserId);
    }
  } catch (err) {
    console.error('[Voiceflow] Error recording session:', err);
  }
}

/**
 * Extract the Voiceflow user ID from a session ID.
 * Session IDs typically contain the userID we passed in.
 * Format: something_traidenis_uuid_something
 */
export function extractVoiceflowUserId(sessionID: string): string | null {
  // Match the pattern: traidenis_ followed by a UUID
  const match = sessionID.match(/traidenis_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (match) {
    return `traidenis_${match[1]}`;
  }
  return null;
}

/**
 * Get all user-voiceflow session mappings from the database.
 */
export async function getUserVoiceflowMappings(): Promise<Map<string, LinkedAppUser>> {
  try {
    const { data, error } = await supabase
      .from('user_voiceflow_sessions')
      .select(`
        voiceflow_user_id,
        app_user_id,
        metadata
      `);

    if (error) {
      console.error('[Voiceflow] Failed to fetch user mappings:', error);
      return new Map();
    }

    // Also fetch all app_users for complete info
    const { data: users, error: usersError } = await supabase
      .from('app_users')
      .select('id, email, display_name, is_admin');

    if (usersError) {
      console.error('[Voiceflow] Failed to fetch app users:', usersError);
      return new Map();
    }

    // Create a lookup map for users
    const usersMap = new Map(users?.map(u => [u.id, u]) || []);

    // Create voiceflow_user_id -> LinkedAppUser map
    const mappings = new Map<string, LinkedAppUser>();

    for (const session of data || []) {
      const appUser = usersMap.get(session.app_user_id);
      if (appUser) {
        mappings.set(session.voiceflow_user_id, {
          id: appUser.id,
          email: appUser.email,
          display_name: appUser.display_name,
          is_admin: appUser.is_admin
        });
      }
    }

    console.log('[Voiceflow] Loaded', mappings.size, 'user-voiceflow mappings');
    return mappings;
  } catch (err) {
    console.error('[Voiceflow] Error fetching user mappings:', err);
    return new Map();
  }
}

/**
 * Enrich transcripts with linked app user information.
 * This provides robust user identification in transcripts.
 */
export async function enrichTranscriptsWithUserInfo(
  transcripts: ParsedTranscript[]
): Promise<ParsedTranscript[]> {
  // Get the user-voiceflow mappings
  const mappings = await getUserVoiceflowMappings();

  // Also get all app_users for fallback matching
  const { data: allUsers } = await supabase
    .from('app_users')
    .select('id, email, display_name, is_admin');

  const usersById = new Map(allUsers?.map(u => [u.id, u]) || []);

  return transcripts.map(transcript => {
    // Try to extract the voiceflow user ID from session ID
    const voiceflowUserId = extractVoiceflowUserId(transcript.sessionID);

    let appUser: LinkedAppUser | undefined;

    // Method 1: Try database mapping (most reliable)
    if (voiceflowUserId && mappings.has(voiceflowUserId)) {
      appUser = mappings.get(voiceflowUserId);
    }

    // Method 2: If no mapping, try to extract UUID and match directly
    if (!appUser && voiceflowUserId) {
      const uuidMatch = voiceflowUserId.match(/traidenis_(.+)/);
      if (uuidMatch) {
        const userId = uuidMatch[1];
        const user = usersById.get(userId);
        if (user) {
          appUser = {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            is_admin: user.is_admin
          };
        }
      }
    }

    // If we found an app user, use their display name as userName
    const enrichedUserName = appUser?.display_name || appUser?.email || transcript.userName;

    return {
      ...transcript,
      appUser,
      voiceflowUserId: voiceflowUserId || undefined,
      userName: enrichedUserName
    };
  });
}

/**
 * Fetch and parse all transcripts with user enrichment.
 * This is the main function to use for getting transcripts with full user info.
 */
export async function fetchEnrichedTranscripts(): Promise<ParsedTranscript[]> {
  const transcripts = await fetchParsedTranscripts();
  return enrichTranscriptsWithUserInfo(transcripts);
}
