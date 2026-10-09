// Database: Directus API (see ./directus.ts). NOT Supabase.
// Tables used:
//   medziagos                    – materials catalogue (artikulas PK, pavadinimas, vienetas, sukurta_at)
//   medziagos_kainu_istorija     – price history       (id PK auto, artikulas, data, kaina_min, kaina_max, pastabos, sukurta_at)
//   medziagos_prognoze_internetas – AI web analysis    (artikulas PK, content, geoevents, nafta, sukurta_at)

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
  sukurta_at: string;  // ISO timestamp
}

export interface AnalysisGenerationLock {
  runId: string;
  startedAt: string;
  heartbeatAt?: string;
  startedBy: string;
  step?: 'idle' | 'nafta' | 'geo' | 'analysis';
  sections: Array<'nafta' | 'geo' | 'analysis'>;
}

/** Computed prediction (not stored in DB — calculated on-the-fly). */
export interface ComputedPrediction {
  data: string;           // predicted-for date YYYY-MM-DD
  kaina: number;          // forecast = last known price (midpoint of its min–max)
  kaina_min: number;      // the last entry's own min/max, carried forward
  kaina_max: number;
  nuo: number;            // range that held ~80 % of the time in the backtest
  iki: number;
  paklaida_proc: number;  // half-width of that range, %
  tendencija: 'kyla' | 'krenta' | 'stabili';
  pokytis_proc: number;   // last price vs the price on pokytis_nuo, %
  pokytis_nuo: string;
  paskutine_data: string; // date of the last known price
  dienu_nuo_paskutines: number;
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

const INTERNETAS_FIELDS = 'artikulas,content,geoevents,nafta,sukurta_at';
const GENERAL_ANALYSIS_ARTIKULAS = '__general__';
const ANALYSIS_LOCK_ARTIKULAS = '__analysis_lock__';
const ANALYSIS_LOCK_STALE_MS = 45 * 1000;

export async function fetchPrognozėInternetas(): Promise<PrognozėInternetas[]> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('sukurta_at', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function fetchLatestPrognozėInternetas(): Promise<PrognozėInternetas | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .order('sukurta_at', { ascending: false })
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
      .update({ content, geoevents, nafta, sukurta_at: new Date().toISOString() })
      .eq('artikulas', artikulas);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('medziagos_prognoze_internetas')
      .insert({ artikulas, content, geoevents, nafta, sukurta_at: new Date().toISOString() });
    if (error) throw error;
  }
}

export async function saveGeneralAnalysis(content: string, geoevents: string, nafta: string = ''): Promise<void> {
  await upsertPrognozėInternetas(GENERAL_ANALYSIS_ARTIKULAS, content, geoevents, nafta);
}

export async function fetchGeneralAnalysis(): Promise<PrognozėInternetas | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .eq('artikulas', GENERAL_ANALYSIS_ARTIKULAS)
    .limit(1);

  if (error) throw error;
  return (data && data.length > 0) ? data[0] : null;
}

function parseAnalysisLockRow(row: PrognozėInternetas | null): AnalysisGenerationLock | null {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.content || '{}') as Partial<AnalysisGenerationLock>;
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections.filter((s): s is 'nafta' | 'geo' | 'analysis' => ['nafta', 'geo', 'analysis'].includes(String(s)))
      : ['nafta', 'geo', 'analysis'];

    if (!parsed.runId || !parsed.startedBy) return null;
    return {
      runId: parsed.runId,
      startedAt: parsed.startedAt || row.sukurta_at,
      heartbeatAt: parsed.heartbeatAt,
      startedBy: parsed.startedBy,
      step: parsed.step,
      sections: sections.length > 0 ? sections : ['nafta', 'geo', 'analysis'],
    };
  } catch {
    return null;
  }
}

function isLockStale(lock: AnalysisGenerationLock): boolean {
  const heartbeatMs = new Date(lock.heartbeatAt || lock.startedAt).getTime();
  if (!Number.isFinite(heartbeatMs)) return true;
  return (Date.now() - heartbeatMs) > ANALYSIS_LOCK_STALE_MS;
}

export async function fetchAnalysisGenerationLock(): Promise<AnalysisGenerationLock | null> {
  const { data, error } = await db
    .from('medziagos_prognoze_internetas')
    .select(INTERNETAS_FIELDS)
    .eq('artikulas', ANALYSIS_LOCK_ARTIKULAS)
    .limit(1);
  if (error) throw error;
  const row = (data && data.length > 0) ? data[0] as PrognozėInternetas : null;
  const parsed = parseAnalysisLockRow(row);
  if (!parsed) return null;
  if (isLockStale(parsed)) {
    await db.from('medziagos_prognoze_internetas').delete().eq('artikulas', ANALYSIS_LOCK_ARTIKULAS);
    return null;
  }
  return parsed;
}

export async function tryAcquireAnalysisGenerationLock(params: {
  runId: string;
  startedBy: string;
  sections: Array<'nafta' | 'geo' | 'analysis'>;
}): Promise<{ acquired: true; lock: AnalysisGenerationLock } | { acquired: false; lock: AnalysisGenerationLock | null }> {
  const existing = await fetchAnalysisGenerationLock();
  if (existing) return { acquired: false, lock: existing };

  const payload: AnalysisGenerationLock = {
    runId: params.runId,
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    startedBy: params.startedBy,
    step: 'idle',
    sections: params.sections,
  };
  const { error } = await db
    .from('medziagos_prognoze_internetas')
    .insert({
      artikulas: ANALYSIS_LOCK_ARTIKULAS,
      content: JSON.stringify(payload),
      geoevents: '',
      nafta: '',
      sukurta_at: payload.startedAt,
    });

  if (error) {
    const lockAfterConflict = await fetchAnalysisGenerationLock();
    return { acquired: false, lock: lockAfterConflict };
  }
  return { acquired: true, lock: payload };
}

export async function updateAnalysisGenerationLock(params: {
  runId: string;
  step?: 'idle' | 'nafta' | 'geo' | 'analysis';
  sections?: Array<'nafta' | 'geo' | 'analysis'>;
}): Promise<void> {
  const currentLock = await fetchAnalysisGenerationLock();
  if (!currentLock || currentLock.runId !== params.runId) return;

  const payload: AnalysisGenerationLock = {
    ...currentLock,
    step: params.step ?? currentLock.step ?? 'idle',
    sections: params.sections ?? currentLock.sections,
    heartbeatAt: new Date().toISOString(),
  };

  await db
    .from('medziagos_prognoze_internetas')
    .update({
      content: JSON.stringify(payload),
      sukurta_at: payload.heartbeatAt,
    })
    .eq('artikulas', ANALYSIS_LOCK_ARTIKULAS);
}

export async function releaseAnalysisGenerationLock(runId?: string): Promise<void> {
  if (runId) {
    const lock = await fetchAnalysisGenerationLock();
    if (lock && lock.runId !== runId) return;
  }
  await db
    .from('medziagos_prognoze_internetas')
    .delete()
    .eq('artikulas', ANALYSIS_LOCK_ARTIKULAS);
}

// ---------------------------------------------------------------------------
// Price prediction — computed on-the-fly: last known price carried forward, with a measured error range
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

// Backtest on the price history (139 forecasts, 9 materials, 2022–2026): carrying the last price forward was off by
// 3.9 % on average; the weighted linear regression used before by 7.4 %; damped-trend and mean-reversion variants by
// 4.7–7.1 %. Prices move in steps a few times a year, so a trend line overshoots. The forecast is therefore the last
// price, with a range that held 80 % of the time in that backtest and widens with the square root of elapsed time.
const RANGE_PER_SQRT_MONTH = 0.045;
const RANGE_CAP = 0.25;
const TREND_LOOKBACK_DAYS = 90;
const TREND_THRESHOLD = 0.03;

/**
 * Forecast for a material from its price history.
 *
 * - Price = the last known price, carried forward.
 * - Target date: 1 month from today when the last price is ≤30 days old, otherwise today.
 * - Range (nuo–iki): ±4.5 % × √(months since the last price), capped at ±25 % — about 80 % of past cases fell inside.
 * - Trend: the last price against the price at least 90 days before it; shown as a label, not projected.
 */
export function computePrediction(entries: KainuIrašas[]): ComputedPrediction | null {
  const valid = entries
    .filter(e => e.kaina_min !== null)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (valid.length < 2) return null;

  const mid = (e: KainuIrašas) => (e.kaina_min! + (e.kaina_max ?? e.kaina_min!)) / 2;
  const last = valid[valid.length - 1];
  const today = dateToDays(new Date().toISOString().split('T')[0]);
  const latestDate = dateToDays(last.data);
  const daysSinceLatest = Math.max(0, today - latestDate);
  const targetDays = daysSinceLatest <= 30 ? today + 30 : today;

  const price = mid(last);
  const months = Math.max(1, (targetDays - latestDate) / 30);
  const range = Math.min(RANGE_CAP, RANGE_PER_SQRT_MONTH * Math.sqrt(months));

  const earlier = [...valid].reverse().find(e => latestDate - dateToDays(e.data) >= TREND_LOOKBACK_DAYS) ?? valid[0];
  const earlierPrice = mid(earlier);
  const change = earlierPrice > 0 ? (price - earlierPrice) / earlierPrice : 0;
  const round2 = (v: number) => Math.round(v * 100) / 100;

  return {
    data: daysToDate(targetDays),
    kaina: round2(price),
    kaina_min: last.kaina_min!,
    kaina_max: last.kaina_max ?? last.kaina_min!,
    nuo: round2(price * (1 - range)),
    iki: round2(price * (1 + range)),
    paklaida_proc: Math.round(range * 100),
    tendencija: change > TREND_THRESHOLD ? 'kyla' : change < -TREND_THRESHOLD ? 'krenta' : 'stabili',
    pokytis_proc: Math.round(change * 1000) / 10,
    pokytis_nuo: earlier.data,
    paskutine_data: last.data,
    dienu_nuo_paskutines: daysSinceLatest,
  };
}

// ---------------------------------------------------------------------------
// Analytics helper – enriched material prices for PaklausimasModal
// ---------------------------------------------------------------------------

/**
 * Returns every material with its 3 most recent historical prices
 * plus an on-the-fly computed prediction (the last price with an error range and a trend label).
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
  price_source: 'current' | 'math' | 'ai' | 'none';
  predicted_current_date: { data: string; kaina_min: number | null; kaina_max: number | null; source: 'math' | 'ai' } | null;
}

export type MaterialEstimatePriceMode = 'current' | 'math' | 'ai';

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

function extractJsonPayloadLoose(text: string): unknown | null {
  const raw = (text || '').replace(/```json/gi, '```').trim();
  if (!raw) return null;

  const tryParse = (candidate: string): unknown | null => {
    try { return JSON.parse(candidate); } catch { return null; }
  };

  const direct = tryParse(raw.replace(/```/g, '').trim());
  if (direct !== null) return direct;

  const blocks = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((m) => (m[1] || '').trim())
    .filter(Boolean);
  for (const block of blocks) {
    const parsed = tryParse(block);
    if (parsed !== null) return parsed;
  }

  const forecastsIdx = raw.search(/"forecasts"\s*:/i);
  if (forecastsIdx >= 0) {
    const start = raw.lastIndexOf('{', forecastsIdx);
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < raw.length; i += 1) {
        const ch = raw[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) return tryParse(raw.slice(start, i + 1));
        }
      }
    }
  }

  return null;
}

function extractGraphAiPriceMap(
  analysisContent: string,
  materials: Array<Pick<MaterialPriceForEstimate, 'artikulas' | 'pavadinimas'>>,
): Map<string, { kaina: number; data: string }> {
  const normalizeName = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.').trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const toIsoDate = (value: unknown, fallback: string): string => (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : fallback
  );

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const knownCodes = materials.map((m) => String(m.artikulas || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const byName = new Map(materials.map((m) => [normalizeName(String(m.pavadinimas || '')), String(m.artikulas || '')]));

  const resolveCode = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    if (knownCodes.includes(text)) return text;
    for (const code of knownCodes) {
      if (new RegExp(`(^|[^A-Za-z0-9-])${escapeRegex(code)}([^A-Za-z0-9-]|$)`).test(text)) return code;
    }
    const normalized = normalizeName(text.replace(/\[[^\]]+\]/g, '').trim());
    return byName.get(normalized) || null;
  };

  const payload = extractJsonPayloadLoose(analysisContent);
  const forecasts = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.forecasts)
      ? (payload as any).forecasts
      : [];

  const map = new Map<string, { kaina: number; data: string }>();
  for (const item of forecasts) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const artikulas = resolveCode(row.artikulas) || resolveCode(row.material_code) || resolveCode(row.material) || resolveCode(row.name);
    if (!artikulas) continue;

    const candidates = Array.isArray(row.points) && row.points.length > 0
      ? row.points
      : [row];

    for (const candidate of candidates) {
      const point = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
      const kaina = toNumber(point.price ?? point.kaina ?? point.value);
      if (kaina === null || kaina < 0) continue;
      const data = toIsoDate(point.date ?? point.data ?? row.data ?? row.date, fallbackDate);
      const existing = map.get(artikulas);
      if (!existing || data >= existing.data) map.set(artikulas, { kaina, data });
    }
  }

  return map;
}

export async function fetchMaterialPricesForEstimatePayload(
  mode: MaterialEstimatePriceMode,
): Promise<MaterialPriceEstimatePayloadItem[]> {
  const base = await fetchMaterialPricesForEstimate();
  const today = new Date().toISOString().split('T')[0];

  let aiMap = new Map<string, { kaina: number; data: string }>();
  if (mode === 'ai') {
    try {
      const { data, error } = await db
        .from('medziagos_analize_internetas')
        .select('content')
        .eq('id', 'kainos')
        .single();
      if (error) throw error;
      aiMap = extractGraphAiPriceMap(String(data?.content || ''), base);
    } catch {
      aiMap = new Map();
    }
  }

  return base.map((m): MaterialPriceEstimatePayloadItem => {
    let effectivePrice: MaterialPriceEstimatePayloadItem['latest_price'] = m.latest_price;
    let priceSource: MaterialPriceEstimatePayloadItem['price_source'] = m.latest_price ? 'current' : 'none';

    if (mode === 'ai') {
      const ai = aiMap.get(m.artikulas);
      if (ai) {
        effectivePrice = {
          data: ai.data || today,
          kaina_min: ai.kaina,
          kaina_max: ai.kaina,
        };
        priceSource = 'ai';
      } else {
        effectivePrice = null;
        priceSource = 'none';
      }
    } else if (mode === 'math' && m.is_stale && m.prediction_math) {
      effectivePrice = {
        data: today,
        kaina_min: m.prediction_math.kaina_min,
        kaina_max: m.prediction_math.kaina_max,
      };
      priceSource = 'math';
    }

    return {
      artikulas: m.artikulas,
      pavadinimas: m.pavadinimas,
      vienetas: m.vienetas,
      latest_price: effectivePrice,
      is_stale: m.is_stale,
      price_source: priceSource,
      predicted_current_date: null,
    };
  });
}
