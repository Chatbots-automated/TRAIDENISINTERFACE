// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db } from './database';

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

/**
 * Fetch all records from standartiniai_projektai table
 */
export const fetchStandartiniaiProjektai = async (): Promise<any[]> => {
  try {
    const { data, error } = await db
      .from('standartiniai_projektai')
      .select('*')
      .order('id', { ascending: false })
      .limit(-1);

    if (error) {
      console.error('Error fetching standartiniai_projektai:', error);
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in fetchStandartiniaiProjektai:', error);
    throw error;
  }
};

/**
 * Create a new standartiniai_projektai record (first-time save for a conversation).
 * Returns the created record including its `id`.
 */
export const createStandartinisProjektas = async (record: {
  conversation_id: string;
  html_content?: string;
  yaml_content: string;
  projekto_kodas: string;
  hnv: string;
  docx_file_id?: string;
}): Promise<any> => {
  try {
    const { data, error } = await db
      .from('standartiniai_projektai')
      .insert([record])
      .select()
      .single();

    if (error) {
      console.error('Error creating standartiniai_projektai:', error);
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error in createStandartinisProjektas:', error);
    throw error;
  }
};

/**
 * Update an existing standartiniai_projektai record by its id.
 */
export const updateStandartinisProjektas = async (
  recordId: number,
  fields: {
    html_content?: string;
    yaml_content?: string;
    projekto_kodas?: string;
    hnv?: string;
    docx_file_id?: string;
  }
): Promise<any> => {
  try {
    const { data, error } = await db
      .from('standartiniai_projektai')
      .update(fields)
      .eq('id', recordId)
      .select()
      .single();

    if (error) {
      console.error('Error updating standartiniai_projektai:', error);
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error in updateStandartinisProjektas:', error);
    throw error;
  }
};

/**
 * Fetch the standartiniai_projektai record linked to a conversation.
 * Returns null if no record exists yet.
 */
export const getStandartinisByConversationId = async (
  conversationId: string
): Promise<any | null> => {
  try {
    const { data, error } = await db
      .from('standartiniai_projektai')
      .select('*')
      .eq('conversation_id', conversationId)
      .limit(1)
      .single();

    if (error) {
      // Directus .single() returns code 'NOT_FOUND' / message 'Item not found' when 0 rows
      if (error.code === 'NOT_FOUND' || error.message?.includes('not found')) {
        return null;
      }
      console.error('Error fetching standartiniai_projektai by conversation_id:', error);
      throw error;
    }

    return data;
  } catch (error: any) {
    if (error?.code === 'NOT_FOUND' || error?.message?.includes('not found')) {
      return null;
    }
    console.error('Error in getStandartinisByConversationId:', error);
    throw error;
  }
};

/**
 * Delete a standartiniai_projektai record and its associated Directus .docx file.
 */
export const deleteStandartinisProjektas = async (record: { id: number; docx_file_id?: string | null }): Promise<void> => {
  // 1. Delete associated .docx file from Directus storage
  if (record.docx_file_id) {
    try {
      await fetch(`${DIRECTUS_URL}/files/${record.docx_file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      });
    } catch (err) {
      console.warn(`Failed to delete Directus file ${record.docx_file_id}:`, err);
    }
  }

  // 2. Delete the DB row
  const { error } = await db
    .from('standartiniai_projektai')
    .delete()
    .eq('id', record.id);

  if (error) {
    console.error('Error deleting standartiniai_projektai record:', error);
    throw error;
  }
};

/** Columns we display for nestandartiniai */
const NESTANDARTINIAI_FIELDS = 'id,description,metadata,project_name,pateikimo_data,klientas,atsakymas,derva,tasks,files,ai_conversation,similar_projects,status,kaina,talpos';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single message in the atsakymas conversation thread */
export interface AtsakymasMessage {
  from?: string;
  date?: string;
  text: string;
  role?: 'recipient' | 'team';
}

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
  due_date?: string | null;
  assigned_to?: string | null;
  priority?: 'high' | 'medium' | 'low';
}

export interface AiConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface SimilarProject {
  id: number;
  project_name: string;
  similarity_score: number;
  kaina?: number | null;
  metadata?: string | Record<string, any> | null;
}

export interface NestandartiniaiRecord {
  id: number;
  description: string | null;
  metadata: string | Record<string, string> | null;
  project_name: string | null;
  pateikimo_data: string | null;
  klientas: string | null;
  atsakymas: string | AtsakymasMessage[] | null;
  derva: string | null;
  tasks: TaskItem[] | string | null;
  files: string | null;
  ai_conversation: AiConversationMessage[] | string | null;
  similar_projects: SimilarProject[] | string | null;
  status: boolean | null;
  kaina: number | string | null;
  talpos?: string | null;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export const fetchNestandartiniaiDokumentai = async (): Promise<NestandartiniaiRecord[]> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select(NESTANDARTINIAI_FIELDS)
      .order('id', { ascending: false })
      .limit(-1);

    if (error) {
      console.error('Error fetching n8n_vector_store:', error);
      throw error;
    }

    return (data as NestandartiniaiRecord[] | null) || [];
  } catch (error: any) {
    console.error('Error in fetchNestandartiniaiDokumentai:', error);
    throw error;
  }
};

export const fetchNestandartiniaiKainaByIds = async (ids: number[]): Promise<Pick<NestandartiniaiRecord, 'id' | 'kaina' | 'metadata' | 'description' | 'derva' | 'klientas' | 'tasks'>[]> => {
  if (ids.length === 0) return [];
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select('id,kaina,metadata,description,derva,klientas,tasks')
      .in('id', ids);
    if (error) throw error;
    return (data ?? []) as Pick<NestandartiniaiRecord, 'id' | 'kaina' | 'metadata' | 'description' | 'derva' | 'klientas' | 'tasks'>[];
  } catch (error: any) {
    console.error('Error in fetchNestandartiniaiKainaByIds:', error);
    return [];
  }
};

export const fetchNestandartiniaiById = async (id: number): Promise<NestandartiniaiRecord | null> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select(NESTANDARTINIAI_FIELDS)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching n8n_vector_store record:', error);
      throw error;
    }

    return (data as NestandartiniaiRecord | null) || null;
  } catch (error: any) {
    console.error('Error in fetchNestandartiniaiById:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Update helpers
// ---------------------------------------------------------------------------

/** Generic field update for a single record */
export const updateNestandartiniaiField = async (
  id: number,
  field: string,
  value: any
): Promise<void> => {
  const { error } = await db
    .from('n8n_vector_store')
    .update({ [field]: value })
    .eq('id', id);

  if (error) {
    console.error(`Error updating ${field}:`, error);
    throw error;
  }
};

export const updateNestandartiniaiAtsakymas = async (
  id: number,
  messages: AtsakymasMessage[]
): Promise<void> => {
  await updateNestandartiniaiField(id, 'atsakymas', messages);
};

export const updateNestandartiniaiTasks = async (
  id: number,
  tasks: TaskItem[]
): Promise<void> => {
  await updateNestandartiniaiField(id, 'tasks', tasks);
};

export const updateNestandartiniaiAiConversation = async (
  id: number,
  messages: AiConversationMessage[]
): Promise<void> => {
  await updateNestandartiniaiField(id, 'ai_conversation', messages);
};

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a nestandartiniai record, its associated Directus files, and linked talpos rows.
 * 1. Parse file UUIDs from the `files` column and delete from Directus storage
 * 2. Delete linked talpos rows (UUIDs from the `talpos` column)
 * 3. Delete the DB row from n8n_vector_store
 */
export const deleteNestandartiniaiRecord = async (
  record: NestandartiniaiRecord
): Promise<void> => {
  // 1. Delete associated files from Directus storage
  if (record.files && typeof record.files === 'string') {
    const fileIds = record.files.split(',').map(s => s.trim()).filter(s => s.length >= 32);
    for (const fileId of fileIds) {
      try {
        await fetch(`${DIRECTUS_URL}/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
        });
      } catch (err) {
        console.warn(`Failed to delete Directus file ${fileId}:`, err);
      }
    }
  }

  // 2. Delete linked talpos rows
  const talposField = (record as any).talpos;
  if (talposField && typeof talposField === 'string') {
    const talposIds = talposField.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (talposIds.length > 0) {
      try {
        const res = await fetch(`${DIRECTUS_URL}/items/talpos`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(talposIds),
        });
        if (!res.ok) console.warn('Error deleting talpos rows:', await res.text());
      } catch (err) {
        console.warn('Error deleting talpos rows:', err);
      }
    }
  }

  // 3. Delete the DB row
  const { error } = await db
    .from('n8n_vector_store')
    .delete()
    .eq('id', record.id);

  if (error) {
    console.error('Error deleting n8n_vector_store record:', error);
    throw error;
  }
};

/**
 * Fetch all records from talpos table
 */
export const fetchTalpos = async (): Promise<any[]> => {
  try {
    const { data, error } = await db
      .from('talpos')
      .select('*')
      .order('id', { ascending: false })
      .limit(-1);

    if (error) {
      console.error('Error fetching talpos:', error);
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in fetchTalpos:', error);
    throw error;
  }
};

/**
 * Fetch specific talpos rows by their UUIDs
 */
export const fetchTalposByIds = async (ids: string[]): Promise<any[]> => {
  if (ids.length === 0) return [];
  try {
    const { data, error } = await db
      .from('talpos')
      .select('*')
      .in('id', ids);
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error in fetchTalposByIds:', error);
    return [];
  }
};

/**
 * Given a list of talpos UUIDs, return a map of { talposUUID → n8n_vector_store integer id }
 * by querying n8n_vector_store rows whose `talpos` column contains each UUID.
 */
export const fetchProjectIdsByTalposIds = async (talposIds: string[]): Promise<Record<string, number>> => {
  if (talposIds.length === 0) return {};
  try {
    // Fetch in parallel — one ilike query per UUID (max 5 for similar results)
    const results = await Promise.all(
      talposIds.map(uuid =>
        db
          .from('n8n_vector_store')
          .select('id,talpos')
          .ilike('talpos', `%${uuid}%`)
          .limit(1)
          .then(({ data }) => ({ uuid, projectId: data?.[0]?.id ?? null }))
      )
    );
    const map: Record<string, number> = {};
    for (const { uuid, projectId } of results) {
      if (projectId != null) map[uuid] = projectId;
    }
    return map;
  } catch (error: any) {
    console.error('Error in fetchProjectIdsByTalposIds:', error);
    return {};
  }
};

/**
 * Update a single field on a talpos row
 */
export const updateTalposField = async (id: string, field: string, value: any): Promise<void> => {
  try {
    const { error } = await db
      .from('talpos')
      .update({ [field]: value })
      .eq('id', id);
    if (error) throw error;
  } catch (error: any) {
    console.error('Error in updateTalposField:', error);
    throw error;
  }
};

/**
 * Create a new talpos row. Returns the created row (including its generated UUID).
 */
export const createTalpa = async (data: Record<string, any>): Promise<any> => {
  try {
    const { data: result, error } = await db
      .from('talpos')
      .insert([data])
      .select()
      .single();
    if (error) throw error;
    return result;
  } catch (error: any) {
    console.error('Error in createTalpa:', error);
    throw error;
  }
};

/**
 * Hard-delete a single talpos row by its UUID.
 */
export const deleteTalpa = async (id: string): Promise<void> => {
  try {
    const { error } = await db
      .from('talpos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (error: any) {
    console.error('Error in deleteTalpa:', error);
    throw error;
  }
};
