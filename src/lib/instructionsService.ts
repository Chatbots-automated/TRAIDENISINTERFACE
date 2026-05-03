// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db, dbAdmin } from './database';
import { appLogger } from './appLogger';

const CHAT_VARIABLE_PREFIX = 'chat_';
const CHAT_TEMPLATE_VARIABLE_KEY = 'chat_template';
const isChatVariableKey = (key: string) => key.startsWith(CHAT_VARIABLE_PREFIX);

export interface InstructionVariable {
  id: string;
  variable_key: string;
  variable_name: string;
  description?: string | null;
  content: string;
  display_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface InstructionVersion {
  id: string;
  version_number: number;
  snapshot: Record<string, string | InstructionSnapshotVariable>;
  change_description: string | null;
  created_at: string;
  created_by: string | null;
  is_revert: boolean;
  reverted_from_version: number | null;
}

export interface InstructionSnapshotVariable {
  content: string;
  variable_name?: string | null;
  description?: string | null;
  display_order?: number | null;
}

const isForbiddenError = (error: any): boolean => {
  const code = String(error?.code || '');
  const details = String(error?.details || '');
  const message = String(error?.message || '');
  return code === '403' || details.toUpperCase().includes('FORBIDDEN') || message.toLowerCase().includes('permission');
};

/**
 * Fetch all instruction variables ordered by display_order
 */
export async function getInstructionVariables(): Promise<InstructionVariable[]> {
  let { data, error } = await db
    .from('instruction_variables')
    .select('*')
    .order('display_order', { ascending: true });

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_variables')
      .select('*')
      .order('display_order', { ascending: true }));
  }

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
  let { data, error } = await db
    .from('instruction_variables')
    .select('*')
    .eq('variable_key', variableKey)
    .limit(1);

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_variables')
      .select('*')
      .eq('variable_key', variableKey)
      .limit(1));
  }

  if (error) {
    console.error('Error fetching instruction variable:', error);
    return null;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return Array.isArray(data) ? (data[0] as InstructionVariable) : (data as InstructionVariable);
}

/**
 * Update a single instruction variable
 */
export async function updateInstructionVariable(
  variableKey: string,
  content: string,
  userId: string
): Promise<InstructionVariable | null> {
  let { data, error } = await db
    .from('instruction_variables')
    .update({
      content,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('variable_key', variableKey)
    .select()
    .single();

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_variables')
      .update({
        content,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('variable_key', variableKey)
      .select()
      .single());
  }

  if (error) {
    console.error('Error updating instruction variable:', error);
    throw error;
  }

  return data;
}

async function deleteInstructionVariableRow(variableKey: string): Promise<void> {
  let { error } = await db
    .from('instruction_variables')
    .delete()
    .eq('variable_key', variableKey);

  if (error && isForbiddenError(error)) {
    ({ error } = await dbAdmin
      .from('instruction_variables')
      .delete()
      .eq('variable_key', variableKey));
  }

  if (error) throw error;
}

export async function deleteInstructionVariable(
  variableKey: string,
  userId: string,
  userEmail: string,
  createVersion: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedKey = variableKey.trim();
    if (!isChatVariableKey(normalizedKey)) {
      return { success: false, error: 'Galima trinti tik chat_ instrukcijų kintamuosius' };
    }
    if (normalizedKey === CHAT_TEMPLATE_VARIABLE_KEY) {
      return { success: false, error: 'chat_template yra pagrindinis šablonas ir negali būti trinamas' };
    }

    const existing = await getInstructionVariable(normalizedKey);
    if (!existing) {
      return { success: false, error: 'Kintamasis nerastas' };
    }

    await deleteInstructionVariableRow(normalizedKey);

    if (createVersion) {
      await createVersionSnapshot(userId, `Ištrinta: ${existing.variable_name || normalizedKey}`);
    }

    await appLogger.logSystem({
      action: 'instruction_deleted',
      userId,
      userEmail,
      metadata: {
        variable_key: normalizedKey,
        variable_name: existing.variable_name
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting instruction variable:', error);
    return { success: false, error: error.message || 'Nepavyko ištrinti kintamojo' };
  }
}

async function upsertInstructionVariableFromSnapshot(
  variableKey: string,
  snapshotValue: string | InstructionSnapshotVariable,
  userId: string
): Promise<void> {
  const value = typeof snapshotValue === 'string'
    ? { content: snapshotValue }
    : snapshotValue;
  const existing = await getInstructionVariable(variableKey);

  const fields = {
    variable_key: variableKey,
    variable_name: value.variable_name || existing?.variable_name || variableKey,
    description: value.description ?? existing?.description ?? null,
    content: value.content ?? '',
    display_order: value.display_order ?? existing?.display_order ?? 500,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  if (existing) {
    let { error } = await db
      .from('instruction_variables')
      .update(fields)
      .eq('variable_key', variableKey);

    if (error && isForbiddenError(error)) {
      ({ error } = await dbAdmin
        .from('instruction_variables')
        .update(fields)
        .eq('variable_key', variableKey));
    }

    if (error) throw error;
    return;
  }

  let { error } = await db
    .from('instruction_variables')
    .insert([fields]);

  if (error && isForbiddenError(error)) {
    ({ error } = await dbAdmin
      .from('instruction_variables')
      .insert([fields]));
  }

  if (error) throw error;
}

export async function createInstructionVariable(
  input: {
    variable_key: string;
    variable_name: string;
    description?: string | null;
    content?: string;
    display_order?: number;
  },
  userId: string,
  userEmail: string,
  createVersion: boolean = true
): Promise<{ success: boolean; variable?: InstructionVariable; error?: string }> {
  try {
    const variableKey = input.variable_key.trim();
    const variableName = input.variable_name.trim();

    if (!variableKey || !variableName) {
      return { success: false, error: 'Kodas ir pavadinimas yra privalomi' };
    }

    const existing = await getInstructionVariable(variableKey);
    if (existing) {
      return { success: false, error: 'Toks kintamasis jau egzistuoja' };
    }

    const record = {
      variable_key: variableKey,
      variable_name: variableName,
      description: input.description?.trim() || null,
      content: input.content || '',
      display_order: input.display_order ?? 500,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    let { data, error } = await db
      .from('instruction_variables')
      .insert([record])
      .select()
      .single();

    if (error && isForbiddenError(error)) {
      ({ data, error } = await dbAdmin
        .from('instruction_variables')
        .insert([record])
        .select()
        .single());
    }

    if (error) throw error;

    if (createVersion) {
      await createVersionSnapshot(userId, `Sukurta: ${variableName}`);
    }

    await appLogger.logSystem({
      action: 'instruction_created',
      userId,
      userEmail,
      metadata: {
        variable_key: variableKey,
        content_length: record.content.length
      }
    });

    return { success: true, variable: data as InstructionVariable };
  } catch (error: any) {
    console.error('Error creating instruction variable:', error);
    return { success: false, error: error.message || 'Nepavyko sukurti kintamojo' };
  }
}

/**
 * Create a version snapshot of current chat_* variables only.
 */
export async function createVersionSnapshot(
  userId: string,
  changeDescription?: string,
  isRevert: boolean = false,
  revertedFromVersion?: number
): Promise<InstructionVersion | null> {
  // Versioning is intentionally scoped to user-facing chat prompts.
  const variables = (await getInstructionVariables()).filter(v => isChatVariableKey(v.variable_key));

  // Create snapshot object
  const snapshot: Record<string, InstructionSnapshotVariable> = {};
  variables.forEach(v => {
    snapshot[v.variable_key] = {
      content: v.content,
      variable_name: v.variable_name,
      description: v.description ?? null,
      display_order: v.display_order,
    };
  });

  let { data, error } = await db
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

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_versions')
      .insert({
        snapshot,
        change_description: changeDescription,
        created_by: userId,
        is_revert: isRevert,
        reverted_from_version: revertedFromVersion
      })
      .select()
      .single());
  }

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
  let { data, error } = await db
    .from('instruction_versions')
    .select('*')
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_versions')
      .select('*')
      .order('version_number', { ascending: false })
      .limit(limit));
  }

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
  let { data, error } = await db
    .from('instruction_versions')
    .select('*')
    .eq('version_number', versionNumber)
    .single();

  if (error && isForbiddenError(error)) {
    ({ data, error } = await dbAdmin
      .from('instruction_versions')
      .select('*')
      .eq('version_number', versionNumber)
      .single());
  }

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
): Promise<{ success: boolean; backupVersion?: number; restoredVersion?: number; error?: string }> {
  try {
    // 1. Create a backup of current state before reverting
    const backup = await createVersionSnapshot(
      userId,
      `Atsarginė kopija prieš atkuriant v${versionNumber}`,
      false
    );

    // 2. Get the version to revert to
    const versionToRevert = await getVersion(versionNumber);
    if (!versionToRevert) {
      return { success: false, error: 'Version not found' };
    }

    // 3. Update all variables with the snapshot values
    const snapshot = Object.fromEntries(
      Object.entries(versionToRevert.snapshot || {}).filter(([key]) => isChatVariableKey(key))
    );
    const snapshotKeys = new Set(Object.keys(snapshot));
    const currentVariables = (await getInstructionVariables()).filter(v => isChatVariableKey(v.variable_key));

    for (const variable of currentVariables) {
      if (!snapshotKeys.has(variable.variable_key)) {
        await deleteInstructionVariableRow(variable.variable_key);
      }
    }

    for (const [key, value] of Object.entries(snapshot)) {
      await upsertInstructionVariableFromSnapshot(key, value, userId);
    }

    // 4. Create a new version marking this as a revert
    const restored = await createVersionSnapshot(
      userId,
      `Atkurta iš v${versionNumber}`,
      true,
      versionNumber
    );

    await appLogger.logSystem({
      action: 'instruction_revert',
      userId,
      userEmail,
      metadata: {
        reverted_to_version: versionNumber,
        variables_restored: Object.keys(snapshot).length
      }
    });

    return {
      success: true,
      backupVersion: backup?.version_number,
      restoredVersion: restored?.version_number,
    };
  } catch (error: any) {
    console.error('Error reverting to version:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a variable and create version snapshot
 */
export async function saveInstructionVariable(
  variableKey: string,
  content: string,
  userId: string,
  userEmail: string,
  createVersion: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateInstructionVariable(variableKey, content, userId);

    if (createVersion) {
      const variable = await getInstructionVariable(variableKey);
      await createVersionSnapshot(
        userId,
        `Atnaujinta: ${variable?.variable_name || variableKey}`
      );
    }

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
  let { error } = await db
    .from('instruction_variables')
    .update({
      content,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('variable_key', variableKey);

  if (error && isForbiddenError(error)) {
    ({ error } = await dbAdmin
      .from('instruction_variables')
      .update({
        content,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('variable_key', variableKey));
  }

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

    return { success: true };
  } catch (error: any) {
    console.error('Error in bulk update:', error);
    return { success: false, error: error.message };
  }
}
