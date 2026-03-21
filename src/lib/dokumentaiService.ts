// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db } from './database';

/**
 * Fetch all records from standartiniai_projektai table
 */
export const fetchStandartiniaiProjektai = async (): Promise<any[]> => {
  try {
    const { data, error } = await db
      .from('standartiniai_projektai')
      .select('*')
      .order('id', { ascending: false });

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
  html_content: string;
  yaml_content: string;
  projekto_kodas: string;
  hnv: string;
  user_created?: string;
  user_updated?: string;
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
    user_updated?: string;
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

/** Columns we display for nestandartiniai */
const NESTANDARTINIAI_FIELDS = 'id,description,metadata,project_name,pateikimo_data,klientas,atsakymas,derva,tasks,files,ai_conversation,similar_projects,status,kaina';

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
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export const fetchNestandartiniaiDokumentai = async (): Promise<NestandartiniaiRecord[]> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select(NESTANDARTINIAI_FIELDS)
      .order('id', { ascending: false });

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

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

/**
 * Delete a nestandartiniai record and all its associated Directus files.
 * 1. Parse file UUIDs from the `files` column
 * 2. Delete each file from Directus storage
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

  // 2. Delete the DB row
  const { error } = await db
    .from('n8n_vector_store')
    .delete()
    .eq('id', record.id);

  if (error) {
    console.error('Error deleting n8n_vector_store record:', error);
    throw error;
  }
};
