// Database: Directus API (see ./directus.ts). NOT Supabase.
// Tables used:
//   medziagos                    – materials catalogue (artikulas PK, pavadinimas, vienetas, sukurta_at)
//   medziagos_kainu_istorija     – price history       (id PK auto, artikulas, data, kaina_min, kaina_max, pastabos, sukurta_at)
//   medziagos_prognoze_internetas – AI web analysis    (artikulas PK, content, geoevents, atnaujinta)

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

export interface PrognozėInternetas {
  artikulas: string;   // PK – one row per material (Option A – overwrite)
  content: string;     // markdown analysis
  geoevents: string;   // geopolitical events
  nafta: string;       // oil price analysis
  atnaujinta: string;  // ISO timestamp
}

/** Computed prediction (not stored in DB — calculated on-the-fly). */
export interface ComputedPrediction {
  data: string;           // predicted-for date YYYY-MM-DD
  kaina_min: number;
  kaina_max: number;
  confidence: number;     // 0.0–1.0
}

// Returned from fetchLatestMaterialPrices for tool/webhook integration
export interface LatestMaterialPrice {
  artikulas: string;
  pavadinimas: string;
  vienetas: string;
  kainos: { data: string; kaina_min: number | null; kaina_max: number | null; pastabos: string | null }[];
  prognoze?: ComputedPrediction;
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
  // Delete price history and web analysis first
  const [h, w] = await Promise.allSettled([
    db.from('medziagos_kainu_istorija').delete().eq('artikulas', artikulas),
    db.from('medziagos_prognoze_internetas').delete().eq('artikulas', artikulas),
  ]);
  for (const r of [h, w]) {
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
      console.warn('[bulkInsertMedziagas] Skipped existing:', row.artikulas);
    }
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Web analysis storage  (table: medziagos_prognoze_internetas)
// ---------------------------------------------------------------------------

const INTERNETAS_FIELDS = 'artikulas,content,geoevents,nafta,atnaujinta';

export async function fetchPrognozėInternetas(): Promise<PrognozėInternetas[]> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('atnaujinta', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function fetchLatestPrognozėInternetas(): Promise<PrognozėInternetas | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('atnaujinta', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

export async function upsertPrognozėInternetas(
  artikulas: string,
  content: string,
  geoevents: string,
  nafta: string = '',
): Promise<void> {
  const { data: existing } = await db
    .from('medziagos_prognoze_internetas')
    .select('artikulas')
    .eq('artikulas', artikulas)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await db
      .from('medziagos_prognoze_internetas')
      .update({ content, geoevents, nafta, atnaujinta: new Date().toISOString() })
      .eq('artikulas', artikulas);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('medziagos_prognoze_internetas')
      .insert({ artikulas, content, geoevents, nafta, atnaujinta: new Date().toISOString() });
    if (error) throw error;
  }
}

export async function saveGeneralAnalysis(content: string, geoevents: string, nafta: string = ''): Promise<void> {
  await upsertPrognozėInternetas('__general__', content, geoevents, nafta);
}

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
// Price prediction — computed on-the-fly using weighted linear regression
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

/** Convert YYYY-MM-DD to epoch days for regression math. */
function dateToDays(d: string): number {
  return Math.floor(new Date(d + 'T00:00:00Z').getTime() / DAY_MS);
}

/** Convert epoch days back to YYYY-MM-DD. */
function daysToDate(days: number): string {
  return new Date(days * DAY_MS).toISOString().split('T')[0];
}

/**
 * Weighted linear regression.
 * More recent data points get exponentially higher weight.
 * Returns { slope, intercept } or null if not enough data.
 */
function weightedLinearRegression(
  points: { x: number; y: number }[],
  halfLife: number = 180, // days — weight halves every 180 days into the past
): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;

  const maxX = Math.max(...points.map(p => p.x));
  // Compute weights: w = 2^((x - maxX) / halfLife)
  const weighted = points.map(p => ({
    ...p,
    w: Math.pow(2, (p.x - maxX) / halfLife),
  }));

  const sumW = weighted.reduce((s, p) => s + p.w, 0);
  const sumWx = weighted.reduce((s, p) => s + p.w * p.x, 0);
  const sumWy = weighted.reduce((s, p) => s + p.w * p.y, 0);
  const sumWxx = weighted.reduce((s, p) => s + p.w * p.x * p.x, 0);
  const sumWxy = weighted.reduce((s, p) => s + p.w * p.x * p.y, 0);

  const denom = sumW * sumWxx - sumWx * sumWx;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (sumW * sumWxy - sumWx * sumWy) / denom;
  const intercept = (sumWy - slope * sumWx) / sumW;

  return { slope, intercept };
}

/**
 * Compute a price prediction for a material based on its price history.
 *
 * Logic:
 * - If latest price is ≤30 days old → predict 1 month from today
 * - If latest price is >30 days old → predict for today
 * - Needs ≥2 data points with numeric prices
 * - Uses weighted linear regression (recent data weighted more)
 * - Confidence is based on R² and data density
 */
export function computePrediction(entries: KainuIrašas[]): ComputedPrediction | null {
  // Filter to entries with numeric prices
  const valid = entries
    .filter(e => e.kaina_min !== null)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (valid.length < 2) return null;

  const today = dateToDays(new Date().toISOString().split('T')[0]);
  const latestDate = dateToDays(valid[valid.length - 1].data);
  const daysSinceLatest = today - latestDate;

  // Target date: if data is fresh (≤30 days), predict 1 month out; otherwise predict today
  const targetDays = daysSinceLatest <= 30 ? today + 30 : today;

  // Build points for min price
  const pointsMin = valid.map(e => ({ x: dateToDays(e.data), y: e.kaina_min! }));
  const regMin = weightedLinearRegression(pointsMin);
  if (!regMin) return null;

  // Build points for max price (use kaina_max if available, otherwise kaina_min)
  const pointsMax = valid.map(e => ({
    x: dateToDays(e.data),
    y: e.kaina_max ?? e.kaina_min!,
  }));
  const regMax = weightedLinearRegression(pointsMax);
  if (!regMax) return null;

  let predMin = regMin.slope * targetDays + regMin.intercept;
  let predMax = regMax.slope * targetDays + regMax.intercept;

  // Ensure predictions are non-negative
  predMin = Math.max(0, predMin);
  predMax = Math.max(0, predMax);

  // Ensure min ≤ max
  if (predMin > predMax) [predMin, predMax] = [predMax, predMin];

  // Confidence: based on data points count, time span, and extrapolation distance
  const timeSpanDays = dateToDays(valid[valid.length - 1].data) - dateToDays(valid[0].data);
  const extrapolationDays = targetDays - latestDate;
  const densityScore = Math.min(1, valid.length / 8);       // more points = better
  const spanScore = Math.min(1, timeSpanDays / 365);        // wider history = better
  const extrapPenalty = Math.max(0.3, 1 - extrapolationDays / (timeSpanDays || 1)); // extrapolating far = worse
  const confidence = Math.round(densityScore * spanScore * extrapPenalty * 100) / 100;

  return {
    data: daysToDate(targetDays),
    kaina_min: Math.round(predMin * 100) / 100,
    kaina_max: Math.round(predMax * 100) / 100,
    confidence: Math.max(0.1, Math.min(1, confidence)),
  };
}

// ---------------------------------------------------------------------------
// Analytics helper – enriched material prices for PaklausimasModal
// ---------------------------------------------------------------------------

/**
 * Returns every material with its 3 most recent historical prices
 * plus an on-the-fly computed prediction. The LLM in n8n uses
 * the price history + prediction to estimate tank prices.
 */
export async function fetchLatestMaterialPrices(): Promise<LatestMaterialPrice[]> {
  try {
    const [medziagas, istorija] = await Promise.all([
      fetchMedziagas(),
      fetchIstorija(),
    ]);

    // Build map: artikulas → all entries sorted newest first
    const histByArt = new Map<string, KainuIrašas[]>();
    for (const e of istorija) {
      const arr = histByArt.get(e.artikulas) || [];
      arr.push(e);
      histByArt.set(e.artikulas, arr);
    }

    return medziagas
      .map(m => {
        const allEntries = histByArt.get(m.artikulas) || [];
        if (allEntries.length === 0) return null;

        // Sort newest first, take top 3 for the payload
        const sorted = [...allEntries].sort((a, b) => b.data.localeCompare(a.data));
        const top3 = sorted.slice(0, 3);

        // Compute prediction from ALL entries (not just top 3)
        const prediction = computePrediction(allEntries);

        const result: LatestMaterialPrice = {
          artikulas: m.artikulas,
          pavadinimas: m.pavadinimas,
          vienetas: m.vienetas,
          kainos: top3.map(e => ({
            data: e.data, kaina_min: e.kaina_min, kaina_max: e.kaina_max, pastabos: e.pastabos,
          })),
        };
        if (prediction) result.prognoze = prediction;
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

// ---------------------------------------------------------------------------
// Material prices with staleness check (for PaklausimoKortele)
// ---------------------------------------------------------------------------

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

export interface MaterialPriceForEstimate {
  artikulas: string;
  pavadinimas: string;
  vienetas: string;
  latest_price: { data: string; kaina_min: number | null; kaina_max: number | null } | null;
  is_stale: boolean;
  prediction_math?: ComputedPrediction;
}

export interface MaterialPriceEstimatePayloadItem {
  artikulas: string;
  pavadinimas: string;
  vienetas: string;
  latest_price: { data: string; kaina_min: number | null; kaina_max: number | null } | null;
  is_stale: boolean;
  predicted_current_date: { data: string; kaina_min: number | null; kaina_max: number | null; source: 'math' | 'ai' } | null;
}

/**
 * Fetch material prices enriched with staleness flag and math prediction.
 * If latest price date > 3 months old, `is_stale` is true and `prediction_math` is included.
 */
export async function fetchMaterialPricesForEstimate(): Promise<MaterialPriceForEstimate[]> {
  const prices = await fetchLatestMaterialPrices();
  const now = Date.now();

  return prices.map(p => {
    const latest = p.kainos[0] ?? null;
    const latestDate = latest ? new Date(latest.data).getTime() : 0;
    const isStale = !latest || (now - latestDate > THREE_MONTHS_MS);

    const result: MaterialPriceForEstimate = {
      artikulas: p.artikulas,
      pavadinimas: p.pavadinimas,
      vienetas: p.vienetas,
      latest_price: latest,
      is_stale: isStale,
    };
    if (isStale && p.prognoze) {
      result.prediction_math = p.prognoze;
    }
    return result;
  });
}

function tryExtractAiPrice(content: string): { kaina: number | null; data: string | null } {
  const text = (content || '').trim();
  if (!text) return { kaina: null, data: null };

  const tryJson = (raw: string): any => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = blockMatch?.[1] || text;
  let parsed = tryJson(jsonCandidate);
  if (!parsed) {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) parsed = tryJson(arrMatch[0]);
  }
  if (!parsed) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) parsed = tryJson(objMatch[0]);
  }

  const pickFromObj = (obj: any): { kaina: number | null; data: string | null } => {
    if (!obj || typeof obj !== 'object') return { kaina: null, data: null };
    const raw = obj.kaina ?? obj.kaina_min ?? obj.price ?? obj.predicted_price ?? null;
    const n = raw == null ? null : Number(raw);
    const date = obj.data ?? obj.date ?? null;
    return {
      kaina: n != null && !isNaN(n) ? n : null,
      data: typeof date === 'string' && date.trim() ? date.trim() : null,
    };
  };

  if (Array.isArray(parsed) && parsed.length > 0) {
    const v = pickFromObj(parsed[0]);
    if (v.kaina != null) return v;
  } else if (parsed && typeof parsed === 'object') {
    const v = pickFromObj(parsed);
    if (v.kaina != null) return v;
  }

  const numMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return {
    kaina: numMatch ? Number(numMatch[1].replace(',', '.')) : null,
    data: dateMatch ? dateMatch[0] : null,
  };
}

export async function fetchMaterialPricesForEstimatePayload(
  mode: 'math' | 'ai',
): Promise<MaterialPriceEstimatePayloadItem[]> {
  const base = await fetchMaterialPricesForEstimate();
  const today = new Date().toISOString().split('T')[0];

  let aiMap = new Map<string, { kaina: number | null; data: string | null }>();
  if (mode === 'ai') {
    try {
      const rows = await fetchPrognozėInternetas();
      aiMap = new Map(
        rows
          .filter(r => r.artikulas && r.artikulas !== '__general__')
          .map(r => [r.artikulas, tryExtractAiPrice(r.content || '')]),
      );
    } catch {
      aiMap = new Map();
    }
  }

  return base.map((m): MaterialPriceEstimatePayloadItem => {
    let predicted: MaterialPriceEstimatePayloadItem['predicted_current_date'] = null;
    if (m.is_stale) {
      if (mode === 'ai') {
        const ai = aiMap.get(m.artikulas);
        if (ai?.kaina != null && !isNaN(ai.kaina)) {
          predicted = {
            data: today,
            kaina_min: ai.kaina,
            kaina_max: ai.kaina,
            source: 'ai',
          };
        } else if (m.prediction_math) {
          predicted = {
            data: today,
            kaina_min: m.prediction_math.kaina_min,
            kaina_max: m.prediction_math.kaina_max,
            source: 'math',
          };
        }
      } else if (m.prediction_math) {
        predicted = {
          data: today,
          kaina_min: m.prediction_math.kaina_min,
          kaina_max: m.prediction_math.kaina_max,
          source: 'math',
        };
      }
    }

    return {
      artikulas: m.artikulas,
      pavadinimas: m.pavadinimas,
      vienetas: m.vienetas,
      latest_price: m.latest_price,
      is_stale: m.is_stale,
      predicted_current_date: predicted,
    };
  });
}
