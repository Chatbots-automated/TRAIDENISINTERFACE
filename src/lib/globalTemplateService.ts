/**
 * DOCX Template Service
 *
 * Manages uploading, retrieving, and filling .docx templates stored as
 * Directus files.  The base template file is identified by its title
 * marker ('__docx_global_template__') so no additional DB table is needed.
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

// Directus instance credentials
const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

// ---------------------------------------------------------------------------
// DOCX Template (stored as a Directus file, found by title marker)
// ---------------------------------------------------------------------------

/** In-memory cache for the docx template file ID. */
let _cachedDocxFileId: string | null = null;
let _docxCacheLoaded = false;

/**
 * Upload a .docx template file to Directus and tag it so we can find it
 * later.  Replaces any previously uploaded docx template.
 */
export async function uploadDocxTemplate(file: File): Promise<string> {
  // 1. Upload file to Directus /files with a known title marker
  const form = new FormData();
  form.append('file', file);
  form.append('title', '__docx_global_template__');
  const resp = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`DOCX šablono įkėlimas nepavyko: ${resp.status}`);
  const json = await resp.json();
  const newFileId: string = json.data.id;

  // 2. Delete the old file from Directus if one existed
  const oldId = _cachedDocxFileId;
  if (oldId && oldId !== newFileId) {
    await fetch(`${DIRECTUS_URL}/files/${oldId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    }).catch(() => { /* best-effort cleanup */ });
  }

  _cachedDocxFileId = newFileId;
  _docxCacheLoaded = true;
  return newFileId;
}

/**
 * Get the Directus file ID of the current .docx template.
 * Searches for a file with the title marker '__docx_global_template__'.
 * Returns null if no template has been uploaded.
 */
export async function getDocxTemplateFileId(): Promise<string | null> {
  if (_docxCacheLoaded) return _cachedDocxFileId;
  try {
    const resp = await fetch(
      `${DIRECTUS_URL}/files?filter[title][_eq]=__docx_global_template__&limit=1&sort=-uploaded_on`,
      { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } },
    );
    if (!resp.ok) {
      _docxCacheLoaded = true;
      return null;
    }
    const json = await resp.json();
    _cachedDocxFileId = json.data?.[0]?.id || null;
    _docxCacheLoaded = true;
    return _cachedDocxFileId;
  } catch {
    _docxCacheLoaded = true;
    return null;
  }
}

/**
 * Build the Directus asset URL for the .docx template file.
 */
export function getDocxTemplateUrl(fileId: string): string {
  return `${DIRECTUS_URL}/assets/${fileId}?access_token=${DIRECTUS_TOKEN}`;
}

/**
 * Delete the current .docx template file from Directus.
 */
export async function deleteDocxTemplate(): Promise<void> {
  const fileId = await getDocxTemplateFileId();
  if (!fileId) return;

  await fetch(`${DIRECTUS_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
  }).catch(() => {});

  _cachedDocxFileId = null;
}

/**
 * Upload a .docx Blob to Directus /files and return the new file ID.
 * Optionally deletes a previous file to avoid orphans.
 */
export async function uploadDocxBlobToDirectus(
  blob: Blob,
  filename: string,
  previousFileId?: string | null,
): Promise<string> {
  const form = new FormData();
  form.append('file', blob, filename);
  const resp = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`DOCX failo įkėlimas nepavyko: ${resp.status}`);
  const json = await resp.json();
  const newFileId: string = json.data.id;

  // Best-effort cleanup of the previous file
  if (previousFileId) {
    fetch(`${DIRECTUS_URL}/files/${previousFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    }).catch(() => {});
  }

  return newFileId;
}

/**
 * Build a Directus asset download URL for any file ID.
 */
export function getDirectusFileUrl(fileId: string): string {
  return `${DIRECTUS_URL}/assets/${fileId}?access_token=${DIRECTUS_TOKEN}`;
}

/**
 * Generate a .docx Blob by filling the uploaded template with variables.
 * Standalone — no DOM/component dependency.
 */
export async function buildDocxBlob(variables: Record<string, string>): Promise<Blob> {
  const fileId = await getDocxTemplateFileId();
  if (!fileId) throw new Error('DOCX šablonas neįkeltas. Įkelkite .docx šabloną per šablono redaktorių.');
  const response = await fetch(getDocxTemplateUrl(fileId));
  if (!response.ok) throw new Error('Nepavyko užkrauti DOCX šablono iš serverio');
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const docx = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });
  const cleanedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables)) {
    cleanedVars[k] = typeof v === 'string' ? v.replace(/\\n/g, '\n') : v;
  }
  docx.render(cleanedVars);
  return docx.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
