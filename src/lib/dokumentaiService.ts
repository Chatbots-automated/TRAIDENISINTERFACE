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
const NESTANDARTINIAI_FIELDS = 'id,description,metadata,project_name,pateikimo_data,klientas,atsakymas,ai';

/** A single message in the atsakymas conversation thread */
export interface AtsakymasMessage {
  from?: string;
  date?: string;
  text: string;
  role?: 'recipient' | 'team';
}

export interface NestandartiniaiRecord {
  id: number;
  description: string | null;
  metadata: string | Record<string, string> | null;
  project_name: string | null;
  pateikimo_data: string | null;
  klientas: string | null;
  atsakymas: string | AtsakymasMessage[] | null;
  ai: string | null;
}

/**
 * Fetch records from n8n_vector_store table (only the columns we need)
 */
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

/**
 * Fetch a single record from n8n_vector_store by ID
 */
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

/**
 * Update the atsakymas (conversation) field for a record
 */
export const updateNestandartiniaiAtsakymas = async (
  id: number,
  messages: AtsakymasMessage[]
): Promise<void> => {
  const { error } = await db
    .from('n8n_vector_store')
    .update({ atsakymas: JSON.stringify(messages) })
    .eq('id', id);

  if (error) {
    console.error('Error updating atsakymas:', error);
    throw error;
  }
};
