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

export interface DervaRecord {
  id: number;
  content: string;
  file_id: string;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

const DERVA_FILES_FIELDS = 'id,file_name,file_size,mime_type,directus_file_id,uploaded_by,uploaded_at';
const DERVA_RECORD_FIELDS = 'id,content,file_id';

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
// Fetch derva embedding records (content only, no embedding vector)
// ---------------------------------------------------------------------------

export const fetchDervaRecords = async (): Promise<DervaRecord[]> => {
  try {
    const resp = await fetch(
      `${DIRECTUS_URL}/items/derva?fields=${DERVA_RECORD_FIELDS}&limit=10000&sort=-id`,
      {
        headers: {
          Authorization: `Bearer ${DIRECTUS_TOKEN}`,
          Accept: 'application/json',
        },
      }
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.data as DervaRecord[]) || [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Fetch file_ids that have at least one embedding in derva table
// ---------------------------------------------------------------------------

export const fetchVectorizedFileIds = async (): Promise<Set<string>> => {
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
    const ids = new Set<string>();
    for (const row of json.data || []) {
      if (row.file_id != null) ids.add(String(row.file_id));
    }
    return ids;
  } catch {
    return new Set();
  }
};

// ---------------------------------------------------------------------------
// Delete all derva records from Directus that reference a given file_id
// ---------------------------------------------------------------------------

const deleteDervaRecordsByFileId = async (fileId: string): Promise<void> => {
  // First, get all record IDs with this file_id
  const listResp = await fetch(
    `${DIRECTUS_URL}/items/derva?filter[file_id][_eq]=${fileId}&fields=id&limit=10000`,
    {
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        Accept: 'application/json',
      },
    }
  );
  if (!listResp.ok) return;
  const listJson = await listResp.json();
  const ids: number[] = (listJson.data || []).map((r: any) => r.id);
  if (ids.length === 0) return;

  // Batch-delete all records
  const resp = await fetch(`${DIRECTUS_URL}/items/derva`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ids),
  });
  if (!resp.ok && resp.status !== 404) {
    console.warn('Failed to delete derva records from Directus:', resp.status);
  }
};

// ---------------------------------------------------------------------------
// Delete a single derva record from Directus.
// If it was the last record for that file_id, also delete the Directus
// binary file and the derva_files DB row so nothing is orphaned.
// ---------------------------------------------------------------------------

export const deleteDervaRecord = async (recordId: number, fileId: string): Promise<void> => {
  // 1. Delete the record itself
  const resp = await fetch(`${DIRECTUS_URL}/items/derva/${recordId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Nepavyko ištrinti įrašo (${resp.status})`);
  }

  // 2. Check if any other records still reference this file_id
  const remaining = await fetch(
    `${DIRECTUS_URL}/items/derva?filter[file_id][_eq]=${fileId}&fields=id&limit=1`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, Accept: 'application/json' } }
  );
  if (!remaining.ok) return;
  const remainingJson = await remaining.json();
  if ((remainingJson.data || []).length > 0) return; // other records still exist

  // 3. No records left — clean up the file from Directus storage + DB
  const { data: fileRows } = await db
    .from('derva_files')
    .select('id,directus_file_id')
    .eq('directus_file_id', fileId)
    .limit(1);

  const fileRow = fileRows?.[0];
  if (fileRow?.directus_file_id) {
    await fetch(`${DIRECTUS_URL}/files/${fileRow.directus_file_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    });
  }

  if (fileRow) {
    await db.from('derva_files').delete().eq('id', fileRow.id);
  }
};

// ---------------------------------------------------------------------------
// Delete file + Directus file + associated derva records
// ---------------------------------------------------------------------------

export const deleteDervaFile = async (id: number, directusFileId: string | null): Promise<void> => {
  // 1. Delete all derva embedding records referencing this file (derva.file_id = directus UUID)
  if (directusFileId) await deleteDervaRecordsByFileId(directusFileId);

  // 2. Delete the binary from Directus file storage
  if (directusFileId) {
    const resp = await fetch(`${DIRECTUS_URL}/files/${directusFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    });
    if (!resp.ok && resp.status !== 404) {
      console.error('Directus file delete failed:', resp.status, resp.statusText);
      throw new Error(`Nepavyko ištrinti failo iš saugyklos (${resp.status})`);
    }
  }

  // 3. Delete the DB record
  const { error } = await db
    .from('derva_files')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting derva_file:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Trigger vectorization webhook
// ---------------------------------------------------------------------------

export const triggerVectorization = async (
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
      directus_file_id: directusFileId,
      file_name: fileName,
    }),
  });

  return resp.ok;
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export const getFileViewUrl = (directusFileId: string): string => {
  return `${DIRECTUS_URL}/assets/${directusFileId}?access_token=${DIRECTUS_TOKEN}`;
};

export const getFileDownloadUrl = (directusFileId: string): string => {
  return `${DIRECTUS_URL}/assets/${directusFileId}?access_token=${DIRECTUS_TOKEN}&download`;
};
