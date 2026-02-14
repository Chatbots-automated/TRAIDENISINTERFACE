import { db } from './database';
import { appLogger } from './appLogger';

export interface NestandardinisProject {
  id: string;
  subject_line: string;
  created_at: string;
  updated_at: string;
  project_metadata?: Record<string, any>;
}

interface VectorStoreRow {
  id: number;
  komercinis_id: string;
  project_name: string;
  klientas: string;
  pateikimo_data: string;
  uzklausos_path: string;
  komercinis_path: string;
}

/**
 * Map n8n_vector_store row to NestandardinisProject interface
 */
const mapToProject = (row: VectorStoreRow): NestandardinisProject => ({
  id: row.komercinis_id || String(row.id),
  subject_line: row.project_name,
  created_at: row.pateikimo_data || '',
  updated_at: row.pateikimo_data || '',
  project_metadata: {
    klientas: row.klientas,
    uzklausos_path: row.uzklausos_path,
    komercinis_path: row.komercinis_path,
    pateikimo_data: row.pateikimo_data
  }
});

/**
 * Deduplicate by project_name, keeping the most recent entry
 */
const deduplicateByProjectName = (projects: NestandardinisProject[]): NestandardinisProject[] => {
  const seen = new Map<string, NestandardinisProject>();
  for (const project of projects) {
    if (!seen.has(project.subject_line)) {
      seen.set(project.subject_line, project);
    }
  }
  return Array.from(seen.values());
};

/**
 * Fetch all nestandartiniai projects from n8n_vector_store
 */
export const fetchNestandardiniaiProjects = async (): Promise<NestandardinisProject[]> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select('id, komercinis_id, project_name, klientas, pateikimo_data, uzklausos_path, komercinis_path')
      .not('project_name', 'is', null)
      .order('pateikimo_data', { ascending: false });

    if (error) {
      console.error('Error fetching nestandartiniai projects:', error);
      await appLogger.logError({
        action: 'fetch_nestandartiniai_projects_error',
        error: error.message,
        metadata: { db_error: error }
      });
      throw error;
    }

    const mapped = (data || []).map(mapToProject);
    return deduplicateByProjectName(mapped);
  } catch (error: any) {
    console.error('Error in fetchNestandardiniaiProjects:', error);
    throw error;
  }
};

/**
 * Search projects by project_name (for autocomplete/search)
 */
export const searchProjectsBySubjectLine = async (query: string): Promise<NestandardinisProject[]> => {
  try {
    if (!query.trim()) {
      return await fetchNestandardiniaiProjects();
    }

    const { data, error } = await db
      .from('n8n_vector_store')
      .select('id, komercinis_id, project_name, klientas, pateikimo_data, uzklausos_path, komercinis_path')
      .not('project_name', 'is', null)
      .ilike('project_name', `%${query}%`)
      .order('pateikimo_data', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error searching projects:', error);
      throw error;
    }

    const mapped = (data || []).map(mapToProject);
    return deduplicateByProjectName(mapped).slice(0, 20);
  } catch (error: any) {
    console.error('Error in searchProjectsBySubjectLine:', error);
    throw error;
  }
};

/**
 * Get a single project by komercinis_id
 */
export const getProjectById = async (projectId: string): Promise<NestandardinisProject | null> => {
  try {
    const { data, error } = await db
      .from('n8n_vector_store')
      .select('id, komercinis_id, project_name, klientas, pateikimo_data, uzklausos_path, komercinis_path')
      .eq('komercinis_id', projectId)
      .limit(1);

    if (error) {
      console.error('Error fetching project:', error);
      throw error;
    }

    if (!data || data.length === 0) return null;
    return mapToProject(data[0]);
  } catch (error: any) {
    console.error('Error in getProjectById:', error);
    throw error;
  }
};
