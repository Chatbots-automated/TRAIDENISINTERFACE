// Database: Directus API (see ./directus.ts). NOT Supabase.
// Tables used:
//   kainu_medziagas  – materials catalogue (id, pavadinimas, vienetas, sukurta_at)
//   kainu_istorija   – price history      (id, medziagas_id, data, kaina_min, kaina_max, pastabos, sukurta_at)

import { db } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KainuMedžiaga {
  id: number;
  pavadinimas: string;   // material name
  vienetas: string;      // unit, e.g. "Eur/kg"
  sukurta_at: string;    // ISO timestamp
}

export interface KainuIrašas {
  id: number;
  medziagas_id: number;
  data: string;           // YYYY-MM-DD
  kaina_min: number | null;
  kaina_max: number | null; // null = exact price (same as min), non-null = range
  pastabos: string | null;  // notes like "???"
  sukurta_at: string;
}

// A convenient shape returned from fetchLatestMaterialPrices for tool integration
export interface LatestMaterialPrice {
  pavadinimas: string;
  vienetas: string;
  data: string;
  kaina_min: number | null;
  kaina_max: number | null;
  pastabos: string | null;
}

// ---------------------------------------------------------------------------
// Materials CRUD
// ---------------------------------------------------------------------------

const MEDZIAGAS_FIELDS = 'id,pavadinimas,vienetas,sukurta_at';

export async function fetchMedziagas(): Promise<KainuMedžiaga[]> {
  const { data, error } = await db
    .from('kainu_medziagas')
    .select(MEDZIAGAS_FIELDS)
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function insertMedžiaga(
  pavadinimas: string,
  vienetas: string,
): Promise<KainuMedžiaga> {
  const { data, error } = await db
    .from('kainu_medziagas')
    .insert({ pavadinimas, vienetas })
    .select(MEDZIAGAS_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMedžiaga(
  id: number,
  pavadinimas: string,
  vienetas: string,
): Promise<void> {
  const { error } = await db
    .from('kainu_medziagas')
    .update({ pavadinimas, vienetas })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteMedžiaga(id: number): Promise<void> {
  // Delete all price entries first, then the material
  const { error: histError } = await db
    .from('kainu_istorija')
    .delete()
    .eq('medziagas_id', id);

  if (histError) throw histError;

  const { error } = await db
    .from('kainu_medziagas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Price history CRUD
// ---------------------------------------------------------------------------

const ISTORIJA_FIELDS = 'id,medziagas_id,data,kaina_min,kaina_max,pastabos,sukurta_at';

export async function fetchIstorija(): Promise<KainuIrašas[]> {
  const { data, error } = await db
    .from('kainu_istorija')
    .select(ISTORIJA_FIELDS)
    .order('data', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function insertIrašas(
  medziagas_id: number,
  data: string,
  kaina_min: number | null,
  kaina_max: number | null,
  pastabos: string | null,
): Promise<KainuIrašas> {
  const { data: row, error } = await db
    .from('kainu_istorija')
    .insert({ medziagas_id, data, kaina_min, kaina_max, pastabos })
    .select(ISTORIJA_FIELDS)
    .single();

  if (error) throw error;
  return row;
}

export async function updateIrašas(
  id: number,
  data: string,
  kaina_min: number | null,
  kaina_max: number | null,
  pastabos: string | null,
): Promise<void> {
  const { error } = await db
    .from('kainu_istorija')
    .update({ data, kaina_min, kaina_max, pastabos })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteIrašas(id: number): Promise<void> {
  const { error } = await db
    .from('kainu_istorija')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Analytics helper – used by toolExecutors to enrich get_prices webhook calls
// ---------------------------------------------------------------------------

/**
 * Returns the most recent price entry for every material.
 * Used to inject current market prices into the n8n kainos nustatymas webhook.
 */
export async function fetchLatestMaterialPrices(): Promise<LatestMaterialPrice[]> {
  try {
    const [medziagas, istorija] = await Promise.all([
      fetchMedziagas(),
      fetchIstorija(),
    ]);

    // Build a map: medziagas_id → latest entry (by date)
    const latestByMaterial = new Map<number, KainuIrašas>();
    for (const entry of istorija) {
      const existing = latestByMaterial.get(entry.medziagas_id);
      if (!existing || entry.data > existing.data) {
        latestByMaterial.set(entry.medziagas_id, entry);
      }
    }

    return medziagas
      .map(m => {
        const latest = latestByMaterial.get(m.id);
        if (!latest) return null;
        return {
          pavadinimas: m.pavadinimas,
          vienetas: m.vienetas,
          data: latest.data,
          kaina_min: latest.kaina_min,
          kaina_max: latest.kaina_max,
          pastabos: latest.pastabos,
        } satisfies LatestMaterialPrice;
      })
      .filter((x): x is LatestMaterialPrice => x !== null);
  } catch {
    // Non-fatal: if the table doesn't exist yet, return empty array
    return [];
  }
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format a price entry for display: "2.50" or "2.49–2.69" */
export function formatPrice(entry: Pick<KainuIrašas, 'kaina_min' | 'kaina_max' | 'pastabos'>): string {
  if (entry.pastabos && (entry.kaina_min === null && entry.kaina_max === null)) {
    return entry.pastabos;
  }
  if (entry.kaina_min === null) return entry.pastabos || '—';
  if (entry.kaina_max !== null && entry.kaina_max !== entry.kaina_min) {
    return `${entry.kaina_min.toFixed(2)}–${entry.kaina_max.toFixed(2)}`;
  }
  return entry.kaina_min.toFixed(2);
}
