import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, AlertCircle, RefreshCw, Database, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import type { AppUser } from '../types';
import { fetchStandartiniaiProjektai, fetchNestandartiniaiDokumentai } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord } from '../lib/dokumentaiService';

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

/** Filters applied to metadata JSON fields */
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

const TABLE_OPTIONS: { value: TableName; label: string }[] = [
  { value: 'standartiniai_projektai', label: 'Standartiniai projektai' },
  { value: 'n8n_vector_store', label: 'Nestandartiniai (vector store)' },
];

/** Columns shown for nestandartiniai table */
const NESTANDARTINIAI_COLUMNS = ['id', 'description', 'metadata', 'project_name', 'pateikimo_data', 'klientas'];

const NESTANDARTINIAI_COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  description: 'Description',
  metadata: 'Metadata',
  project_name: 'Project name',
  pateikimo_data: 'Pateikimo data',
  klientas: 'Klientas',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, string>;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderCellValue(value: any, column?: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Taip' : 'Ne';
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      return str.length > 100 ? str.slice(0, 100) + '...' : str;
    } catch {
      return String(value);
    }
  }
  const str = String(value);
  if (column === 'metadata') {
    return str.length > 80 ? str.slice(0, 80) + '...' : str;
  }
  return str.length > 150 ? str.slice(0, 150) + '...' : str;
}

function getColumns(rows: any[]): string[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const idIndex = keys.indexOf('id');
  if (idIndex > -1) {
    keys.splice(idIndex, 1);
    keys.sort();
    keys.unshift('id');
  } else {
    keys.sort();
  }
  return keys;
}

function formatColumnName(col: string): string {
  return col.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** Extract unique metadata values for a given key across all records */
function extractUniqueMetaValues(records: NestandartiniaiRecord[], key: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const meta = parseMetadata(r.metadata);
    if (meta && meta[key]) {
      set.add(meta[key]);
    }
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// MetadataCell – renders the JSON object in a readable popover
// ---------------------------------------------------------------------------

function MetadataCell({ raw }: { raw: string | Record<string, string> | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = parseMetadata(raw);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!meta) return <span className="text-base-content/40">—</span>;

  const preview = Object.entries(meta).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-left text-xs font-mono text-primary/80 hover:text-primary truncate max-w-[220px] block"
        title="Spustelėkite, kad matytumėte visą metadata"
      >
        {preview.length > 60 ? preview.slice(0, 60) + '...' : preview}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-80 max-h-72 overflow-auto bg-base-100 border border-base-content/15 rounded-lg shadow-xl p-3 text-xs font-mono space-y-0.5">
          {Object.entries(meta).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-base-content/50 min-w-[120px] shrink-0">{k}:</span>
              <span className="text-base-content break-all">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterDropdown – custom styled dropdown that replaces native <select>
// ---------------------------------------------------------------------------

function FilterDropdown({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isActive = value !== '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
          transition-all duration-150 cursor-pointer
          ${isActive
            ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
            : 'bg-base-200/80 text-base-content/70 border border-base-content/10 hover:bg-base-200 hover:border-base-content/20'
          }
        `}
      >
        <span>{isActive ? `${label}: ${value}` : label}</span>
        {isActive ? (
          <X
            className="w-3 h-3 hover:text-error transition-colors"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
          />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && options.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1.5 min-w-[160px] max-h-56 overflow-auto bg-base-100 border border-base-content/10 rounded-xl shadow-lg py-1">
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-base-content/50 hover:bg-base-200/60 transition-colors"
            >
              Visi
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                opt === value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-base-content hover:bg-base-200/60'
              }`}
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
// FilterBar – metadata filters for nestandartiniai table
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filters: MetadataFilters;
  onChange: (f: MetadataFilters) => void;
  options: {
    orientacija: string[];
    derva: string[];
    talpa_tipas: string[];
    DN: string[];
  };
}

function FilterBar({ filters, onChange, options }: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const update = (key: keyof MetadataFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount = [filters.orientacija, filters.derva, filters.talpa_tipas, filters.DN, filters.metadataSearch].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      <div className="flex items-center gap-1.5 text-xs text-base-content/40 shrink-0 mr-1">
        <Filter className="w-3.5 h-3.5" />
        <span className="font-medium">Filtrai</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-content text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </div>

      <FilterDropdown label="Orientacija" value={filters.orientacija} options={options.orientacija} onChange={v => update('orientacija', v)} />
      <FilterDropdown label="Derva" value={filters.derva} options={options.derva} onChange={v => update('derva', v)} />
      <FilterDropdown label="Talpa tipas" value={filters.talpa_tipas} options={options.talpa_tipas} onChange={v => update('talpa_tipas', v)} />
      <FilterDropdown label="DN" value={filters.DN} options={options.DN} onChange={v => update('DN', v)} />

      {/* Metadata text search */}
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
        <input
          type="text"
          placeholder="Ieškoti metadata..."
          value={filters.metadataSearch}
          onChange={e => update('metadataSearch', e.target.value)}
          className="h-7 text-xs rounded-full border border-base-content/10 bg-base-200/80 pl-7 pr-3 w-[170px] outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-base-content/30"
        />
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-error/80 hover:text-error hover:bg-error/10 transition-all"
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
  const [selectedTable, setSelectedTable] = useState<TableName>('standartiniai_projektai');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [standartiniaiData, setStandartiniaiData] = useState<any[]>([]);
  const [nestandartiniaiData, setNestandartiniaiData] = useState<NestandartiniaiRecord[]>([]);
  const [loadingStandartiniai, setLoadingStandartiniai] = useState(true);
  const [loadingNestandartiniai, setLoadingNestandartiniai] = useState(true);
  const [errorStandartiniai, setErrorStandartiniai] = useState<string | null>(null);
  const [errorNestandartiniai, setErrorNestandartiniai] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: 'asc' });
  const [metadataFilters, setMetadataFilters] = useState<MetadataFilters>({ ...EMPTY_FILTERS });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    loadStandartiniai();
    loadNestandartiniai();
  }, []);

  const loadStandartiniai = async () => {
    try {
      setLoadingStandartiniai(true);
      setErrorStandartiniai(null);
      const data = await fetchStandartiniaiProjektai();
      setStandartiniaiData(data);
    } catch (err: any) {
      setErrorStandartiniai(err?.message || 'Nepavyko gauti duomenų');
    } finally {
      setLoadingStandartiniai(false);
    }
  };

  const loadNestandartiniai = async () => {
    try {
      setLoadingNestandartiniai(true);
      setErrorNestandartiniai(null);
      const data = await fetchNestandartiniaiDokumentai();
      setNestandartiniaiData(data);
    } catch (err: any) {
      setErrorNestandartiniai(err?.message || 'Nepavyko gauti duomenų');
    } finally {
      setLoadingNestandartiniai(false);
    }
  };

  // ---- Derived state for nestandartiniai filter options (computed once per data load) ----
  const filterOptions = useMemo(() => ({
    orientacija: extractUniqueMetaValues(nestandartiniaiData, 'orientacija'),
    derva: extractUniqueMetaValues(nestandartiniaiData, 'derva'),
    talpa_tipas: extractUniqueMetaValues(nestandartiniaiData, 'talpa_tipas'),
    DN: extractUniqueMetaValues(nestandartiniaiData, 'DN'),
  }), [nestandartiniaiData]);

  // ---- Table data, columns, loading, error based on selection ----
  const isNestandartiniai = selectedTable === 'n8n_vector_store';
  const currentLoading = isNestandartiniai ? loadingNestandartiniai : loadingStandartiniai;
  const currentError = isNestandartiniai ? errorNestandartiniai : errorStandartiniai;
  const currentReload = isNestandartiniai ? loadNestandartiniai : loadStandartiniai;
  const currentLabel = TABLE_OPTIONS.find(o => o.value === selectedTable)!.label;

  const columns = useMemo(() => {
    if (isNestandartiniai) return NESTANDARTINIAI_COLUMNS;
    return getColumns(standartiniaiData);
  }, [isNestandartiniai, standartiniaiData]);

  // ---- Filtering ----
  const filteredData = useMemo(() => {
    let rows: any[] = isNestandartiniai ? nestandartiniaiData : standartiniaiData;

    // Global text search across visible columns
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row =>
        columns.some(col => {
          const val = row[col];
          if (val === null || val === undefined) return false;
          if (typeof val === 'object') {
            return JSON.stringify(val).toLowerCase().includes(q);
          }
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    // Metadata-specific filters (only for nestandartiniai)
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
            const q = metadataSearch.toLowerCase();
            const found = Object.entries(meta).some(
              ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
            );
            if (!found) return false;
          }

          return true;
        });
      }
    }

    return rows;
  }, [isNestandartiniai, nestandartiniaiData, standartiniaiData, searchQuery, columns, metadataFilters]);

  // ---- Sorting ----
  const sortedData = useMemo(() => {
    if (!sortConfig.column) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const handleTableChange = (table: TableName) => {
    setSelectedTable(table);
    setDropdownOpen(false);
    setSearchQuery('');
    setSortConfig({ column: '', direction: 'asc' });
    setMetadataFilters({ ...EMPTY_FILTERS });
  };

  const totalCount = isNestandartiniai ? nestandartiniaiData.length : standartiniaiData.length;

  return (
    <div className="h-full flex flex-col bg-base-200/50">
      {/* Header */}
      <div className="p-6 border-b border-base-content/10 bg-base-100/80">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-base-content">Dokumentai</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <button
              onClick={currentReload}
              disabled={currentLoading}
              className="btn btn-soft btn-sm"
            >
              <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
              Atnaujinti
            </button>
          </div>
        </div>

        {/* Toolbar: table selector + search */}
        <div className="flex items-center gap-3">
          {/* Table selector dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="btn btn-sm btn-outline gap-2 min-w-[240px] justify-between"
            >
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                {currentLabel}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <ul className="absolute z-50 mt-1 w-full bg-base-100 rounded-lg border border-base-content/10 shadow-lg py-1 macos-animate-slide-down">
                {TABLE_OPTIONS.map(opt => (
                  <li key={opt.value}>
                    <button
                      onClick={() => handleTableChange(opt.value)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-base-200 ${
                        selectedTable === opt.value ? 'bg-primary/10 text-primary font-medium' : 'text-base-content'
                      }`}
                    >
                      {opt.label}
                      <span className="block text-xs text-base-content/40 font-mono">{opt.value}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              placeholder="Ieškoti..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-sm w-full pl-9"
            />
          </div>
        </div>

        {/* Metadata filter bar – only for nestandartiniai */}
        {isNestandartiniai && !currentLoading && nestandartiniaiData.length > 0 && (
          <FilterBar
            filters={metadataFilters}
            onChange={setMetadataFilters}
            options={filterOptions}
          />
        )}
      </div>

      {/* Error */}
      {currentError && (
        <div className="mx-6 mt-4 alert alert-error alert-soft">
          <AlertCircle className="w-5 h-5" />
          <span>{currentError}</span>
        </div>
      )}

      {/* Table content */}
      <div className="flex-1 overflow-auto p-6">
        {currentLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="text-sm mt-4 text-base-content/60">Kraunama...</p>
            </div>
          </div>
        ) : sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-4 text-base-content/20" />
              <h3 className="text-lg font-medium mb-2 text-base-content">
                {searchQuery || Object.values(metadataFilters).some(v => v) ? 'Nieko nerasta' : 'Nėra duomenų'}
              </h3>
              <p className="text-sm text-base-content/60">
                {searchQuery || Object.values(metadataFilters).some(v => v)
                  ? 'Pakeiskite paieškos užklausą arba filtrus'
                  : `Lentelė ${selectedTable} tuščia`
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border border-base-content/10 bg-base-100">
            <table className="table-striped table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="cursor-pointer select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span>{isNestandartiniai ? (NESTANDARTINIAI_COLUMN_LABELS[col] || formatColumnName(col)) : formatColumnName(col)}</span>
                        <span className="inline-flex flex-col leading-none">
                          <ChevronUp
                            className={`w-3 h-3 ${
                              sortConfig.column === col && sortConfig.direction === 'asc'
                                ? 'text-primary'
                                : 'text-base-content/20'
                            }`}
                          />
                          <ChevronDown
                            className={`w-3 h-3 -mt-0.5 ${
                              sortConfig.column === col && sortConfig.direction === 'desc'
                                ? 'text-primary'
                                : 'text-base-content/20'
                            }`}
                          />
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, rowIndex) => (
                  <tr key={row.id ?? rowIndex}>
                    {columns.map(col => (
                      <td
                        key={col}
                        className={`whitespace-nowrap ${col === 'metadata' ? 'max-w-[240px]' : 'max-w-xs'} truncate`}
                      >
                        {col === 'metadata' && isNestandartiniai ? (
                          <MetadataCell raw={row[col]} />
                        ) : (
                          <span title={String(row[col] ?? '')}>{renderCellValue(row[col], col)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-4 py-2 text-xs border-t border-base-content/10 flex items-center justify-between bg-base-200/50 text-base-content/50">
              <span>
                {sortedData.length < totalCount
                  ? `${sortedData.length} iš ${totalCount} įrašų`
                  : `${sortedData.length} įrašų`
                }
              </span>
              <span className="font-mono text-base-content/30">
                {selectedTable}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
