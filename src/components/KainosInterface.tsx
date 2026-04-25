import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Pencil, RefreshCw, Loader2, X, Upload,
  Globe, TrendingUp, Sparkles, BarChart2, AlertTriangle, LineChart as LineChartIcon, FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';
import {
  fetchMedziagas, fetchIstorija,
  insertMedžiaga, updateMedžiaga, deleteMedžiaga,
  insertIrašas, updateIrašas, deleteIrašas,
  bulkInsertMedziagas, bulkInsertIstorija,
  formatPrice, relativeTime,
} from '../lib/kainosService';
import type { Medžiaga, KainuIrašas, PrognozėInternetas } from '../lib/kainosService';
import { renderMarkdown as renderMarkdownHtml } from './analize/markdownRenderer';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { AddMaterialModal, PriceModal } from './kainos/KainosModals';
import { SablonaiTab } from './kainos/SablonaiTab';
import { GrafaTab } from './kainos/GrafaTab';
import {
  extractUrlCitationsFromText,
  type AnalysisDebugState,
  type AnalysisSectionKey,
  type AnalysisSectionMeta,
} from './kainos/forecastParsing';
import {
  fetchInternetAnalyses,
  InternetAnalysisConfigError,
  parseTokenUsage,
  runInternetAnalysis,
  type InternetAnalysisId,
  type InternetAnalysisRecord,
} from '../lib/internetAnalysisService';

interface KainosInterfaceProps { user: AppUser; }

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
  const [runningSections, setRunningSections] = useState<Record<'nafta' | 'geo' | 'analysis', boolean>>({
    nafta: false,
    geo: false,
    analysis: false,
  });
  const [internetAnalyses, setInternetAnalyses] = useState<Record<InternetAnalysisId, InternetAnalysisRecord | null>>({
    nafta: null,
    politika: null,
    kainos: null,
  });
  const [analysisMeta, setAnalysisMeta] = useState<{
    nafta: AnalysisSectionMeta;
    geo: AnalysisSectionMeta;
    analysis: AnalysisSectionMeta;
  }>({
    nafta: { confidence: 0, citations: [] },
    geo: { confidence: 0, citations: [] },
    analysis: { confidence: 0, citations: [] },
  });
  const [analysisDebug, setAnalysisDebug] = useState<AnalysisDebugState>({
    lastRunAt: null,
    stepStatus: { nafta: 'idle', geo: 'idle', analysis: 'idle' },
    promptIssues: [],
    parser: null,
    missingForecastCodes: [],
    error: null,
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<AnalysisSectionKey, boolean>>({
    nafta: false,
    geo: false,
    analysis: false,
  });
  const [analysisFocus, setAnalysisFocus] = useState<AnalysisSectionKey>('analysis');
  const analysisFetchVersionRef = useRef(0);
  const [configWarning, setConfigWarning] = useState<{
    reason: string;
    promptContent: string;
    toolSchemaContent: string;
    resolvedPrompt?: string;
  } | null>(null);

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
      const [med, ist] = await Promise.all([
        fetchMedziagas(), fetchIstorija(),
      ]);
      setMedziagas(med);
      setIstorija(ist);
      // Legacy __general__ endpoint is no longer required for internet analysis UI.
      setAnalytics(null);
      return { med, ist, ana: null };
    } catch (err: any) {
      addNotif('error', 'Klaida', err.message || 'Nepavyko įkelti duomenų');
      return { med: [], ist: [], ana: null };
    } finally { setLoading(false); }
  }, []);

  // ---- internet analysis (single request per action) ----
  const loadInternetAnalysisState = useCallback(async (notifyOnError: boolean = false) => {
    const requestVersion = ++analysisFetchVersionRef.current;
    try {
      const rows = await fetchInternetAnalyses();
      if (requestVersion !== analysisFetchVersionRef.current) return;
      setInternetAnalyses({
        nafta: rows.find((r) => r.id === 'nafta') || null,
        politika: rows.find((r) => r.id === 'politika') || null,
        kainos: rows.find((r) => r.id === 'kainos') || null,
      });
    } catch (error) {
      if (notifyOnError) {
        addNotif('error', 'Klaida', error instanceof Error ? error.message : 'Nepavyko įkelti analizės būsenos.');
      }
    }
  }, []);

  useEffect(() => {
    loadInternetAnalysisState();
    const interval = window.setInterval(loadInternetAnalysisState, 8000);
    return () => window.clearInterval(interval);
  }, [loadInternetAnalysisState]);

  const generateSingleAnalysis = useCallback(async (section: 'nafta' | 'geo' | 'analysis') => {
    if (genLoading || runningSections[section]) return;
    setGenLoading(true);
    setGenStep(section);
    setRunningSections((prev) => ({ ...prev, [section]: true }));
    try {
      const targetId: InternetAnalysisId = section === 'nafta' ? 'nafta' : section === 'geo' ? 'politika' : 'kainos';
      await runInternetAnalysis(targetId);
      await loadInternetAnalysisState(true);
      addNotif('success', 'Analizė atnaujinta', 'Sėkmingai sugeneruota');
    } catch (err: any) {
      if (err instanceof InternetAnalysisConfigError) {
        setConfigWarning({
          reason: err.reason,
          promptContent: err.promptContent,
          toolSchemaContent: err.toolSchemaContent,
          resolvedPrompt: err.resolvedPrompt,
        });
      }
      addNotif('error', 'Klaida', err?.message || 'Nepavyko sugeneruoti analizės');
    } finally {
      setGenLoading(false);
      setGenStep('idle');
      setRunningSections((prev) => ({ ...prev, [section]: false }));
    }
  }, [genLoading, loadInternetAnalysisState, runningSections]);

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
      className="text-[13px] leading-6"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdownHtml(text || '')) }}
    />
  );

  const naftaDisplay = streamNafta || internetAnalyses.nafta?.content || '';
  const geoDisplay = streamGeo || internetAnalyses.politika?.content || '';
  const analysisDisplay = streamAnalysis || internetAnalyses.kainos?.content || '';
  const lastUpdated = internetAnalyses.kainos?.date_updated || internetAnalyses.politika?.date_updated || internetAnalyses.nafta?.date_updated || null;
  const isGenerationBlocked = genLoading;
  const renderCitations = (meta: AnalysisSectionMeta, displayText: string) => {
    const fallbackCitations = extractUrlCitationsFromText(displayText || '');
    const merged = [...meta.citations];
    const seen = new Set(merged.map(c => `${c.title}|${c.url}`));
    for (const citation of fallbackCitations) {
      const key = `${citation.title}|${citation.url}`;
      if (!seen.has(key)) {
        merged.push(citation);
        seen.add(key);
      }
    }
    if (!merged.length) return null;
    return (
      <div className="mt-2 pt-2 border-t border-blue-100">
        <p className="text-[10px] font-semibold mb-1" style={{ color: '#1d4ed8' }}>Šaltiniai ({merged.length})</p>
        <ul className="space-y-1">
          {merged.slice(0, 8).map((c, idx) => (
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
          <GrafaTab medziagas={medziagas} istorija={istorija} analysisContent={internetAnalyses.kainos?.content || ""} onError={(msg) => addNotif('error', 'DI prognozė', msg)} />
        ) : (
          /* ---- ANALYTICS TAB ---- */
          <div className="space-y-5">
            <div className="rounded-3xl overflow-hidden"
              style={{ border: '1px solid #e5e7eb', boxShadow: '0 14px 34px rgba(15,23,42,0.08)', background: 'linear-gradient(135deg,#ffffff 0%,#f8fafc 100%)' }}>
              <div className="px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#64748b' }}>Web analizė</p>
                  <h3 className="text-lg font-semibold mt-1" style={{ color: '#1f2937' }}>AI analizės valdymas</h3>
                  <p className="text-xs mt-1.5" style={{ color: '#6b7280' }}>
                    {lastUpdated ? `Paskutinį kartą atnaujinta ${relativeTime(lastUpdated)}.` : 'Dar nėra sugeneruotos analizės.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => generateSingleAnalysis('nafta')} disabled={isGenerationBlocked}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:brightness-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%)' }}>
                    {isGenerationBlocked && genStep === 'nafta' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Oil Analysis
                  </button>
                  <button onClick={() => generateSingleAnalysis('geo')} disabled={isGenerationBlocked}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:brightness-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%)' }}>
                    {isGenerationBlocked && genStep === 'geo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Geopolitical Analysis
                  </button>
                  <button onClick={() => generateSingleAnalysis('analysis')} disabled={isGenerationBlocked}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:brightness-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)' }}>
                    {isGenerationBlocked && genStep === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Price Prediction
                  </button>
                </div>
              </div>
              {genLoading && (
                <div className="px-6 py-3" style={{ borderTop: '1px solid #dbeafe', background: '#eff6ff' }}>
                  <p className="text-xs font-medium" style={{ color: '#1e40af' }}>
                    {genStep === 'nafta' ? 'Vykdoma naftos analizė…' : genStep === 'geo' ? 'Vykdoma geopolitinė analizė…' : 'Vykdoma kainų prognozė…'}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
              <aside className="rounded-2xl bg-white p-3"
                style={{ border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
                {([
                  { key: 'nafta', label: 'Oil Analysis', sub: 'nafta', icon: BarChart2, bg: '#fff7ed', color: '#9a3412', confBg: '#ffedd5', confidence: 100 },
                  { key: 'geo', label: 'Geopolitical Analysis', sub: 'politika', icon: Globe, bg: '#eff6ff', color: '#1e40af', confBg: '#dbeafe', confidence: 100 },
                  { key: 'analysis', label: 'Price Prediction', sub: 'kainos', icon: TrendingUp, bg: '#ecfdf5', color: '#065f46', confBg: '#d1fae5', confidence: 100 },
                ] as const).map((item) => {
                  const active = analysisFocus === item.key;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setAnalysisFocus(item.key)}
                      className="w-full text-left rounded-xl px-3 py-3 mb-2 last:mb-0 transition-all"
                      style={{
                        background: active ? item.bg : '#fff',
                        border: `1px solid ${active ? item.confBg : '#eef2f7'}`,
                        boxShadow: active ? '0 4px 12px rgba(15,23,42,0.07)' : 'none',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg" style={{ background: item.bg }}>
                          <Icon className="w-4 h-4" style={{ color: item.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: '#1f2937' }}>{item.label}</p>
                          <p className="text-[10px]" style={{ color: '#94a3b8' }}>{item.sub}</p>
                        </div>
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: item.confBg, color: item.color }}>
                          ~{Math.round(item.confidence)}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </aside>

              <div className="rounded-2xl overflow-hidden bg-white"
                style={{
                  border: genLoading && genStep === analysisFocus ? '1px solid #bfdbfe' : '1px solid #e5e7eb',
                  boxShadow: genLoading && genStep === analysisFocus
                    ? '0 10px 25px rgba(59,130,246,0.10)'
                    : '0 10px 25px rgba(15,23,42,0.06)',
                }}>
                <div className="px-5 py-3 flex items-center justify-between"
                  style={{
                    background: analysisFocus === 'nafta' ? '#fff7ed' : analysisFocus === 'geo' ? '#eff6ff' : '#ecfdf5',
                    borderBottom: analysisFocus === 'nafta' ? '1px solid #ffedd5' : analysisFocus === 'geo' ? '1px solid #dbeafe' : '1px solid #d1fae5',
                  }}>
                  <div className="flex items-center gap-2">
                    {analysisFocus === 'nafta' ? <BarChart2 className="w-4 h-4" style={{ color: '#9a3412' }} /> : analysisFocus === 'geo' ? <Globe className="w-4 h-4" style={{ color: '#1e40af' }} /> : <TrendingUp className="w-4 h-4" style={{ color: '#065f46' }} />}
                    <span className="text-xs font-semibold" style={{ color: analysisFocus === 'nafta' ? '#9a3412' : analysisFocus === 'geo' ? '#1e40af' : '#065f46' }}>
                      {analysisFocus === 'nafta' ? 'Naftos kainos ir dervų ryšys' : analysisFocus === 'geo' ? 'Geopolitiniai įvykiai ir rinkos sąlygos' : 'Kainų analizė ir prognozė'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => generateSingleAnalysis(analysisFocus)}
                      disabled={isGenerationBlocked}
                      className="text-[10px] px-2.5 py-1 rounded-lg disabled:opacity-50"
                      style={{ color: '#334155', background: '#fff' }}
                    >
                      Generuoti
                    </button>
                    <button
                      onClick={() => setCollapsedSections(prev => ({ ...prev, [analysisFocus]: !prev[analysisFocus] }))}
                      className="text-[10px] px-2.5 py-1 rounded-lg"
                      style={{ color: '#334155', background: '#fff' }}
                    >
                      {collapsedSections[analysisFocus] ? 'Atverti tekstą' : 'Sutraukti tekstą'}
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 h-[520px] overflow-y-auto">
                  {genLoading && genStep === analysisFocus ? (
                    <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#2563eb' }} />
                      <span className="text-xs" style={{ color: '#64748b' }}>Atnaujinamas pasirinktas etapas…</span>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const currentText = analysisFocus === 'nafta' ? naftaDisplay : analysisFocus === 'geo' ? geoDisplay : analysisDisplay;
                        if (!currentText) {
                          return (
                            <div className="flex items-center gap-2 py-1">
                              <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                              <span className="text-xs" style={{ color: '#8a857f' }}>No analysis generated yet.</span>
                            </div>
                          );
                        }
                        if (collapsedSections[analysisFocus]) {
                          return <p className="text-xs italic" style={{ color: '#8a857f' }}>Turinys suskleistas. Paspauskite „Atverti tekstą“.</p>;
                        }
                        return <div className="max-w-4xl">{renderMd(currentText)}</div>;
                      })()}
                    </>
                  )}
                  {(() => {
                    const tokenData = analysisFocus === 'nafta'
                      ? parseTokenUsage(internetAnalyses.nafta?.tokens || null)
                      : analysisFocus === 'geo'
                        ? parseTokenUsage(internetAnalyses.politika?.tokens || null)
                        : parseTokenUsage(internetAnalyses.kainos?.tokens || null);
                    if (!tokenData) return null;
                    return (
                      <div className="mt-3 pt-2 border-t border-slate-200 text-[11px]" style={{ color: '#64748b' }}>
                        Input: {tokenData.input.toLocaleString('lt-LT')} · Output: {tokenData.output.toLocaleString('lt-LT')} · Total: {tokenData.total.toLocaleString('lt-LT')}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
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

      {configWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => setConfigWarning(null)}>
          <div
            className="w-full max-w-3xl bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 24px 60px rgba(15,23,42,0.22)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 className="text-sm font-semibold" style={{ color: '#0f172a' }}>Konfigūracijos klaida</h4>
                <p className="text-xs mt-1" style={{ color: '#64748b' }}>{configWarning.reason}</p>
              </div>
              <button onClick={() => setConfigWarning(null)} className="p-1.5 rounded hover:bg-slate-100">
                <X className="w-4 h-4" style={{ color: '#64748b' }} />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#334155' }}>Prompt content</p>
                <pre className="text-xs whitespace-pre-wrap rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                  {configWarning.promptContent?.trim() ? configWarning.promptContent : '[Prompt is empty]'}
                </pre>
              </div>
              {configWarning.resolvedPrompt && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#334155' }}>Resolved prompt (runtime)</p>
                  <pre className="text-xs whitespace-pre-wrap rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                    {configWarning.resolvedPrompt}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#334155' }}>Tool schema content</p>
                <pre className="text-xs whitespace-pre-wrap rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                  {configWarning.toolSchemaContent?.trim() ? configWarning.toolSchemaContent : '[Tool schema is empty → analysis runs without tools]'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      <NotificationContainer notifications={notifs} onRemove={removeNotif} />
    </div>
  );
}
