import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Pencil, RefreshCw, Loader2, X,
  Globe, TrendingUp, Sparkles, BarChart2, AlertTriangle, Check,
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';
import {
  fetchMedziagas, fetchIstorija,
  insertMedžiaga, updateMedžiaga, deleteMedžiaga,
  insertIrašas, updateIrašas, deleteIrašas,
  fetchLatestAnalitika, saveAnalitika, analyticsNeedRefresh,
  formatPrice,
} from '../lib/kainosService';
import type { KainuMedžiaga, KainuIrašas, KainuAnalitika } from '../lib/kainosService';

interface KainosInterfaceProps { user: AppUser; }

const MODEL = 'claude-opus-4-6';

function formatPriceDataForPrompt(meds: KainuMedžiaga[], hist: KainuIrašas[]): string {
  if (!meds.length || !hist.length) return 'Nėra kainų duomenų.';
  const lines: string[] = [];
  for (const m of meds) {
    const entries = hist.filter(e => e.medziagas_id === m.id).sort((a, b) => a.data.localeCompare(b.data));
    if (!entries.length) continue;
    const row = entries.map(e => `${e.data}: ${formatPrice(e)}`).join(' | ');
    lines.push(`${m.pavadinimas} (${m.vienetas}): ${row}`);
  }
  return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Modal: Add / Edit Material
// ---------------------------------------------------------------------------

interface AddMaterialModalProps {
  initial?: KainuMedžiaga;
  onSave: (pavadinimas: string, vienetas: string) => Promise<void>;
  onClose: () => void;
}

function AddMaterialModal({ initial, onSave, onClose }: AddMaterialModalProps) {
  const [pavadinimas, setPavadinimas] = useState(initial?.pavadinimas ?? '');
  const [vienetas, setVienetas] = useState(initial?.vienetas ?? 'Eur/kg');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pavadinimas.trim()) return;
    setSaving(true);
    try { await onSave(pavadinimas.trim(), vienetas.trim() || 'Eur/kg'); onClose(); }
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
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Pavadinimas</label>
            <input autoFocus value={pavadinimas} onChange={e => setPavadinimas(e.target.value)}
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
            <button type="submit" disabled={saving || !pavadinimas.trim()}
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
  medziagas: KainuMedžiaga[];
  initial?: KainuIrašas;
  defaultMedzaigaId?: number;
  onSave: (mid: number, data: string, min: number | null, max: number | null, notes: string | null) => Promise<void>;
  onClose: () => void;
}

function PriceModal({ medziagas, initial, defaultMedzaigaId, onSave, onClose }: PriceModalProps) {
  const [mid, setMid] = useState<number>(
    initial?.medziagas_id ?? defaultMedzaigaId ?? (medziagas[0]?.id ?? 0)
  );
  const [data, setData] = useState(initial?.data ?? new Date().toISOString().split('T')[0]);
  const [isRange, setIsRange] = useState(
    !!(initial && initial.kaina_max !== null && initial.kaina_max !== initial.kaina_min)
  );
  const [kMin, setKMin] = useState(initial?.kaina_min != null ? String(initial.kaina_min) : '');
  const [kMax, setKMax] = useState(initial?.kaina_max != null ? String(initial.kaina_max) : '');
  const [notes, setNotes] = useState(initial?.pastabos ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mid || !data) return;
    const min = kMin ? parseFloat(kMin) : null;
    const max = isRange && kMax ? parseFloat(kMax) : null;
    setSaving(true);
    try { await onSave(mid, data, min, max, notes.trim() || null); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f0ede8' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
            {initial ? 'Redaguoti kainą' : 'Nauja kaina'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Medžiaga</label>
            <select value={mid} onChange={e => setMid(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }}>
              {medziagas.map(m => <option key={m.id} value={m.id}>{m.pavadinimas}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#5a5550' }}>Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#fdfcfb', border: '1px solid #e5e0d8', color: '#3d3935' }} />
          </div>
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
            <button type="submit" disabled={saving || !mid || !data}
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
  const [medziagas, setMedziagas] = useState<KainuMedžiaga[]>([]);
  const [istorija, setIstorija] = useState<KainuIrašas[]>([]);
  const [analytics, setAnalytics] = useState<KainuAnalitika | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lentele' | 'analize'>('lentele');

  // ---- modal state ----
  const [showAddMat, setShowAddMat] = useState(false);
  const [editingMat, setEditingMat] = useState<KainuMedžiaga | null>(null);
  const [showPriceMod, setShowPriceMod] = useState<{ defId?: number } | null>(null);
  const [editingIras, setEditingIras] = useState<KainuIrašas | null>(null);
  const [delMatId, setDelMatId] = useState<number | null>(null);
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
    for (const e of istorija) map.set(`${e.medziagas_id}-${e.data}`, e);
    return map;
  }, [istorija]);

  // ---- loadData ----
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [med, ist, ana] = await Promise.all([fetchMedziagas(), fetchIstorija(), fetchLatestAnalitika()]);
      setMedziagas(med); setIstorija(ist); setAnalytics(ana);
      return { med, ist, ana };
    } catch (err: any) {
      addNotif('error', 'Klaida', err.message || 'Nepavyko įkelti duomenų');
      return { med: [], ist: [], ana: null };
    } finally { setLoading(false); }
  }, []);

  // ---- analytics generation (streams, uses web_search) ----
  const generateAnalyticsFromData = useCallback(async (
    meds: KainuMedžiaga[], hist: KainuIrašas[]
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
      const saved = await saveAnalitika(analysisText, geoText);
      setAnalytics(saved);
      addNotif('success', 'Analizė atnaujinta', 'Sėkmingai sugeneruota');
    } catch (err: any) {
      console.error('Analytics error:', err);
      addNotif('error', 'Klaida', err.message || 'Nepavyko sugeneruoti analizės');
    } finally { setGenLoading(false); setGenStep('idle'); }
  }, [genLoading]);

  const generateAnalytics = useCallback(() =>
    generateAnalyticsFromData(medziagas, istorija), [generateAnalyticsFromData, medziagas, istorija]);

  // ---- cron: auto-refresh at 07:00 daily ----
  useEffect(() => {
    loadData().then(({ med, ist, ana }) => {
      if (analyticsNeedRefresh(ana?.sukurta_at)) generateAnalyticsFromData(med, ist);
    });
  }, []);

  // ---- CRUD handlers ----
  const handleAddMat = async (pav: string, vnt: string) => {
    await insertMedžiaga(pav, vnt);
    await loadData();
    addNotif('success', 'Pridėta', `Medžiaga "\${pav}" pridėta`);
  };
  const handleUpdateMat = async (pav: string, vnt: string) => {
    if (!editingMat) return;
    await updateMedžiaga(editingMat.id, pav, vnt);
    await loadData();
    addNotif('success', 'Atnaujinta', 'Medžiaga atnaujinta');
  };
  const handleDeleteMat = async (m: KainuMedžiaga) => {
    if (!confirm(`Ištrinti "\${m.pavadinimas}" ir visus jos kainų įrašus?`)) return;
    setDelMatId(m.id);
    try { await deleteMedžiaga(m.id); await loadData(); addNotif('info', 'Ištrinta', `"\${m.pavadinimas}" pašalinta`); }
    catch (err: any) { addNotif('error', 'Klaida', err.message); }
    finally { setDelMatId(null); }
  };
  const handleAddPrice = async (mid: number, data: string, min: number|null, max: number|null, notes: string|null) => {
    await insertIrašas(mid, data, min, max, notes);
    await loadData();
    addNotif('success', 'Pridėta', 'Kaina pridėta');
  };
  const handleUpdatePrice = async (mid: number, data: string, min: number|null, max: number|null, notes: string|null) => {
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

  // ---- helpers ----
  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('lt-LT', { year: '2-digit', month: '2-digit', day: '2-digit' });

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

  // ---- render ----
  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>

      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Žaliavų Kainos</h2>
          <div className="flex items-center gap-2">
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
                    <th className="px-3 py-3 text-left whitespace-nowrap" style={{ minWidth: 70 }}>
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
                    <tr key={m.id} className="group" style={{ borderBottom: '1px solid #f8f6f3' }}>
                      <td className="px-4 py-2.5 sticky left-0 z-10 bg-white group-hover:bg-[#fdfcfb]" style={{ minWidth: 220 }}>
                        <span className="text-xs font-medium" style={{ color: '#3d3935' }}>{m.pavadinimas}</span>
                      </td>
                      <td className="px-3 py-2.5" style={{ minWidth: 70 }}>
                        <span className="text-xs" style={{ color: '#8a857f' }}>{m.vienetas}</span>
                      </td>
                      {dates.map(d => {
                        const e = priceMatrix.get(`${m.id}-${d}`);
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
                              <button onClick={() => setShowPriceMod({ defId: m.id })}
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
                          <button onClick={() => handleDeleteMat(m)} disabled={delMatId === m.id}
                            className="p-1.5 rounded-md hover:bg-red-50 transition-colors" title="Ištrinti">
                            {delMatId === m.id
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
                {analytics?.sukurta_at && (
                  <span className="text-xs" style={{ color: '#8a857f' }}>
                    Atnaujinta: {new Date(analytics.sukurta_at).toLocaleString('lt-LT')}
                  </span>
                )}
              </div>
              <button onClick={generateAnalytics} disabled={genLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-95 disabled:opacity-60"
                style={{ background: '#007AFF' }}>
                {genLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{genStep === 'geo' ? 'Ieško įvykių...' : 'Analizuoja...'}</>
                  : <><RefreshCw className="w-3.5 h-3.5" />Regeneruoti</>}
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

      {/* Modals */}
      {showAddMat && (
        <AddMaterialModal onSave={handleAddMat} onClose={() => setShowAddMat(false)} />
      )}
      {editingMat && (
        <AddMaterialModal initial={editingMat} onSave={handleUpdateMat} onClose={() => setEditingMat(null)} />
      )}
      {showPriceMod && (
        <PriceModal medziagas={medziagas} defaultMedzaigaId={showPriceMod.defId}
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
