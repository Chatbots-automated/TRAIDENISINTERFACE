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
 * Fetch all records from n8n_vector_store table
 */
export const fetchNestandartiniaiDokumentai = async (): Promise<any[]> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error fetching n8n_vector_store:', error);
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in fetchNestandartiniaiDokumentai:', error);
    throw error;
  }
};
