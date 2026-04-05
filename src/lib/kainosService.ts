// Database: Directus API (see ./directus.ts). NOT Supabase.
// Tables used:
//   medziagos                    – materials catalogue (artikulas PK, pavadinimas, vienetas, sukurta_at)
//   medziagos_kainu_istorija     – price history       (id PK auto, artikulas, data, kaina_min, kaina_max, pastabos, sukurta_at)
//   medziagos_prognoze_internetas – AI web analysis    (artikulas PK, content, geoevents, atnaujinta)
//   medziagos_kainu_prognozes    – AI price predictions (id PK auto, artikulas, data, kaina_min, kaina_max, pasitikejimas, sukurta_at)

import { db } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Medžiaga {
  artikulas: string;     // PK – user-entered code from external ERP
  pavadinimas: string;   // material name
  vienetas: string;      // unit, e.g. "Eur/kg"
  sukurta_at: string;    // ISO timestamp
}

export interface KainuIrašas {
  id: number;
  artikulas: string;      // FK → medziagos.artikulas
  data: string;           // YYYY-MM-DD
  kaina_min: number | null;
  kaina_max: number | null;
  pastabos: string | null;
  sukurta_at: string;
}

export interface KainuPrognozė {
  id: number;
  artikulas: string;        // FK → medziagos.artikulas
  data: string;             // predicted-for date YYYY-MM-DD
  kaina_min: number | null;
  kaina_max: number | null;
  pasitikejimas: number;    // 0.0–1.0 confidence
  sukurta_at: string;
}

export interface PrognozėInternetas {
  artikulas: string;   // PK – one row per material (Option A – overwrite)
  content: string;     // markdown analysis
  geoevents: string;   // geopolitical events
  atnaujinta: string;  // ISO timestamp
}

// Returned from fetchLatestMaterialPrices for tool/webhook integration
export interface LatestMaterialPrice {
  artikulas: string;
  pavadinimas: string;
  vienetas: string;
  kainos: { data: string; kaina_min: number | null; kaina_max: number | null; pastabos: string | null }[];
  prognoze?: { data: string; kaina_min: number | null; kaina_max: number | null; pasitikejimas: number };
}

// ---------------------------------------------------------------------------
// Materials CRUD
// ---------------------------------------------------------------------------

const MEDZIAGAS_FIELDS = 'artikulas,pavadinimas,vienetas,sukurta_at';

export async function fetchMedziagas(): Promise<Medžiaga[]> {
  const { data, error } = await db
    .from('medziagos')
    .select(MEDZIAGAS_FIELDS)
    .order('pavadinimas', { ascending: true })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function insertMedžiaga(
  artikulas: string,
  pavadinimas: string,
  vienetas: string,
): Promise<Medžiaga> {
  const { data, error } = await db
    .from('medziagos')
    .insert({ artikulas, pavadinimas, vienetas })
    .select(MEDZIAGAS_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMedžiaga(
  artikulas: string,
  pavadinimas: string,
  vienetas: string,
): Promise<void> {
  const { error } = await db
    .from('medziagos')
    .update({ pavadinimas, vienetas })
    .eq('artikulas', artikulas);

  if (error) throw error;
}

export async function deleteMedžiaga(artikulas: string): Promise<void> {
  // Delete price history, predictions, web analysis first
  const [h, p, w] = await Promise.allSettled([
    db.from('medziagos_kainu_istorija').delete().eq('artikulas', artikulas),
    db.from('medziagos_kainu_prognozes').delete().eq('artikulas', artikulas),
    db.from('medziagos_prognoze_internetas').delete().eq('artikulas', artikulas),
  ]);
  for (const r of [h, p, w]) {
    if (r.status === 'rejected') console.warn('Cascade delete warning:', r.reason);
  }

  const { error } = await db
    .from('medziagos')
    .delete()
    .eq('artikulas', artikulas);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Price history CRUD
// ---------------------------------------------------------------------------

const ISTORIJA_FIELDS = 'id,artikulas,data,kaina_min,kaina_max,pastabos,sukurta_at';

export async function fetchIstorija(): Promise<KainuIrašas[]> {
  const { data, error } = await db
    .from('medziagos_kainu_istorija')
    .select(ISTORIJA_FIELDS)
    .order('data', { ascending: true })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function insertIrašas(
  artikulas: string,
  data: string,
  kaina_min: number | null,
  kaina_max: number | null,
  pastabos: string | null,
): Promise<KainuIrašas> {
  const { data: row, error } = await db
    .from('medziagos_kainu_istorija')
    .insert({ artikulas, data, kaina_min, kaina_max, pastabos })
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
    .from('medziagos_kainu_istorija')
    .update({ data, kaina_min, kaina_max, pastabos })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteIrašas(id: number): Promise<void> {
  const { error } = await db
    .from('medziagos_kainu_istorija')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Bulk insert for Excel import — skips duplicates
export async function bulkInsertIstorija(
  rows: { artikulas: string; data: string; kaina_min: number | null; kaina_max: number | null; pastabos: string | null }[],
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    try {
      await db
        .from('medziagos_kainu_istorija')
        .insert(row)
        .select('id')
        .single();
      inserted++;
    } catch {
      // Skip duplicates / errors silently (log to console)
      console.warn('[bulkInsertIstorija] Skipped row:', row.artikulas, row.data);
    }
  }
  return inserted;
}

// Bulk insert materials — skips if artikulas already exists
export async function bulkInsertMedziagas(
  rows: { artikulas: string; pavadinimas: string; vienetas: string }[],
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    try {
      await db
        .from('medziagos')
        .insert(row)
        .select('artikulas')
        .single();
      inserted++;
    } catch {
      // Already exists — skip
      console.warn('[bulkInsertMedziagas] Skipped existing:', row.artikulas);
    }
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// AI predictions CRUD  (table: medziagos_kainu_prognozes)
// ---------------------------------------------------------------------------

const PROGNOZE_FIELDS = 'id,artikulas,data,kaina_min,kaina_max,pasitikejimas,sukurta_at';

export async function fetchPrognozes(): Promise<KainuPrognozė[]> {
  const { data, error } = await db
    .from('medziagos_kainu_prognozes')
    .select(PROGNOZE_FIELDS)
    .order('sukurta_at', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

/** Delete old predictions and save fresh ones (full replace per generation). */
export async function replacePrognozes(
  rows: { artikulas: string; data: string; kaina_min: number | null; kaina_max: number | null; pasitikejimas: number }[],
): Promise<void> {
  // Delete all existing predictions
  await db.from('medziagos_kainu_prognozes').delete().neq('id', 0); // delete all
  // Insert fresh
  for (const row of rows) {
    await db
      .from('medziagos_kainu_prognozes')
      .insert(row);
  }
}

// ---------------------------------------------------------------------------
// Web analysis storage  (table: medziagos_prognoze_internetas)
// Option A: one row per material, overwrite on each generation
// ---------------------------------------------------------------------------

const INTERNETAS_FIELDS = 'artikulas,content,geoevents,atnaujinta';

/** Fetch all web analysis rows (one per material that has been analysed). */
export async function fetchPrognozėInternetas(): Promise<PrognozėInternetas[]> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('atnaujinta', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

/** Fetch the most recently updated web analysis row (for "last updated" display). */
export async function fetchLatestPrognozėInternetas(): Promise<PrognozėInternetas | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('atnaujinta', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

/** Upsert web analysis for a material (overwrites existing row). */
export async function upsertPrognozėInternetas(
  artikulas: string,
  content: string,
  geoevents: string,
): Promise<void> {
  // Try update first, then insert if not found
  const { data: existing } = await db
    .from('medziagos_prognoze_internetas')
    .select('artikulas')
    .eq('artikulas', artikulas)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await db
      .from('medziagos_prognoze_internetas')
      .update({ content, geoevents, atnaujinta: new Date().toISOString() })
      .eq('artikulas', artikulas);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('medziagos_prognoze_internetas')
      .insert({ artikulas, content, geoevents, atnaujinta: new Date().toISOString() });
    if (error) throw error;
  }
}

/** Save a single general analysis row (artikulas = '__general__'). */
export async function saveGeneralAnalysis(
  content: string,
  geoevents: string,
): Promise<void> {
  await upsertPrognozėInternetas('__general__', content, geoevents);
}

/** Fetch the general analysis row. */
export async function fetchGeneralAnalysis(): Promise<PrognozėInternetas | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .eq('artikulas', '__general__')
    .limit(1);

  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

// ---------------------------------------------------------------------------
// Analytics helper – enriched material prices for PaklausimasModal
// ---------------------------------------------------------------------------

/**
 * Returns every material with its 3 most recent historical prices
 * and optionally the latest AI prediction. The LLM in n8n uses
 * the price history to understand trends and pick relevant materials.
 */
export async function fetchLatestMaterialPrices(): Promise<LatestMaterialPrice[]> {
  try {
    const [medziagas, istorija, prognozes] = await Promise.all([
      fetchMedziagas(),
      fetchIstorija(),
      fetchPrognozes(),
    ]);

    // Build map: artikulas → all entries sorted newest first
    const histByArt = new Map<string, KainuIrašas[]>();
    for (const e of istorija) {
      const arr = histByArt.get(e.artikulas) || [];
      arr.push(e);
      histByArt.set(e.artikulas, arr);
    }
    // Sort each array newest first and keep top 3
    for (const [art, arr] of histByArt) {
      arr.sort((a, b) => b.data.localeCompare(a.data));
      histByArt.set(art, arr.slice(0, 3));
    }

    // Build map: artikulas → latest prediction
    const latestPredByArt = new Map<string, KainuPrognozė>();
    for (const p of prognozes) {
      const existing = latestPredByArt.get(p.artikulas);
      if (!existing || p.data > existing.data) {
        latestPredByArt.set(p.artikulas, p);
      }
    }

    return medziagas
      .map(m => {
        const prices = histByArt.get(m.artikulas) || [];
        const pred = latestPredByArt.get(m.artikulas);
        if (prices.length === 0 && !pred) return null;

        const result: LatestMaterialPrice = {
          artikulas: m.artikulas,
          pavadinimas: m.pavadinimas,
          vienetas: m.vienetas,
          kainos: prices.map(e => ({
            data: e.data, kaina_min: e.kaina_min, kaina_max: e.kaina_max, pastabos: e.pastabos,
          })),
        };
        if (pred) {
          result.prognoze = {
            data: pred.data, kaina_min: pred.kaina_min, kaina_max: pred.kaina_max,
            pasitikejimas: pred.pasitikejimas,
          };
        }
        return result;
      })
      .filter((x): x is LatestMaterialPrice => x !== null);
  } catch {
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

/** Relative time in Lithuanian: "ką tik", "prieš 6 val.", "vakar", "prieš 3 d." */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'niekada';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'ką tik';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ką tik';
  if (mins < 60) return `prieš ${mins} min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `prieš ${hrs} val.`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'vakar';
  if (days < 7) return `prieš ${days} d.`;
  return new Date(iso).toLocaleDateString('lt-LT');
}
