import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Pencil, RefreshCw, Loader2, X, Upload,
  Globe, TrendingUp, Sparkles, BarChart2, AlertTriangle, Check, LineChart as LineChartIcon, FileText, Save, Eye, ArrowRight, Lock, Unlock, ChevronDown,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot,
  CartesianGrid,
} from 'recharts';
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';
import {
  fetchMedziagas, fetchIstorija,
  insertMedžiaga, updateMedžiaga, deleteMedžiaga,
  insertIrašas, updateIrašas, deleteIrašas,
  fetchGeneralAnalysis, saveGeneralAnalysis,
  fetchLatestMaterialForecasts, saveMaterialForecasts,
  bulkInsertMedziagas, bulkInsertIstorija,
  formatPrice, relativeTime, computePrediction,
} from '../lib/kainosService';
import type { Medžiaga, KainuIrašas, PrognozėInternetas, ComputedPrediction } from '../lib/kainosService';
import {
  fetchSablonai, createSablonas, updateSablonas, deleteSablonas, generateStructuredJson,
} from '../lib/sablonaiService';
import type { MedziaguSablonas } from '../lib/sablonaiService';
import MaterialSlateView from './MaterialSlateView';
import { renderMarkdown as renderMarkdownHtml } from './analize/markdownRenderer';

interface KainosInterfaceProps { user: AppUser; }

const ANALYTICS_MODEL = 'claude-sonnet-4-5';
function formatPriceDataForPrompt(meds: Medžiaga[], hist: KainuIrašas[]): string {
  if (!meds.length || !hist.length) return 'Nėra kainų duomenų.';
  const lines: string[] = [];
  for (const m of meds) {
    const entries = hist.filter(e => e.artikulas === m.artikulas).sort((a, b) => a.data.localeCompare(b.data));
    if (!entries.length) continue;
    const row = entries.map(e => `${e.data}: ${formatPrice(e)}`).join(' | ');
    lines.push(`${m.pavadinimas} [${m.artikulas}] (${m.vienetas}): ${row}`);
  }
  return lines.join('\n');
}

function truncatePromptSection(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[sutrumpinta dėl ilgio: ${text.length - maxChars} simbolių]`;
}

function formatLatestPricesForPrompt(meds: Medžiaga[], hist: KainuIrašas[]): string {
  if (!meds.length || !hist.length) return 'Nėra kainų duomenų.';
  return meds
    .map((m) => {
      const latest = hist
        .filter((e) => e.artikulas === m.artikulas && e.kaina_min != null)
        .sort((a, b) => b.data.localeCompare(a.data))[0];
      if (!latest) return `- ${m.artikulas} (${m.pavadinimas}): nėra kainos`;
      return `- ${m.artikulas} (${m.pavadinimas}): ${formatPrice(latest)} @ ${latest.data}`;
    })
    .join('\n');
}

function formatTrendDataForPrompt(meds: Medžiaga[], hist: KainuIrašas[]): string {
  if (!meds.length || !hist.length) return 'Tendencijai nepakanka duomenų.';
  return meds
    .map((m) => {
      const entries = hist
        .filter((e) => e.artikulas === m.artikulas && e.kaina_min != null)
        .sort((a, b) => a.data.localeCompare(b.data));
      if (entries.length < 2) return `- ${m.artikulas}: nepakanka istorijos trendui`;
      const first = Number(entries[0].kaina_min);
      const last = Number(entries[entries.length - 1].kaina_min);
      if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return `- ${m.artikulas}: trendas nenustatytas`;
      const deltaPct = ((last - first) / first) * 100;
      const dir = deltaPct > 0.5 ? 'kylanti' : deltaPct < -0.5 ? 'krentanti' : 'stabili';
      return `- ${m.artikulas}: ${dir}, pokytis ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}% (${entries[0].data} → ${entries[entries.length - 1].data})`;
    })
    .join('\n');
}

function addMonthsISO(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m - 1) + months, d));
  return dt.toISOString().split('T')[0];
}
// ---------------------------------------------------------------------------
// Modal: Add / Edit Material
// ---------------------------------------------------------------------------

interface AddMaterialModalProps {
  initial?: Medžiaga;
  onSave: (artikulas: string, pavadinimas: string, vienetas: string) => Promise<void>;
  onClose: () => void;
}

function AddMaterialModal({ initial, onSave, onClose }: AddMaterialModalProps) {
  const [artikulas, setArtikulas] = useState(initial?.artikulas ?? '');
  const [pavadinimas, setPavadinimas] = useState(initial?.pavadinimas ?? '');
  const [vienetas, setVienetas] = useState(initial?.vienetas ?? 'Eur/kg');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artikulas.trim() || !pavadinimas.trim()) return;
    setSaving(true);
    try { await onSave(artikulas.trim(), pavadinimas.trim(), vienetas.trim() || 'Eur/kg'); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #f0ede8' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
            {initial ? 'Redaguoti medžiagą' : 'Nauja medžiaga'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Artikulas (ID)</label>
            <input autoFocus={!initial} value={artikulas} onChange={e => setArtikulas(e.target.value)}
              disabled={!!initial} placeholder="pvz. DER-001"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-60"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Pavadinimas</label>
            <input autoFocus={!!initial} value={pavadinimas} onChange={e => setPavadinimas(e.target.value)}
              placeholder="pvz. derva rankiniam f." className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Vienetas</label>
            <input value={vienetas} onChange={e => setVienetas(e.target.value)} placeholder="Eur/kg"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg"
              style={{ color: '#5a5550', background: 'rgba(0,0,0,0.04)' }}>Atšaukti</button>
            <button type="submit" disabled={saving || !artikulas.trim() || !pavadinimas.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-60"
              style={{ background: '#007AFF' }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Išsaugoti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: Add / Edit Price
// ---------------------------------------------------------------------------

interface PriceModalProps {
  medziagas: Medžiaga[];
  initial?: KainuIrašas;
  defaultArtikulas?: string;
  defaultDate?: string;
  onSave: (artikulas: string, data: string, min: number | null, max: number | null, notes: string | null) => Promise<void>;
  onClose: () => void;
}

function PriceModal({ medziagas, initial, defaultArtikulas, defaultDate, onSave, onClose }: PriceModalProps) {
  const [art, setArt] = useState<string>(
    initial?.artikulas ?? defaultArtikulas ?? (medziagas[0]?.artikulas ?? '')
  );
  const [data, setData] = useState(initial?.data ?? defaultDate ?? new Date().toISOString().split('T')[0]);
  const [isRange, setIsRange] = useState(
    !!(initial && initial.kaina_max !== null && initial.kaina_max !== initial.kaina_min)
  );
  const [kMin, setKMin] = useState(initial?.kaina_min != null ? String(initial.kaina_min) : '');
  const [kMax, setKMax] = useState(initial?.kaina_max != null ? String(initial.kaina_max) : '');
  const [notes, setNotes] = useState(initial?.pastabos ?? '');
  const [saving, setSaving] = useState(false);

  // Quick mode: both material and date are already known (clicked "+" in a specific cell)
  const quickMode = !!(defaultArtikulas && defaultDate && !initial);
  const matName = medziagas.find(m => m.artikulas === art)?.pavadinimas;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!art || !data) return;
    const min = kMin ? parseFloat(kMin) : null;
    const max = isRange && kMax ? parseFloat(kMax) : null;
    setSaving(true);
    try { await onSave(art, data, min, max, notes.trim() || null); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`w-full mx-4 bg-white rounded-2xl overflow-hidden ${quickMode ? 'max-w-sm' : 'max-w-md'}`}
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0ede8' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
              {initial ? 'Redaguoti kainą' : quickMode ? 'Pridėti kainą' : 'Nauja kaina'}
            </h3>
            {quickMode && matName && (
              <p className="text-xs mt-0.5" style={{ color: '#8a857f' }}>{matName} · {data}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {!quickMode && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Medžiaga</label>
              <select value={art} onChange={e => setArt(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}>
                {medziagas.map(m => <option key={m.artikulas} value={m.artikulas}>{m.pavadinimas} ({m.artikulas})</option>)}
              </select>
            </div>
          )}
          {!quickMode && (
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
            </div>
          )}
          <div className="flex gap-2">
            {(['exact', 'range'] as const).map(t => (
              <button key={t} type="button" onClick={() => setIsRange(t === 'range')}
                className="flex-1 py-1.5 text-xs rounded-lg font-medium transition-all"
                style={{ background: (isRange ? t === 'range' : t === 'exact') ? '#007AFF' : 'rgba(0,0,0,0.04)',
                         color: (isRange ? t === 'range' : t === 'exact') ? 'white' : '#5a5550' }}>
                {t === 'exact' ? 'Tiksli kaina' : 'Diapazonas'}
              </button>
            ))}
          </div>
          <div className={`grid gap-2 ${isRange ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>
                {isRange ? 'Nuo (Eur/kg)' : 'Kaina (Eur/kg)'}
              </label>
              <input type="number" step="0.01" value={kMin} onChange={e => setKMin(e.target.value)}
                placeholder="pvz. 2.50" className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
            </div>
            {isRange && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Iki (Eur/kg)</label>
                <input type="number" step="0.01" value={kMax} onChange={e => setKMax(e.target.value)}
                  placeholder="pvz. 2.81" className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                  style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Pastabos</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="pvz. ???"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg"
              style={{ color: '#5a5550', background: 'rgba(0,0,0,0.04)' }}>Atšaukti</button>
            <button type="submit" disabled={saving || !art || !data}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-60"
              style={{ background: '#007AFF' }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Išsaugoti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grafa Tab — per-material line charts with prediction
// ---------------------------------------------------------------------------

interface ChartPoint {
  date: string;       // YYYY-MM-DD
  label: string;      // MM-DD for display
  kaina: number | null;
  predicted?: number;
  aiPredicted?: number;
}

interface AiPrediction {
  artikulas: string;
  kaina: number;
  data: string;
  reasoning: string;
  confidence?: number;
  currentPrice?: number;
  oilImpactPercent?: number;
  oilCurrentPrice?: number;
  oil3mForecastChangePercent?: number;
  citations?: { title: string; url: string; citedText?: string }[];
}

interface AiMaterialForecastResponse {
  name: string;
  current_price?: number;
  forecast_3m_price?: number;
  oil_impact_percent?: number;
}

interface AiForecastResponsePayload {
  oil_current_price?: number;
  oil_3m_forecast_change_percent?: number;
  materials?: AiMaterialForecastResponse[];
}

interface AnalysisForecastResponsePayload {
  analysis_markdown?: string;
  forecasts?: Array<{
    artikulas?: string;
    kaina?: number;
    data?: string;
    confidence?: number;
    reasoning?: string;
  }>;
}

interface ExtractedCitation {
  title: string;
  url: string;
  citedText?: string;
}

interface ExtractedResponseText {
  text: string;
  citations: ExtractedCitation[];
}

interface AnalysisSectionMeta {
  confidence: number;
  citations: ExtractedCitation[];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractJsonPayload(text: string): unknown {
  const stripped = text
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // fallback to broad block extraction for partially wrapped responses
  }

  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // continue
    }
  }

  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]);
  }

  throw new Error('AI negrąžino atpažįstamo JSON');
}

function extractTextAndCitationsFromMessage(contentBlocks: any[]): ExtractedResponseText {
  let text = '';
  const citations: ExtractedCitation[] = [];

  for (const block of contentBlocks || []) {
    if (block?.type !== 'text') continue;
    if (typeof block.text === 'string') {
      text += `${block.text}\n`;
    }
    if (Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        const title = citation?.title || citation?.document_title || 'Šaltinis';
        const url = citation?.url || citation?.source_url;
        const citedText = citation?.cited_text;
        if (url && !citations.some(c => c.url === url && c.title === title)) {
          citations.push({ title: String(title), url: String(url), citedText: citedText ? String(citedText) : undefined });
        }
      }
    }
  }

  return { text: text.trim(), citations };
}

function normalizeAnalysisForecasts(payload: unknown, medziagas: Medžiaga[], fallbackDate: string): AiPrediction[] {
  const byCode = new Map(medziagas.map(m => [m.artikulas.toLowerCase(), m.artikulas]));
  const byName = new Map(medziagas.map(m => [normalizeName(m.pavadinimas), m.artikulas]));
  const resolved = (value: string): string | null => {
    const direct = byCode.get(value.toLowerCase());
    if (direct) return direct;
    return byName.get(normalizeName(value)) || null;
  };

  const toPred = (item: any): AiPrediction | null => {
    const key = typeof item?.artikulas === 'string' ? item.artikulas : typeof item?.name === 'string' ? item.name : null;
    if (!key) return null;
    const artikulas = resolved(key);
    if (!artikulas) return null;
    const kaina = Number(item?.kaina);
    if (!Number.isFinite(kaina)) return null;
    const confidence = Number(item?.confidence);
    return {
      artikulas,
      kaina,
      data: typeof item?.data === 'string' ? item.data : fallbackDate,
      reasoning: typeof item?.reasoning === 'string' ? item.reasoning : 'Prognozė pagal naftos ir geopolitinį kontekstą.',
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : undefined,
    };
  };

  if (Array.isArray(payload)) {
    return payload.map(toPred).filter(Boolean) as AiPrediction[];
  }
  const parsed = payload as AnalysisForecastResponsePayload;
  const list = Array.isArray(parsed?.forecasts) ? parsed.forecasts : [];
  return list.map(toPred).filter(Boolean) as AiPrediction[];
}

function sanitizePredictionAgainstHistory(aiPred: AiPrediction, lastActualPrice: number): AiPrediction {
  const MAX_CHANGE_PERCENT = 35;
  const max = lastActualPrice * (1 + MAX_CHANGE_PERCENT / 100);
  const min = lastActualPrice * (1 - MAX_CHANGE_PERCENT / 100);
  const boundedPrice = Math.min(max, Math.max(min, aiPred.kaina));
  if (boundedPrice === aiPred.kaina) return aiPred;

  return {
    ...aiPred,
    kaina: boundedPrice,
    reasoning: `${aiPred.reasoning} Prognozė apribota saugumo riba ±${MAX_CHANGE_PERCENT}% nuo paskutinės kainos.`,
    confidence: Math.min(100, Math.max(0, (aiPred.confidence ?? 70) - 10)),
  };
}

function computeAiAdjustedPrice(aiPred: AiPrediction, fallbackCurrent: number): number {
  const current = Number.isFinite(aiPred.currentPrice) ? Number(aiPred.currentPrice) : fallbackCurrent;
  const oilImpact = Number(aiPred.oilImpactPercent);
  const oilAdjusted = Number.isFinite(oilImpact)
    ? current * (1 + oilImpact / 100)
    : null;

  if (oilAdjusted !== null) {
    return (aiPred.kaina * 0.7) + (oilAdjusted * 0.3);
  }

  return aiPred.kaina;
}

// ---------------------------------------------------------------------------
// SablonaiTab – CRUD for material slate templates
// ---------------------------------------------------------------------------

function SablonaiTab() {
  const [sablonai, setSablonai] = useState<MedziaguSablonas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [capacityFilter, setCapacityFilter] = useState('');
  const [draftCard, setDraftCard] = useState<{
    localId: string;
    id: number | null;
    name: string;
    rawText: string;
    isSaving: boolean;
    saveError: string | null;
  } | null>(null);
  const [showSavedHint, setShowSavedHint] = useState(false);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Generate / structurize
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSablonai(await fetchSablonai());
    } catch (err: any) {
      setError(err?.message || 'Nepavyko gauti duomenų');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setExpandedCards(prev => {
      const next = { ...prev };
      for (const s of sablonai) {
        const key = String(s.id);
        if (!(key in next)) next[key] = false;
      }
      return next;
    });
  }, [sablonai]);

  useEffect(() => {
    if (!draftCard) return;
    const timer = window.setTimeout(() => {
      draftTextareaRef.current?.focus();
      draftTextareaRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftCard?.localId]);

  useEffect(() => {
    const shouldWarn = !!draftCard && (draftCard.isSaving || (!!draftCard.rawText.trim() && !draftCard.id));
    if (!shouldWarn) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draftCard]);

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const willExpand = !prev[id];
      if (!willExpand) return { ...prev, [id]: false };
      const collapsed: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) collapsed[key] = false;
      collapsed[id] = true;
      return collapsed;
    });
  };

  const startNew = () => {
    if (draftCard) {
      setExpandedCards(prev => {
        const collapsed: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) collapsed[key] = false;
        collapsed[draftCard.localId] = true;
        return collapsed;
      });
      draftTextareaRef.current?.focus();
      return;
    }

    const localId = `new-${Date.now()}`;
    setDraftCard({ localId, id: null, name: '', rawText: '', isSaving: false, saveError: null });
    setExpandedCards(prev => {
      const collapsed: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) collapsed[key] = false;
      collapsed[localId] = true;
      return collapsed;
    });
  };

  const filteredSablonai = useMemo(() => {
    const normalized = capacityFilter.trim();
    if (!normalized) return sablonai;
    return sablonai.filter(s => {
      const title = s.name
        .normalize('NFKC')
        .replace(/[–—]/g, '-');

      // Primary: V + capacity in any spacing/hyphen format (e.g. V-230, V - 230, V- 230, V230)
      const vMatches = Array.from(title.matchAll(/v\s*[-]?\s*(\d+)/gi)).map(m => m[1]);
      if (vMatches.includes(normalized)) return true;

      // Fallback: plain numeric token match, if title was entered without V prefix
      return new RegExp(`\\b${normalized}\\b`).test(title);
    });
  }, [sablonai, capacityFilter]);

  const upsertLocalTemplate = useCallback((next: Partial<MedziaguSablonas> & { id: number }) => {
    setSablonai(prev => {
      const i = prev.findIndex(s => s.id === next.id);
      if (i === -1) return [next as MedziaguSablonas, ...prev];
      const copy = [...prev];
      copy[i] = { ...copy[i], ...next };
      return copy;
    });
  }, []);

  useEffect(() => {
    if (!draftCard) return;
    const rawText = draftCard.rawText.trim();
    if (!rawText) return;

    const timer = window.setTimeout(async () => {
      const inferredName = draftCard.name.trim() || rawText.split('\n')[0].trim() || 'Naujas šablonas';
      setDraftCard(prev => prev ? { ...prev, isSaving: true, saveError: null, name: inferredName } : prev);
      try {
        if (!draftCard.id) {
          const created = await createSablonas({ name: inferredName, raw_text: rawText, structured_json: null });
          setDraftCard(prev => prev ? { ...prev, id: created.id, isSaving: false } : prev);
          upsertLocalTemplate(created);
          setShowSavedHint(true);
        } else {
          await updateSablonas(draftCard.id, { name: inferredName, raw_text: rawText });
          setDraftCard(prev => prev ? { ...prev, isSaving: false } : prev);
          upsertLocalTemplate({ id: draftCard.id, name: inferredName, raw_text: rawText });
          setShowSavedHint(true);
        }
      } catch (err: any) {
        setDraftCard(prev => prev ? { ...prev, isSaving: false, saveError: err?.message || 'Nepavyko automatiškai išsaugoti' } : prev);
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [draftCard?.rawText, draftCard?.name, draftCard?.id, upsertLocalTemplate]);

  useEffect(() => {
    if (!showSavedHint) return;
    const timer = window.setTimeout(() => setShowSavedHint(false), 1200);
    return () => window.clearTimeout(timer);
  }, [showSavedHint]);

  const handleViewGenerate = async (s: MedziaguSablonas) => {
    setGenerating(true);
    setGeneratingId(s.id);
    setFormError(null);
    try {
      const json = await generateStructuredJson(s.raw_text.trim());
      await updateSablonas(s.id, { structured_json: json });
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Nepavyko sugeneruoti struktūros');
    } finally {
      setGenerating(false);
      setGeneratingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await deleteSablonas(id);
      setConfirmDeleteId(null);
      await loadData();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleFinishDraft = async () => {
    if (!draftCard) return;
    const rawText = draftCard.rawText.trim();
    if (!rawText) {
      setDraftCard(null);
      return;
    }

    const inferredName = draftCard.name.trim() || rawText.split('\n')[0].trim() || 'Naujas šablonas';
    setDraftCard(prev => prev ? { ...prev, isSaving: true, saveError: null, name: inferredName } : prev);
    try {
      let targetId = draftCard.id;
      if (!targetId) {
        const created = await createSablonas({ name: inferredName, raw_text: rawText, structured_json: null });
        targetId = created.id;
        upsertLocalTemplate(created);
      } else {
        await updateSablonas(targetId, { name: inferredName, raw_text: rawText });
        upsertLocalTemplate({ id: targetId, name: inferredName, raw_text: rawText });
      }
      setDraftCard(null);
      if (targetId) {
        setExpandedCards(prev => {
          const collapsed: Record<string, boolean> = {};
          for (const key of Object.keys(prev)) collapsed[key] = false;
          collapsed[String(targetId)] = true;
          return collapsed;
        });
      }
      setShowSavedHint(false);
    } catch (err: any) {
      setDraftCard(prev => prev ? { ...prev, isSaving: false, saveError: err?.message || 'Nepavyko išsaugoti' } : prev);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#007AFF' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>
          <AlertTriangle className="w-4 h-4 inline mr-2" />{error}
        </div>
      )}

      {formError && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>
          {formError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-base-content/10 bg-base-100 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <p className="text-sm text-base-content/60">{filteredSablonai.length} / {sablonai.length} šablonai</p>
          <label className="inline-flex items-center gap-1.5 text-xs text-base-content/55 rounded-lg border border-base-content/10 px-2 py-1 bg-white/70">
            <span className="font-medium">V-</span>
            <input
              value={capacityFilter}
              onChange={e => setCapacityFilter(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="talpa"
              className="w-14 bg-transparent outline-none"
              aria-label="Filtruoti pagal talpą"
            />
          </label>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-base-content/75 border border-base-content/15 bg-white/65 backdrop-blur-sm transition-all duration-200 hover:bg-white/80"
        >
          <Plus className="w-3.5 h-3.5" />Naujas šablonas
        </button>
      </div>

      {/* Templates list */}
      {filteredSablonai.length === 0 && !draftCard ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-10 h-10 mb-3" style={{ color: '#d1cdc7' }} />
          <p className="text-sm font-medium" style={{ color: '#8a857f' }}>{capacityFilter ? 'Nėra šablonų pagal šį V- filtrą' : 'Nėra medžiagų šablonų'}</p>
          <p className="text-xs mt-1" style={{ color: '#b5b0aa' }}>{capacityFilter ? 'Pakeiskite V- filtro reikšmę' : 'Sukurkite pirmą šabloną paspaudę „Naujas šablonas"'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,360px))] justify-center items-start gap-3">
          {draftCard && (
            <div
              key={draftCard.localId}
              className="rounded-xl border p-3.5 transition-all min-h-[160px] flex flex-col"
              style={{
                borderColor: '#007AFF',
                background: 'rgba(0,122,255,0.04)',
                boxShadow: '0 0 0 1px rgba(0,122,255,0.12) inset',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={draftCard.name}
                    onChange={e => setDraftCard(prev => prev ? { ...prev, name: e.target.value } : prev)}
                    placeholder="Šablono pavadinimas..."
                    className="text-sm font-semibold bg-transparent border-b outline-none w-full py-0.5 transition-colors focus:border-blue-400"
                    style={{ color: '#3d3935', borderColor: '#e5e2dd' }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {draftCard.id && (
                    <button
                      onClick={handleFinishDraft}
                      disabled={draftCard.isSaving}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-base-content/15 bg-white/70 hover:bg-white disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      Baigti
                    </button>
                  )}
                  <button
                    onClick={() => toggleCard(draftCard.localId)}
                    className="p-1 text-base-content/60 hover:text-base-content"
                    title={expandedCards[draftCard.localId] ? 'Sutraukti' : 'Išskleisti'}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedCards[draftCard.localId] ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {expandedCards[draftCard.localId] && (
                <div className="mt-2 rounded-lg p-2.5 border border-base-content/8 bg-base-content/[0.015] flex-1 overflow-hidden">
                  <textarea
                    ref={draftTextareaRef}
                    value={draftCard.rawText}
                    onChange={e => setDraftCard(prev => prev ? { ...prev, rawText: e.target.value } : prev)}
                    placeholder="Įveskite medžiagų aprašymą..."
                    rows={8}
                    className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono transition-colors focus:border-blue-400 resize-y"
                    style={{ borderColor: '#e5e2dd', color: '#3d3935', lineHeight: '1.6', background: '#fff' }}
                  />
                  <div className="mt-2 min-h-[16px]">
                    {draftCard.isSaving ? (
                      <p className="text-[11px] text-base-content/55">Išsaugoma...</p>
                    ) : showSavedHint ? (
                      <p className="text-[11px]" style={{ color: '#34C759' }}>Išsaugota</p>
                    ) : null}
                    {draftCard.saveError && (
                      <p className="text-xs mt-1" style={{ color: '#FF3B30' }}>{draftCard.saveError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredSablonai.map(s => {
            const cardKey = String(s.id);
            const isExpanded = !!expandedCards[cardKey];

            return (
              <div
                key={s.id}
                className={`group rounded-xl border p-3.5 transition-all flex flex-col ${isExpanded ? 'min-h-[180px]' : 'min-h-[60px]'}`}
                style={{
                  borderColor: 'rgba(0,0,0,0.06)',
                  background: '#fff',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-sm font-semibold truncate" style={{ color: '#3d3935' }}>{s.name}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    {!s.structured_json && isExpanded && (
                      <button
                        onClick={() => handleViewGenerate(s)}
                        disabled={generating}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-base-content/75 border border-base-content/15 bg-white/65 backdrop-blur-sm transition-all duration-200 hover:bg-white/80 disabled:opacity-60"
                      >
                        {generating && generatingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Strūkturizuoti
                      </button>
                    )}
                    <button onClick={() => setConfirmDeleteId(s.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-base-content/10 bg-white/65 backdrop-blur-sm hover:bg-white/80" title="Ištrinti">
                      <Trash2 className="w-3.5 h-3.5 text-base-content/55" />
                    </button>
                    <button
                      onClick={() => toggleCard(cardKey)}
                      className="p-1 text-base-content/60 hover:text-base-content"
                      title={isExpanded ? 'Sutraukti' : 'Išskleisti'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 rounded-lg p-2.5 border border-base-content/8 bg-base-content/[0.015] flex-1 overflow-hidden">
                    {s.structured_json ? (
                      <div className="max-h-[320px] overflow-y-auto">
                        <MaterialSlateView data={s.structured_json} variant="panel" />
                      </div>
                    ) : (
                      <p
                        className="text-[11px] whitespace-pre-wrap break-words leading-relaxed"
                        style={{
                          color: '#5a5550',
                          display: '-webkit-box',
                          WebkitLineClamp: 10,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {s.raw_text || 'Nėra teksto'}
                      </p>
                    )}
                  </div>
                )}

                {/* Delete confirmation */}
                {confirmDeleteId === s.id && (
                  <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid #f0ede8' }}>
                    <span className="text-xs" style={{ color: '#FF3B30' }}>Ištrinti šį šabloną?</span>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting}
                      className="text-xs px-3 py-1 rounded-lg text-white disabled:opacity-50" style={{ background: '#FF3B30' }}>
                      {deleting ? 'Trinama...' : 'Taip'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-3 py-1 rounded-lg" style={{ color: '#8a857f' }}>Ne</button>
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}


function GrafaTab({ medziagas, istorija, analytics, onError }: { medziagas: Medžiaga[]; istorija: KainuIrašas[]; analytics: PrognozėInternetas | null; onError?: (msg: string) => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const [aiToggle, setAiToggle] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPredictions, setAiPredictions] = useState<AiPrediction[]>([]);
  const [aiResponseCitations, setAiResponseCitations] = useState<ExtractedCitation[]>([]);
  // Close on outside click
  useEffect(() => {
    if (!showInfo) return;
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showInfo]);

  // Fetch AI predictions when toggle is enabled
  const fetchAiPredictions = useCallback(async () => {
    if (aiLoading || medziagas.length === 0) return;
    setAiLoading(true);
    try {
      const sharedForecasts = await fetchLatestMaterialForecasts();
      const forecastMap = new Map(sharedForecasts.map(f => [f.artikulas, f]));
      const loaded = medziagas
        .map((m) => {
          const row = forecastMap.get(m.artikulas);
          if (!row) return null;
          return {
            artikulas: row.artikulas,
            kaina: row.kaina_min,
            data: row.data,
            reasoning: 'Prognozė iš Analizė skilties',
            confidence: row.pasitikejimas ?? undefined,
            citations: [],
          } as AiPrediction;
        })
        .filter(Boolean) as AiPrediction[];

      if (loaded.length === 0) {
        onError?.('Nėra išsaugotų AI prognozių. Pirmiausia sugeneruokite analizę.');
        setAiToggle(false);
        return;
      }

      const normalizedPredictions = loaded;

      const sanitized = normalizedPredictions.map(pred => {
        const historyEntries = istorija
          .filter(e => e.artikulas === pred.artikulas && e.kaina_min != null)
          .sort((a, b) => b.data.localeCompare(a.data));
        const lastActual = historyEntries[0]?.kaina_min;
        return Number.isFinite(lastActual) ? sanitizePredictionAgainstHistory(pred, Number(lastActual)) : pred;
      });
      setAiPredictions(sanitized);
      setAiResponseCitations([]);
    } catch (err: any) {
      console.error('AI prediction error:', err);
      onError?.(err.message || 'Nepavyko gauti DI prognozės');
      setAiToggle(false);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, medziagas, istorija, onError]);

  useEffect(() => {
    if (aiToggle && aiPredictions.length === 0 && !aiLoading) {
      fetchAiPredictions();
    }
  }, [aiToggle]);

  // Group history by artikulas
  const byArt = useMemo(() => {
    const map = new Map<string, KainuIrašas[]>();
    for (const e of istorija) {
      const arr = map.get(e.artikulas) || [];
      arr.push(e);
      map.set(e.artikulas, arr);
    }
    return map;
  }, [istorija]);

  // Build chart data per material
  const charts = useMemo(() => {
    return medziagas.map(m => {
      const entries = (byArt.get(m.artikulas) || [])
        .filter(e => e.kaina_min !== null)
        .sort((a, b) => a.data.localeCompare(b.data));

      if (entries.length === 0) return null;

      const prediction = computePrediction(entries);

      // Build chart points from actual data
      const points: ChartPoint[] = entries.map(e => ({
        date: e.data,
        label: e.data, // full YYYY-MM-DD for axis
        kaina: e.kaina_min,
        predicted: undefined,
      }));

      // Add prediction point
      if (prediction) {
        // Add a bridge point at the last real data point with predicted value to start the dashed line
        const lastPoint = points[points.length - 1];
        points.push({
          date: lastPoint.date,
          label: lastPoint.date,
          kaina: lastPoint.kaina,
          predicted: lastPoint.kaina!,
        });
        points.push({
          date: prediction.data,
          label: prediction.data,
          kaina: null,
          predicted: (prediction.kaina_min + prediction.kaina_max) / 2,
        });
      }

      // Add AI prediction point if toggle is on
      const aiPred = aiToggle ? aiPredictions.find(p => p.artikulas === m.artikulas) : null;
      if (aiPred && aiPred.kaina > 0) {
        const lastActual = [...points].reverse().find(p => p.kaina !== null);
        if (lastActual) {
          const adjustedAiValue = computeAiAdjustedPrice(aiPred, lastActual.kaina || aiPred.kaina);

          // Bridge from last actual to AI prediction
          const bridgeExists = points.some(p => p.date === lastActual.date && p.aiPredicted !== undefined);
          if (!bridgeExists) {
            points.push({
              date: lastActual.date,
              label: lastActual.date,
              kaina: lastActual.kaina,
              aiPredicted: lastActual.kaina!,
            });
          }
          points.push({
            date: aiPred.data,
            label: aiPred.data,
            kaina: null,
            aiPredicted: adjustedAiValue,
          });
        }
      }

      // Compute Y-axis domain
      const lastActualForDomain = [...points].reverse().find(p => p.kaina !== null);
      const allValues = [
        ...entries.map(e => e.kaina_min!),
        ...entries.filter(e => e.kaina_max != null).map(e => e.kaina_max!),
        ...(prediction ? [(prediction.kaina_min + prediction.kaina_max) / 2] : []),
        ...(aiPred && lastActualForDomain ? [computeAiAdjustedPrice(aiPred, lastActualForDomain.kaina || aiPred.kaina)] : []),
      ];
      const minY = Math.floor(Math.min(...allValues) * 0.95 * 100) / 100;
      const maxY = Math.ceil(Math.max(...allValues) * 1.05 * 100) / 100;

      return { material: m, entries, prediction, points, minY, maxY, aiPred };
    }).filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];
  }, [medziagas, byArt, aiToggle, aiPredictions]);

  if (charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <LineChartIcon className="w-10 h-10" style={{ color: '#d4cfc8' }} />
        <p className="text-sm" style={{ color: '#8a857f' }}>Nėra kainų duomenų grafams.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Prediction animations */}
      <style>{`
        @keyframes predPulse {
          0%, 100% { r: 5; opacity: 1; filter: url(#predGlow); }
          50% { r: 7; opacity: 0.85; }
        }
        @keyframes predBadgeIn {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .prediction-dot {
          animation: predPulse 2.5s ease-in-out infinite;
          animation-delay: 2s;
        }
        .prediction-badge {
          animation: predBadgeIn 0.5s ease-out 1.8s both;
        }
      `}</style>

      {/* Controls row — centered toggle + info */}
      <div className="flex items-center justify-center gap-2 relative" ref={infoRef}>
        <button
          onClick={() => { if (!aiLoading) setAiToggle(!aiToggle); }}
          disabled={aiLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
          style={{
            background: aiToggle ? 'linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)' : 'rgba(0,0,0,0.04)',
            color: aiToggle ? 'white' : '#5a5550',
            border: `0.5px solid ${aiToggle ? 'transparent' : 'rgba(0,0,0,0.08)'}`,
          }}>
          {aiLoading ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Generuojama...</>
          ) : aiToggle ? 'Su DI' : 'Be DI'}
        </button>
        <div
          className="relative cursor-help"
          onMouseEnter={() => setShowInfo(true)}
          onMouseLeave={() => setShowInfo(false)}
        >
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#b0aba4' }} />
          {showInfo && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 w-80 bg-white rounded-xl overflow-hidden"
              style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #f0ede8' }}>
              <div className="px-4 py-3 space-y-2 text-xs leading-relaxed" style={{ color: '#5a5550' }}>
                <p><strong style={{ color: '#3d3935' }}>Be DI</strong> — grafikai rodo tik matematinę prognozę (svertinė tiesinė regresija pagal istorinius duomenis).</p>
                <p><strong style={{ color: '#7c3aed' }}>Su DI</strong> — papildomai rodoma DI prognozė (violetinė linija), kuri atsižvelgia į naftos kainas, geopolitinius įvykius, styreno rinką ir dabartines tiekimo sąlygas iš interneto.</p>
                <p style={{ color: '#b0aba4', fontSize: 10 }}>DI prognozei reikia sugeneruotos analizės (Analizė tab).</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {aiToggle && aiResponseCitations.length > 0 && (
        <div className="flex justify-center">
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'rgba(37,99,235,0.08)', color: '#1d4ed8' }}>
            Šaltiniai: {aiResponseCitations.length}
          </span>
        </div>
      )}

      {charts.map(({ material, entries, prediction, points, minY, maxY, aiPred }) => (
        <div key={material.artikulas} className="rounded-xl bg-white overflow-hidden"
          style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid #f0ede8' }}>
            <div>
              <span className="text-xs font-semibold" style={{ color: '#3d3935' }}>{material.pavadinimas}</span>
              <span className="text-[10px] ml-1.5" style={{ color: '#b0aba4' }}>{material.artikulas} · {material.vienetas}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: '#8a857f' }}>
                {entries.length} įraš{entries.length === 1 ? 'as' : 'ai'}
              </span>
              {prediction && (
                <span className="prediction-badge text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                  Prognozė {prediction.data}: {prediction.kaina_min.toFixed(2)}–{prediction.kaina_max.toFixed(2)}
                  <span className="ml-1 opacity-60">({Math.round(prediction.confidence * 100)}%)</span>
                </span>
              )}
              {aiPred && (
                <span className="prediction-badge text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}
                  title={aiPred.reasoning}>
                  AI {aiPred.data}: {aiPred.kaina.toFixed(2)}
                  {typeof aiPred.confidence === 'number' && (
                    <span className="ml-1 opacity-70">({Math.round(aiPred.confidence)}%)</span>
                  )}
                </span>
              )}
            </div>
          </div>
          {/* Chart */}
          <div className="px-2 py-3" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
              <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                <XAxis
                  dataKey="label"
                  tick={({ x, y, payload }: any) => {
                    const [yr, md] = (payload.value || '').split(/-(.+)/);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={10} textAnchor="middle" fontSize={8} fill="#b0aba4">{yr}</text>
                        <text x={0} y={0} dy={21} textAnchor="middle" fontSize={10} fill="#8a857f">{md}</text>
                      </g>
                    );
                  }}
                  height={35}
                  tickLine={false}
                  axisLine={{ stroke: '#f0ede8' }}
                />
                <YAxis
                  domain={[minY, maxY]}
                  tick={{ fontSize: 10, fill: '#8a857f' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v.toFixed(2)}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0ede8', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(value: number, name: string) => [
                    value?.toFixed(2),
                    name === 'aiPredicted' ? 'AI prognozė' : name === 'predicted' ? 'Prognozė' : 'Kaina',
                  ]}
                  labelFormatter={(label: string) => label}
                />
                {/* Actual price line */}
                <Line
                  type="monotone"
                  dataKey="kaina"
                  stroke="#3d3935"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3d3935', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#007AFF' }}
                  connectNulls={false}
                />
                {/* Prediction dashed line — delayed draw animation */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="url(#predGradient)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={true}
                  animationBegin={800}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                {/* AI prediction dashed line — purple */}
                {aiPred && (
                  <Line
                    type="monotone"
                    dataKey="aiPredicted"
                    stroke="url(#aiPredGradient)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={true}
                    animationBegin={1200}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                )}
                {/* Gradient + glow defs */}
                <defs>
                  <linearGradient id="predGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#007AFF" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#007AFF" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="aiPredGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={1} />
                  </linearGradient>
                  <filter id="predGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* Prediction endpoint — pulsing glow dot */}
                {prediction && points.length > 0 && (() => {
                  const predPoint = [...points].reverse().find(p => p.predicted !== undefined);
                  return predPoint ? (
                    <ReferenceDot x={predPoint.label} y={predPoint.predicted!} r={0} fill="transparent" stroke="transparent">
                      <circle r={5} fill="#007AFF" stroke="white" strokeWidth={2} filter="url(#predGlow)" className="prediction-dot" />
                    </ReferenceDot>
                  ) : null;
                })()}
                {/* AI prediction endpoint — purple dot */}
                {aiPred && (() => {
                  const aiPoint = [...points].reverse().find(p => p.aiPredicted !== undefined && p.kaina === null);
                  return aiPoint ? (
                    <ReferenceDot x={aiPoint.label} y={aiPoint.aiPredicted!} r={0} fill="transparent" stroke="transparent">
                      <circle r={5} fill="#7c3aed" stroke="white" strokeWidth={2} filter="url(#predGlow)" className="prediction-dot" />
                    </ReferenceDot>
                  ) : null;
                })()}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function KainosInterface({ user }: KainosInterfaceProps) {
  // ---- data state ----
  const [medziagas, setMedziagas] = useState<Medžiaga[]>([]);
  const [istorija, setIstorija] = useState<KainuIrašas[]>([]);
  const [analytics, setAnalytics] = useState<PrognozėInternetas | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lentele' | 'sablonai' | 'grafa' | 'analize'>(() => {
    const hash = window.location.hash.replace('#', '') as 'lentele' | 'sablonai' | 'grafa' | 'analize';
    return ['lentele', 'sablonai', 'grafa', 'analize'].includes(hash) ? hash : 'lentele';
  });

  // Persist active tab in URL hash
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // ---- Excel import state ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelPreview, setExcelPreview] = useState<{ mats: { artikulas: string; pavadinimas: string; vienetas: string }[]; prices: { artikulas: string; data: string; kaina_min: number | null; kaina_max: number | null; pastabos: string | null }[] } | null>(null);
  const [importing, setImporting] = useState(false);

  // ---- modal state ----
  const [showAddMat, setShowAddMat] = useState(false);
  const [editingMat, setEditingMat] = useState<Medžiaga | null>(null);
  const [showPriceMod, setShowPriceMod] = useState<{ defArt?: string; defDate?: string } | null>(null);
  const [editingIras, setEditingIras] = useState<KainuIrašas | null>(null);
  const [delMatArt, setDelMatArt] = useState<string | null>(null);
  const [delIrasId, setDelIrasId] = useState<number | null>(null);

  // ---- analytics gen state ----
  const [genLoading, setGenLoading] = useState(false);
  const [genStep, setGenStep] = useState<'idle' | 'nafta' | 'geo' | 'analysis'>('idle');
  const [streamNafta, setStreamNafta] = useState('');
  const [streamGeo, setStreamGeo] = useState('');
  const [streamAnalysis, setStreamAnalysis] = useState('');
  const [analysisMeta, setAnalysisMeta] = useState<{
    nafta: AnalysisSectionMeta;
    geo: AnalysisSectionMeta;
    analysis: AnalysisSectionMeta;
  }>({
    nafta: { confidence: 0, citations: [] },
    geo: { confidence: 0, citations: [] },
    analysis: { confidence: 0, citations: [] },
  });

  // ---- notifications ----
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const addNotif = (type: Notification['type'], title: string, message: string) => {
    const id = `n-${Date.now()}-${Math.random()}`;
    setNotifs(prev => [...prev, { id, type, title, message }]);
  };
  const removeNotif = (id: string) => setNotifs(prev => prev.filter(n => n.id !== id));

  // ---- computed pivot table data ----
  const dates = useMemo(() => {
    const all = [...new Set(istorija.map(e => e.data))];
    return all.sort((a, b) => b.localeCompare(a));
  }, [istorija]);

  const priceMatrix = useMemo(() => {
    const map = new Map<string, KainuIrašas>();
    for (const e of istorija) map.set(`${e.artikulas}-${e.data}`, e);
    return map;
  }, [istorija]);

  // ---- loadData ----
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [med, ist, ana] = await Promise.all([
        fetchMedziagas(), fetchIstorija(), fetchGeneralAnalysis(),
      ]);
      setMedziagas(med); setIstorija(ist); setAnalytics(ana);
      return { med, ist, ana };
    } catch (err: any) {
      addNotif('error', 'Klaida', err.message || 'Nepavyko įkelti duomenų');
      return { med: [], ist: [], ana: null };
    } finally { setLoading(false); }
  }, []);

  // ---- analytics generation (web search + citations + safety metadata) ----
  const generateAnalyticsFromData = useCallback(async (
    meds: Medžiaga[],
    hist: KainuIrašas[],
    sections: Array<'nafta' | 'geo' | 'analysis'> = ['nafta', 'geo', 'analysis']
  ) => {
    if (genLoading) return;
    setGenLoading(true);
    const targetSections = new Set(sections);
    if (targetSections.has('nafta')) setStreamNafta('');
    if (targetSections.has('geo')) setStreamGeo('');
    if (targetSections.has('analysis')) setStreamAnalysis('');
    const client = new Anthropic({
      apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true,
    });
    const today = new Date().toISOString().split('T')[0];
    const webSearchTool = [{ type: 'web_search_20260209', name: 'web_search' }] as any;
    const ANALYTICS_RETRY_ATTEMPTS = 2;
    const MAX_TOOL_TURNS = 2;
    const BETWEEN_STEP_DELAY_MS = 1500;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const runWebStep = async (params: {
      system: string;
      user: string;
      maxTokens: number;
    }): Promise<ExtractedResponseText> => {
      const msgs: Anthropic.MessageParam[] = [{ role: 'user', content: params.user }];
      let mergedText = '';
      let mergedCitations: ExtractedCitation[] = [];

      let turn = 0;
      while (true) {
        turn += 1;
        let response: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < ANALYTICS_RETRY_ATTEMPTS; attempt += 1) {
          try {
            response = await client.messages.create({
              model: ANALYTICS_MODEL,
              max_tokens: params.maxTokens,
              system: params.system,
              tools: webSearchTool,
              messages: msgs,
            });
            break;
          } catch (err: any) {
            lastError = err;
            const isRateLimited = err?.status === 429;
            if (!isRateLimited || attempt === ANALYTICS_RETRY_ATTEMPTS - 1) {
              throw err;
            }
            await sleep(2200 * (attempt + 1));
          }
        }
        if (!response) throw lastError || new Error('Nepavyko gauti atsakymo iš DI');

        const extracted = extractTextAndCitationsFromMessage(response.content as any[]);
        const isPauseTurn = response.stop_reason === 'pause_turn';
        if (!isPauseTurn || turn >= MAX_TOOL_TURNS) {
          if (extracted.text) mergedText = [mergedText, extracted.text].filter(Boolean).join('\n');
        }
        if (extracted.citations.length > 0) {
          const seen = new Set(mergedCitations.map(c => `${c.title}|${c.url}`));
          for (const citation of extracted.citations) {
            const key = `${citation.title}|${citation.url}`;
            if (!seen.has(key)) {
              mergedCitations.push(citation);
              seen.add(key);
            }
          }
        }
        if (!isPauseTurn || turn >= MAX_TOOL_TURNS) break;
        msgs.push({ role: 'assistant', content: response.content as any });
      }

      return {
        text: mergedText.trim(),
        citations: mergedCitations,
      };
    };

    try {
      let naftaText = analytics?.nafta || '';
      let geoText = analytics?.geoevents || '';
      let analysisText = analytics?.content || '';

      if (targetSections.has('nafta')) {
        // -- Step 1: Oil prices (Brent crude + Eastern Europe) --
        setGenStep('nafta');
        const naftaResult = await runWebStep({
          maxTokens: 700,
          system: `Naftos ir žaliavų rinkos analitikas. Visada atsakykite lietuvių kalba su konkrečiais skaičiais. Šiandien: ${today}.`,
          user: `Šiandien yra ${today}. Ieškokite internete dabartinių naftos kainų ir pateikite:

1. **Brent žalia nafta** — dabartinė kaina (USD/bbl ir EUR/bbl), savaitės ir mėnesio pokytis procentais
2. **Rytų Europos kontekstas** — kaip naftos kainos veikia regioną (Baltijos šalys, Lenkija), energijos kainos, transporto sąnaudos
3. **Nafta → dervos ryšys** — kaip dabartinės naftos kainos veikia poliestetinių ir epoksidinių dervų gamybos sąnaudas. Dervos yra naftos perdirbimo produktai (styrenas, propileno glikolis, epichlorhidrinas), todėl naftos kainų pokyčiai tiesiogiai veikia dervų kainas su 1-3 mėnesių vėlavimu.
4. **Styreno kaina** — jei randama, dabartinė styreno (pagrindinis poliestetinės dervos komponentas) kaina Europoje

Pateikite trumpai ir struktūruotai lietuvių kalba. Naudokite konkrečius skaičius.`,
        });
        naftaText = naftaResult.text;
        setStreamNafta(naftaText);
        setAnalysisMeta((prev) => ({
          ...prev,
          nafta: { confidence: Math.min(95, 40 + naftaResult.citations.length * 10), citations: naftaResult.citations },
        }));
        if (targetSections.has('geo') || targetSections.has('analysis')) {
          await sleep(BETWEEN_STEP_DELAY_MS);
        }
      }

      if (targetSections.has('geo')) {
        // -- Step 2: Geopolitical events --
        setGenStep('geo');
        const geoResult = await runWebStep({
          maxTokens: 550,
          system: `Rinkos žvalgybų analitikas. Atsakykite lietuvių kalba. Šiandien: ${today}.`,
          user: `Šiandien yra ${today}. Ieškokite internete naujausių geopolitinių įvykių, kurie gali turėti įtakos poliestetinėms dervoms, epoksidinėms dervoms (Derakane, Atlac), stiklo pluštui ir kompozitinių medžiagų kainoms. Sutelkite dėmesį į: naftos kainas, sankcijas, prekybos politiką, energijos kainas, tiekimo grandinės sutrikimus. 4-6 konkretūs biuletenų punktai lietuvių kalba.`,
        });
        geoText = geoResult.text;
        setStreamGeo(geoText);
        setAnalysisMeta((prev) => ({
          ...prev,
          geo: { confidence: Math.min(95, 40 + geoResult.citations.length * 10), citations: geoResult.citations },
        }));
        if (targetSections.has('analysis')) {
          await sleep(BETWEEN_STEP_DELAY_MS);
        }
      }

      if (targetSections.has('analysis')) {
        // -- Step 3: Material analysis + stable JSON forecasts (uses oil+geo context) --
        setGenStep('analysis');
        const priceData = truncatePromptSection(formatPriceDataForPrompt(meds, hist), 7000);
        const latestPrices = truncatePromptSection(formatLatestPricesForPrompt(meds, hist), 4500);
        const trendData = truncatePromptSection(formatTrendDataForPrompt(meds, hist), 4500);
        const boundedNaftaText = truncatePromptSection(naftaText, 2500);
        const boundedGeoText = truncatePromptSection(geoText, 2200);
        const materialList = meds.map(m => `- ${m.artikulas}: ${m.pavadinimas} (${m.vienetas})`).join('\n');
        const analysisResult = await runWebStep({
          maxTokens: 2200,
          system: `Patyrusi medžiagų kainų analitikė. Visada atsakykite TIK JSON. Šiandien: ${today}.`,
          user: `Šiandien yra ${today}. Įvertinkite žaliavų kainų prognozes remdamiesi:

1) Geopolitika (karai, tarifai, sankcijos, tiekimo sutrikimai)
2) Naftos kaina ir jos tendencijos
3) Medžiagų istorinėmis kainomis ir jų trendu

MEDŽIAGŲ SĄRAŠAS:
${materialList}

DABARTINĖS / PASKUTINĖS KAINOS:
${latestPrices}

KAINŲ TENDENCIJOS:
${trendData}

ISTORINIAI KAINŲ DUOMENYS:
${priceData}

NAFTOS KAINŲ KONTEKSTAS:
${boundedNaftaText}

GEOPOLITINIS KONTEKSTAS:
${boundedGeoText}

Privalomas atsakymo formatas (TIK JSON objektas, be jokio papildomo teksto):
{
  "analysis_markdown": "Trumpa analizė lietuvių kalba su aiškiais punktais.",
  "forecasts": [
    {
      "artikulas": "MEDZIAGOS_KODAS",
      "kaina": 1.23,
      "data": "YYYY-MM-DD",
      "confidence": 0-100,
      "reasoning": "Trumpas paaiškinimas."
    }
  ]
}

Taisyklės:
- "forecasts" turi turėti po vieną įrašą kiekvienai medžiagai iš sąrašo.
- "kaina" turi būti skaičius ir realistiška pagal trendą bei kontekstą.
- "data" turi būti ~3 mėn. nuo šiandien.
- Jei trūksta duomenų medžiagai, vis tiek grąžinkite įrašą su konservatyvia prognoze.`,
        });
        const fallbackDate = addMonthsISO(today, 3);
        let parsedForecasts: AiPrediction[] = [];
        try {
          const analysisPayload = extractJsonPayload(analysisResult.text);
          const parsed = analysisPayload as AnalysisForecastResponsePayload;
          parsedForecasts = normalizeAnalysisForecasts(analysisPayload, meds, fallbackDate);
          if (typeof parsed?.analysis_markdown === 'string' && parsed.analysis_markdown.trim()) {
            analysisText = parsed.analysis_markdown.trim();
          } else {
            analysisText = analysisResult.text;
          }
        } catch {
          analysisText = analysisResult.text;
          parsedForecasts = [];
        }

        let mergedForecasts: AiPrediction[] = [];
        if (parsedForecasts.length > 0) {
          mergedForecasts = meds.map((m) => {
            const aiPred = parsedForecasts.find(p => p.artikulas === m.artikulas);
            if (aiPred) return aiPred;
            const entries = hist
              .filter(e => e.artikulas === m.artikulas && e.kaina_min != null)
              .sort((a, b) => a.data.localeCompare(b.data));
            const math = computePrediction(entries);
            if (!math) return null;
            return {
              artikulas: m.artikulas,
              kaina: (math.kaina_min + math.kaina_max) / 2,
              data: math.data,
              reasoning: 'Papildyta atsargine matematine prognoze (trūko DI įrašo).',
              confidence: Math.round(math.confidence * 100),
            } as AiPrediction;
          }).filter(Boolean) as AiPrediction[];
        } else {
          addNotif('error', 'AI prognozės formatas', 'Nepavyko išgauti struktūruotų AI kainų prognozių. Grafui nebus atnaujinta AI serija.');
        }

        const sanitized = mergedForecasts.map((pred) => {
          const historyEntries = hist
            .filter(e => e.artikulas === pred.artikulas && e.kaina_min != null)
            .sort((a, b) => b.data.localeCompare(a.data));
          const lastActual = historyEntries[0]?.kaina_min;
          return Number.isFinite(lastActual) ? sanitizePredictionAgainstHistory(pred, Number(lastActual)) : pred;
        });

        setStreamAnalysis(analysisText);
        setAnalysisMeta((prev) => ({
          ...prev,
          analysis: { confidence: Math.min(95, 35 + analysisResult.citations.length * 8), citations: analysisResult.citations },
        }));

        if (sanitized.length > 0) {
          await saveMaterialForecasts(
            sanitized.map((item) => ({
              artikulas: item.artikulas,
              data: item.data,
              kaina_min: item.kaina,
              kaina_max: item.kaina,
              pasitikejimas: item.confidence ?? null,
            }))
          );
        }
      }

      await saveGeneralAnalysis(analysisText, geoText, naftaText);
      const freshAnalysis = await fetchGeneralAnalysis();
      setAnalytics(freshAnalysis);

      addNotif('success', 'Analizė atnaujinta', 'Sėkmingai sugeneruota');
    } catch (err: any) {
      console.error('Analytics error:', err);
      if (err?.status === 429) {
        addNotif(
          'error',
          'Viršytas DI limitas',
          'Anthropic limitas viršytas. Sumažinome užklausos dydį ir bandome pakartotinai, bet šiuo metu reikia palaukti 1-2 min. arba sumažinti analizuojamų duomenų kiekį.'
        );
      } else {
        addNotif('error', 'Klaida', err.message || 'Nepavyko sugeneruoti analizės');
      }
    } finally { setGenLoading(false); setGenStep('idle'); }
  }, [genLoading, analytics]);

  const generateAnalytics = useCallback(() =>
    generateAnalyticsFromData(medziagas, istorija), [generateAnalyticsFromData, medziagas, istorija]);
  const regenerateAnalysisSection = useCallback((section: 'nafta' | 'geo' | 'analysis') =>
    generateAnalyticsFromData(medziagas, istorija, [section]), [generateAnalyticsFromData, medziagas, istorija]);

  // ---- load data on mount (no auto-generation — manual button only) ----
  useEffect(() => { loadData(); }, []);

  // ---- CRUD handlers ----
  const handleAddMat = async (art: string, pav: string, vnt: string) => {
    await insertMedžiaga(art, pav, vnt);
    await loadData();
    addNotif('success', 'Pridėta', `Medžiaga "${pav}" pridėta`);
  };
  const handleUpdateMat = async (_art: string, pav: string, vnt: string) => {
    if (!editingMat) return;
    await updateMedžiaga(editingMat.artikulas, pav, vnt);
    await loadData();
    addNotif('success', 'Atnaujinta', 'Medžiaga atnaujinta');
  };
  const handleDeleteMat = async (m: Medžiaga) => {
    if (!confirm(`Ištrinti "${m.pavadinimas}" ir visus jos kainų įrašus?`)) return;
    setDelMatArt(m.artikulas);
    try { await deleteMedžiaga(m.artikulas); await loadData(); addNotif('info', 'Ištrinta', `"${m.pavadinimas}" pašalinta`); }
    catch (err: any) { addNotif('error', 'Klaida', err.message); }
    finally { setDelMatArt(null); }
  };
  const handleAddPrice = async (art: string, data: string, min: number|null, max: number|null, notes: string|null) => {
    await insertIrašas(art, data, min, max, notes);
    await loadData();
    addNotif('success', 'Pridėta', 'Kaina pridėta');
  };
  const handleUpdatePrice = async (_art: string, data: string, min: number|null, max: number|null, notes: string|null) => {
    if (!editingIras) return;
    await updateIrašas(editingIras.id, data, min, max, notes);
    await loadData();
    addNotif('success', 'Atnaujinta', 'Kaina atnaujinta');
  };
  const handleDeletePrice = async (id: number) => {
    setDelIrasId(id);
    try { await deleteIrašas(id); await loadData(); }
    catch (err: any) { addNotif('error', 'Klaida', err.message); }
    finally { setDelIrasId(null); }
  };

  // ---- Excel import handler ----
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { addNotif('error', 'Klaida', 'Excel failas tuščias'); return; }

        const keys = Object.keys(rows[0]);
        const find = (patterns: string[]) => keys.find(k => patterns.some(p => k.toLowerCase().includes(p))) || null;

        const artCol = find(['artikul', 'article', 'id', 'kodas', 'code']);
        const pavCol = find(['pavadinim', 'name', 'material', 'medžiag', 'medziag']);
        const vntCol = find(['vienet', 'unit']);
        const dataCol = find(['dat', 'date']);
        const kainaCol = find(['kain', 'price']);
        const minCol = find(['min']);
        const maxCol = find(['max']);
        const pastCol = find(['pastab', 'note', 'comment']);

        // Detect date columns (pivot format): columns that look like dates (YYYY-MM-DD, DD.MM.YYYY, etc.)
        const isDateLike = (s: string): string | null => {
          // YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          // DD.MM.YYYY or DD/MM/YYYY
          const m1 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
          if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
          // Try parsing as date
          const d = new Date(s);
          if (!isNaN(d.getTime()) && s.length >= 8) return d.toISOString().split('T')[0];
          return null;
        };

        // Find all columns that are dates (pivot format)
        const dateColumns: { col: string; dateStr: string }[] = [];
        for (const k of keys) {
          // Skip known non-date columns
          if (k === artCol || k === pavCol || k === vntCol || k === dataCol || k === kainaCol || k === minCol || k === maxCol || k === pastCol) continue;
          const parsed = isDateLike(k);
          if (parsed) dateColumns.push({ col: k, dateStr: parsed });
        }

        const isPivotFormat = dateColumns.length > 0;

        const matsMap = new Map<string, { artikulas: string; pavadinimas: string; vienetas: string }>();
        const priceRows: { artikulas: string; data: string; kaina_min: number | null; kaina_max: number | null; pastabos: string | null }[] = [];

        for (const row of rows) {
          const art = String(artCol ? row[artCol] : '').trim();
          if (!art) continue;

          const pav = String(pavCol ? row[pavCol] : art).trim();
          const vnt = String(vntCol ? row[vntCol] : 'Eur/kg').trim();
          if (!matsMap.has(art)) matsMap.set(art, { artikulas: art, pavadinimas: pav, vienetas: vnt });

          if (isPivotFormat) {
            // Pivot format: each date column contains a price value for this material
            for (const dc of dateColumns) {
              const raw = row[dc.col];
              if (raw === '' || raw === null || raw === undefined) continue;
              const rawStr = String(raw).trim();
              if (!rawStr) continue;

              // Check if it's a note (non-numeric like "???")
              let kMin: number | null = null;
              let kMax: number | null = null;
              let note: string | null = null;

              // Try to parse as range: "2.50-2.80" or "2,50–2,80"
              const rangeMatch = rawStr.match(/^(\d+[.,]?\d*)\s*[-–]\s*(\d+[.,]?\d*)$/);
              if (rangeMatch) {
                kMin = parseFloat(rangeMatch[1].replace(',', '.'));
                kMax = parseFloat(rangeMatch[2].replace(',', '.'));
              } else {
                const num = parseFloat(rawStr.replace(',', '.'));
                if (!isNaN(num)) {
                  kMin = num;
                } else {
                  // Non-numeric value — treat as note (e.g. "???")
                  note = rawStr;
                }
              }
              if (kMin !== null && isNaN(kMin)) kMin = null;
              if (kMax !== null && isNaN(kMax)) kMax = null;

              if (kMin !== null || note) {
                priceRows.push({ artikulas: art, data: dc.dateStr, kaina_min: kMin, kaina_max: kMax, pastabos: note });
              }
            }
          } else {
            // Flat format: one row per price entry with a "data" column
            let dateStr = '';
            const rawDate = dataCol ? row[dataCol] : null;
            if (rawDate instanceof Date) {
              dateStr = rawDate.toISOString().split('T')[0];
            } else if (rawDate) {
              const parsed = isDateLike(String(rawDate));
              dateStr = parsed || '';
            }

            let kMin: number | null = null;
            let kMax: number | null = null;
            if (minCol && row[minCol] !== '') {
              kMin = parseFloat(String(row[minCol]).replace(',', '.'));
            } else if (kainaCol && row[kainaCol] !== '') {
              kMin = parseFloat(String(row[kainaCol]).replace(',', '.'));
            }
            if (maxCol && row[maxCol] !== '') {
              kMax = parseFloat(String(row[maxCol]).replace(',', '.'));
            }
            if (kMin !== null && isNaN(kMin)) kMin = null;
            if (kMax !== null && isNaN(kMax)) kMax = null;

            const pastabos = pastCol ? (String(row[pastCol]).trim() || null) : null;

            if (dateStr && (kMin !== null || pastabos)) {
              priceRows.push({ artikulas: art, data: dateStr, kaina_min: kMin, kaina_max: kMax, pastabos });
            }
          }
        }

        setExcelPreview({ mats: Array.from(matsMap.values()), prices: priceRows });
        if (isPivotFormat) {
          addNotif('info', 'Pivot formatas', `Aptikta ${dateColumns.length} datų stulpelių`);
        }
      } catch (err: any) {
        addNotif('error', 'Excel klaida', err.message || 'Nepavyko nuskaityti failo');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExcelImport = async () => {
    if (!excelPreview) return;
    setImporting(true);
    try {
      const matCount = await bulkInsertMedziagas(excelPreview.mats);
      const priceCount = await bulkInsertIstorija(excelPreview.prices);
      await loadData();
      setExcelPreview(null);
      addNotif('success', 'Importuota', `${matCount} medžiagos, ${priceCount} kainų įrašai`);
    } catch (err: any) {
      addNotif('error', 'Importo klaida', err.message);
    } finally { setImporting(false); }
  };

  // ---- helpers ----
  const fmtDate = (d: string) => {
    // "YYYY\nMM-DD" — year on top, month-day below
    const [y, m, dd] = d.split('-');
    return <span className="flex flex-col items-center leading-tight"><span className="text-[10px]" style={{ color: '#b0aba4' }}>{y}</span><span>{m}-{dd}</span></span>;
  };

  const renderMd = (text: string) => (
    <div
      className="text-xs"
      dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(text || '') }}
    />
  );

  const naftaDisplay = streamNafta || analytics?.nafta || '';
  const geoDisplay = streamGeo || analytics?.geoevents || '';
  const analysisDisplay = streamAnalysis || analytics?.content || '';
  const lastUpdated = analytics?.sukurta_at ?? null;
  const renderCitations = (meta: AnalysisSectionMeta) => {
    if (!meta.citations.length) return null;
    return (
      <div className="mt-2 pt-2 border-t border-blue-100">
        <p className="text-[10px] font-semibold mb-1" style={{ color: '#1d4ed8' }}>Šaltiniai ({meta.citations.length})</p>
        <ul className="space-y-1">
          {meta.citations.slice(0, 5).map((c, idx) => (
            <li key={`${c.url}-${idx}`} className="truncate text-[10px]">
              <a href={c.url} target="_blank" rel="noreferrer" className="underline" style={{ color: '#1d4ed8' }}>
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // ---- render ----
  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>

      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Žaliavos</h2>
          {activeTab === 'lentele' && (
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />
              <button onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-95"
                style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}>
                <Upload className="w-3.5 h-3.5" />Importuoti Excel
              </button>
              <button onClick={() => setShowPriceMod({})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-95"
                style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}>
                <Plus className="w-3.5 h-3.5" />Nauja kaina
              </button>
              <button onClick={() => setShowAddMat(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-95"
                style={{ background: '#007AFF' }}>
                <Plus className="w-3.5 h-3.5" />Nauja medžiaga
              </button>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid #f0ede8' }}>
          {(['lentele', 'sablonai', 'grafa', 'analize'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2.5 text-xs font-medium transition-colors relative"
              style={{ color: activeTab === tab ? '#007AFF' : '#8a857f',
                       borderBottom: activeTab === tab ? '2px solid #007AFF' : '2px solid transparent',
                       marginBottom: '-1px' }}>
              {tab === 'lentele'
                ? <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" />Kainų lentelė</span>
                : tab === 'sablonai'
                ? <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Medžiagų šablonai</span>
                : tab === 'grafa'
                ? <span className="flex items-center gap-1.5"><LineChartIcon className="w-3.5 h-3.5" />Grafa</span>
                : <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Analizė</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-md" style={{ color: '#007AFF' }} />
          </div>
        ) : activeTab === 'lentele' ? (
          /* ---- PIVOT TABLE ---- */
          medziagas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <BarChart2 className="w-10 h-10" style={{ color: '#d4cfc8' }} />
              <p className="text-sm" style={{ color: '#8a857f' }}>Nėra medžiagų. Pridėkite pirmąją.</p>
              <button onClick={() => setShowAddMat(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#007AFF' }}>
                <Plus className="w-3.5 h-3.5" />Nauja medžiaga
              </button>
            </div>
          ) : (
            <div className="w-full overflow-auto rounded-xl bg-white"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', maxHeight: 'calc(100vh - 220px)' }}>
              <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
                <thead className="sticky top-0 z-20 bg-white">
                  <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                    <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-30 bg-white" style={{ minWidth: 220 }}>
                      <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Medžiaga</span>
                    </th>
                    <th className="px-3 py-3 text-left whitespace-nowrap sticky z-30 bg-white" style={{ minWidth: 70, left: 220 }}>
                      <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Vnt.</span>
                    </th>
                    {dates.map(d => (
                      <th key={d} className="px-3 py-3 text-center whitespace-nowrap" style={{ minWidth: 90 }}>
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{fmtDate(d)}</span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {medziagas.map(m => (
                    <tr key={m.artikulas} className="group" style={{ borderBottom: '1px solid #f8f6f3' }}>
                      <td className="px-4 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-[#fdfcfb]" style={{ minWidth: 220 }}>
                        <div>
                          <span className="text-xs font-medium" style={{ color: '#3d3935' }}>{m.pavadinimas}</span>
                          <span className="text-[10px] ml-1.5" style={{ color: '#b0aba4' }}>{m.artikulas}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sticky z-10 bg-white group-hover:bg-[#fdfcfb]" style={{ minWidth: 70, left: 220 }}>
                        <span className="text-xs" style={{ color: '#8a857f' }}>{m.vienetas}</span>
                      </td>
                      {dates.map(d => {
                        const e = priceMatrix.get(`${m.artikulas}-${d}`);
                        return (
                          <td key={d} className="px-2 py-1.5 text-center" style={{ minWidth: 90 }}>
                            {e ? (
                              <div className="flex items-center justify-center gap-0.5 group/cell">
                                <button onClick={() => setEditingIras(e)}
                                  className="px-2 py-1 rounded text-xs font-mono hover:bg-blue-50 transition-colors"
                                  style={{ color: '#3d3935' }} title="Redaguoti">
                                  {formatPrice(e)}
                                </button>
                                <button onClick={() => handleDeletePrice(e.id)} disabled={delIrasId === e.id}
                                  className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded hover:bg-red-50 transition-all" title="Ištrinti">
                                  {delIrasId === e.id
                                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: '#b91c1c' }} />
                                    : <X className="w-2.5 h-2.5" style={{ color: '#b91c1c' }} />}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setShowPriceMod({ defArt: m.artikulas, defDate: d })}
                                className="px-2 py-1 rounded text-xs text-gray-300 hover:text-blue-400 hover:bg-blue-50 transition-colors" title="Pridėti kainą">
                                +
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => setEditingMat(m)}
                            className="p-1.5 rounded-md hover:bg-black/5 transition-colors" title="Redaguoti">
                            <Pencil className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                          </button>
                          <button onClick={() => handleDeleteMat(m)} disabled={delMatArt === m.artikulas}
                            className="p-1.5 rounded-md hover:bg-red-50 transition-colors" title="Ištrinti">
                            {delMatArt === m.artikulas
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#b91c1c' }} />
                              : <Trash2 className="w-3.5 h-3.5" style={{ color: '#b91c1c' }} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs flex items-center justify-between"
                style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}>
                <span>{medziagas.length} medžiagos · {istorija.length} įrašai · {dates.length} datos</span>
                <button onClick={() => loadData()} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-black/5">
                  <RefreshCw className="w-3 h-3" />Atnaujinti
                </button>
              </div>
            </div>
          )
        ) : activeTab === 'sablonai' ? (
          /* ---- SABLONAI TAB ---- */
          <SablonaiTab />
        ) : activeTab === 'grafa' ? (
          /* ---- GRAFA TAB ---- */
          <GrafaTab medziagas={medziagas} istorija={istorija} analytics={analytics} onError={(msg) => addNotif('error', 'DI prognozė', msg)} />
        ) : (
          /* ---- ANALYTICS TAB ---- */
          <div className="space-y-4 max-w-4xl">
            {/* Controls row */}
            <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-white"
              style={{ borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div>
                <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                  {lastUpdated ? `Atnaujinta: ${relativeTime(lastUpdated)}` : 'Analizė dar nesugeneruota'}
                </span>
                <div className="text-[11px] mt-1" style={{ color: '#8a857f' }}>
                  Rodomi šaltiniai ir apytikslis patikimumas pagal citatų kiekį.
                </div>
              </div>
              <button onClick={generateAnalytics} disabled={genLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-95 disabled:opacity-60"
                style={{ background: '#007AFF' }}>
                {genLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{genStep === 'nafta' ? 'Ieško naftos kainų...' : genStep === 'geo' ? 'Ieško įvykių...' : 'Analizuoja...'}</>
                  : <><RefreshCw className="w-3.5 h-3.5" />Generuoti analizę</>}
              </button>
            </div>

            {/* Oil prices box */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#78350f 0%,#b45309 100%)' }}>
                <BarChart2 className="w-4 h-4 text-white opacity-90" />
                <span className="text-xs font-semibold text-white">Naftos kainos &middot; Styrenas &middot; Dervos ryšys</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Patikimumas ~{Math.round(analysisMeta.nafta.confidence)}%
                </span>
                <button
                  onClick={() => regenerateAnalysisSection('nafta')}
                  disabled={genLoading}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/15 text-white disabled:opacity-50"
                >
                  Regeneruoti
                </button>
                {genLoading && genStep === 'nafta' && <Loader2 className="w-3 h-3 text-white animate-spin" />}
              </div>
              <div className="px-4 py-3 bg-white min-h-[60px]">
                {naftaDisplay ? (
                  <>{renderMd(naftaDisplay)}</>
                ) : genLoading && genStep === 'nafta' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#b45309' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Ieškomos naftos kainos...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Naftos kainų duomenys nesugeneruoti.</span>
                  </div>
                )}
                {renderCitations(analysisMeta.nafta)}
              </div>
            </div>

            {/* Geopolitical events box */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#1a3a5c 0%,#2563a8 100%)' }}>
                <Globe className="w-4 h-4 text-white opacity-90" />
                <span className="text-xs font-semibold text-white">Geopolitiniai įvykiai &middot; Rinkos sąlygos</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Patikimumas ~{Math.round(analysisMeta.geo.confidence)}%
                </span>
                <button
                  onClick={() => regenerateAnalysisSection('geo')}
                  disabled={genLoading}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/15 text-white disabled:opacity-50"
                >
                  Regeneruoti
                </button>
                {genLoading && genStep === 'geo' && <Loader2 className="w-3 h-3 text-white animate-spin" />}
              </div>
              <div className="px-4 py-3 bg-white min-h-[60px]">
                {geoDisplay ? (
                  <>{renderMd(geoDisplay)}</>
                ) : genLoading && genStep === 'geo' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#007AFF' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Ieškomi naujausi įvykiai...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Analizė nesugeneruota. Paspauskite „Regeneruoti“.</span>
                  </div>
                )}
                {renderCitations(analysisMeta.geo)}
              </div>
            </div>

            {/* Price analysis box */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#0f4c2a 0%,#166534 100%)' }}>
                <TrendingUp className="w-4 h-4 text-white opacity-90" />
                <span className="text-xs font-semibold text-white">Kainų analizė &middot; Prognozė</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Patikimumas ~{Math.round(analysisMeta.analysis.confidence)}%
                </span>
                <button
                  onClick={() => regenerateAnalysisSection('analysis')}
                  disabled={genLoading}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/15 text-white disabled:opacity-50"
                >
                  Regeneruoti
                </button>
                {genLoading && genStep === 'analysis' && <Loader2 className="w-3 h-3 text-white animate-spin" />}
              </div>
              <div className="px-4 py-3 bg-white min-h-[60px]">
                {analysisDisplay ? (
                  <>{renderMd(analysisDisplay)}</>
                ) : genLoading && genStep === 'analysis' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#007AFF' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Analizuojami kainų duomenys...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                    <span className="text-xs" style={{ color: '#8a857f' }}>Analizė nesugeneruota.</span>
                  </div>
                )}
                {renderCitations(analysisMeta.analysis)}
              </div>
            </div>

            {genLoading && (
              <p className="text-xs text-center" style={{ color: '#8a857f' }}>
                Claude ieško internete su web_search ir analizuoja duomenis...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Excel Import Preview Modal */}
      {excelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setExcelPreview(null)}>
          <div className="w-full max-w-2xl mx-4 bg-white rounded-2xl overflow-hidden max-h-[80vh] flex flex-col"
            style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: '1px solid #f0ede8' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
                Excel peržiūra
              </h3>
              <button onClick={() => setExcelPreview(null)} className="p-1.5 rounded-md hover:bg-black/5">
                <X className="w-4 h-4" style={{ color: '#8a857f' }} />
              </button>
            </div>
            <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
              <div className="text-xs" style={{ color: '#5a5550' }}>
                <strong>{excelPreview.mats.length}</strong> medžiagos, <strong>{excelPreview.prices.length}</strong> kainų įrašai
              </div>
              {excelPreview.mats.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#3d3935' }}>Medžiagos</div>
                  <div className="overflow-auto max-h-32 rounded-lg" style={{ border: '1px solid #f0ede8' }}>
                    <table className="w-full text-xs">
                      <thead><tr style={{ background: '#faf9f7' }}>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Artikulas</th>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Pavadinimas</th>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Vienetas</th>
                      </tr></thead>
                      <tbody>
                        {excelPreview.mats.slice(0, 20).map((m, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f0ede8' }}>
                            <td className="px-2 py-1" style={{ color: '#3d3935' }}>{m.artikulas}</td>
                            <td className="px-2 py-1" style={{ color: '#3d3935' }}>{m.pavadinimas}</td>
                            <td className="px-2 py-1" style={{ color: '#8a857f' }}>{m.vienetas}</td>
                          </tr>
                        ))}
                        {excelPreview.mats.length > 20 && (
                          <tr><td colSpan={3} className="px-2 py-1 text-center" style={{ color: '#8a857f' }}>
                            ...ir dar {excelPreview.mats.length - 20}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {excelPreview.prices.length > 0 && (
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#3d3935' }}>Kainos</div>
                  <div className="overflow-auto max-h-40 rounded-lg" style={{ border: '1px solid #f0ede8' }}>
                    <table className="w-full text-xs">
                      <thead><tr style={{ background: '#faf9f7' }}>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Artikulas</th>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Data</th>
                        <th className="px-2 py-1.5 text-right font-medium" style={{ color: '#8a857f' }}>Kaina</th>
                        <th className="px-2 py-1.5 text-left font-medium" style={{ color: '#8a857f' }}>Pastabos</th>
                      </tr></thead>
                      <tbody>
                        {excelPreview.prices.slice(0, 30).map((p, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f0ede8' }}>
                            <td className="px-2 py-1" style={{ color: '#3d3935' }}>{p.artikulas}</td>
                            <td className="px-2 py-1" style={{ color: '#3d3935' }}>{p.data}</td>
                            <td className="px-2 py-1 text-right font-mono" style={{ color: '#3d3935' }}>
                              {p.kaina_min != null ? p.kaina_min.toFixed(2) : '—'}
                              {p.kaina_max != null ? `–${p.kaina_max.toFixed(2)}` : ''}
                            </td>
                            <td className="px-2 py-1" style={{ color: '#8a857f' }}>{p.pastabos || ''}</td>
                          </tr>
                        ))}
                        {excelPreview.prices.length > 30 && (
                          <tr><td colSpan={4} className="px-2 py-1 text-center" style={{ color: '#8a857f' }}>
                            ...ir dar {excelPreview.prices.length - 30}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid #f0ede8' }}>
              <button onClick={() => setExcelPreview(null)} className="px-4 py-1.5 text-xs rounded-lg"
                style={{ color: '#5a5550', background: 'rgba(0,0,0,0.04)' }}>Atšaukti</button>
              <button onClick={handleExcelImport} disabled={importing}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-60"
                style={{ background: '#007AFF' }}>
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Importuoti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddMat && (
        <AddMaterialModal onSave={handleAddMat} onClose={() => setShowAddMat(false)} />
      )}
      {editingMat && (
        <AddMaterialModal initial={editingMat} onSave={handleUpdateMat} onClose={() => setEditingMat(null)} />
      )}
      {showPriceMod && (
        <PriceModal medziagas={medziagas} defaultArtikulas={showPriceMod.defArt} defaultDate={showPriceMod.defDate}
          onSave={handleAddPrice} onClose={() => setShowPriceMod(null)} />
      )}
      {editingIras && (
        <PriceModal medziagas={medziagas} initial={editingIras}
          onSave={handleUpdatePrice} onClose={() => setEditingIras(null)} />
      )}

      <NotificationContainer notifications={notifs} onRemove={removeNotif} />
    </div>
  );
}
