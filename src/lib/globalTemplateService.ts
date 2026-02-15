/**
 * Global Template Service
 *
 * Manages the single shared HTML template stored in the database.
 * All users see the same template.  Every save creates a version
 * snapshot so changes can be undone (up to MAX_VERSIONS back).
 */

import { db } from './database';
import { COMMERCIAL_OFFER_TEMPLATE } from '../templates/commercialOfferTemplate';
import { appLogger } from './appLogger';

/** Maximum number of version history entries to keep. */
const MAX_VERSIONS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalTemplate {
  id: number;
  html_content: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  version: number;
}

export interface GlobalTemplateVersion {
  id: string;
  version_number: number;
  html_content: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  change_description: string | null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch the current global template from the database.
 * Returns null if no row exists yet (first-time use).
 */
export async function getGlobalTemplate(): Promise<GlobalTemplate | null> {
  try {
    const { data, error } = await db
      .from('global_template')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      // PGRST116 = not found — expected on first launch
      if (error.code === 'PGRST116' || error.message?.includes('not found')) {
        return null;
      }
      console.error('[GlobalTemplate] Error fetching template:', error);
      return null;
    }

    return data as GlobalTemplate;
  } catch (err) {
    console.error('[GlobalTemplate] Error fetching template:', err);
    return null;
  }
}

/**
 * Get the HTML for the global template.
 * Falls back to the hardcoded default if no DB row exists.
 */
export async function getGlobalTemplateHtml(): Promise<string> {
  const tpl = await getGlobalTemplate();
  return tpl?.html_content ?? COMMERCIAL_OFFER_TEMPLATE;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Delete the oldest version history entries so only MAX_VERSIONS remain.
 * Called after every insert to keep the table bounded.
 */
async function pruneOldVersions(): Promise<void> {
  try {
    // Fetch all versions ordered newest-first, only need the id field
    const { data, error } = await db
      .from('global_template_versions')
      .select('id,version_number')
      .order('version_number', { ascending: false });

    if (error || !data) return;

    const rows = data as { id: string; version_number: number }[];
    if (rows.length <= MAX_VERSIONS) return;

    // Everything beyond the first MAX_VERSIONS rows must go
    const toDelete = rows.slice(MAX_VERSIONS);
    for (const row of toDelete) {
      await db
        .from('global_template_versions')
        .delete()
        .eq('id', row.id);
    }

    console.log(`[GlobalTemplate] Pruned ${toDelete.length} old version(s), keeping ${MAX_VERSIONS}`);
  } catch (err) {
    // Non-critical — log and move on
    console.error('[GlobalTemplate] Error pruning old versions:', err);
  }
}

/**
 * Save a new version of the global template.
 * - Upserts the singleton row (id=1).
 * - Creates a version history entry with the *previous* content.
 * - Prunes versions beyond the 30-entry limit.
 */
export async function saveGlobalTemplateToDb(
  html: string,
  userId: string,
  userName: string,
  changeDescription?: string
): Promise<GlobalTemplate | null> {
  try {
    // 1. Read current template so we can snapshot it before overwriting
    const current = await getGlobalTemplate();

    // 2. Snapshot the *previous* content into version history
    if (current) {
      await db
        .from('global_template_versions')
        .insert({
          html_content: current.html_content,
          created_by: current.updated_by,
          created_by_name: current.updated_by_name,
          change_description: changeDescription ?? 'Šablono atnaujinimas',
        });

      // 3. Prune old versions beyond the 30-entry limit
      await pruneOldVersions();
    }

    const nextVersion = (current?.version ?? 0) + 1;

    // 4. Upsert the singleton row
    if (current) {
      const { data, error } = await db
        .from('global_template')
        .update({
          html_content: html,
          updated_at: new Date().toISOString(),
          updated_by: userId,
          updated_by_name: userName,
          version: nextVersion,
        })
        .eq('id', 1)
        .select()
        .single();

      if (error) {
        console.error('[GlobalTemplate] Error updating template:', error);
        return null;
      }

      await appLogger.logDocument({
        action: 'global_template_updated',
        userId,
        userEmail: userName,
        metadata: { version: nextVersion },
      });

      return data as GlobalTemplate;
    } else {
      // First-time insert
      const { data, error } = await db
        .from('global_template')
        .insert({
          id: 1,
          html_content: html,
          updated_by: userId,
          updated_by_name: userName,
          version: 1,
        })
        .select()
        .single();

      if (error) {
        console.error('[GlobalTemplate] Error inserting template:', error);
        return null;
      }

      await appLogger.logDocument({
        action: 'global_template_created',
        userId,
        userEmail: userName,
        metadata: { version: 1 },
      });

      return data as GlobalTemplate;
    }
  } catch (err) {
    console.error('[GlobalTemplate] Error saving template:', err);
    return null;
  }
}

/**
 * Reset the global template back to the hardcoded default.
 * Snapshots the current content before resetting.
 */
export async function resetGlobalTemplateInDb(
  userId: string,
  userName: string
): Promise<GlobalTemplate | null> {
  return saveGlobalTemplateToDb(
    COMMERCIAL_OFFER_TEMPLATE,
    userId,
    userName,
    'Atkurtas pradinis šablonas'
  );
}

// ---------------------------------------------------------------------------
// Version History
// ---------------------------------------------------------------------------

/**
 * Fetch the version history, newest first.
 */
export async function getGlobalTemplateVersions(
  limit: number = 30
): Promise<GlobalTemplateVersion[]> {
  try {
    const { data, error } = await db
      .from('global_template_versions')
      .select('*')
      .order('version_number', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[GlobalTemplate] Error fetching versions:', error);
      return [];
    }

    return (data as GlobalTemplateVersion[]) ?? [];
  } catch (err) {
    console.error('[GlobalTemplate] Error fetching versions:', err);
    return [];
  }
}

/**
 * Revert to a specific version from the history.
 */
export async function revertToVersion(
  versionId: string,
  userId: string,
  userName: string
): Promise<GlobalTemplate | null> {
  try {
    // Fetch the version to restore
    const { data, error } = await db
      .from('global_template_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error || !data) {
      console.error('[GlobalTemplate] Version not found:', versionId);
      return null;
    }

    const version = data as GlobalTemplateVersion;

    return saveGlobalTemplateToDb(
      version.html_content,
      userId,
      userName,
      `Atkurta versija #${version.version_number}`
    );
  } catch (err) {
    console.error('[GlobalTemplate] Error reverting:', err);
    return null;
  }
}

/**
 * Check whether the global template has been customised
 * (i.e. is different from the hardcoded default).
 */
export async function isGlobalTemplateCustomizedInDb(): Promise<boolean> {
  const tpl = await getGlobalTemplate();
  if (!tpl) return false;
  return tpl.html_content !== COMMERCIAL_OFFER_TEMPLATE;
}
