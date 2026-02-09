import { db } from './database';
import { appLogger } from './appLogger';

const WEBHOOK_URL = 'https://n8n-self-host-gedarta.onrender.com/webhook-test/3961e6fa-4199-4f85-82f5-4e7e036f7e18';

export interface InstructionVariable {
  id: string;
  variable_key: string;
  variable_name: string;
  content: string;
  display_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface InstructionVersion {
  id: string;
  version_number: number;
  snapshot: Record<string, string>;
  change_description: string | null;
  created_at: string;
  created_by: string | null;
  is_revert: boolean;
  reverted_from_version: number | null;
}

/**
 * Fetch all instruction variables ordered by display_order
 */
export async function getInstructionVariables(): Promise<InstructionVariable[]> {
  const { data, error } = await db
    .from('instruction_variables')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching instruction variables:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single instruction variable by key
 */
export async function getInstructionVariable(variableKey: string): Promise<InstructionVariable | null> {
  const { data, error } = await db
    .from('instruction_variables')
    .select('*')
    .eq('variable_key', variableKey)
    .single();

  if (error) {
    console.error('Error fetching instruction variable:', error);
    return null;
  }

  return data;
}

/**
 * Update a single instruction variable
 */
export async function updateInstructionVariable(
  variableKey: string,
  content: string,
  userId: string
): Promise<InstructionVariable | null> {
  const { data, error } = await db
    .from('instruction_variables')
    .update({
      content,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('variable_key', variableKey)
    .select()
    .single();

  if (error) {
    console.error('Error updating instruction variable:', error);
    throw error;
  }

  return data;
}

/**
 * Create a version snapshot of all current variables
 */
export async function createVersionSnapshot(
  userId: string,
  changeDescription?: string,
  isRevert: boolean = false,
  revertedFromVersion?: number
): Promise<InstructionVersion | null> {
  // Get all current variables
  const variables = await getInstructionVariables();

  // Create snapshot object
  const snapshot: Record<string, string> = {};
  variables.forEach(v => {
    snapshot[v.variable_key] = v.content;
  });

  const { data, error } = await db
    .from('instruction_versions')
    .insert({
      snapshot,
      change_description: changeDescription,
      created_by: userId,
      is_revert: isRevert,
      reverted_from_version: revertedFromVersion
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating version snapshot:', error);
    throw error;
  }

  return data;
}

/**
 * Get all version history ordered by version_number descending
 */
export async function getVersionHistory(limit: number = 50): Promise<InstructionVersion[]> {
  const { data, error } = await db
    .from('instruction_versions')
    .select('*')
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching version history:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a specific version by version_number
 */
export async function getVersion(versionNumber: number): Promise<InstructionVersion | null> {
  const { data, error } = await db
    .from('instruction_versions')
    .select('*')
    .eq('version_number', versionNumber)
    .single();

  if (error) {
    console.error('Error fetching version:', error);
    return null;
  }

  return data;
}

/**
 * Revert to a specific version (safe revert - creates backup first)
 */
export async function revertToVersion(
  versionNumber: number,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Create a backup of current state before reverting
    await createVersionSnapshot(
      userId,
      `Auto-backup before reverting to version ${versionNumber}`,
      false
    );

    // 2. Get the version to revert to
    const versionToRevert = await getVersion(versionNumber);
    if (!versionToRevert) {
      return { success: false, error: 'Version not found' };
    }

    // 3. Update all variables with the snapshot values
    const snapshot = versionToRevert.snapshot;
    for (const [key, value] of Object.entries(snapshot)) {
      await updateInstructionVariable(key, value, userId);
    }

    // 4. Create a new version marking this as a revert
    await createVersionSnapshot(
      userId,
      `Reverted to version ${versionNumber}`,
      true,
      versionNumber
    );

    // 5. Trigger webhook with all updated variables
    await triggerWebhook(snapshot, userId, userEmail, `revert_to_v${versionNumber}`);

    await appLogger.logSystem({
      action: 'instruction_revert',
      userId,
      userEmail,
      metadata: {
        reverted_to_version: versionNumber,
        variables_restored: Object.keys(snapshot).length
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error reverting to version:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a variable and trigger webhook
 */
export async function saveInstructionVariable(
  variableKey: string,
  content: string,
  userId: string,
  userEmail: string,
  createVersion: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Update the variable
    await updateInstructionVariable(variableKey, content, userId);

    // 2. Optionally create a version snapshot
    if (createVersion) {
      const variable = await getInstructionVariable(variableKey);
      await createVersionSnapshot(
        userId,
        `Updated: ${variable?.variable_name || variableKey}`
      );
    }

    // 3. Get all current variables for webhook
    const allVariables = await getInstructionVariables();
    const payload: Record<string, string> = {};
    allVariables.forEach(v => {
      payload[v.variable_key] = v.content;
    });

    // 4. Trigger webhook
    await triggerWebhook(payload, userId, userEmail, `update_${variableKey}`);

    await appLogger.logSystem({
      action: 'instruction_saved',
      userId,
      userEmail,
      metadata: {
        variable_key: variableKey,
        content_length: content.length
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error saving instruction variable:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger the n8n webhook with variable data
 */
async function triggerWebhook(
  variables: Record<string, string>,
  userId: string,
  userEmail: string,
  action: string
): Promise<void> {
  try {
    const payload = {
      action,
      timestamp: new Date().toISOString(),
      user: {
        id: userId,
        email: userEmail
      },
      variables
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn('Webhook returned non-OK status:', response.status);
    }

    console.log('Webhook triggered successfully for action:', action);
  } catch (error) {
    // Log but don't throw - webhook failure shouldn't block the save
    console.error('Failed to trigger webhook:', error);
    await appLogger.logError({
      action: 'instruction_webhook_failed',
      error,
      metadata: { webhook_action: action }
    });
  }
}

/**
 * Verify user password for editing access
 */
export async function verifyUserPassword(
  email: string,
  password: string
): Promise<boolean> {
  const { data, error } = await db
    .from('app_users')
    .select('id')
    .eq('email', email)
    .eq('password', password)
    .single();

  if (error || !data) {
    return false;
  }

  return true;
}

/**
 * Initialize variables with default content (for first-time setup)
 */
export async function initializeVariableContent(
  variableKey: string,
  content: string,
  userId: string
): Promise<void> {
  const { error } = await db
    .from('instruction_variables')
    .update({
      content,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('variable_key', variableKey);

  if (error) {
    console.error('Error initializing variable content:', error);
    throw error;
  }
}

/**
 * Bulk update all variables (for initialization or bulk operations)
 */
export async function bulkUpdateVariables(
  updates: Array<{ variable_key: string; content: string }>,
  userId: string,
  userEmail: string,
  createVersion: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update each variable
    for (const update of updates) {
      await updateInstructionVariable(update.variable_key, update.content, userId);
    }

    // Create version snapshot
    if (createVersion) {
      await createVersionSnapshot(
        userId,
        `Bulk update: ${updates.length} variables`
      );
    }

    // Get all variables for webhook
    const allVariables = await getInstructionVariables();
    const payload: Record<string, string> = {};
    allVariables.forEach(v => {
      payload[v.variable_key] = v.content;
    });

    // Trigger webhook
    await triggerWebhook(payload, userId, userEmail, 'bulk_update');

    return { success: true };
  } catch (error: any) {
    console.error('Error in bulk update:', error);
    return { success: false, error: error.message };
  }
}
