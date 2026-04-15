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
const DOCX_TEMPLATE_TITLE = '__docx_global_template__';
const SDK_TEMPLATE_COLLECTION = 'sdk_template';
const DOCX_TEMPLATE_LOCAL_KEY = 'docx_template_file_id';

// ---------------------------------------------------------------------------
// DOCX Template (stored as a Directus file, found by title marker)
// ---------------------------------------------------------------------------

/** In-memory cache for the docx template file ID. */
let _cachedDocxFileId: string | null = null;
let _docxCacheLoaded = false;

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
  const url = `${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}?limit=1&sort=-id&fields=id,file,file.id`;
  const resp = await fetch(url, { headers: getAuthHeaders() });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.data?.[0] || null;
}

async function listSdkTemplateRowIds(): Promise<number[]> {
  const url = `${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}?limit=-1&sort=id&fields=id`;
  const resp = await fetch(url, { headers: getAuthHeaders() });
  if (!resp.ok) return [];
  const json = await resp.json();
  return Array.isArray(json?.data)
    ? json.data.map((row: { id?: number }) => row.id).filter((id: number | undefined): id is number => typeof id === 'number')
    : [];
}

async function upsertSdkTemplateFile(fileId: string | null): Promise<void> {
  const ids = await listSdkTemplateRowIds();

  // Preferred path: exactly one row exists -> PATCH only (no new row creation)
  if (ids.length === 1) {
    const resp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/${ids[0]}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileId }),
    });
    if (!resp.ok) throw new Error(`Nepavyko atnaujinti sdk_template įrašo: ${resp.status}`);
    return;
  }

  // Recovery path: multiple rows exist -> keep the oldest, PATCH it, delete the rest
  if (ids.length > 1) {
    const [keepId, ...extraIds] = ids;
    const patchResp = await fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/${keepId}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileId }),
    });
    if (!patchResp.ok) throw new Error(`Nepavyko atnaujinti sdk_template įrašo: ${patchResp.status}`);
    await Promise.all(
      extraIds.map((id) =>
        fetch(`${DIRECTUS_URL}/items/${SDK_TEMPLATE_COLLECTION}/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }).catch(() => {})
      ),
    );
    return;
  }

  // Bootstrap path: no rows exist -> create first (and only) row
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

  // 2. Delete the old file from Directus if one existed
  const oldId = await getDocxTemplateFileId();
  if (oldId && oldId !== newFileId) {
    await fetch(`${DIRECTUS_URL}/files/${oldId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => { /* best-effort cleanup */ });
  }

  cacheTemplateId(newFileId);
  await upsertSdkTemplateFile(newFileId);
  return newFileId;
}

/**
 * Get the Directus file ID of the current .docx template.
 * Searches for a file with the title marker '__docx_global_template__'.
 * Returns null if no template has been uploaded.
 */
export async function getDocxTemplateFileId(): Promise<string | null> {
  if (_docxCacheLoaded) return _cachedDocxFileId;

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
      `${DIRECTUS_URL}/files?filter[title][_eq]=${encodeURIComponent(DOCX_TEMPLATE_TITLE)}&limit=1&sort=-date_created&fields=id`,
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
