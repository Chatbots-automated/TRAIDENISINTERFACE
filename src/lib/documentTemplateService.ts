/**
 * Document Template Service
 *
 * Handles rendering the commercial offer HTML template with live variable
 * substitution.  The template (exported from Google Docs) uses {{variable_key}}
 * placeholders that are replaced with actual values at render time.
 *
 * Unfilled placeholders are highlighted with a yellow background so the user
 * can see what's still missing.
 */

import { COMMERCIAL_OFFER_TEMPLATE } from '../templates/commercialOfferTemplate';

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

  // Replace every {{key}} with the value or a placeholder chip
  html = html.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimKey = key.trim();
    const value = variables[trimKey];

    if (value !== undefined && value !== '') {
      // Render the actual value, escaping HTML entities for safety.
      // Convert newlines to <br> so multiline values (e.g. bullet lists) render.
      return escapeHtml(value).replace(/\n/g, '<br>');
    }

    // Unfilled — render a visible placeholder chip
    return `<span style="background:#fff3cd;color:#856404;padding:1px 6px;border-radius:3px;font-size:0.85em;border:1px dashed #ffc107;white-space:nowrap;">${trimKey}</span>`;
  });

  // Extract the header block (logo bar + company info) — the first <div>
  // inside <body>.  This block is injected after every page break so each
  // printed page starts with the company heading.
  const headerMatch = html.match(/<body[^>]*>(\s*<div>[\s\S]*?<\/div>)/);
  const headerBlock = headerMatch ? headerMatch[1] : '';

  // Convert Google Docs page-break <hr> to visual page separators,
  // injecting the header block after each separator so subsequent pages
  // display the company logo/info.
  const pageSeparator =
    `<div style="width:100%;border-top:2px dashed #d1d5db;margin:32px 0;position:relative;">` +
    `<span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#fff;padding:0 12px;font-size:10px;color:#9ca3af;white-space:nowrap;">Naujas puslapis</span>` +
    `</div>`;

  html = html.replace(
    /<hr[^>]*style="page-break-before:\s*always[^"]*"[^>]*>/gi,
    pageSeparator + headerBlock
  );

  return html;
}

/**
 * Returns the default template HTML.
 */
export function getDefaultTemplate(): string {
  return COMMERCIAL_OFFER_TEMPLATE;
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
