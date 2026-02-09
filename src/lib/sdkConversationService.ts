import { supabase, supabaseAdmin } from './database';
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

export interface CommercialOfferArtifact {
  id: string;
  type: 'commercial_offer';
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
  diff_history: DiffEntry[];
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
    const { data, error } = await supabaseAdmin
      .from('sdk_conversations')
      .insert([{
        project_id: projectId,
        title: title,
        author_id: userId,
        author_email: userEmail,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        messages: [],
        artifact: null
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
    const { data, error } = await supabaseAdmin
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
    const { data, error } = await supabaseAdmin
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
    const { data: conversation, error: fetchError } = await supabaseAdmin
      .from('sdk_conversations')
      .select('messages, message_count')
      .eq('id', conversationId)
      .single();

    if (fetchError) throw fetchError;

    const currentMessages = conversation.messages || [];
    const updatedMessages = [...currentMessages, message];

    // Update conversation with new message
    const { error: updateError } = await supabaseAdmin
      .from('sdk_conversations')
      .update({
        messages: updatedMessages,
        message_count: updatedMessages.length,
        last_message_at: message.timestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (updateError) throw updateError;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in addMessageToConversation:', error);
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
    const { error } = await supabaseAdmin
      .from('sdk_conversations')
      .update({
        artifact: artifact,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in updateConversationArtifact:', error);
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
    const { error } = await supabaseAdmin
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
    const { error } = await supabaseAdmin
      .from('sdk_conversations')
      .update({
        title: newTitle,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in renameSDKConversation:', error);
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
    const { data: conversation, error: fetchError } = await supabaseAdmin
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
      const { error: updateError } = await supabaseAdmin
        .from('sdk_conversations')
        .update({
          messages: currentMessages,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) throw updateError;
    }

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in updateMessageButtonSelection:', error);
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
