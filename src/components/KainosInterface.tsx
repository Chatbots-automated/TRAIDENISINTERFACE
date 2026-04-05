import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Pencil, RefreshCw, Loader2, X, Upload,
  Globe, TrendingUp, Sparkles, BarChart2, AlertTriangle, Check,
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';
import {
  fetchMedziagas, fetchIstorija,
  insertMedžiaga, updateMedžiaga, deleteMedžiaga,
  insertIrašas, updateIrašas, deleteIrašas,
  fetchGeneralAnalysis, saveGeneralAnalysis,
  replacePrognozes, fetchPrognozes,
  bulkInsertMedziagas, bulkInsertIstorija,
  formatPrice, relativeTime,
} from '../lib/kainosService';
import type { Medžiaga, KainuIrašas, KainuPrognozė, PrognozėInternetas } from '../lib/kainosService';

interface KainosInterfaceProps { user: AppUser; }

const MODEL = 'claude-opus-4-6';

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
// Main component
// ---------------------------------------------------------------------------

export default function KainosInterface({ user }: KainosInterfaceProps) {
  // ---- data state ----
  const [medziagas, setMedziagas] = useState<Medžiaga[]>([]);
  const [istorija, setIstorija] = useState<KainuIrašas[]>([]);
  const [analytics, setAnalytics] = useState<PrognozėInternetas | null>(null);
  const [prognozes, setPrognozes] = useState<KainuPrognozė[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lentele' | 'analize'>('lentele');

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
  const [genStep, setGenStep] = useState<'idle' | 'geo' | 'analysis'>('idle');
  const [streamGeo, setStreamGeo] = useState('');
  const [streamAnalysis, setStreamAnalysis] = useState('');

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
      const [med, ist, ana, prog] = await Promise.all([
        fetchMedziagas(), fetchIstorija(), fetchGeneralAnalysis(), fetchPrognozes(),
      ]);
      setMedziagas(med); setIstorija(ist); setAnalytics(ana); setPrognozes(prog);
      return { med, ist, ana };
    } catch (err: any) {
      addNotif('error', 'Klaida', err.message || 'Nepavyko įkelti duomenų');
      return { med: [], ist: [], ana: null };
    } finally { setLoading(false); }
  }, []);

  // ---- analytics generation (streams, uses web_search) ----
  const generateAnalyticsFromData = useCallback(async (
    meds: Medžiaga[], hist: KainuIrašas[]
  ) => {
    if (genLoading) return;
    setGenLoading(true);
    setStreamGeo('');
    setStreamAnalysis('');
    const client = new Anthropic({
      apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true,
    });
    const today = new Date().toISOString().split('T')[0];
    const webSearchTool = [{ type: 'web_search_20260209', name: 'web_search' }] as any;
    try {
      // -- Step 1: Geopolitical events --
      setGenStep('geo');
      let geoText = '';
      {
        const msgs: Anthropic.MessageParam[] = [{
          role: 'user',
          content: `Šiandien yra ${today}. Ieškokite internete naujausių geopolitinių įvykių, kurie gali turėti įtakos poliestetinėms dervoms, epoksidinėms dervoms (Derakane, Atlac), stiklo pluštui ir kompozitinių medžiagų kainoms. Sutelkite dėmesį į: naftos kainas, sankcijas, prekybos politiką, energijos kainas, tiekimo grandinės sutrikimus. 4-6 konkretūs biuletenų punktai lietuvių kalba.`,
        }];
        while (true) {
          const stream = client.messages.stream({
            model: MODEL, max_tokens: 1024,
            system: `Rinkos žvalgybů analitikas. Atsakykite lietuvių kalba. Šiandien: ${today}.`,
            tools: webSearchTool, messages: msgs,
          });
          stream.on('text', d => { geoText += d; setStreamGeo(geoText); });
          const msg = await stream.finalMessage();
          if (msg.stop_reason !== 'pause_turn') break;
          msgs.push({ role: 'assistant', content: msg.content as any });
        }
      }
      // -- Step 2: Price analysis --
      setGenStep('analysis');
      let analysisText = '';
      const priceData = formatPriceDataForPrompt(meds, hist);
      {
        const msgs: Anthropic.MessageParam[] = [{
          role: 'user',
          content: `Šiandien yra ${today}. Esate medžiagų kainų analitikas įmonei Traidenis (Lietuva). Remiantis šiais istoriniais kainų duomenimis ir ieškodami internete dabartinių rinkos sąlygų:\n\nISTORINIAI KAINitaslide DUOMENYS:\n${priceData}\n\nPateikite liečiai lietuvių kalba:\n1. **Kainų tendencijos** \u2013 kiekvienos medžiagos kainos pokytis\n2. **Kainų prognozė** \u2013 3\u20136 mėnesių prognozė\n3. **Rinkos veiksniai** \u2013 nafta, energija, tiekimo grandinė\n4. **Rekomendacijos** \u2013 pirkimo strategija`,
        }];
        while (true) {
          const stream = client.messages.stream({
            model: MODEL, max_tokens: 3000,
            thinking: { type: 'adaptive' },
            system: `Patyrusi medžiagų kainų analitikė. Visada atsakykite lietuvių kalba. Šiandien: ${today}.`,
            tools: webSearchTool, messages: msgs,
          });
          stream.on('text', d => { analysisText += d; setStreamAnalysis(analysisText); });
          const msg = await stream.finalMessage();
          if (msg.stop_reason !== 'pause_turn') break;
          msgs.push({ role: 'assistant', content: msg.content as any });
        }
      }
      await saveGeneralAnalysis(analysisText, geoText);
      const freshAnalysis = await fetchGeneralAnalysis();
      setAnalytics(freshAnalysis);

      // Parse structured predictions from the analysis text and save them
      try {
        const predRows: { artikulas: string; data: string; kaina_min: number | null; kaina_max: number | null; pasitikejimas: number }[] = [];
        const predDate = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]; // ~3 months out
        for (const m of meds) {
          // Try to find a predicted price mention for this material in the analysis
          const regex = new RegExp(`${m.pavadinimas.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\d]*(\\d+[.,]\\d+)`, 'i');
          const match = analysisText.match(regex);
          if (match) {
            const price = parseFloat(match[1].replace(',', '.'));
            if (!isNaN(price)) {
              predRows.push({ artikulas: m.artikulas, data: predDate, kaina_min: price * 0.95, kaina_max: price * 1.05, pasitikejimas: 0.6 });
            }
          }
        }
        if (predRows.length > 0) {
          await replacePrognozes(predRows);
          setPrognozes(await fetchPrognozes());
        }
      } catch (predErr) {
        console.warn('Could not parse predictions from analysis:', predErr);
      }

      addNotif('success', 'Analizė atnaujinta', 'Sėkmingai sugeneruota');
    } catch (err: any) {
      console.error('Analytics error:', err);
      addNotif('error', 'Klaida', err.message || 'Nepavyko sugeneruoti analizės');
    } finally { setGenLoading(false); setGenStep('idle'); }
  }, [genLoading]);

  const generateAnalytics = useCallback(() =>
    generateAnalyticsFromData(medziagas, istorija), [generateAnalyticsFromData, medziagas, istorija]);

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

  const renderMd = (text: string) =>
    text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="text-xs font-bold mt-3 mb-1" style={{ color: '#3d3935' }}>{line.slice(3)}</h3>;
      if (line.startsWith('# ')) return <h2 key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: '#3d3935' }}>{line.slice(2)}</h2>;
      if (line.startsWith('- ') || line.startsWith('• '))
        return <li key={i} className="text-xs ml-4 list-disc leading-relaxed" style={{ color: '#5a5550' }}>{line.slice(2)}</li>;
      if (line.trim() === '') return <div key={i} className="h-1.5" />;
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return <p key={i} className="text-xs leading-relaxed" style={{ color: '#5a5550' }}>
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: '#3d3935' }}>{p}</strong> : p)}
      </p>;
    });

  const geoDisplay = genLoading ? streamGeo : (analytics?.geoevents ?? '');
  const analysisDisplay = genStep === 'analysis' ? streamAnalysis : (!genLoading ? (analytics?.content ?? '') : '');
  const lastUpdated = analytics?.atnaujinta ?? null;

  // ---- render ----
  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>

      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Žaliavų Kainos</h2>
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
        </div>
        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid #f0ede8' }}>
          {(['lentele', 'analize'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2.5 text-xs font-medium transition-colors relative"
              style={{ color: activeTab === tab ? '#007AFF' : '#8a857f',
                       borderBottom: activeTab === tab ? '2px solid #007AFF' : '2px solid transparent',
                       marginBottom: '-1px' }}>
              {tab === 'lentele'
                ? <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" />Kainų lentelė</span>
                : <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Analizė</span>}
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
            <div className="w-full overflow-x-auto rounded-xl bg-white"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                    <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-white" style={{ minWidth: 220 }}>
                      <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Medžiaga</span>
                    </th>
                    <th className="px-3 py-3 text-left whitespace-nowrap sticky z-10 bg-white" style={{ minWidth: 70, left: 220 }}>
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
        ) : (
          /* ---- ANALYTICS TAB ---- */
          <div className="space-y-4 max-w-3xl">
            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs" style={{ color: '#8a857f' }}>
                  {lastUpdated ? `Atnaujinta: ${relativeTime(lastUpdated)}` : 'Analizė dar nesugeneruota'}
                </span>
              </div>
              <button onClick={generateAnalytics} disabled={genLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-95 disabled:opacity-60"
                style={{ background: '#007AFF' }}>
                {genLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{genStep === 'geo' ? 'Ieško įvykių...' : 'Analizuoja...'}</>
                  : <><RefreshCw className="w-3.5 h-3.5" />Generuoti analizę</>}
              </button>
            </div>

            {/* Geopolitical events box */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#1a3a5c 0%,#2563a8 100%)' }}>
                <Globe className="w-4 h-4 text-white opacity-90" />
                <span className="text-xs font-semibold text-white">Geopolitiniai įvykiai &middot; Rinkos sąlygos</span>
                {genLoading && genStep === 'geo' && <Loader2 className="w-3 h-3 text-white animate-spin ml-auto" />}
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
              </div>
            </div>

            {/* Price analysis box */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#0f4c2a 0%,#166534 100%)' }}>
                <TrendingUp className="w-4 h-4 text-white opacity-90" />
                <span className="text-xs font-semibold text-white">Kainų analizė &middot; Prognozė</span>
                {genLoading && genStep === 'analysis' && <Loader2 className="w-3 h-3 text-white animate-spin ml-auto" />}
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
