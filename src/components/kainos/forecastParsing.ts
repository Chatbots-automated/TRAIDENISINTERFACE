import type { Medžiaga } from '../../lib/kainosService';
import type { ExtractedCitation } from '../../lib/kainosAnalyticsFramework';

export function addMonthsISO(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m - 1) + months, d));
  return dt.toISOString().split('T')[0];
}

export function addDaysISO(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function normalizeIsoDate(value: unknown, fallbackDate: string): string {
  if (typeof value !== 'string') return fallbackDate;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fallbackDate;
  const [_, y, m, d] = match;
  const dt = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return fallbackDate;
  if (dt.toISOString().slice(0, 10) !== `${y}-${m}-${d}`) return fallbackDate;
  return `${y}-${m}-${d}`;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export interface ChartPoint {
  date: string;       // YYYY-MM-DD
  label: string;      // MM-DD for display
  kaina: number | null;
  predicted?: number;
  aiPredicted?: number;
}

export interface AiPrediction {
  artikulas: string;
  kaina: number;
  data: string;
  reasoning: string;
  currentPrice?: number;
  oilImpactPercent?: number;
  oilCurrentPrice?: number;
  oil3mForecastChangePercent?: number;
  citations?: { title: string; url: string; citedText?: string }[];
}

interface AnalysisForecastResponsePayload {
  analysis_markdown?: string;
  forecasts?: Array<{
    artikulas?: string;
    material?: string;
    kaina?: number;
    data?: string;
    confidence?: number;
    reasoning?: string;
    current_price?: number;
    currentPrice?: number;
    points?: Array<{
      date?: string;
      price?: number;
      kaina?: number;
    }>;
  }>;
}

export interface AnalysisSectionMeta {
  confidence: number;
  citations: ExtractedCitation[];
}

export interface AnalysisDebugState {
  lastRunAt: string | null;
  stepStatus: {
    nafta: 'idle' | 'ok' | 'error' | 'skipped';
    geo: 'idle' | 'ok' | 'error' | 'skipped';
    analysis: 'idle' | 'ok' | 'error' | 'skipped';
  };
  promptIssues: Array<{ prompt: string; variables: string[] }>;
  parser: { total: number; json: number; markdown: number; failed: number } | null;
  missingForecastCodes: string[];
  error: string | null;
}

export type AnalysisSectionKey = 'nafta' | 'geo' | 'analysis';

export function extractUrlCitationsFromText(text: string): ExtractedCitation[] {
  const links = new Map<string, ExtractedCitation>();
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gim;
  const rawUrlRegex = /(https?:\/\/[^\s)]+)(?!\))/gim;

  let match: RegExpExecArray | null;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const title = match[1]?.trim() || match[2];
    const url = match[2]?.trim();
    if (url && !links.has(url)) links.set(url, { title, url });
  }
  while ((match = rawUrlRegex.exec(text)) !== null) {
    const url = match[1]?.trim();
    if (!url || links.has(url)) continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      links.set(url, { title: host, url });
    } catch {
      links.set(url, { title: url, url });
    }
  }

  return Array.from(links.values());
}

export function getAnalysisMarkdownForDisplay(content: string): string {
  const raw = (content || '').trim();
  if (!raw) return '';
  try {
    const payload = extractJsonPayload(raw) as AnalysisForecastResponsePayload;
    if (payload && typeof payload === 'object' && typeof payload.analysis_markdown === 'string' && payload.analysis_markdown.trim()) {
      return payload.analysis_markdown.trim();
    }
    const generated = buildForecastMarkdownFromPayload(payload);
    if (generated) return generated;
  } catch {
    // Legacy rows can still be plain markdown.
  }
  return content;
}

function buildForecastMarkdownFromPayload(payload: AnalysisForecastResponsePayload | unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const forecasts = (payload as AnalysisForecastResponsePayload).forecasts;
  if (!Array.isArray(forecasts) || forecasts.length === 0) return '';

  const formatNumber = (value: unknown): string | null => {
    const parsed = coerceFiniteNumber(value);
    if (parsed === null) return null;
    return parsed.toLocaleString('lt-LT', {
      minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  };

  const sections = forecasts.slice(0, 80).map((forecast, index) => {
    if (!forecast || typeof forecast !== 'object') return '';
    const label = forecast.material || forecast.artikulas || `Medžiaga ${index + 1}`;
    const currentPrice = formatNumber(forecast.current_price ?? forecast.currentPrice);
    const confidence = formatNumber(forecast.confidence);
    const points = Array.isArray(forecast.points) ? forecast.points : [];
    const directPrice = points.length === 0 ? formatNumber(forecast.kaina) : null;
    const directDate = typeof forecast.data === 'string' && forecast.data.trim() ? forecast.data.trim() : '';

    const lines = [`### ${label}`];
    if (currentPrice) lines.push(`- Dabartinė kaina: ${currentPrice}`);
    if (directPrice) lines.push(`- Prognozė${directDate ? ` (${directDate})` : ''}: ${directPrice}`);
    for (const point of points) {
      const price = formatNumber(point?.price ?? point?.kaina);
      const date = typeof point?.date === 'string' && point.date.trim() ? point.date.trim() : 'prognozė';
      if (price) lines.push(`- ${date}: ${price}`);
    }
    if (confidence) lines.push(`- Pasitikėjimas: ${confidence}%`);
    if (forecast.reasoning?.trim()) lines.push(`- Pagrindimas: ${forecast.reasoning.trim()}`);
    return lines.join('\n');
  }).filter(Boolean);

  if (!sections.length) return '';
  return [
    '## Kainų prognozė',
    'Žemiau pateikiama struktūrizuota prognozė pagal sugeneruotus duomenis.',
    ...sections,
  ].join('\n\n');
}


export function extractJsonPayload(text: string): unknown {
  const stripped = text
    .replace(/```json/gi, '```')
    .trim();

  const jsonBlocks = Array.from(stripped.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((m) => (m[1] || '').trim())
    .filter(Boolean);

  const candidates = [
    stripped.replace(/```/g, '').trim(),
    ...jsonBlocks,
  ].filter(Boolean);

  const tryParse = (raw: string): unknown | null => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed !== null) return parsed;
  }

  const forecastsIdx = stripped.search(/"forecasts"\s*:/i);
  if (forecastsIdx >= 0) {
    const objectStart = stripped.lastIndexOf('{', forecastsIdx);
    if (objectStart >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = objectStart; i < stripped.length; i += 1) {
        const ch = stripped[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            const chunk = stripped.slice(objectStart, i + 1);
            const parsed = tryParse(chunk);
            if (parsed !== null) return parsed;
            break;
          }
        }
      }
    }
  }

  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParse(objectMatch[0]);
    if (parsed !== null) return parsed;
  }

  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = tryParse(arrayMatch[0]);
    if (parsed !== null) return parsed;
  }

  throw new Error('AI negrąžino atpažįstamo JSON');
}

export function normalizeAnalysisForecasts(payload: unknown, medziagas: Medžiaga[], fallbackDate: string): AiPrediction[] {
  const knownArtikulas = medziagas
    .map((m) => m.artikulas.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const knownSet = new Set(knownArtikulas);

  const extractKnownArtikulasFromText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    if (knownSet.has(text)) return text;

    for (const artikulas of knownArtikulas) {
      const tokenMatch = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(artikulas)}([^A-Za-z0-9-]|$)`).test(text);
      if (tokenMatch) return artikulas;
    }
    return null;
  };

  const resolveItemArtikulas = (item: unknown): string | null => {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;

    const strictArtikulas = extractKnownArtikulasFromText(row.artikulas);
    if (strictArtikulas) return strictArtikulas;

    const materialCode = extractKnownArtikulasFromText(row.material_code);
    if (materialCode) return materialCode;

    const materialLabel = extractKnownArtikulasFromText(row.material);
    if (materialLabel) return materialLabel;

    const nameLabel = extractKnownArtikulasFromText(row.name);
    if (nameLabel) return nameLabel;

    return null;
  };

  const toPredictions = (item: unknown): AiPrediction[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const artikulas = resolveItemArtikulas(row);
    if (!artikulas) return [];

    const reasoning = typeof row.reasoning === 'string'
      ? row.reasoning
      : 'Prognozė pagal naftos ir geopolitinį kontekstą.';

    if (Array.isArray(row.points)) {
      const normalizedPoints: AiPrediction[] = row.points
        .map((p: unknown) => {
          const point = (p && typeof p === 'object') ? (p as Record<string, unknown>) : {};
          return {
            artikulas,
            kaina: coerceFiniteNumber(point.price ?? point.kaina ?? point.value),
            data: normalizeIsoDate(point.date ?? point.data, fallbackDate),
            reasoning,
          };
        })
        .filter((p) => p.kaina !== null && p.kaina >= 0) as AiPrediction[];
      if (normalizedPoints.length > 0) return normalizedPoints;
    }

    const kaina = coerceFiniteNumber(row.kaina ?? row.price ?? row.value);
    if (kaina === null || kaina < 0) return [];

    return [{
      artikulas,
      kaina,
      data: normalizeIsoDate(row.data ?? row.date, fallbackDate),
      reasoning,
    }];
  };

  const parsed = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as AnalysisForecastResponsePayload)?.forecasts)
      ? (payload as AnalysisForecastResponsePayload).forecasts!
      : [];

  const deduped = new Map<string, AiPrediction>();
  for (const row of parsed) {
    const preds = toPredictions(row);
    for (const pred of preds) {
      const key = `${pred.artikulas}|${pred.data}`;
      if (!deduped.has(key)) deduped.set(key, pred);
    }
  }

  return Array.from(deduped.values());
}

export function parseForecastsFromMarkdownTable(text: string, medziagas: Medžiaga[], fallbackDate: string): AiPrediction[] {
  if (!text) return [];
  const byName = new Map(medziagas.map((m) => [normalizeName(m.pavadinimas), m.artikulas]));
  const byCode = new Map(medziagas.map((m) => [m.artikulas.toLowerCase(), m.artikulas]));
  const rows = text.split('\n').map((r) => r.trim()).filter(Boolean);
  const predictions: AiPrediction[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.includes('EUR/kg')) continue;
    const parts = row.includes('\t') ? row.split('\t').map((p) => p.trim()).filter(Boolean) : row.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const rawName = parts[0];
    const rangeMatch = row.match(/(\d+[.,]?\d*)\s*[–-]\s*(\d+[.,]?\d*)\s*EUR\/kg/);
    const singleMatch = row.match(/(\d+[.,]?\d*)\s*EUR\/kg/);
    const parsedMax = rangeMatch ? coerceFiniteNumber(rangeMatch[2]) : null;
    const parsedMin = rangeMatch ? coerceFiniteNumber(rangeMatch[1]) : (singleMatch ? coerceFiniteNumber(singleMatch[1]) : null);
    const kaina = parsedMin !== null && parsedMax !== null ? (parsedMin + parsedMax) / 2 : parsedMin;
    if (kaina === null) continue;

    const codeInName = rawName.match(/\[([A-Za-z0-9-]+)\]/)?.[1] || '';
    const normalizedMaterialName = normalizeName(rawName.replace(/\[[^\]]+\]/g, '').trim());
    const artikulas = byCode.get(codeInName.toLowerCase()) || byName.get(normalizedMaterialName) || null;
    if (!artikulas || seen.has(artikulas)) continue;

    predictions.push({
      artikulas,
      kaina,
      data: fallbackDate,
      reasoning: 'Prognozė išgauta iš markdown lentelės.',
    });
    seen.add(artikulas);
  }

  return predictions;
}

export function parseForecastsFromNarrativeText(text: string, medziagas: Medžiaga[], fallbackDate: string): AiPrediction[] {
  if (!text) return [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const normalizedLines = lines.map((line) => normalizeName(line));
  const predictions: AiPrediction[] = [];
  const rangeRegex = /(\d+[.,]?\d*)\s*[–-]\s*(\d+[.,]?\d*)\s*EUR\/kg/i;
  const singleRegex = /(\d+[.,]?\d*)\s*EUR\/kg/i;

  for (const material of medziagas) {
    const materialNameNorm = normalizeName(material.pavadinimas);
    const codeNorm = normalizeName(material.artikulas);
    const idx = normalizedLines.findIndex((lineNorm) => (
      lineNorm.includes(materialNameNorm) ||
      materialNameNorm.includes(lineNorm) ||
      lineNorm.includes(codeNorm)
    ));
    if (idx < 0) continue;

    const window = lines.slice(idx, Math.min(lines.length, idx + 10));
    let kaina: number | null = null;
    for (const row of window) {
      const rangeMatch = row.match(rangeRegex);
      if (rangeMatch) {
        const min = coerceFiniteNumber(rangeMatch[1]);
        const max = coerceFiniteNumber(rangeMatch[2]);
        if (min !== null && max !== null) {
          kaina = (min + max) / 2;
          break;
        }
      }
      const single = row.match(singleRegex);
      if (single) {
        const value = coerceFiniteNumber(single[1]);
        if (value !== null) {
          kaina = value;
        }
      }
    }
    if (kaina === null) continue;
    predictions.push({
      artikulas: material.artikulas,
      kaina,
      data: fallbackDate,
      reasoning: 'Prognozė išgauta iš naratyvinio teksto fallback.',
    });
  }
  return predictions;
}
