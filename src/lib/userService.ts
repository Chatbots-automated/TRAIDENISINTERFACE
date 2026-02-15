import { db } from './database';

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
    const { data, error } = await db
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
    const { data, error } = await db
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
 * Get managers from the vadybininkai table
 */
export const getManagers = async (): Promise<AppUserData[]> => {
  try {
    const { data, error } = await db
      .from('vadybininkai')
      .select('id, created_at, kodas, full_name, role')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[UserService] Error getting managers:', error);
      throw error;
    }

    // Map vadybininkai fields to AppUserData shape for compatibility
    return (data || []).map(v => ({
      id: v.id,
      email: '',
      is_admin: false,
      created_at: v.created_at,
      kodas: v.kodas || undefined,
      full_name: v.full_name || undefined,
      role: v.role || undefined,
    }));
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

/**
 * Get users that can be shared with (excludes only self)
 */
export const getShareableUsers = async (excludeUserId: string): Promise<AppUserData[]> => {
  try {
    const { data, error } = await db
      .from('app_users')
      .select('id, email, display_name, is_admin, created_at, phone, kodas, full_name, role')
      .neq('id', excludeUserId)
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[UserService] Error getting shareable users:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[UserService] Exception in getShareableUsers:', error);
    return [];
  }
};
