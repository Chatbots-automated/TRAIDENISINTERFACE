import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, AlertCircle, RefreshCw, Filter, X, ChevronUp, ChevronDown, FileText } from 'lucide-react';
import type { AppUser } from '../types';
import { fetchStandartiniaiProjektai, fetchNestandartiniaiDokumentai, updateNestandartiniaiField } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord } from '../lib/dokumentaiService';
import { PaklausimoModal } from './PaklausimoKortele';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

type TableName = 'standartiniai_projektai' | 'n8n_vector_store';
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
// Column config for nestandartiniai – metadata fields shown as own columns
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  label: string;
  /** If set, value comes from metadata[metaKey] instead of row[key] */
  metaKey?: string;
  width?: string;
  badge?: boolean;
  toggle?: boolean;
}

const NESTANDARTINIAI_COLS: ColumnDef[] = [
  { key: 'id', label: 'ID', width: 'w-16' },
  { key: 'status', label: 'Statusas', width: 'w-20', toggle: true },
  { key: 'project_name', label: 'Projektas' },
  { key: 'klientas', label: 'Klientas', badge: true },
  { key: 'meta_orientacija', label: 'Orientacija', metaKey: 'orientacija' },
  { key: 'meta_talpa_tipas', label: 'Talpos tipas', metaKey: 'talpa_tipas' },
  { key: 'meta_DN', label: 'DN', metaKey: 'DN', width: 'w-20' },
  { key: 'meta_derva', label: 'Derva', metaKey: 'derva' },
  { key: 'pateikimo_data', label: 'Data', width: 'w-28' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, string>;
  try { return JSON.parse(raw); } catch { return null; }
}

function getCellValue(row: any, col: ColumnDef): string {
  if (col.metaKey) {
    const meta = parseMetadata(row.metadata);
    return meta?.[col.metaKey] || '—';
  }
  const val = row[col.key];
  if (val === null || val === undefined) return '—';
  const str = String(val);
  return str.length > 120 ? str.slice(0, 120) + '…' : str;
}

function getColumns(rows: any[]): string[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const idIndex = keys.indexOf('id');
  if (idIndex > -1) { keys.splice(idIndex, 1); keys.sort(); keys.unshift('id'); } else { keys.sort(); }
  return keys;
}

function formatColumnName(col: string): string {
  return col.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function extractUniqueMetaValues(records: NestandartiniaiRecord[], key: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const meta = parseMetadata(r.metadata);
    if (meta && meta[key]) set.add(meta[key]);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// FilterDropdown
// ---------------------------------------------------------------------------

function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isActive = value !== '';

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
        <span>{isActive ? `${label}: ${value}` : label}</span>
        {isActive ? (
          <X className="w-3 h-3 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && options.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 mt-1.5 min-w-[160px] max-h-56 overflow-auto bg-white rounded-macos-lg py-1"
          style={{ border: '0.5px solid rgba(0,0,0,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
        >
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-macos-gray-400 hover:bg-macos-gray-50 transition-colors"
            >
              Visi
            </button>
          )}
          {options.map(opt => (
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: 'asc' });
  const [metadataFilters, setMetadataFilters] = useState<MetadataFilters>({ ...EMPTY_FILTERS });
  const [selectedCard, setSelectedCard] = useState<NestandartiniaiRecord | null>(null);

  useEffect(() => { loadStandartiniai(); loadNestandartiniai(); }, []);

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

  const filterOptions = useMemo(() => ({
    orientacija: extractUniqueMetaValues(nestandartiniaiData, 'orientacija'),
    derva: extractUniqueMetaValues(nestandartiniaiData, 'derva'),
    talpa_tipas: extractUniqueMetaValues(nestandartiniaiData, 'talpa_tipas'),
    DN: extractUniqueMetaValues(nestandartiniaiData, 'DN'),
  }), [nestandartiniaiData]);

  const isNestandartiniai = selectedTable === 'n8n_vector_store';
  const currentLoading = isNestandartiniai ? loadingNestandartiniai : loadingStandartiniai;
  const currentError = isNestandartiniai ? errorNestandartiniai : errorStandartiniai;
  const currentReload = isNestandartiniai ? loadNestandartiniai : loadStandartiniai;

  // Generic columns for standartiniai
  const genericCols = useMemo(() => getColumns(standartiniaiData), [standartiniaiData]);

  // Filtering
  const filteredData = useMemo(() => {
    let rows: any[] = isNestandartiniai ? nestandartiniaiData : standartiniaiData;
    const searchCols = isNestandartiniai ? ['id', 'project_name', 'klientas', 'pateikimo_data', 'derva', 'description'] : genericCols;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row => {
        // Search across direct fields
        const directMatch = searchCols.some(col => {
          const val = row[col];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
        if (directMatch) return true;
        // Also search metadata
        if (isNestandartiniai) {
          const meta = parseMetadata(row.metadata);
          if (meta) return Object.values(meta).some(v => String(v).toLowerCase().includes(q));
        }
        return false;
      });
    }

    if (isNestandartiniai) {
      const { orientacija, derva, talpa_tipas, DN, metadataSearch } = metadataFilters;
      if (orientacija || derva || talpa_tipas || DN || metadataSearch) {
        rows = rows.filter((row: NestandartiniaiRecord) => {
          const meta = parseMetadata(row.metadata);
          if (!meta) return false;
          if (orientacija && meta.orientacija !== orientacija) return false;
          if (derva && meta.derva !== derva) return false;
          if (talpa_tipas && meta.talpa_tipas !== talpa_tipas) return false;
          if (DN && meta.DN !== DN) return false;
          if (metadataSearch) {
            const mq = metadataSearch.toLowerCase();
            if (!Object.entries(meta).some(([k, v]) => k.toLowerCase().includes(mq) || String(v).toLowerCase().includes(mq))) return false;
          }
          return true;
        });
      }
    }

    return rows;
  }, [isNestandartiniai, nestandartiniaiData, standartiniaiData, searchQuery, genericCols, metadataFilters]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortConfig.column) return filteredData;
    return [...filteredData].sort((a, b) => {
      // For metadata columns, get value from metadata
      const colDef = isNestandartiniai ? NESTANDARTINIAI_COLS.find(c => c.key === sortConfig.column) : null;
      let aVal = colDef?.metaKey ? (parseMetadata(a.metadata)?.[colDef.metaKey] ?? null) : a[sortConfig.column];
      let bVal = colDef?.metaKey ? (parseMetadata(b.metadata)?.[colDef.metaKey] ?? null) : b[sortConfig.column];
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

  const handleSort = (column: string) => {
    setSortConfig(prev => prev.column === column ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'asc' });
  };

  const handleTableChange = (table: TableName) => {
    setSelectedTable(table);
    setSearchQuery('');
    setSortConfig({ column: '', direction: 'asc' });
    setMetadataFilters({ ...EMPTY_FILTERS });
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

  const totalCount = isNestandartiniai ? nestandartiniaiData.length : standartiniaiData.length;

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
        ) : isNestandartiniai ? (
          /* ---- Nestandartiniai table (custom columns from metadata) ---- */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  <th className="w-10 px-2 py-3"></th>
                  {NESTANDARTINIAI_COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap ${col.width || ''}`}
                    >
                      <div className="flex items-center gap-1">
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
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #f8f6f3' }}
                    onClick={() => setSelectedCard(row as NestandartiniaiRecord)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td className="w-10 px-2 py-2.5">
                      <button
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: '#8a857f' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#007AFF'; e.currentTarget.style.background = 'rgba(0,122,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#8a857f'; e.currentTarget.style.background = ''; }}
                        onClick={e => { e.stopPropagation(); setSelectedCard(row as NestandartiniaiRecord); }}
                        title="Atidaryti kortelę"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </td>
                    {NESTANDARTINIAI_COLS.map(col => {
                      if (col.toggle) {
                        const checked = !!row[col.key];
                        return (
                          <td key={col.key} className={`px-3 py-2.5 ${col.width || ''}`}>
                            <button
                              onClick={e => { e.stopPropagation(); handleToggleStatus(row.id, checked); }}
                              className={`macos-toggle ${checked ? 'active' : ''}`}
                              style={{ width: 36, height: 20, borderRadius: 10 }}
                            >
                              <span
                                className="macos-toggle-thumb"
                                style={{ width: 16, height: 16, top: 2, left: 2, borderRadius: 8 }}
                              />
                            </button>
                          </td>
                        );
                      }
                      const val = getCellValue(row, col);
                      return (
                        <td key={col.key} className={`px-3 py-2.5 ${col.width || ''}`}>
                          {col.badge && val !== '—' ? (
                            <span
                              className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full truncate max-w-[140px]"
                              style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}
                            >
                              {val}
                            </span>
                          ) : (
                            <span
                              className="block truncate max-w-[200px]"
                              style={{ color: col.key === 'id' ? '#8a857f' : '#3d3935', fontSize: col.key === 'id' ? '12px' : '13px' }}
                              title={val}
                            >
                              {val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}
            >
              <span>
                {sortedData.length < totalCount ? `${sortedData.length} iš ${totalCount} įrašų` : `${sortedData.length} įrašų`}
              </span>
            </div>
          </div>
        ) : (
          /* ---- Standartiniai table (generic columns) ---- */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  {genericCols.map(col => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{formatColumnName(col)}</span>
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
                {sortedData.map((row, i) => (
                  <tr key={row.id ?? i} style={{ borderBottom: '1px solid #f8f6f3' }}>
                    {genericCols.map(col => {
                      const val = row[col];
                      const display = val === null || val === undefined ? '—' : String(val).length > 120 ? String(val).slice(0, 120) + '…' : String(val);
                      return (
                        <td key={col} className="px-3 py-2.5 max-w-xs truncate" style={{ color: '#3d3935', fontSize: '13px' }} title={String(val ?? '')}>
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

      {selectedCard && (
        <PaklausimoModal record={selectedCard} onClose={() => setSelectedCard(null)} onDeleted={loadNestandartiniai} onRefresh={(updated) => { setSelectedCard(updated); loadNestandartiniai(); }} />
      )}
    </div>
  );
}
