/**
 * Global Template Service
 *
 * Manages the single shared HTML template stored in the database.
 * All users see the same template.  Every save creates a version
 * snapshot so changes can be undone (up to MAX_VERSIONS back).
 */

// Database: Directus API (see ./directus.ts). NOT Supabase.
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

// ---------------------------------------------------------------------------
// Change summary helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and collapse whitespace to get plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute a short, user-friendly Lithuanian summary of what changed
 * between oldHtml and newHtml.
 */
export function computeChangeSummary(oldHtml: string, newHtml: string): string {
  const oldText = stripHtml(oldHtml);
  const newText = stripHtml(newHtml);

  if (oldText === newText) return 'Formatavimo pakeitimai';

  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);
  const diff = newWords.length - oldWords.length;

  if (diff > 3) return `Pridėta ~${diff} žodž.`;
  if (diff < -3) return `Pašalinta ~${Math.abs(diff)} žodž.`;
  return 'Teksto pakeitimai';
}

// ---------------------------------------------------------------------------
// Word-level diff (LCS-based)
// ---------------------------------------------------------------------------

export interface DiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Compute word-level diff between two HTML strings.
 * Strips HTML first, then runs LCS on word arrays.
 * Returns segments suitable for rendering (green/red highlights).
 */
export function computeHtmlDiff(oldHtml: string, newHtml: string): DiffSegment[] {
  const oldWords = stripHtml(oldHtml).split(/\s+/).filter(Boolean);
  const newWords = stripHtml(newHtml).split(/\s+/).filter(Boolean);

  const m = oldWords.length;
  const n = newWords.length;

  // LCS DP table — safe for templates up to ~1000 words
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Trace back to produce segments
  const raw: DiffSegment[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      raw.push({ type: 'same', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'added', text: newWords[j - 1] });
      j--;
    } else {
      raw.push({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // Merge consecutive segments of the same type, joining words with spaces
  const merged: DiffSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += ' ' + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
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
      // Compute a human-readable summary of the change
      const autoSummary = computeChangeSummary(current.html_content, html);
      const description = changeDescription
        ? `${changeDescription} (${autoSummary.toLowerCase()})`
        : autoSummary;

      await db
        .from('global_template_versions')
        .insert({
          html_content: current.html_content,
          created_by: current.updated_by,
          created_by_name: current.updated_by_name,
          change_description: description,
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
