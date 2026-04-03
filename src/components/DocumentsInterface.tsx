import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, AlertCircle, RefreshCw, Filter, X, ChevronUp, ChevronDown, FileText, Eye, Trash2, GripVertical, Columns3, Check, Download } from 'lucide-react';
import type { AppUser } from '../types';
import { fetchStandartiniaiProjektai, fetchNestandartiniaiDokumentai, updateNestandartiniaiField, deleteNestandartiniaiRecord, deleteStandartinisProjektas, fetchTalpos } from '../lib/dokumentaiService';
import { getDefaultTemplate } from '../lib/documentTemplateService';
import { getDirectusFileUrl } from '../lib/globalTemplateService';
import type { NestandartiniaiRecord } from '../lib/dokumentaiService';
import { PaklausimoModal } from './PaklausimoKortele';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

type TableName = 'standartiniai_projektai' | 'n8n_vector_store' | 'talpos';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: string;
  direction: SortDirection;
}

interface MetadataFilters {
  orientacija: string;
  derva: string;
  talpa_tipas: string;
  DN: string;
  metadataSearch: string;
}

const EMPTY_FILTERS: MetadataFilters = {
  orientacija: '',
  derva: '',
  talpa_tipas: '',
  DN: '',
  metadataSearch: '',
};

// ---------------------------------------------------------------------------
// Column config interface (shared by standartiniai)
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  label: string;
  width?: string;
  badge?: boolean;
  toggle?: boolean;
}

function getOrderedCols(allCols: ColumnDef[], savedOrder: string[] | null): ColumnDef[] {
  if (!savedOrder) return allCols;
  const byKey = new Map(allCols.map(c => [c.key, c]));
  const ordered: ColumnDef[] = [];
  for (const key of savedOrder) {
    const col = byKey.get(key);
    if (col) { ordered.push(col); byKey.delete(key); }
  }
  for (const col of byKey.values()) ordered.push(col);
  return ordered;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrapper keys that may contain the actual products array */
const PRODUCT_WRAPPER_KEYS = ['products', 'talpos', 'gaminiai', 'items'];

function unwrapFirstProduct(obj: Record<string, any>): Record<string, string> {
  // Check if the object is a wrapper like { products: [{...}] }
  for (const key of PRODUCT_WRAPPER_KEYS) {
    if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
      return obj[key][0];
    }
  }
  return obj as Record<string, string>;
}

/** Cache for parseMetadata — avoids redundant JSON.parse across thousands of cell renders */
const _metadataCache = new WeakMap<object, Record<string, string> | null>();
const _metadataStringCache = new Map<string, Record<string, string> | null>();
const _METADATA_STRING_CACHE_MAX = 500;

function parseMetadata(raw: string | Record<string, string> | any[] | null | undefined): Record<string, string> | null {
  if (!raw) return null;

  // For object/array refs, use WeakMap (GC-friendly)
  if (typeof raw === 'object') {
    if (_metadataCache.has(raw as object)) return _metadataCache.get(raw as object)!;
    let result: Record<string, string> | null;
    if (Array.isArray(raw)) {
      const first = raw[0];
      result = (first && typeof first === 'object') ? unwrapFirstProduct(first) : null;
    } else {
      result = unwrapFirstProduct(raw as Record<string, any>);
    }
    _metadataCache.set(raw as object, result);
    return result;
  }

  // For strings, use a Map keyed by the string content
  if (_metadataStringCache.has(raw)) return _metadataStringCache.get(raw)!;
  let result: Record<string, string> | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      result = (first && typeof first === 'object') ? unwrapFirstProduct(first) : null;
    } else {
      result = unwrapFirstProduct(parsed);
    }
  } catch { /* invalid JSON */ }
  if (_metadataStringCache.size >= _METADATA_STRING_CACHE_MAX) _metadataStringCache.clear();
  _metadataStringCache.set(raw, result);
  return result;
}

/**
 * Map from old-format table column keys to possible new-format key aliases.
 * The LLM extraction prompt produces keys like "Orientacija", "Medžiaga",
 * "Skersmuo_mm", etc., while the table columns expect "orientacija", "DN", etc.
 */
const META_KEY_ALIASES: Record<string, string[]> = {
  orientacija: ['Orientacija', 'orientacija'],
  talpa_tipas: ['Talpa_tipas', 'talpa_tipas', 'Medžiaga', 'Vieta'],
  DN: ['DN', 'Skersmuo_mm', 'skersmuo_mm', 'Skersmuo Mm'],
  derva: ['derva', 'Medžiaga'],
  derva_musu: ['derva_musu', 'Derva_musu'],
};

/** Look up a metadata value by key, trying aliases and case-insensitive fallback */
function getMetaValue(meta: Record<string, any> | null, key: string): string | undefined {
  if (!meta) return undefined;

  // 1. Direct match
  if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') return String(meta[key]);

  // 2. Check known aliases
  const aliases = META_KEY_ALIASES[key];
  if (aliases) {
    for (const alias of aliases) {
      if (meta[alias] !== undefined && meta[alias] !== null && meta[alias] !== '') return String(meta[alias]);
    }
  }

  // 3. Case-insensitive fallback
  const keyLower = key.toLowerCase();
  for (const [k, v] of Object.entries(meta)) {
    if (k.toLowerCase() === keyLower && v !== undefined && v !== null && v !== '') return String(v);
  }

  return undefined;
}

/** Parse ALL products from metadata (not just the first) */
function parseAllProducts(raw: any): Record<string, any>[] {
  if (!raw) return [];
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return []; } }
  if (Array.isArray(obj)) return obj.filter((item: any) => item && typeof item === 'object' && !Array.isArray(item));
  if (obj && typeof obj === 'object') {
    for (const key of PRODUCT_WRAPPER_KEYS) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
    }
    return [obj];
  }
  return [];
}

/** Truncate a comma-separated list to fit ~30 chars */
function truncateList(items: string[], maxLen = 30): string {
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].length > maxLen ? items[0].slice(0, maxLen - 1) + '…' : items[0];
  let result = items[0];
  for (let i = 1; i < items.length; i++) {
    const next = result + ', ' + items[i];
    if (next.length > maxLen) return result + ', …';
    result = next;
  }
  return result;
}

/** Format derva (org) across all tanks — unique values, truncated */
function formatDervaOrg(raw: any, maxLen = 30): string {
  const products = parseAllProducts(raw);
  if (products.length === 0) return '—';
  const values: string[] = [];
  for (const p of products) {
    const d = getMetaValue(p, 'derva') || getMetaValue(p, 'Medžiaga');
    if (d && !values.includes(d)) values.push(d);
  }
  return truncateList(values, maxLen);
}

/** Format derva (mūsų) across all tanks — unique values, truncated */
function formatDervaMusu(raw: any, maxLen = 30): string {
  const products = parseAllProducts(raw);
  if (products.length === 0) return '—';
  // Check _derva_musu_per_tank at the root level
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { obj = null; } }
  const root = Array.isArray(obj) ? obj[0] : obj;
  const perTank = root?._derva_musu_per_tank;
  if (perTank && typeof perTank === 'object') {
    const unique = [...new Set(Object.values(perTank).filter(Boolean).map(String))];
    if (unique.length > 0) return truncateList(unique, maxLen);
  }
  // Fallback: check each product's derva_musu
  const values: string[] = [];
  for (const p of products) {
    const d = getMetaValue(p, 'derva_musu');
    if (d && !values.includes(d)) values.push(d);
  }
  return truncateList(values, maxLen);
}

function getProjectNameFromMetadata(row: any): string | undefined {
  const meta = parseMetadata(row.metadata);
  if (!meta) return undefined;
  if (meta.projektas) return String(meta.projektas);
  const projName = getMetaValue(meta, 'projekto_kontekstas_Projekto_pavadinimas');
  if (projName) return projName;
  return undefined;
}

// ---------------------------------------------------------------------------
// Column config for standartiniai – same ColumnDef pattern as nestandartiniai
// ---------------------------------------------------------------------------

/** Default columns shown in the standartiniai table. */
const DEFAULT_STANDARTINIAI_COLS: ColumnDef[] = [
  { key: 'id', label: 'ID', width: 'w-16' },
  { key: 'projekto_kodas', label: 'Projekto kodas' },
  { key: 'hnv', label: 'HNV' },
  { key: 'docx_file_id', label: 'DOCX' },
  { key: 'date_created', label: 'Sukūrimo data', width: 'w-36' },
  { key: 'date_updated', label: 'Atnaujinimo data', width: 'w-36' },
  { key: 'status', label: 'Būsena', width: 'w-24' },
];

const DEFAULT_STANDARTINIAI_VISIBLE_KEYS = new Set(DEFAULT_STANDARTINIAI_COLS.map(c => c.key));

/** DB fields not useful as columns in standartiniai */
const HIDDEN_STANDARTINIAI_DB_FIELDS = new Set(['conversation_id', 'yaml_content', 'html_content']);

const STANDARTINIAI_COL_ORDER_KEY = 'traidenis_col_order_standartiniai';
const STANDARTINIAI_COL_HIDDEN_KEY = 'traidenis_col_hidden_standartiniai';

function loadStandartiniaiColOrder(): string[] | null {
  try { const raw = localStorage.getItem(STANDARTINIAI_COL_ORDER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveStandartiniaiColOrder(keys: string[]) {
  try { localStorage.setItem(STANDARTINIAI_COL_ORDER_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
}
function loadStandartiniaiHiddenCols(): Set<string> {
  try { const raw = localStorage.getItem(STANDARTINIAI_COL_HIDDEN_KEY); return raw ? new Set(JSON.parse(raw)) : new Set(); } catch { return new Set(); }
}
function saveStandartiniaiHiddenCols(hidden: Set<string>) {
  try { localStorage.setItem(STANDARTINIAI_COL_HIDDEN_KEY, JSON.stringify([...hidden])); } catch { /* ignore */ }
}

/** Build all available standartiniai columns from data + defaults */
function buildAllStandartiniaiColumns(rows: any[]): ColumnDef[] {
  const byKey = new Map(DEFAULT_STANDARTINIAI_COLS.map(c => [c.key, c]));
  const result = [...DEFAULT_STANDARTINIAI_COLS];
  if (rows.length > 0) {
    for (const key of Object.keys(rows[0])) {
      if (byKey.has(key) || HIDDEN_STANDARTINIAI_DB_FIELDS.has(key)) continue;
      const label = key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      result.push({ key, label });
      byKey.set(key, { key, label });
    }
  }
  return result;
}

/** Lithuanian label fallback for any column */
function formatColumnName(col: string): string {
  return col.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function extractUniqueMetaValues(records: NestandartiniaiRecord[], key: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const meta = parseMetadata(r.metadata);
    const val = getMetaValue(meta, key);
    if (val) set.add(val);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// FilterDropdown
// ---------------------------------------------------------------------------

const DROPDOWN_SEARCH_THRESHOLD = 8;
const DROPDOWN_MAX_VISIBLE = 30;

function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && options.length >= DROPDOWN_SEARCH_THRESHOLD) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    if (!open) setDropdownSearch('');
  }, [open, options.length]);

  const isActive = value !== '';

  const visibleOptions = useMemo(() => {
    let filtered = options;
    if (dropdownSearch.trim()) {
      const kw = dropdownSearch.toLowerCase();
      filtered = options.filter(o => o.toLowerCase().includes(kw));
    }
    return filtered.slice(0, DROPDOWN_MAX_VISIBLE);
  }, [options, dropdownSearch]);

  const hiddenCount = options.length - visibleOptions.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer ${
          isActive
            ? 'text-white shadow-sm'
            : 'text-macos-gray-500 hover:text-macos-gray-700 hover:bg-macos-gray-100'
        }`}
        style={isActive ? { background: '#007AFF' } : { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)' }}
      >
        <span>{isActive ? `${label}: ${value}` : `${label} (${options.length})`}</span>
        {isActive ? (
          <X className="w-3 h-3 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && options.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 mt-1.5 min-w-[180px] max-h-64 overflow-auto bg-white rounded-macos-lg py-1"
          style={{ border: '0.5px solid rgba(0,0,0,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
        >
          {options.length >= DROPDOWN_SEARCH_THRESHOLD && (
            <div className="px-2 py-1.5 sticky top-0 bg-white" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={dropdownSearch}
                onChange={e => setDropdownSearch(e.target.value)}
                placeholder="Ieškoti..."
                className="w-full px-2 py-1 text-xs rounded bg-macos-gray-50 outline-none"
                style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}
              />
            </div>
          )}
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-macos-gray-400 hover:bg-macos-gray-50 transition-colors"
            >
              Visi
            </button>
          )}
          {visibleOptions.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                opt === value ? 'font-medium' : 'text-macos-gray-700 hover:bg-macos-gray-50'
              }`}
              style={opt === value ? { color: '#007AFF', background: 'rgba(0,122,255,0.06)' } : undefined}
            >
              {opt}
            </button>
          ))}
          {hiddenCount > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-macos-gray-400">
              +{hiddenCount} daugiau — naudokite paiešką
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

function FilterBar({ filters, onChange, options }: {
  filters: MetadataFilters;
  onChange: (f: MetadataFilters) => void;
  options: { orientacija: string[]; derva: string[]; talpa_tipas: string[]; DN: string[] };
}) {
  const hasActive = Object.values(filters).some(v => v !== '');
  const update = (key: keyof MetadataFilters, value: string) => onChange({ ...filters, [key]: value });
  const activeCount = [filters.orientacija, filters.derva, filters.talpa_tipas, filters.DN, filters.metadataSearch].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs shrink-0 mr-1" style={{ color: '#8a857f' }}>
        <Filter className="w-3.5 h-3.5" />
        <span className="font-medium">Filtrai</span>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold"
            style={{ background: '#007AFF' }}
          >
            {activeCount}
          </span>
        )}
      </div>

      <FilterDropdown label="Orientacija" value={filters.orientacija} options={options.orientacija} onChange={v => update('orientacija', v)} />
      <FilterDropdown label="Derva" value={filters.derva} options={options.derva} onChange={v => update('derva', v)} />
      <FilterDropdown label="Talpa tipas" value={filters.talpa_tipas} options={options.talpa_tipas} onChange={v => update('talpa_tipas', v)} />
      <FilterDropdown label="DN" value={filters.DN} options={options.DN} onChange={v => update('DN', v)} />

      <div className="relative">
        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#8a857f' }} />
        <input
          type="text"
          placeholder="Ieškoti metadata..."
          value={filters.metadataSearch}
          onChange={e => update('metadataSearch', e.target.value)}
          className="h-7 text-xs rounded-full pl-7 pr-3 w-[170px] outline-none transition-all"
          style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; e.currentTarget.style.background = '#fff'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
        />
      </div>

      {hasActive && (
        <button
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{ color: '#FF3B30' }}
        >
          <X className="w-3 h-3" />
          Išvalyti
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [selectedTable, setSelectedTable] = useState<TableName>('n8n_vector_store');
  const [standartiniaiData, setStandartiniaiData] = useState<any[]>([]);
  const [nestandartiniaiData, setNestandartiniaiData] = useState<NestandartiniaiRecord[]>([]);
  const [loadingStandartiniai, setLoadingStandartiniai] = useState(true);
  const [loadingNestandartiniai, setLoadingNestandartiniai] = useState(true);
  const [errorStandartiniai, setErrorStandartiniai] = useState<string | null>(null);
  const [errorNestandartiniai, setErrorNestandartiniai] = useState<string | null>(null);
  const [talposData, setTalposData] = useState<any[]>([]);
  const [loadingTalpos, setLoadingTalpos] = useState(true);
  const [errorTalpos, setErrorTalpos] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: 'asc' });
  const [metadataFilters, setMetadataFilters] = useState<MetadataFilters>({ ...EMPTY_FILTERS });
  const [selectedCard, setSelectedCard] = useState<NestandartiniaiRecord | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [talposJsonPreview, setTalposJsonPreview] = useState<{ col: string; value: any } | null>(null);

  // Pagination
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  const isNestandartiniai = selectedTable === 'n8n_vector_store';
  const isTalpos = selectedTable === 'talpos';

  // ── Standartiniai column config ──
  const allColsStand = useMemo(() => buildAllStandartiniaiColumns(standartiniaiData), [standartiniaiData]);
  const [hiddenColsStand, setHiddenColsStand] = useState<Set<string>>(() => {
    const saved = loadStandartiniaiHiddenCols();
    if (saved.size === 0 && localStorage.getItem(STANDARTINIAI_COL_HIDDEN_KEY) === null) return new Set();
    return saved;
  });
  const [colOrderStand, setColOrderStand] = useState<string[]>(() => loadStandartiniaiColOrder() || DEFAULT_STANDARTINIAI_COLS.map(c => c.key));
  const visibleColsStand = useMemo(() => allColsStand.filter(c => !hiddenColsStand.has(c.key)), [allColsStand, hiddenColsStand]);
  const orderedColsStand = useMemo(() => getOrderedCols(visibleColsStand, colOrderStand), [visibleColsStand, colOrderStand]);

  // ── Unified column config (standartiniai only — nestandartiniai uses fixed columns) ──
  const allCols = allColsStand;
  const orderedCols = orderedColsStand;

  const [showColConfig, setShowColConfig] = useState(false);
  const colConfigRef = useRef<HTMLDivElement>(null);
  const dragColRef = useRef<string | null>(null);
  const dragOverColRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showColConfig) return;
    const handler = (e: MouseEvent) => {
      if (colConfigRef.current && !colConfigRef.current.contains(e.target as Node)) setShowColConfig(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColConfig]);

  const hiddenCols = hiddenColsStand;

  const handleColDragStart = useCallback((key: string) => { dragColRef.current = key; }, []);
  const handleColDragOver = useCallback((e: React.DragEvent, key: string) => { e.preventDefault(); dragOverColRef.current = key; }, []);
  const handleColDrop = useCallback(() => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    if (!from || !to || from === to) return;
    setColOrderStand(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      saveStandartiniaiColOrder(next);
      return next;
    });
    dragColRef.current = null;
    dragOverColRef.current = null;
  }, []);

  const toggleColumnVisibility = useCallback((key: string) => {
    setHiddenColsStand(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveStandartiniaiHiddenCols(next);
      return next;
    });
  }, []);

  const resetColumnsToDefault = useCallback(() => {
    const allKeys = allColsStand.map(c => c.key);
    const hidden = new Set(allKeys.filter(k => !DEFAULT_STANDARTINIAI_VISIBLE_KEYS.has(k)));
    setHiddenColsStand(hidden);
    saveStandartiniaiHiddenCols(hidden);
    setColOrderStand(DEFAULT_STANDARTINIAI_COLS.map(c => c.key));
    saveStandartiniaiColOrder(DEFAULT_STANDARTINIAI_COLS.map(c => c.key));
  }, [allColsStand]);

  // Load only the active table on mount and on every tab switch (lazy — avoids
  // pre-fetching tables the user may never visit and eliminates the double-fetch
  // of the default table that the previous two-effect pattern caused).
  // Nestandartiniai also needs talpos data to show "Talpa m3" per row.
  useEffect(() => {
    if (selectedTable === 'talpos') loadTalpos();
    else if (selectedTable === 'n8n_vector_store') {
      loadNestandartiniai();
      if (talposData.length === 0) loadTalpos();
    } else if (selectedTable === 'standartiniai_projektai') loadStandartiniai();
  }, [selectedTable]);

  const loadStandartiniai = async () => {
    try { setLoadingStandartiniai(true); setErrorStandartiniai(null); setStandartiniaiData(await fetchStandartiniaiProjektai()); }
    catch (err: any) { setErrorStandartiniai(err?.message || 'Nepavyko gauti duomenų'); }
    finally { setLoadingStandartiniai(false); }
  };
  const loadNestandartiniai = async () => {
    try { setLoadingNestandartiniai(true); setErrorNestandartiniai(null); setNestandartiniaiData(await fetchNestandartiniaiDokumentai()); }
    catch (err: any) { setErrorNestandartiniai(err?.message || 'Nepavyko gauti duomenų'); }
    finally { setLoadingNestandartiniai(false); }
  };
  const loadTalpos = async () => {
    try { setLoadingTalpos(true); setErrorTalpos(null); setTalposData(await fetchTalpos()); }
    catch (err: any) { setErrorTalpos(err?.message || 'Nepavyko gauti duomenų'); }
    finally { setLoadingTalpos(false); }
  };

  // Dynamically derive columns from talpos data
  const talposCols = useMemo(() => {
    if (talposData.length === 0) return [] as string[];
    const keys = new Set<string>();
    for (const row of talposData) { Object.keys(row).forEach(k => keys.add(k)); }
    return Array.from(keys);
  }, [talposData]);

  // Lookup map: talpos id (string) → row — used by nestandartiniai table to show Talpa m3
  const talposById = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of talposData) {
      if (row.id != null) map.set(String(row.id), row);
    }
    return map;
  }, [talposData]);

  const filterOptions = useMemo(() => ({
    orientacija: extractUniqueMetaValues(nestandartiniaiData, 'orientacija'),
    derva: extractUniqueMetaValues(nestandartiniaiData, 'derva'),
    talpa_tipas: extractUniqueMetaValues(nestandartiniaiData, 'talpa_tipas'),
    DN: extractUniqueMetaValues(nestandartiniaiData, 'DN'),
  }), [nestandartiniaiData]);

  const currentLoading = isTalpos ? loadingTalpos : isNestandartiniai ? loadingNestandartiniai : loadingStandartiniai;
  const currentError = isTalpos ? errorTalpos : isNestandartiniai ? errorNestandartiniai : errorStandartiniai;
  const currentReload = isTalpos ? loadTalpos : isNestandartiniai ? loadNestandartiniai : loadStandartiniai;

  // Filtering
  const filteredData = useMemo(() => {
    let rows: any[] = isTalpos ? talposData : isNestandartiniai ? nestandartiniaiData : standartiniaiData;

    if (searchQuery.trim()) {
      // Split into keywords for AND logic — every keyword must match somewhere in the record
      const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);

      if (isTalpos) {
        rows = rows.filter(row => {
          const blob = Object.values(row).map(v => String(v ?? '')).join(' ').toLowerCase();
          return keywords.every(kw => blob.includes(kw));
        });
      } else if (isNestandartiniai) {
        rows = rows.filter((row: NestandartiniaiRecord) => {
          // Build a searchable text blob from all record fields
          const parts: string[] = [];
          // Direct fields
          if (row.id != null) parts.push(String(row.id));
          if (row.project_name) parts.push(row.project_name);
          if (row.klientas) parts.push(row.klientas);
          if (row.pateikimo_data) parts.push(row.pateikimo_data);
          // description column removed from DB; santrauka is inside metadata
          if (row.derva) parts.push(row.derva);
          // All metadata values (includes derva_musu)
          const meta = parseMetadata(row.metadata);
          if (meta) {
            for (const v of Object.values(meta)) {
              if (v) parts.push(String(v));
            }
          }
          // Formatted derva (org) with cheminis sluoksnis
          const dervaOrgFormatted = formatDervaOrg(row.metadata);
          if (dervaOrgFormatted !== '—') parts.push(dervaOrgFormatted);
          const dervaMusuFormatted = formatDervaMusu(row.metadata);
          if (dervaMusuFormatted !== '—') parts.push(dervaMusuFormatted);

          const blob = parts.join(' ').toLowerCase();
          return keywords.every(kw => blob.includes(kw));
        });
      } else {
        // Standartiniai: multi-criteria AND search across key fields
        rows = rows.filter(row => {
          const parts: string[] = [];
          if (row.id != null) parts.push(String(row.id));
          if (row.projekto_kodas) parts.push(row.projekto_kodas);
          if (row.hnv) parts.push(row.hnv);
          if (row.yaml_content) parts.push(String(row.yaml_content));
          // Also search all visible column fields for completeness
          for (const col of allColsStand) {
            const val = row[col.key];
            if (val !== null && val !== undefined) parts.push(String(val));
          }
          const blob = parts.join(' ').toLowerCase();
          return keywords.every(kw => blob.includes(kw));
        });
      }
    }

    if (!isTalpos && isNestandartiniai) {
      const { orientacija, derva, talpa_tipas, DN, metadataSearch } = metadataFilters;
      if (orientacija || derva || talpa_tipas || DN || metadataSearch) {
        rows = rows.filter((row: NestandartiniaiRecord) => {
          const meta = parseMetadata(row.metadata);
          if (!meta) return false;
          if (orientacija && getMetaValue(meta, 'orientacija') !== orientacija) return false;
          if (derva && getMetaValue(meta, 'derva') !== derva) return false;
          if (talpa_tipas && getMetaValue(meta, 'talpa_tipas') !== talpa_tipas) return false;
          if (DN && getMetaValue(meta, 'DN') !== DN) return false;
          if (metadataSearch) {
            const mq = metadataSearch.toLowerCase();
            if (!Object.entries(meta).some(([k, v]) => k.toLowerCase().includes(mq) || String(v).toLowerCase().includes(mq))) return false;
          }
          return true;
        });
      }
    }

    return rows;
  }, [isTalpos, isNestandartiniai, talposData, nestandartiniaiData, standartiniaiData, searchQuery, allColsStand, metadataFilters]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortConfig.column) return filteredData;
    return [...filteredData].sort((a, b) => {
      const colDef = isNestandartiniai ? allCols.find(c => c.key === sortConfig.column) : null;
      let aVal: any;
      let bVal: any;
      if (sortConfig.column === 'meta_derva_org') {
        aVal = formatDervaOrg(a.metadata);
        bVal = formatDervaOrg(b.metadata);
        if (aVal === '—') aVal = null;
        if (bVal === '—') bVal = null;
      } else if (colDef?.metaKey) {
        aVal = getMetaValue(parseMetadata(a.metadata), colDef.metaKey) ?? null;
        bVal = getMetaValue(parseMetadata(b.metadata), colDef.metaKey) ?? null;
      } else {
        aVal = a[sortConfig.column];
        bVal = b[sortConfig.column];
      }
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig, isNestandartiniai]);

  // Reset to page 1 when filters, search, sort, or table change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, metadataFilters, sortConfig, selectedTable]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return sortedData.slice(start, start + PAGE_SIZE);
  }, [sortedData, safeCurrentPage]);

  const handleSort = (column: string) => {
    setSortConfig(prev => prev.column === column ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' });
  };

  const handleTableChange = (table: TableName) => {
    setSelectedTable(table);
    setSearchQuery('');
    setSortConfig({ column: '', direction: 'asc' });
    setMetadataFilters({ ...EMPTY_FILTERS });
    setSelectedIds(new Set());
  };

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // Optimistic update
    setNestandartiniaiData(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    try {
      await updateNestandartiniaiField(id, 'status', newStatus);
    } catch {
      // Revert on error
      setNestandartiniaiData(prev => prev.map(r => r.id === id ? { ...r, status: currentStatus } : r));
    }
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = pagedData.map((r: any) => r.id as number);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      if (isNestandartiniai) {
        const toDelete = nestandartiniaiData.filter(r => selectedIds.has(r.id));
        for (const record of toDelete) {
          await deleteNestandartiniaiRecord(record);
        }
        setSelectedIds(new Set());
        setShowBulkDeleteConfirm(false);
        await loadNestandartiniai();
      } else {
        const toDelete = standartiniaiData.filter((r: any) => selectedIds.has(r.id));
        for (const record of toDelete) {
          await deleteStandartinisProjektas({ id: record.id, docx_file_id: record.docx_file_id });
        }
        setSelectedIds(new Set());
        setShowBulkDeleteConfirm(false);
        await loadStandartiniai();
      }
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      alert(`Klaida trinant įrašus: ${err?.message || 'Nežinoma klaida'}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const totalCount = isTalpos ? talposData.length : isNestandartiniai ? nestandartiniaiData.length : standartiniaiData.length;

  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
        {/* Top row: title + actions */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Dokumentai</h2>
          <button
            onClick={currentReload}
            disabled={currentLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-macos text-xs font-medium transition-all hover:brightness-95"
            style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${currentLoading ? 'animate-spin' : ''}`} />
            Atnaujinti
          </button>
        </div>

        {/* Segmented control + search */}
        <div className="flex items-center gap-4 mb-4">
          {/* macOS segmented control */}
          <div className="inline-flex rounded-macos p-0.5 shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <button
              onClick={() => handleTableChange('standartiniai_projektai')}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                selectedTable === 'standartiniai_projektai' ? 'text-macos-gray-900' : 'text-macos-gray-400 hover:text-macos-gray-600'
              }`}
              style={selectedTable === 'standartiniai_projektai' ? {
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              } : undefined}
            >
              Standartiniai
            </button>
            <button
              onClick={() => handleTableChange('n8n_vector_store')}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                selectedTable === 'n8n_vector_store' ? 'text-macos-gray-900' : 'text-macos-gray-400 hover:text-macos-gray-600'
              }`}
              style={selectedTable === 'n8n_vector_store' ? {
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              } : undefined}
            >
              Nestandartiniai
            </button>
            <button
              onClick={() => handleTableChange('talpos')}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                selectedTable === 'talpos' ? 'text-macos-gray-900' : 'text-macos-gray-400 hover:text-macos-gray-600'
              }`}
              style={selectedTable === 'talpos' ? {
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              } : undefined}
            >
              Talpos
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a857f' }} />
            <input
              type="text"
              placeholder="Ieškoti..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 text-sm rounded-macos pl-9 pr-3 outline-none transition-all"
              style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
            />
          </div>

          {/* Column config button — only for standartiniai */}
          {!isTalpos && !isNestandartiniai && (
            <div className="relative" ref={colConfigRef}>
              <button
                onClick={() => setShowColConfig(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-macos text-xs font-medium transition-all hover:brightness-95 shrink-0"
                style={{ background: showColConfig ? 'rgba(0,122,255,0.08)' : 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: showColConfig ? '#007AFF' : '#5a5550' }}
              >
                <Columns3 className="w-3.5 h-3.5" />
                Stulpeliai
              </button>
              {showColConfig && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 w-72 max-h-[420px] overflow-auto rounded-xl shadow-lg border border-base-content/10 bg-base-100"
                  style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                >
                  <div className="px-3 py-2.5 border-b border-base-content/10 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70">Rodyti stulpelius</span>
                    <button
                      onClick={resetColumnsToDefault}
                      className="text-[11px] text-blue-500 hover:text-blue-600 font-medium"
                    >
                      Atkurti numatytuosius
                    </button>
                  </div>
                  {allCols.map(col => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumnVisibility(col.key)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-base-200/60 transition-colors text-sm"
                    >
                      <span
                        className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                        style={{
                          borderColor: hiddenCols.has(col.key) ? 'rgba(0,0,0,0.15)' : '#007AFF',
                          background: hiddenCols.has(col.key) ? 'transparent' : '#007AFF',
                        }}
                      >
                        {!hiddenCols.has(col.key) && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="text-base-content/80 truncate">{col.label}</span>
                      {col.metaKey && <span className="text-[10px] text-base-content/30 ml-auto shrink-0">meta</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters – only for nestandartiniai */}
        {isNestandartiniai && !currentLoading && nestandartiniaiData.length > 0 && (
          <FilterBar filters={metadataFilters} onChange={setMetadataFilters} options={filterOptions} />
        )}
      </div>

      {/* Error */}
      {currentError && (
        <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-3 rounded-macos text-sm" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{currentError}</span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {currentLoading ? (
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-md text-macos-blue"></span>
          </div>
        ) : sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-center">
            <div>
              <p className="text-base font-medium mb-1" style={{ color: '#3d3935' }}>
                {searchQuery || Object.values(metadataFilters).some(v => v) ? 'Nieko nerasta' : 'Nėra duomenų'}
              </p>
              <p className="text-sm" style={{ color: '#8a857f' }}>
                {searchQuery || Object.values(metadataFilters).some(v => v) ? 'Pakeiskite paieškos užklausą arba filtrus' : 'Lentelė tuščia'}
              </p>
            </div>
          </div>
        ) : isTalpos ? (
          /* ---- Talpos table (all fields) ---- */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  {talposCols.map(col => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{col}</span>
                        <span className="inline-flex flex-col leading-none">
                          <ChevronUp className={`w-2.5 h-2.5 ${sortConfig.column === col && sortConfig.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                          <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortConfig.column === col && sortConfig.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid #f8f6f3' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {talposCols.map(col => {
                      const val = row[col];
                      // Detect JSON: already an object/array, or a string that parses as one
                      let isJson = false;
                      let jsonValue: any = null;
                      if (val !== null && val !== undefined) {
                        if (typeof val === 'object') {
                          isJson = true;
                          jsonValue = val;
                        } else if (typeof val === 'string' && (val.trimStart().startsWith('{') || val.trimStart().startsWith('['))) {
                          try { jsonValue = JSON.parse(val); isJson = true; } catch { /* not json */ }
                        }
                      }
                      if (isJson) {
                        return (
                          <td key={col} className="px-3 py-2.5">
                            <button
                              onClick={() => setTalposJsonPreview({ col, value: jsonValue })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all hover:brightness-95"
                              style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}
                            >
                              <Eye className="w-3 h-3" />
                              JSON
                            </button>
                          </td>
                        );
                      }
                      const maxLen = 120;
                      const display = val === null || val === undefined ? '—' : String(val).length > maxLen ? String(val).slice(0, maxLen) + '…' : String(val);
                      return (
                        <td key={col} className="px-3 py-2.5 max-w-xs truncate" style={{ color: col === 'id' ? '#8a857f' : '#3d3935', fontSize: col === 'id' ? '12px' : '13px' }} title={String(val ?? '')}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}>
              <span>
                {sortedData.length < totalCount
                  ? `${sortedData.length} iš ${totalCount} įrašų`
                  : `${sortedData.length} įrašų`}
                {totalPages > 1 && ` · puslapis ${safeCurrentPage} iš ${totalPages}`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage(1)} disabled={safeCurrentPage <= 1} className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default">««</button>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1} className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default">«</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) page = i + 1;
                    else if (safeCurrentPage <= 3) page = i + 1;
                    else if (safeCurrentPage >= totalPages - 2) page = totalPages - 4 + i;
                    else page = safeCurrentPage - 2 + i;
                    return (
                      <button key={page} onClick={() => setCurrentPage(page)} className={`px-2 py-0.5 rounded ${page === safeCurrentPage ? 'font-bold' : 'hover:bg-macos-gray-100'}`} style={page === safeCurrentPage ? { color: '#007AFF' } : undefined}>{page}</button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages} className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default">»</button>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage >= totalPages} className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default">»»</button>
                </div>
              )}
            </div>
          </div>
        ) : isNestandartiniai ? (
          /* ---- Nestandartiniai table (fixed columns) ---- */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'rgba(0,122,255,0.04)', borderBottom: '1px solid #f0ede8' }}>
                <span className="text-xs font-medium" style={{ color: '#007AFF' }}>
                  Pasirinkta: {selectedIds.size}
                </span>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#e53e3e', background: 'rgba(229,62,62,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.08)')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Ištrinti
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs px-2 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#8a857f' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  Atšaukti
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  <th className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={sortedData.length > 0 && sortedData.every((r: any) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      title="Pasirinkti visus"
                    />
                  </th>
                  <th className="w-10 px-2 py-3"></th>
                  {(['id', 'status', 'project_name', 'talpu_kiekis', 'klientas', 'pateikimo_data', 'description', 'talpa_m3'] as const).map(key => {
                    const label = key === 'id' ? 'ID' : key === 'status' ? 'Statusas' : key === 'project_name' ? 'Projektas' : key === 'talpu_kiekis' ? 'Talpų Kiekis' : key === 'klientas' ? 'Klientas' : key === 'pateikimo_data' ? 'Data' : key === 'description' ? 'Santrauka' : 'Talpa m3';
                    return (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{label}</span>
                          <span className="inline-flex flex-col leading-none">
                            <ChevronUp className={`w-2.5 h-2.5 ${sortConfig.column === key && sortConfig.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                            <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortConfig.column === key && sortConfig.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row, i) => {
                  // Parse metadata JSON (handles string, object, or array wrapper)
                  let _meta: any = row.metadata;
                  if (typeof _meta === 'string') { try { _meta = JSON.parse(_meta); } catch { _meta = null; } }
                  if (Array.isArray(_meta) && _meta.length > 0) _meta = _meta[0];
                  // Santrauka from metadata root
                  const santrauka: string = _meta?.santrauka || _meta?.Santrauka || '';
                  // Talpa m3 from metadata.talpos[].Talpa_m3
                  const metaTalpos: any[] = Array.isArray(_meta?.talpos) ? _meta.talpos : [];
                  const talpaValues = metaTalpos.map((t: any) => t?.Talpa_m3 ?? t?.talpa_m3 ?? t?.talpa).filter((v: any) => v != null && v !== '');
                  const talpaM3 = talpaValues.length > 0 ? talpaValues.join(', ') : '—';
                  // Talpų Kiekis: use UUID field count, fall back to metadata array length
                  const uuidIds = (row.talpos || '').split(',').map((s: string) => s.trim()).filter(Boolean);
                  const talpaKiekis = uuidIds.length > 0 ? String(uuidIds.length) : (metaTalpos.length > 0 ? String(metaTalpos.length) : '—');
                  return (
                    <tr
                      key={row.id ?? i}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.06)' : 'rgba(0,122,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.03)' : '')}
                      style={{ borderBottom: '1px solid #f8f6f3', background: selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.03)' : '' }}
                    >
                      <td className="w-10 px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id as number)}
                          onChange={e => { e.stopPropagation(); toggleSelectId(row.id as number); }}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                        />
                      </td>
                      <td className="w-10 px-2 py-2.5">
                        <button
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: '#8a857f' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#007AFF'; e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#8a857f'; e.currentTarget.style.background = ''; }}
                          onClick={() => setSelectedCard(row as NestandartiniaiRecord)}
                          title="Atidaryti kortelę"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                      {/* ID */}
                      <td className="px-3 py-2.5 w-16">
                        <span style={{ color: '#8a857f', fontSize: '12px' }}>{row.id ?? '—'}</span>
                      </td>
                      {/* Statusas */}
                      <td className="px-3 py-2.5 w-20">
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleStatus(row.id, !!row.status); }}
                          className={`macos-toggle ${row.status ? 'active' : ''}`}
                          style={{ width: 36, height: 20, borderRadius: 10 }}
                        >
                          <span className="macos-toggle-thumb" style={{ width: 16, height: 16, top: 2, left: 2, borderRadius: 8 }} />
                        </button>
                      </td>
                      {/* Projektas */}
                      <td className="px-3 py-2.5">
                        <span className="block truncate max-w-[180px]" style={{ color: '#3d3935', fontSize: '13px' }} title={row.project_name || getProjectNameFromMetadata(row) || ''}>
                          {row.project_name || getProjectNameFromMetadata(row) || '—'}
                        </span>
                      </td>
                      {/* Talpų Kiekis */}
                      <td className="px-3 py-2.5 w-24">
                        <span style={{ color: '#3d3935', fontSize: '13px' }}>{talpaKiekis}</span>
                      </td>
                      {/* Klientas */}
                      <td className="px-3 py-2.5">
                        {row.klientas ? (
                          <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full truncate max-w-[140px]" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                            {row.klientas}
                          </span>
                        ) : <span style={{ color: '#8a857f', fontSize: '13px' }}>—</span>}
                      </td>
                      {/* Data */}
                      <td className="px-3 py-2.5 w-28">
                        <span style={{ color: '#3d3935', fontSize: '13px' }}>{row.pateikimo_data || '—'}</span>
                      </td>
                      {/* Santrauka */}
                      <td className="px-3 py-2.5">
                        <span className="block truncate max-w-[200px]" style={{ color: '#3d3935', fontSize: '13px' }} title={santrauka}>
                          {santrauka || '—'}
                        </span>
                      </td>
                      {/* Talpa m3 */}
                      <td className="px-3 py-2.5">
                        <span className="block truncate max-w-[150px]" style={{ color: '#3d3935', fontSize: '13px' }} title={talpaM3}>
                          {talpaM3}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}
            >
              <span>
                {sortedData.length < totalCount
                  ? `${sortedData.length} iš ${totalCount} įrašų`
                  : `${sortedData.length} įrašų`}
                {totalPages > 1 && ` · puslapis ${safeCurrentPage} iš ${totalPages}`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >
                    «
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (safeCurrentPage <= 3) {
                      page = i + 1;
                    } else if (safeCurrentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = safeCurrentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-2 py-0.5 rounded ${page === safeCurrentPage ? 'font-bold' : 'hover:bg-macos-gray-100'}`}
                        style={page === safeCurrentPage ? { color: '#007AFF' } : undefined}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >
                    »
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    className="px-2 py-0.5 rounded hover:bg-macos-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >
                    »»
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ---- Standartiniai table (configurable columns) ---- */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'rgba(0,122,255,0.04)', borderBottom: '1px solid #f0ede8' }}>
                <span className="text-xs font-medium" style={{ color: '#007AFF' }}>
                  Pasirinkta: {selectedIds.size}
                </span>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#e53e3e', background: 'rgba(229,62,62,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.08)')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Ištrinti
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs px-2 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#8a857f' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  Atšaukti
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  <th className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={sortedData.length > 0 && sortedData.every((r: any) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      title="Pasirinkti visus"
                    />
                  </th>
                  {orderedColsStand.map(col => (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={() => handleColDragStart(col.key)}
                      onDragOver={e => handleColDragOver(e, col.key)}
                      onDrop={handleColDrop}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap ${col.width || ''}`}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-base-content/20 shrink-0 cursor-grab" />
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{col.label}</span>
                        <span className="inline-flex flex-col leading-none">
                          <ChevronUp className={`w-2.5 h-2.5 ${sortConfig.column === col.key && sortConfig.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                          <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortConfig.column === col.key && sortConfig.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, i) => (
                  <tr
                    key={row.id ?? i}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid #f8f6f3', background: selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.03)' : '' }}
                    onMouseEnter={e => (e.currentTarget.style.background = selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.06)' : 'rgba(0,122,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = selectedIds.has(row.id as number) ? 'rgba(0,122,255,0.03)' : '')}
                  >
                    <td className="w-10 px-2 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id as number)}
                        onChange={e => { e.stopPropagation(); toggleSelectId(row.id as number); }}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      />
                    </td>
                    {orderedColsStand.map(col => {
                      const val = row[col.key];
                      // docx_file_id — show download button
                      if (col.key === 'docx_file_id') {
                        // Directus may return a plain UUID string or an object { id: '...' } for M2O file relations
                        const fileId = typeof val === 'object' && val !== null ? val.id : val;
                        return (
                          <td key={col.key} className="px-3 py-2.5">
                            {fileId ? (
                              <a
                                href={getDirectusFileUrl(fileId)}
                                download
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:brightness-95"
                                style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Atsisiųsti
                              </a>
                            ) : (
                              <span style={{ color: '#8a857f', fontSize: '13px' }}>—</span>
                            )}
                          </td>
                        );
                      }
                      // Date columns — format nicely
                      if ((col.key === 'date_created' || col.key === 'date_updated') && val) {
                        const d = new Date(val);
                        const formatted = isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('lt-LT') + ' ' + d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <td key={col.key} className="px-3 py-2.5 whitespace-nowrap" style={{ color: '#3d3935', fontSize: '13px' }}>
                            {formatted}
                          </td>
                        );
                      }
                      const maxLen = 120;
                      const display = val === null || val === undefined ? '—' : String(val).length > maxLen ? String(val).slice(0, maxLen) + '…' : String(val);
                      return (
                        <td key={col.key} className="px-3 py-2.5 max-w-xs truncate" style={{ color: '#3d3935', fontSize: '13px' }} title={String(val ?? '')}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}>
              <span>{sortedData.length < totalCount ? `${sortedData.length} iš ${totalCount} įrašų` : `${sortedData.length} įrašų`}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bulk delete confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}>
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: '#3d3935' }}>
              Ištrinti {selectedIds.size} {selectedIds.size === 1 ? 'įrašą' : selectedIds.size < 10 ? 'įrašus' : 'įrašų'}?
            </h3>
            <p className="text-sm mb-5" style={{ color: '#8a857f' }}>
              Pasirinkti įrašai ir jų failai bus ištrinti negrįžtamai. Šio veiksmo atšaukti negalima.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ color: '#3d3935', background: '#f5f3f0' }}
              >
                Atšaukti
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                style={{ background: bulkDeleting ? '#f87171' : '#e53e3e' }}
                onMouseEnter={e => { if (!bulkDeleting) e.currentTarget.style.background = '#c53030'; }}
                onMouseLeave={e => { if (!bulkDeleting) e.currentTarget.style.background = '#e53e3e'; }}
              >
                {bulkDeleting && (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                )}
                {bulkDeleting ? 'Trinama...' : 'Ištrinti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCard && (
        <PaklausimoModal record={selectedCard} onClose={() => setSelectedCard(null)} onDeleted={loadNestandartiniai} onRefresh={(updated) => { setSelectedCard(updated); loadNestandartiniai(); }} />
      )}

      {/* Talpos JSON viewer modal */}
      {talposJsonPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setTalposJsonPreview(null)}>
          <div
            className="bg-white rounded-xl shadow-xl flex flex-col w-full max-w-2xl mx-4"
            style={{ maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
              <span className="text-sm font-semibold" style={{ color: '#3d3935' }}>{talposJsonPreview.col}</span>
              <button
                onClick={() => setTalposJsonPreview(null)}
                className="p-1.5 rounded-md transition-colors hover:bg-gray-100"
                style={{ color: '#8a857f' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre
                className="text-xs rounded-lg p-4 overflow-auto"
                style={{ background: '#f8f6f3', color: '#3d3935', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {JSON.stringify(talposJsonPreview.value, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* HTML Preview Modal (view-only) */}
      {htmlPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setHtmlPreview(null)}>
          <div
            className="w-full max-w-4xl flex flex-col rounded-xl overflow-hidden bg-white shadow-xl"
            style={{ height: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
              <span className="text-sm font-semibold" style={{ color: '#3d3935' }}>Dokumento peržiūra</span>
              <button
                onClick={() => setHtmlPreview(null)}
                className="p-1.5 rounded-md transition-colors hover:bg-gray-100"
                style={{ color: '#8a857f' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 p-4">
              <div className="mx-auto bg-white shadow-sm rounded-lg" style={{ maxWidth: '210mm' }}>
                <iframe
                  srcDoc={(() => {
                    // Full HTML document (new format) — use as-is
                    if (htmlPreview.trim().match(/^<(!doctype|html)/i)) {
                      return htmlPreview;
                    }
                    // Legacy body-only content — wrap with template styles
                    const tpl = getDefaultTemplate();
                    const styleMatch = tpl.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
                    const styles = styleMatch ? styleMatch[0] : '';
                    return `<html><head><meta charset="UTF-8">${styles}</head><body class="c47 doc-content" style="max-width:523.2pt;margin:0 auto;padding:36pt;background:#fff;">${htmlPreview}</body></html>`;
                  })()}
                  className="w-full border-0"
                  style={{ minHeight: '297mm' }}
                  title="Dokumento peržiūra"
                  sandbox="allow-same-origin"
                  onLoad={(e) => {
                    // Auto-size iframe to content so only the outer container scrolls
                    const iframe = e.currentTarget;
                    const body = iframe.contentDocument?.body;
                    if (body) {
                      // Disable iframe internal scrolling
                      iframe.contentDocument!.documentElement.style.overflow = 'hidden';
                      const h = body.scrollHeight;
                      iframe.style.height = h + 'px';
                      iframe.style.minHeight = h + 'px';
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
