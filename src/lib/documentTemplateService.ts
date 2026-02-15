/**
 * Document Template Service
 *
 * Handles rendering the commercial offer HTML template with live variable
 * substitution.  The template (exported from Google Docs) uses {{variable_key}}
 * placeholders that are replaced with actual values at render time.
 *
 * Unfilled placeholders are highlighted with a yellow background so the user
 * can see what's still missing.
 *
 * The global template is stored in the database (global_template table) and
 * cached in memory for synchronous access.  On first load the cache is
 * hydrated from the DB; subsequent reads are instant.
 */

import { COMMERCIAL_OFFER_TEMPLATE } from '../templates/commercialOfferTemplate';
import {
  getGlobalTemplate,
  saveGlobalTemplateToDb,
  resetGlobalTemplateInDb,
  type GlobalTemplate,
} from './globalTemplateService';

// ---------------------------------------------------------------------------
// In-memory cache — keeps synchronous callers working while data lives in DB
// ---------------------------------------------------------------------------

let _cachedHtml: string | null = null;
let _cachedMeta: GlobalTemplate | null = null;
let _cacheLoaded = false;

/**
 * Load the global template from the database into the in-memory cache.
 * Must be called once on app startup (e.g. in useEffect).
 * Returns the full GlobalTemplate metadata (updated_by_name, version, etc.).
 */
export async function loadGlobalTemplateFromDb(): Promise<GlobalTemplate | null> {
  try {
    const tpl = await getGlobalTemplate();
    if (tpl) {
      _cachedHtml = tpl.html_content;
      _cachedMeta = tpl;
    } else {
      _cachedHtml = null;
      _cachedMeta = null;
    }
    _cacheLoaded = true;
    return tpl;
  } catch (err) {
    console.error('[DocumentTemplate] Error loading from DB:', err);
    _cacheLoaded = true; // mark loaded even on error so we don't hang
    return null;
  }
}

/**
 * Get cached metadata about the global template (version, updated_by, etc.).
 * Returns null if no customised template exists.
 */
export function getGlobalTemplateMeta(): GlobalTemplate | null {
  return _cachedMeta;
}

// ---------------------------------------------------------------------------
// Template variable helpers
// ---------------------------------------------------------------------------

/**
 * Extract all {{variable_key}} placeholder names from the template.
 */
export function extractTemplateVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    vars.add(match[1].trim());
  }
  return Array.from(vars);
}

/**
 * Render the template by substituting {{variable_key}} placeholders.
 *
 * - Filled variables are replaced with the value text.
 * - Unfilled variables are rendered as highlighted placeholder chips so the
 *   user can visually identify what still needs to be filled in.
 * - The `<hr>` page-break markers from Google Docs are converted into visual
 *   A4 page separators.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let html = template;

  // Replace every {{key}} with a clickable data-var span.
  // Filled variables show the value; unfilled ones show a yellow placeholder chip.
  // Both are wrapped in <span data-var="key"> for click handling in the preview.
  html = html.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimKey = key.trim();
    const value = variables[trimKey];

    if (value !== undefined && value !== '') {
      const escaped = escapeHtml(value).replace(/\n/g, '<br>');
      return `<span data-var="${trimKey}" class="template-var filled">${escaped}</span>`;
    }

    // Unfilled — visible placeholder chip, also clickable
    return `<span data-var="${trimKey}" class="template-var unfilled" style="background:#fff3cd;color:#856404;padding:1px 6px;border-radius:3px;font-size:0.85em;border:1px dashed #ffc107;white-space:nowrap;cursor:pointer;">${trimKey}</span>`;
  });

  // Extract the header block (logo bar + company info) — the first <div>
  // inside <body>.  This block is injected after every page break so each
  // printed page starts with the company heading.
  const headerMatch = html.match(/<body[^>]*>(\s*<div>[\s\S]*?<\/div>)/);
  const headerBlock = headerMatch ? headerMatch[1] : '';

  // Count total pages (page-break HRs + 1)
  const pageBreakRegex = /<hr[^>]*style="page-break-before:\s*always[^"]*"[^>]*>/gi;
  const pageBreakCount = (html.match(pageBreakRegex) || []).length;
  const totalPages = pageBreakCount + 1;

  // Convert Google Docs page-break <hr> to visual page separators,
  // injecting the header block after each separator so subsequent pages
  // display the company logo/info.
  const pageSeparator =
    `<div style="width:100%;border-top:2px dashed #d1d5db;margin:32px 0;position:relative;">` +
    `<span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#fff;padding:0 12px;font-size:10px;color:#9ca3af;white-space:nowrap;">Naujas puslapis</span>` +
    `</div>`;

  // Inject page number footer before each page separator
  let pageNum = 1;
  html = html.replace(
    /<hr[^>]*style="page-break-before:\s*always[^"]*"[^>]*>/gi,
    () => {
      const pageFooter = `<div class="page-number">${pageNum} / ${totalPages}</div>`;
      pageNum++;
      return pageFooter + pageSeparator + headerBlock;
    }
  );

  // Add page number footer for the last page before </body> (skip for single-page docs)
  if (totalPages > 1) {
    const lastPageFooter = `<div class="page-number">${totalPages} / ${totalPages}</div>`;
    html = html.replace('</body>', lastPageFooter + '</body>');
  }

  return html;
}

/**
 * Render template for the visual editor: only variable substitution,
 * no page-break processing or header injection.  This keeps the raw
 * template structure intact so we can cleanly extract it back on save.
 */
export function renderTemplateForEditor(template: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimKey = key.trim();
    return `<span data-var="${trimKey}" class="template-var unfilled" contenteditable="false" style="background:#fff3cd;color:#856404;padding:1px 6px;border-radius:3px;font-size:0.85em;border:1px dashed #ffc107;white-space:nowrap;display:inline-block;">${trimKey}</span>`;
  });
}

// ---------------------------------------------------------------------------
// Synchronous getters / setters (cache-backed, DB-synced)
// ---------------------------------------------------------------------------

/**
 * Returns the global template HTML (synchronous).
 * Uses the in-memory cache (populated by loadGlobalTemplateFromDb).
 * Falls back to the hardcoded default if cache is empty.
 */
export function getDefaultTemplate(): string {
  if (_cachedHtml) return _cachedHtml;
  return COMMERCIAL_OFFER_TEMPLATE;
}

/**
 * Save a user-edited global template.
 * Updates the in-memory cache immediately and persists to DB async.
 */
export function saveGlobalTemplate(
  html: string,
  userId?: string,
  userName?: string
): void {
  // Update cache immediately for synchronous consumers
  _cachedHtml = html;

  // Persist to database (fire-and-forget for the synchronous API;
  // the caller can also use saveGlobalTemplateToDb directly for await)
  if (userId && userName) {
    saveGlobalTemplateToDb(html, userId, userName).then((result) => {
      if (result) _cachedMeta = result;
    }).catch(err => console.error('[DocumentTemplate] DB save error:', err));
  }
}

/**
 * Reset the global template back to the hardcoded default.
 * Updates cache immediately and persists to DB async.
 */
export function resetGlobalTemplate(userId?: string, userName?: string): void {
  _cachedHtml = null;
  _cachedMeta = null;

  if (userId && userName) {
    resetGlobalTemplateInDb(userId, userName).then((result) => {
      if (result) _cachedMeta = result;
    }).catch(err => console.error('[DocumentTemplate] DB reset error:', err));
  }
}

/**
 * Check whether the global template has been customized.
 */
export function isGlobalTemplateCustomized(): boolean {
  if (!_cacheLoaded) return false;
  return _cachedHtml !== null && _cachedHtml !== COMMERCIAL_OFFER_TEMPLATE;
}

/**
 * Get the list of variables that have not been filled yet.
 */
export function getUnfilledVariables(
  template: string,
  variables: Record<string, string>
): string[] {
  const all = extractTemplateVariables(template);
  return all.filter((key) => !variables[key] || variables[key] === '');
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Sanitize HTML before loading into a sandboxed iframe.
 * Strips script tags, meta http-equiv, inline event handlers, and
 * javascript: URLs so that user-edited templates from the DB cannot
 * inject executable content.
 */
export function sanitizeHtmlForIframe(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta[^>]+http-equiv[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
