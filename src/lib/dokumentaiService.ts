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

/** Columns we display for nestandartiniai */
const NESTANDARTINIAI_FIELDS = 'id,description,metadata,project_name,pateikimo_data,klientas,atsakymas,derva,tasks,files.id,files.directus_files_id.id,files.directus_files_id.filename_download,files.directus_files_id.filesize,files.directus_files_id.type,files.directus_files_id.uploaded_on,files.directus_files_id.filename_disk,ai_conversation,similar_projects';

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
  files: any;
  ai_conversation: AiConversationMessage[] | string | null;
  similar_projects: SimilarProject[] | string | null;
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
