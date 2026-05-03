// Database: Directus API (see ./database.ts). NOT Supabase.
// Table: medziagu_sablonai — material slate templates (plain text)

import { db } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MedziaguSablonas {
  id: number;
  name: string;
  raw_text: string;
  structured_json: Record<string, any> | null;
  date_created: string;
  date_updated: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

const FIELDS = 'id,name,raw_text,structured_json,date_created,date_updated';

export async function fetchSablonai(): Promise<MedziaguSablonas[]> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .select(FIELDS)
    .order('date_updated', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function fetchSablonasById(id: number): Promise<MedziaguSablonas | null> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .select(FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.message?.includes('not found')) return null;
    throw error;
  }
  return data;
}

export async function createSablonas(record: {
  name: string;
  raw_text: string;
  structured_json?: Record<string, any> | null;
}): Promise<MedziaguSablonas> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .insert([record])
    .select(FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateSablonas(
  id: number,
  fields: Partial<Pick<MedziaguSablonas, 'name' | 'raw_text' | 'structured_json'>>,
): Promise<MedziaguSablonas> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .update(fields)
    .eq('id', id)
    .select(FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSablonas(id: number): Promise<void> {
  const { error } = await db
    .from('medziagu_sablonai')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
