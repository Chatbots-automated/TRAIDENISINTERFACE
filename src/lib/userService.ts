import { supabase } from './supabase';

export interface AppUserData {
  id: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  created_at: string;
  phone?: string;
  kodas?: string;
  full_name?: string;
  role?: string;
}

/**
 * Get all users from the database
 */
export const getAllUsersData = async (): Promise<AppUserData[]> => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, display_name, is_admin, created_at, phone, kodas, full_name, role')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[UserService] Error getting all users:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[UserService] Exception in getAllUsersData:', error);
    return [];
  }
};

/**
 * Get only users with role = 'ekonomistas' (case insensitive)
 */
export const getEconomists = async (): Promise<AppUserData[]> => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, display_name, is_admin, created_at, phone, kodas, full_name, role')
      .ilike('role', 'ekonomistas')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[UserService] Error getting economists:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[UserService] Exception in getEconomists:', error);
    return [];
  }
};

/**
 * Get only users with role = 'vadybininkas' (case insensitive)
 */
export const getManagers = async (): Promise<AppUserData[]> => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, display_name, is_admin, created_at, phone, kodas, full_name, role')
      .ilike('role', 'vadybininkas')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[UserService] Error getting managers:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[UserService] Exception in getManagers:', error);
    return [];
  }
};

/**
 * Get current user's complete data by ID
 */
export const getCurrentUserData = (userId: string, users: AppUserData[]): AppUserData | null => {
  return users.find(u => u.id === userId) || null;
};

/**
 * Get user by kodas
 */
export const getUserByKodas = (kodas: string, users: AppUserData[]): AppUserData | null => {
  return users.find(u => u.kodas === kodas) || null;
};
