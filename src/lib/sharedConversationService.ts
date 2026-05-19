// Database: Directus API (see ./directus.ts). NOT Supabase.
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

type SharedConversationRow = {
  id: string;
  conversation_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  shared_at: string;
  is_read: boolean;
};

const asArray = <T,>(value: T[] | T | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const cleanupSharedConversationRows = async (
  shareIds: string[],
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  const uniqueIds = Array.from(new Set(shareIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const results = await Promise.all(uniqueIds.map(shareId =>
    dbAdmin
      .from('shared_conversations')
      .delete()
      .eq('id', shareId)
  ));

  const failed = results.find(result => result.error);
  if (failed?.error) {
    throw failed.error;
  }

  await appLogger.logDocument({
    action: 'orphaned_shared_conversations_deleted',
    metadata: {
      deleted_share_count: uniqueIds.length,
      deleted_share_ids: uniqueIds,
      ...metadata
    }
  });
};

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
    await appLogger.logError({
      action: 'conversation_share_failed',
      error: error as any,
      userId: sharedByUserId,
      userEmail: sharedByEmail,
      metadata: { conversation_id: conversationId, shared_with_users: userIds }
    });
    return { data: false, error };
  }
};

/**
 * Get conversations shared with a specific user
 * Uses separate queries instead of relational embedding for Directus compatibility
 */
export const getSharedConversations = async (
  userId: string
): Promise<{ data: SharedConversation[] | null; error: any }> => {
  try {
    // Step 1: Get shared conversation records
    const { data: shares, error } = await dbAdmin
      .from('shared_conversations')
      .select('*')
      .eq('shared_with_user_id', userId)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('Error fetching shared conversations:', error);
      throw error;
    }

    if (!shares || shares.length === 0) {
      return { data: [], error: null };
    }

    // Step 2: Fetch related conversations and users
    const transformedData: SharedConversation[] = [];
    const shareRows = asArray(shares as SharedConversationRow[] | SharedConversationRow);
    const conversationIds = Array.from(new Set(shareRows.map(share => share.conversation_id).filter(Boolean)));

    const { data: conversations, error: conversationsError } = conversationIds.length > 0
      ? await dbAdmin
        .from('sdk_conversations')
        .select('*')
        .in('id', conversationIds)
      : { data: [], error: null };

    if (conversationsError) throw conversationsError;

    const conversationsById = new Map(
      asArray(conversations as SDKConversation[] | SDKConversation).map(conversation => [conversation.id, conversation])
    );
    const orphanShares = shareRows.filter(share => !conversationsById.has(share.conversation_id));

    if (orphanShares.length > 0) {
      await cleanupSharedConversationRows(
        orphanShares.map(share => share.id),
        {
          user_id: userId,
          orphaned_conversation_ids: orphanShares.map(share => share.conversation_id)
        }
      );
    }

    const sharedByUserIds = Array.from(new Set(
      shareRows
        .filter(share => conversationsById.has(share.conversation_id))
        .map(share => share.shared_by_user_id)
        .filter(Boolean)
    ));

    const { data: sharedByUsers, error: usersError } = sharedByUserIds.length > 0
      ? await dbAdmin
        .from('app_users')
        .select('id, email, display_name')
        .in('id', sharedByUserIds)
      : { data: [], error: null };

    if (usersError) throw usersError;

    const sharedByUsersById = new Map(
      asArray(sharedByUsers as Array<{ id: string; email: string; display_name: string }> | { id: string; email: string; display_name: string })
        .map(sharedByUser => [sharedByUser.id, sharedByUser])
    );

    for (const share of shareRows) {
      const conversation = conversationsById.get(share.conversation_id);
      if (!conversation) continue;

      const sharedByUser = sharedByUsersById.get(share.shared_by_user_id);

      transformedData.push({
        id: share.id,
        conversation_id: share.conversation_id,
        shared_with_user_id: share.shared_with_user_id,
        shared_by_user_id: share.shared_by_user_id,
        shared_at: share.shared_at,
        is_read: share.is_read,
        conversation,
        shared_by_email: sharedByUser?.email,
        shared_by_name: sharedByUser?.display_name
      });
    }

    return { data: transformedData, error: null };
  } catch (error) {
    console.error('Error in getSharedConversations:', error);
    await appLogger.logError({
      action: 'shared_conversations_fetch_failed',
      error: error as any,
      metadata: { user_id: userId }
    });
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
      .select('*')
      .eq('conversation_id', conversationId);

    if (sharesError) throw sharesError;

    // Get the owner info
    const { data: owner, error: ownerError } = await dbAdmin
      .from('app_users')
      .select('id, email, display_name')
      .eq('id', conversation.author_id)
      .single();

    if (ownerError) throw ownerError;

    // Get shared-with user details for each share record
    const sharedWith: Array<{ id: string; email: string; display_name: string }> = [];
    for (const share of (shares || [])) {
      const { data: sharedUser } = await dbAdmin
        .from('app_users')
        .select('id, email, display_name')
        .eq('id', share.shared_with_user_id)
        .single();

      if (sharedUser) {
        sharedWith.push({
          id: sharedUser.id,
          email: sharedUser.email,
          display_name: sharedUser.display_name
        });
      }
    }

    const details: SharedConversationDetails = {
      conversation,
      shared_by: owner,
      shared_with: sharedWith,
      is_owner: conversation.author_id === userId
    };

    return { data: details, error: null };
  } catch (error) {
    console.error('Error in getSharedConversationDetails:', error);
    await appLogger.logError({
      action: 'shared_conversation_details_fetch_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, user_id: userId }
    });
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

    await appLogger.logDocument({
      action: 'shared_conversation_read',
      metadata: {
        conversation_id: conversationId,
        shared_with_user_id: userId
      }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in markSharedAsRead:', error);
    await appLogger.logError({
      action: 'shared_conversation_update_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, shared_with_user_id: userId, operation: 'mark_read' }
    });
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
    await appLogger.logError({
      action: 'conversation_unshare_failed',
      error: error as any,
      userId: removedByUserId,
      userEmail: removedByEmail,
      metadata: { conversation_id: conversationId, unshared_user_id: userId }
    });
    return { data: false, error };
  }
};

/**
 * Remove a specific shared conversation row, usually when it points to a
 * conversation that no longer exists.
 */
export const removeSharedConversationRecord = async (
  shareId: string,
  userId: string
): Promise<{ data: boolean; error: any }> => {
  try {
    const { error } = await dbAdmin
      .from('shared_conversations')
      .delete()
      .eq('id', shareId)
      .eq('shared_with_user_id', userId);

    if (error) throw error;

    await appLogger.logDocument({
      action: 'shared_conversation_record_removed',
      metadata: { share_id: shareId, shared_with_user_id: userId }
    });

    return { data: true, error: null };
  } catch (error) {
    console.error('Error in removeSharedConversationRecord:', error);
    await appLogger.logError({
      action: 'shared_conversation_record_remove_failed',
      error: error as any,
      metadata: { share_id: shareId, shared_with_user_id: userId }
    });
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

    if (!conversation) {
      return { hasAccess: false, isOwner: false, isShared: false };
    }

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
    await appLogger.logError({
      action: 'conversation_access_check_failed',
      error: error as any,
      metadata: { conversation_id: conversationId, user_id: userId }
    });
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
    // Directus doesn't support head-only count queries the same way,
    // so we fetch IDs only and count client-side. Only resolvable
    // conversations should count; orphan rows are cleaned up.
    const { data, error } = await dbAdmin
      .from('shared_conversations')
      .select('id, conversation_id')
      .eq('shared_with_user_id', userId)
      .eq('is_read', false);

    if (error) throw error;

    const unreadShares = asArray(data as SharedConversationRow[] | SharedConversationRow);
    if (unreadShares.length === 0) {
      return { data: 0, error: null };
    }

    const conversationIds = Array.from(new Set(unreadShares.map(share => share.conversation_id).filter(Boolean)));
    const { data: conversations, error: conversationsError } = conversationIds.length > 0
      ? await dbAdmin
        .from('sdk_conversations')
        .select('id')
        .in('id', conversationIds)
      : { data: [], error: null };

    if (conversationsError) throw conversationsError;

    const existingConversationIds = new Set(
      asArray(conversations as Array<{ id: string }> | { id: string }).map(conversation => conversation.id)
    );
    const orphanShares = unreadShares.filter(share => !existingConversationIds.has(share.conversation_id));

    if (orphanShares.length > 0) {
      await cleanupSharedConversationRows(
        orphanShares.map(share => share.id),
        {
          user_id: userId,
          orphaned_conversation_ids: orphanShares.map(share => share.conversation_id),
          source: 'unread_count'
        }
      );
    }

    const count = unreadShares.filter(share => existingConversationIds.has(share.conversation_id)).length;
    return { data: count, error: null };
  } catch (error) {
    console.error('Error in getUnreadSharedCount:', error);
    await appLogger.logError({
      action: 'shared_conversations_unread_count_failed',
      error: error as any,
      metadata: { user_id: userId }
    });
    return { data: 0, error };
  }
};
