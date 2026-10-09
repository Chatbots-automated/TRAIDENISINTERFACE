// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db } from './database';
import { callWebhook } from './webhooksService';
import { buildDirectusAssetUrl, buildDirectusDownloadUrl } from './filePreviewUrls';

// Directus file operations go through the local Netlify proxy.
const DIRECTUS_URL = '/api/directus-admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DervaFile {
  id: number;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  directus_file_id: string | null;
  uploaded_by: string;
  uploaded_at: string;
  /** The file has been read and can be found by the resin recommendation */
  is_indexed: boolean;
  vectorization_status: string | null;
  vectorization_started_at: string | null;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

const DERVA_FILES_FIELDS = 'id,file_name,file_size,mime_type,directus_file_id,uploaded_by,uploaded_at,vectorization_status,vectorization_started_at';

// ---------------------------------------------------------------------------
// Upload file to Directus file storage → returns UUID
// ---------------------------------------------------------------------------

export const uploadFileToDirectus = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);

  const resp = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });

  if (!resp.ok) throw new Error(`Failo įkėlimas nepavyko: ${resp.status}`);
  const json = await resp.json();
  return json.data.id;
};

// ---------------------------------------------------------------------------
// Insert derva_files record
// ---------------------------------------------------------------------------

export const insertDervaFile = async (
  fileName: string,
  fileSize: number,
  mimeType: string,
  directusFileId: string,
  uploadedBy: string,
): Promise<DervaFile> => {
  const { data, error } = await db
    .from('derva_files')
    .insert({
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      directus_file_id: directusFileId,
      uploaded_by: uploadedBy,
    })
    .select(DERVA_FILES_FIELDS)
    .single();

  if (error) {
    console.error('Error inserting derva_file:', error);
    throw error;
  }
  return { ...data, is_indexed: false };
};

// ---------------------------------------------------------------------------
// Fetch all files
// ---------------------------------------------------------------------------

/** Ids of the files that have a vector, asked for as a filter so the vectors themselves stay on the server. */
const fetchIndexedIds = async (): Promise<Set<number>> => {
  const resp = await fetch('/api/directus/items/derva_files?fields=id&filter[embedding][_nnull]=true&limit=-1', {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Nepavyko patikrinti failų būsenos (${resp.status})`);
  const json = await resp.json();
  return new Set<number>((json.data || []).map((row: { id: number }) => row.id));
};

export const fetchDervaFiles = async (): Promise<DervaFile[]> => {
  const [{ data, error }, indexed] = await Promise.all([
    db
      .from('derva_files')
      .select(DERVA_FILES_FIELDS)
      .order('uploaded_at', { ascending: false })
      .limit(-1),
    fetchIndexedIds(),
  ]);

  if (error) {
    console.error('Error fetching derva_files:', error);
    throw error;
  }
  return (data || []).map((row: Omit<DervaFile, 'is_indexed'>) => ({ ...row, is_indexed: indexed.has(row.id) }));
};

// ---------------------------------------------------------------------------
// Delete record, then its Directus binary
// ---------------------------------------------------------------------------

export const deleteDervaFile = async (id: number, directusFileId: string | null): Promise<void> => {
  // 1. Delete the DB record
  const { error } = await db
    .from('derva_files')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting derva_file:', error);
    throw error;
  }

  // 2. Delete the binary from Directus file storage. The record is already gone, so a failure here only leaves an
  //    unused stored file behind; it is logged, not shown as a failed delete.
  if (directusFileId) {
    try {
      const resp = await fetch(`${DIRECTUS_URL}/files/${directusFileId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok && resp.status !== 404) {
        console.error('Directus file delete failed:', resp.status, resp.statusText);
      }
    } catch (err) {
      console.error('Directus file delete failed:', err);
    }
  }
};

// ---------------------------------------------------------------------------
// Vectorization status — atomic claim to prevent duplicate work
// ---------------------------------------------------------------------------

// A run that has not finished in this long is taken to have died (browser closed, connection lost, server
// restarted). Reading one file takes a minute or two.
export const VECTORIZATION_STALE_MS = 10 * 60 * 1000;

/** True while a started run can still be expected to finish. */
export const isVectorizationRunning = (file: Pick<DervaFile, 'vectorization_status' | 'vectorization_started_at'>): boolean => {
  if (file.vectorization_status !== 'processing') return false;
  if (!file.vectorization_started_at) return false; // marked before start times were recorded: nothing to wait for
  return Date.now() - new Date(file.vectorization_started_at).getTime() < VECTORIZATION_STALE_MS;
};

/**
 * Claim a file for vectorization. Fails only while another run is still
 * within its time; a stale "processing" mark is taken over. Returns true if the claim was acquired.
 */
export const claimFileForVectorization = async (id: number): Promise<boolean> => {
  // 1. Read current status
  const { data: file, error: readError } = await db
    .from('derva_files')
    .select('id,vectorization_status,vectorization_started_at')
    .eq('id', id)
    .single();

  if (readError || !file) {
    console.error('Error reading file for claim:', readError);
    throw readError || new Error('Failas nerastas');
  }

  // 2. Reject if already processing
  if (isVectorizationRunning(file)) return false;

  // 3. Set to processing
  const { error: updateError } = await db
    .from('derva_files')
    .update({ vectorization_status: 'processing', vectorization_started_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    console.error('Error claiming file for vectorization:', updateError);
    throw updateError;
  }
  return true;
};

export const updateVectorizationStatus = async (
  id: number,
  status: string | null,
): Promise<void> => {
  const { error } = await db
    .from('derva_files')
    .update({ vectorization_status: status })
    .eq('id', id);

  if (error) {
    console.error('Error updating vectorization status:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Trigger vectorization webhook
// ---------------------------------------------------------------------------

export const triggerVectorization = async (
  directusFileId: string,
  fileName: string,
  dervaFileId: number,
): Promise<boolean> => {
  await callWebhook('n8n_derva_vectorize', {
    directus_file_id: directusFileId,
    file_name: fileName,
    derva_file_id: dervaFileId,
  });
  return true;
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export const getFileViewUrl = (directusFileId: string): string => {
  return buildDirectusAssetUrl(directusFileId);
};

export const getFileDownloadUrl = (directusFileId: string): string => {
  return buildDirectusDownloadUrl(directusFileId);
};
