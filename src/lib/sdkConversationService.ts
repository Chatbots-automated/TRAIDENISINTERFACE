// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db, dbAdmin } from './database';
import { appLogger } from './appLogger';

export interface SDKConversation {
  id: string;
  project_id: string;
  title: string;
  author_id: string;
  author_email: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string;
  messages: SDKMessage[];
  artifact?: CommercialOfferArtifact;
  artifact_ui_state?: ArtifactUIState | null;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cache_creation_tokens?: number;
  total_cache_read_tokens?: number;
}

export interface SDKMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thinking?: string; // Extended thinking content
  buttons?: Array<{id: string, label: string, value: string}>; // Interactive buttons
  buttonsMessage?: string; // Message to display with buttons
  selectedButtonId?: string; // ID of the button that was selected by the user
  isSilent?: boolean; // Flag for silent messages (button clicks that shouldn't be displayed)
}

export interface VariableCitation {
  variable_key: string;
  message_index: number;
  thinking_excerpt: string;
  chat_excerpt: string;
  timestamp: string;
  version: number;
}

export interface CommercialOfferArtifact {
  id: string;
  type: 'commercial_offer';
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
  diff_history: DiffEntry[];
  variable_citations?: Record<string, VariableCitation>;
}

export interface ArtifactUIState {
  skipped_template_rows?: Record<string, boolean>;
  template_row_overrides?: Record<string, string>;
  updated_at?: string;
  updated_by?: string;
}

export interface DiffEntry {
  version: number;
  timestamp: string;
  changes: {
    added: string[];
    removed: string[];
    modified: { before: string; after: string }[];
  };
}

/**
 * Create a new SDK conversation
 */
export const createSDKConversation = async (
  projectId: string,
  userId: string,
  userEmail: string,
  title: string = 'Naujas pokalbis'
): Promise<{ data: string | null; error: any }> => {
  try {
    const { data, error } = await dbAdmin
      .from('sdk_conversations')
      .insert([{
        project_id: projectId,
        title: title,
        author_id: userId,
        author_email: userEmail,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        messages: [],
        artifact: null,
        artifact_ui_state: null,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating SDK conversation:', error);
      throw error;
    }

    await appLogger.logDocument({
      action: 'sdk_conversation_created',
      userId: userId,
      userEmail: userEmail,
      metadata: {
        conversation_id: data.id,
        project_id: projectId,
        title: title
      }
    });

    return { data: data.id, error: null };
  } catch (error) {
    console.error('Error in createSDKConversation:', error);
    await appLogger.logError({
      action: 'sdk_conversation_create_failed',
      error: error as any,
      userId,
      userEmail,
      metadata: { project_id: projectId, title }
    });
    return { data: null, error };
  }
};

/**
 * Get all SDK conversations for a project
 */
export const getSDKConversations = async (
  projectId: string
): Promise<{ data: SDKConversation[] | null; error: any }> => {
  try {
    const { data, error } = await dbAdmin
      .from('sdk_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching SDK conversations:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getSDKConversations:', error);
    await appLogger.logError({
      action: 'sdk_conversations_fetch_failed',
      error: error as any,
      metadata: { project_id: projectId }
    });
    return { data: null, error };
  }
};

/**
 * Get a single SDK conversation by ID
 */
export const getSDKConversation = async (
  conversationId: string
): Promise<{ data: SDKConversation | null; error: any }> => {
  try {
    const { data, error } = await dbAdmin
      .from('sdk_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) {
      console.error('Error fetching SDK conversation:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getSDKConversation:', error);
    await appLogger.logError({
      action: 'sdk_conversation_fetch_failed',
      error: error as any,
      metadata: { conversation_id: conversationId }
    });
    return { data: null, error };
  }
};

/**
 * Add a message to an SDK conversation
 */
export const addMessageToConversation = async (
  conversationId: string,
  message: SDKMessage
): Promise<{ data: boolean; error: any }> => {
  try {
    // Fetch current conversation
    const { data: conversation, error: fetchError } = await dbAdmin
      .from('sdk_conversations')
      .select('messages, message_count')
      .eq('id', conversationId)
      .single();

    if (fetchError) throw fetchError;

    const currentMessages = conversation.messages || [];
    const updatedMessages = [...currentMessages, message];

    // Update conversation with new message
    const { error: updateError } = await dbAdmin
      .from('sdk_conversations')
      .update({
        messages: updatedMessages,
        message_count: updatedMessages.length,
        last_message_at: message.timestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (updateError) throw updateError;

    await appLogger.logDocument({
      action: 'sdk_conversation_updated',
      metadata: {
        conversation_id: conversationId,
        updated_field: 'messages',
        message_count: updatedMessages.length,
        message_role: message.role
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in addMessageToConversation:', error);
    await appLogger.logError({
      action: 'sdk_conversation_update_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, operation: 'add_message' }
    });
    return { data: false, error };
  }
};

/**
 * Update the artifact in a conversation
 */
export const updateConversationArtifact = async (
  conversationId: string,
  artifact: CommercialOfferArtifact
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('sdk_conversations')
      .update({
        artifact: artifact,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) throw error;

    await appLogger.logDocument({
      action: 'sdk_artifact_updated',
      metadata: {
        conversation_id: conversationId,
        artifact_id: artifact.id,
        artifact_type: artifact.type,
        artifact_version: artifact.version
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in updateConversationArtifact:', error);
    await appLogger.logError({
      action: 'sdk_artifact_update_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, artifact_id: artifact?.id }
    });
    return { data: false, error };
  }
};

/**
 * Persist artifact-side panel UI state for a conversation.
 */
export const updateConversationArtifactUIState = async (
  conversationId: string,
  uiState: ArtifactUIState
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('sdk_conversations')
      .update({
        artifact_ui_state: uiState,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('Error in updateConversationArtifactUIState:', error);
    return { data: false, error };
  }
};

/**
 * Accumulate token usage counters for a conversation.
 */
export const addConversationTokenUsage = async (
  conversationId: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  }
): Promise<{ data: boolean; error: any }> => {
  try {
    const { data: row, error: fetchError } = await dbAdmin
      .from('sdk_conversations')
      .select('total_input_tokens,total_output_tokens,total_cache_creation_tokens,total_cache_read_tokens')
      .eq('id', conversationId)
      .single();

    if (fetchError) throw fetchError;

    const nextInput = (row?.total_input_tokens || 0) + (usage.input_tokens || 0);
    const nextOutput = (row?.total_output_tokens || 0) + (usage.output_tokens || 0);
    const nextCacheCreation = (row?.total_cache_creation_tokens || 0) + (usage.cache_creation_tokens || 0);
    const nextCacheRead = (row?.total_cache_read_tokens || 0) + (usage.cache_read_tokens || 0);

    const { error: updateError } = await dbAdmin
      .from('sdk_conversations')
      .update({
        total_input_tokens: nextInput,
        total_output_tokens: nextOutput,
        total_cache_creation_tokens: nextCacheCreation,
        total_cache_read_tokens: nextCacheRead,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (updateError) throw updateError;
    return { data: true, error: null };
  } catch (error) {
    console.error('Error in addConversationTokenUsage:', error);
    return { data: false, error };
  }
};

/**
 * Delete an SDK conversation
 */
export const deleteSDKConversation = async (
  conversationId: string,
  userId: string,
  userEmail: string
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('sdk_conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;

    await appLogger.logDocument({
      action: 'sdk_conversation_deleted',
      userId: userId,
      userEmail: userEmail,
      metadata: {
        conversation_id: conversationId
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in deleteSDKConversation:', error);
    await appLogger.logError({
      action: 'sdk_conversation_delete_failed',
      error: error as any,
      userId,
      userEmail,
      metadata: { conversation_id: conversationId }
    });
    return { data: false, error };
  }
};

/**
 * Rename an SDK conversation
 */
export const renameSDKConversation = async (
  conversationId: string,
  newTitle: string
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('sdk_conversations')
      .update({
        title: newTitle,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) throw error;

    await appLogger.logDocument({
      action: 'sdk_conversation_updated',
      metadata: {
        conversation_id: conversationId,
        updated_field: 'title'
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in renameSDKConversation:', error);
    await appLogger.logError({
      action: 'sdk_conversation_update_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, operation: 'rename' }
    });
    return { data: false, error };
  }
};

/**
 * Update a specific message's selected button
 */
export const updateMessageButtonSelection = async (
  conversationId: string,
  messageIndex: number,
  selectedButtonId: string
): Promise<{ data: boolean; error: any }> => {
  try {
    // Fetch current conversation
    const { data: conversation, error: fetchError } = await dbAdmin
      .from('sdk_conversations')
      .select('messages')
      .eq('id', conversationId)
      .single();

    if (fetchError) throw fetchError;

    const currentMessages = conversation.messages || [];

    // Update the specific message's selectedButtonId
    if (messageIndex >= 0 && messageIndex < currentMessages.length) {
      currentMessages[messageIndex].selectedButtonId = selectedButtonId;

      // Update conversation with modified messages
      const { error: updateError } = await dbAdmin
        .from('sdk_conversations')
        .update({
          messages: currentMessages,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      await appLogger.logDocument({
        action: 'sdk_conversation_updated',
        metadata: {
          conversation_id: conversationId,
          updated_field: 'selected_button_id',
          message_index: messageIndex
        }
      });
    }

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in updateMessageButtonSelection:', error);
    await appLogger.logError({
      action: 'sdk_conversation_update_failed',
      error: error as any,
      metadata: {
        conversation_id: conversationId,
        operation: 'update_message_button_selection',
        message_index: messageIndex
      }
    });
    return { data: false, error };
  }
};

/**
 * Calculate diff between two versions of content
 */
export function calculateDiff(oldContent: string, newContent: string): DiffEntry['changes'] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const added: string[] = [];
  const removed: string[] = [];
  const modified: { before: string; after: string }[] = [];

  // Simple line-by-line diff
  const maxLength = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLength; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === undefined && newLine !== undefined) {
      added.push(newLine);
    } else if (oldLine !== undefined && newLine === undefined) {
      removed.push(oldLine);
    } else if (oldLine !== newLine) {
      modified.push({ before: oldLine, after: newLine });
    }
  }

  return { added, removed, modified };
}
