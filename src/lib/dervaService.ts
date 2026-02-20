import { db } from './database';
import { getWebhookUrl } from './webhooksService';

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

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
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

const DERVA_FILES_FIELDS = 'id,file_name,file_size,mime_type,directus_file_id,uploaded_by,uploaded_at';

// ---------------------------------------------------------------------------
// Upload file to Directus file storage → returns UUID
// ---------------------------------------------------------------------------

export const uploadFileToDirectus = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);

  const resp = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
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
  return data;
};

// ---------------------------------------------------------------------------
// Fetch all files
// ---------------------------------------------------------------------------

export const fetchDervaFiles = async (): Promise<DervaFile[]> => {
  const { data, error } = await db
    .from('derva_files')
    .select(DERVA_FILES_FIELDS)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Error fetching derva_files:', error);
    throw error;
  }
  return data || [];
};

// ---------------------------------------------------------------------------
// Fetch file_ids that have at least one embedding in derva table
// ---------------------------------------------------------------------------

export const fetchVectorizedFileIds = async (): Promise<Set<number>> => {
  try {
    const resp = await fetch(
      `${DIRECTUS_URL}/items/derva?fields=file_id&limit=10000`,
      {
        headers: {
          Authorization: `Bearer ${DIRECTUS_TOKEN}`,
          Accept: 'application/json',
        },
      }
    );
    if (!resp.ok) return new Set();
    const json = await resp.json();
    const ids = new Set<number>();
    for (const row of json.data || []) {
      if (row.file_id != null) ids.add(Number(row.file_id));
    }
    return ids;
  } catch {
    return new Set();
  }
};

// ---------------------------------------------------------------------------
// Delete file + Directus file (cascade deletes derva embeddings via FK)
// ---------------------------------------------------------------------------

export const deleteDervaFile = async (id: number, directusFileId: string | null): Promise<void> => {
  // Delete the DB record (ON DELETE CASCADE handles derva rows)
  const { error } = await db
    .from('derva_files')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting derva_file:', error);
    throw error;
  }

  // Also remove the binary from Directus file storage
  if (directusFileId) {
    try {
      await fetch(`${DIRECTUS_URL}/files/${directusFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      });
    } catch (err) {
      console.warn('Failed to delete Directus file (non-critical):', err);
    }
  }
};

// ---------------------------------------------------------------------------
// Trigger vectorization webhook
// ---------------------------------------------------------------------------

export const triggerVectorization = async (
  fileId: number,
  directusFileId: string,
  fileName: string,
): Promise<boolean> => {
  const webhookUrl = await getWebhookUrl('n8n_derva_vectorize');
  if (!webhookUrl) {
    throw new Error('Webhook n8n_derva_vectorize nėra sukonfigūruotas. Patikrinkite Webhooks nustatymus.');
  }

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      directus_file_id: directusFileId,
      file_url: `${DIRECTUS_URL}/assets/${directusFileId}`,
      file_name: fileName,
    }),
  });

  return resp.ok;
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export const getFileViewUrl = (directusFileId: string): string => {
  return `${DIRECTUS_URL}/assets/${directusFileId}`;
};

export const getFileDownloadUrl = (directusFileId: string): string => {
  return `${DIRECTUS_URL}/assets/${directusFileId}?download`;
};
