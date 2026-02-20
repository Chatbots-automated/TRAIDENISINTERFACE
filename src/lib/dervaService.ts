import { db } from './database';
import { getWebhookUrl } from './webhooksService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DervaFile {
  id: number;
  file_name: string;
  file_size: number | null;
  source_type: string;
  uploaded_by: string;
  uploaded_at: string;
  status: 'pending' | 'processing' | 'vectorized' | 'error';
  chunk_count: number;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const DERVA_FILES_FIELDS = 'id,file_name,file_size,source_type,uploaded_by,uploaded_at,status,chunk_count,error_message';

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
// Insert
// ---------------------------------------------------------------------------

export const insertDervaFile = async (
  fileName: string,
  fileSize: number,
  uploadedBy: string,
): Promise<DervaFile> => {
  const { data, error } = await db
    .from('derva_files')
    .insert({
      file_name: fileName,
      file_size: fileSize,
      uploaded_by: uploadedBy,
      status: 'pending',
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
// Delete
// ---------------------------------------------------------------------------

export const deleteDervaFile = async (id: number): Promise<void> => {
  // Delete chunks from derva table that reference this file
  // Directus filter on JSONB: metadata.file_id = id
  await db
    .from('derva')
    .delete()
    .eq('metadata->file_id', String(id));

  // Delete the file record itself
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
// Vectorize (send file to n8n webhook)
// ---------------------------------------------------------------------------

export const triggerVectorization = async (
  file: File,
  fileId: number,
  uploadedBy: string,
): Promise<boolean> => {
  const webhookUrl = await getWebhookUrl('n8n_derva_vectorize');
  if (!webhookUrl) {
    throw new Error('Webhook n8n_derva_vectorize nėra sukonfigūruotas. Patikrinkite Webhooks nustatymus.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('file_id', String(fileId));
  formData.append('file_name', file.name);
  formData.append('uploaded_by', uploadedBy);

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    body: formData,
  });

  return resp.ok;
};
