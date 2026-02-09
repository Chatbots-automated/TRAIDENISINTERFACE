import { supabase } from './database';
import { appLogger } from './appLogger';

export interface NestandardinisProject {
  id: string;
  subject_line: string;
  created_at: string;
  updated_at: string;
  project_metadata?: Record<string, any>;
}

/**
 * Fetch all nestandartiniai projects from Supabase
 * Projects are stored with their subject lines from emails
 */
export const fetchNestandardiniaiProjects = async (): Promise<NestandardinisProject[]> => {
  try {
    const { data, error } = await supabase
      .from('nestandartiniai_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching nestandartiniai projects:', error);
      await appLogger.logError({
        action: 'fetch_nestandartiniai_projects_error',
        error: error.message,
        metadata: { supabase_error: error }
      });
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in fetchNestandardiniaiProjects:', error);
    throw error;
  }
};

/**
 * Search projects by subject line (for autocomplete/search)
 */
export const searchProjectsBySubjectLine = async (query: string): Promise<NestandardinisProject[]> => {
  try {
    if (!query.trim()) {
      return await fetchNestandardiniaiProjects();
    }

    const { data, error } = await supabase
      .from('nestandartiniai_projects')
      .select('*')
      .ilike('subject_line', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error searching projects:', error);
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in searchProjectsBySubjectLine:', error);
    throw error;
  }
};

/**
 * Get a single project by ID
 */
export const getProjectById = async (projectId: string): Promise<NestandardinisProject | null> => {
  try {
    const { data, error } = await supabase
      .from('nestandartiniai_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error in getProjectById:', error);
    throw error;
  }
};
