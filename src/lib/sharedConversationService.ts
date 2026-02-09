import { dbAdmin } from './database';
import { appLogger } from './appLogger';
import type { SDKConversation } from './sdkConversationService';

export interface SharedConversation {
  id: string;
  conversation_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  shared_at: string;
  is_read: boolean;
  conversation?: SDKConversation;
  shared_by_email?: string;
  shared_by_name?: string;
}

export interface SharedConversationDetails {
  conversation: SDKConversation;
  shared_by: {
    id: string;
    email: string;
    display_name: string;
  };
  shared_with: Array<{
    id: string;
    email: string;
    display_name: string;
  }>;
  is_owner: boolean;
}

/**
 * Share a conversation with multiple users
 */
export const shareConversation = async (
  conversationId: string,
  userIds: string[],
  sharedByUserId: string,
  sharedByEmail: string
): Promise<{ data: boolean; error: any }> => {
  try {
    // Create share records for each user
    const shareRecords = userIds.map(userId => ({
      conversation_id: conversationId,
      shared_with_user_id: userId,
      shared_by_user_id: sharedByUserId,
      is_read: false
    }));

    const { error } = await dbAdmin
      .from('shared_conversations')
      .insert(shareRecords);

    if (error) {
      console.error('Error sharing conversation:', error);
      throw error;
    }

    await appLogger.logDocument({
      action: 'conversation_shared',
      userId: sharedByUserId,
      userEmail: sharedByEmail,
      metadata: {
        conversation_id: conversationId,
        shared_with_count: userIds.length,
        shared_with_users: userIds
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in shareConversation:', error);
    return { data: false, error };
  }
};

/**
 * Get conversations shared with a specific user
 */
export const getSharedConversations = async (
  userId: string
): Promise<{ data: SharedConversation[] | null; error: any }> => {
  try {
    const { data, error } = await dbAdmin
      .from('shared_conversations')
      .select(`
        *,
        conversation:sdk_conversations(*),
        shared_by:app_users!shared_conversations_shared_by_user_id_fkey(email, display_name)
      `)
      .eq('shared_with_user_id', userId)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('Error fetching shared conversations:', error);
      throw error;
    }

    // Transform the data to match our interface
    const transformedData = data?.map((item: any) => ({
      id: item.id,
      conversation_id: item.conversation_id,
      shared_with_user_id: item.shared_with_user_id,
      shared_by_user_id: item.shared_by_user_id,
      shared_at: item.shared_at,
      is_read: item.is_read,
      conversation: item.conversation,
      shared_by_email: item.shared_by?.email,
      shared_by_name: item.shared_by?.display_name
    })) || [];

    return { data: transformedData, error: null };
  } catch (error) {
    console.error('Error in getSharedConversations:', error);
    return { data: null, error };
  }
};

/**
 * Get detailed information about a shared conversation
 */
export const getSharedConversationDetails = async (
  conversationId: string,
  userId: string
): Promise<{ data: SharedConversationDetails | null; error: any }> => {
  try {
    // Get the conversation
    const { data: conversation, error: convError } = await dbAdmin
      .from('sdk_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    // Get all shares for this conversation
    const { data: shares, error: sharesError } = await dbAdmin
      .from('shared_conversations')
      .select(`
        *,
        shared_with:app_users!shared_conversations_shared_with_user_id_fkey(id, email, display_name)
      `)
      .eq('conversation_id', conversationId);

    if (sharesError) throw sharesError;

    // Get the owner info
    const { data: owner, error: ownerError } = await dbAdmin
      .from('app_users')
      .select('id, email, display_name')
      .eq('id', conversation.author_id)
      .single();

    if (ownerError) throw ownerError;

    const sharedWith = shares?.map((share: any) => ({
      id: share.shared_with.id,
      email: share.shared_with.email,
      display_name: share.shared_with.display_name
    })) || [];

    const details: SharedConversationDetails = {
      conversation,
      shared_by: owner,
      shared_with: sharedWith,
      is_owner: conversation.author_id === userId
    };

    return { data: details, error: null };
  } catch (error) {
    console.error('Error in getSharedConversationDetails:', error);
    return { data: null, error };
  }
};

/**
 * Mark a shared conversation as read
 */
export const markSharedAsRead = async (
  conversationId: string,
  userId: string
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('shared_conversations')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('shared_with_user_id', userId);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in markSharedAsRead:', error);
    return { data: false, error };
  }
};

/**
 * Remove share access for a specific user
 */
export const unshareConversation = async (
  conversationId: string,
  userId: string,
  removedByUserId: string,
  removedByEmail: string
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('shared_conversations')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('shared_with_user_id', userId);

    if (error) throw error;

    await appLogger.logDocument({
      action: 'conversation_unshared',
      userId: removedByUserId,
      userEmail: removedByEmail,
      metadata: {
        conversation_id: conversationId,
        unshared_user_id: userId
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in unshareConversation:', error);
    return { data: false, error };
  }
};

/**
 * Check if user has access to a conversation (owner or shared)
 */
export const checkConversationAccess = async (
  conversationId: string,
  userId: string
): Promise<{ hasAccess: boolean; isOwner: boolean; isShared: boolean }> => {
  try {
    // Check if user is owner
    const { data: conversation } = await dbAdmin
      .from('sdk_conversations')
      .select('author_id')
      .eq('id', conversationId)
      .single();

    if (conversation?.author_id === userId) {
      return { hasAccess: true, isOwner: true, isShared: false };
    }

    // Check if conversation is shared with user
    const { data: share } = await dbAdmin
      .from('shared_conversations')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('shared_with_user_id', userId)
      .single();

    if (share) {
      return { hasAccess: true, isOwner: false, isShared: true };
    }

    return { hasAccess: false, isOwner: false, isShared: false };
  } catch (error) {
    console.error('Error in checkConversationAccess:', error);
    return { hasAccess: false, isOwner: false, isShared: false };
  }
};

/**
 * Get count of unread shared conversations for a user
 */
export const getUnreadSharedCount = async (
  userId: string
): Promise<{ data: number; error: any }> => {
  try {
    const { count, error } = await dbAdmin
      .from('shared_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('shared_with_user_id', userId)
      .eq('is_read', false);

    if (error) throw error;

    return { data: count || 0, error: null };
  } catch (error) {
    console.error('Error in getUnreadSharedCount:', error);
    return { data: 0, error };
  }
};
