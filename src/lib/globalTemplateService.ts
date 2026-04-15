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
const ENV_DOCX_TEMPLATE_FILE_ID = (import.meta.env.VITE_SDK_TEMPLATE_FILE_ID || '').trim() || null;
const DOCX_TEMPLATE_TITLE = '__docx_global_template__';
const SDK_TEMPLATE_COLLECTION = 'sdk_template';
const DOCX_TEMPLATE_LOCAL_KEY = 'docx_template_file_id';

// ---------------------------------------------------------------------------
// DOCX Template (stored as a Directus file, found by title marker)
// ---------------------------------------------------------------------------

/** In-memory cache for the docx template file ID. */
let _cachedDocxFileId: string | null = null;
let _docxCacheLoaded = false;
let _cachedTemplateVars: { fileId: string; vars: string[] } | null = null;

function getAuthHeaders(): HeadersInit {
  return { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
}

function cacheTemplateId(fileId: string | null) {
  _cachedDocxFileId = fileId;
  _docxCacheLoaded = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (fileId) localStorage.setItem(DOCX_TEMPLATE_LOCAL_KEY, fileId);
      else localStorage.removeItem(DOCX_TEMPLATE_LOCAL_KEY);
    }
  } catch {
    // best-effort only
  }
}

type SdkTemplateRow = {
  id: number;
  file?: string | { id?: string | null } | null;
};

function normalizeFileId(value: SdkTemplateRow['file']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' && value.id ? value.id : null;
}

async function getSdkTemplateRow(): Promise<SdkTemplateRow | null> {
  // Preferred: singleton-like read without list params (works across more Directus setups)
  const primaryUrl = `${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}?fields=id,file,file.id`;
  const primaryResp = await fetch(primaryUrl, { headers: getAuthHeaders() });
  if (primaryResp.ok) {
    const primaryJson = await primaryResp.json();
    const data = primaryJson?.data;
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  // If the token can't read this collection, don't keep probing noisy fallbacks.
  if (primaryResp.status === 401 || primaryResp.status === 403) {
    return null;
  }

  // Backward-compatible fallback for Directus setups that expose /singleton path
  const singletonUrl = `${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/singleton?fields=id,file,file.id`;
  const singletonResp = await fetch(singletonUrl, { headers: getAuthHeaders() });
  if (!singletonResp.ok) return null;
  const singletonJson = await singletonResp.json();
  return singletonJson?.data || null;
}

async function upsertSdkTemplateFile(fileId: string | null): Promise<void> {
  // Preferred path for singleton collections in Directus
  const primaryResp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}`, {
    method: 'PATCH',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: fileId }),
  });
  if (primaryResp.ok) return;

  // Backward-compatible fallback for /singleton style endpoints
  const singletonResp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/singleton`, {
    method: 'PATCH',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: fileId }),
  });
  if (singletonResp.ok) return;

  // Final fallback for non-singleton tables
  const row = await getSdkTemplateRow();
  if (row?.id) {
    const resp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/${row.id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileId }),
    });
    if (!resp.ok) throw new Error(`Nepavyko atnaujinti sdk_template įrašo: ${resp.status}`);
    return;
  }

  const createResp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: fileId }),
  });
  if (!createResp.ok) throw new Error(`Nepavyko sukurti sdk_template įrašo: ${createResp.status}`);
}

async function fileExists(fileId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${DIRECTUS_URL}/files/${fileId}?fields=id`, { headers: getAuthHeaders() });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Upload a .docx template file to Directus and tag it so we can find it
 * later.  Replaces any previously uploaded docx template.
 */
export async function uploadDocxTemplate(file: File): Promise<string> {
  const oldId = await getDocxTemplateFileId();

  // 1. Upload file to Directus /files with a known title marker
  const form = new FormData();
  form.append('file', file);
  form.append('title', DOCX_TEMPLATE_TITLE);
  form.append('filename_download', `${DOCX_TEMPLATE_TITLE}.docx`);
  const resp = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  if (!resp.ok) throw new Error(`DOCX šablono įkėlimas nepavyko: ${resp.status}`);
  const json = await resp.json();
  const newFileId: string = json.data.id;

  // 2. Point sdk_template to the new file and refresh cache immediately.
  cacheTemplateId(newFileId);
  await upsertSdkTemplateFile(newFileId);

  // 3. Delete the old file from Directus if one existed
  if (oldId && oldId !== newFileId) {
    await fetch(`${DIRECTUS_URL}/files/${oldId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => { /* best-effort cleanup */ });
  }

  return newFileId;
}

/**
 * Get the Directus file ID of the current .docx template.
 * Searches for a file with the title marker '__docx_global_template__'.
 * Returns null if no template has been uploaded.
 */
export async function getDocxTemplateFileId(): Promise<string | null> {
  // Positive cache hit: safe to return immediately.
  // Do NOT short-circuit on cached null, because template can be linked later
  // during the same app session (without a full page refresh).
  if (_docxCacheLoaded && _cachedDocxFileId) return _cachedDocxFileId;

  // -1) Optional hard override via environment (useful when API role can't read sdk_template)
  if (ENV_DOCX_TEMPLATE_FILE_ID && await fileExists(ENV_DOCX_TEMPLATE_FILE_ID)) {
    cacheTemplateId(ENV_DOCX_TEMPLATE_FILE_ID);
    return ENV_DOCX_TEMPLATE_FILE_ID;
  }

  // 0) Fast local fallback (survives refresh if DB pointer write fails)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const localId = localStorage.getItem(DOCX_TEMPLATE_LOCAL_KEY);
      if (localId && await fileExists(localId)) {
        cacheTemplateId(localId);
        return localId;
      }
    }
  } catch {
    // continue
  }

  // 1) Source of truth: sdk_template table pointer
  try {
    const row = await getSdkTemplateRow();
    const sdkFileId = normalizeFileId(row?.file);
    if (sdkFileId && await fileExists(sdkFileId)) {
      cacheTemplateId(sdkFileId);
      return sdkFileId;
    }
  } catch {
    // ignore and continue with fallback lookup
  }

  // 2) Legacy fallback: by title marker in Directus files collection
  try {
    const resp = await fetch(
      `${DIRECTUS_URL}/files?filter[title][_eq]=${encodeURIComponent(DOCX_TEMPLATE_TITLE)}&limit=1&fields=id`,
      { headers: getAuthHeaders() },
    );
    if (!resp.ok) {
      return null;
    }
    const json = await resp.json();
    const discovered = json.data?.[0]?.id || null;
    cacheTemplateId(discovered);
    if (discovered) await upsertSdkTemplateFile(discovered);
    return discovered;
  } catch {
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
 * Build a Directus asset URL for preview/opening.
 */
export function getDirectusAssetUrl(fileId: string): string {
  return `${DIRECTUS_URL}/assets/${fileId}?access_token=${DIRECTUS_TOKEN}`;
}

/**
 * Delete the current .docx template file from Directus.
 */
export async function deleteDocxTemplate(): Promise<void> {
  const fileId = await getDocxTemplateFileId();
  if (fileId) {
    await fetch(`${DIRECTUS_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => {});
  }

  await upsertSdkTemplateFile(null);

  cacheTemplateId(null);
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
  return `${DIRECTUS_URL}/assets/${fileId}?access_token=${DIRECTUS_TOKEN}&download`;
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
    nullGetter: () => '',
  });
  const cleanedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables)) {
    const normalized = v === undefined || v === null ? '' : String(v);
    cleanedVars[k] = normalized.replace(/\\n/g, '\n');
  }
  docx.render(cleanedVars);
  return docx.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Extract template variable placeholders used in the current DOCX template.
 * Looks for {{variable_name}} patterns inside DOCX XML parts.
 */
export async function extractDocxTemplateVariables(): Promise<string[]> {
  const fileId = await getDocxTemplateFileId();
  if (!fileId) return [];
  if (_cachedTemplateVars?.fileId === fileId) return _cachedTemplateVars.vars;

  const response = await fetch(getDocxTemplateUrl(fileId));
  if (!response.ok) return [];
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);

  const vars = new Set<string>();
  const placeholderRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (!name.endsWith('.xml') || entry.dir) continue;
    const content = entry.asText();
    let match: RegExpExecArray | null = null;
    while ((match = placeholderRegex.exec(content)) !== null) {
      const key = match[1]?.trim();
      if (key) vars.add(key);
    }
  }

  const discovered = [...vars].sort((a, b) => a.localeCompare(b));
  _cachedTemplateVars = { fileId, vars: discovered };
  return discovered;
}
