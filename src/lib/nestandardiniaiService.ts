import { db } from './database';
import { appLogger } from './appLogger';

export interface VectorStoreProject {
  id: number;
  project_name: string;
  klientas: string;
  pateikimo_data: string;
  komercinis_id: string;
  uzklausos_path: string;
  komercinis_path: string;
}

const VECTOR_STORE_SELECT = 'id, project_name, klientas, pateikimo_data, komercinis_id, uzklausos_path, komercinis_path';

/**
 * Deduplicate by project_name, keeping the first (most recent) entry
 */
const deduplicateByProjectName = (rows: VectorStoreProject[]): VectorStoreProject[] => {
  const seen = new Map<string, VectorStoreProject>();
  for (const row of rows) {
    if (!seen.has(row.project_name)) {
      seen.set(row.project_name, row);
    }
  }
  return Array.from(seen.values());
};

/**
 * Fetch all projects from n8n_vector_store
 */
export const fetchProjects = async (): Promise<VectorStoreProject[]> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select(VECTOR_STORE_SELECT)
      .not('project_name', 'is', null)
      .order('pateikimo_data', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      await appLogger.logError({
        action: 'fetch_projects_error',
        error: error.message,
        metadata: { db_error: error }
      });
      throw error;
    }

    return deduplicateByProjectName(data || []);
  } catch (error: any) {
    console.error('Error in fetchProjects:', error);
    throw error;
  }
};

/**
 * Search projects by project_name
 */
export const searchProjects = async (query: string): Promise<VectorStoreProject[]> => {
  try {
    if (!query.trim()) {
      return await fetchProjects();
    }

    const { data, error } = await db
      .from('n8n_vector_store')
      .select(VECTOR_STORE_SELECT)
      .not('project_name', 'is', null)
      .ilike('project_name', `%${query}%`)
      .order('pateikimo_data', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error searching projects:', error);
      throw error;
    }

    return deduplicateByProjectName(data || []).slice(0, 20);
  } catch (error: any) {
    console.error('Error in searchProjects:', error);
    throw error;
  }
};

/**
 * Get a single project by id
 */
export const getProjectById = async (projectId: number): Promise<VectorStoreProject | null> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select(VECTOR_STORE_SELECT)
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      throw error;
    }

    return data || null;
  } catch (error: any) {
    console.error('Error in getProjectById:', error);
    throw error;
  }
};
