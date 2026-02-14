import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, AlertCircle, RefreshCw, Database, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppUser } from '../types';
import { fetchStandartiniaiProjektai, fetchNestandartiniaiDokumentai } from '../lib/dokumentaiService';

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

const TABLE_OPTIONS: { value: TableName; label: string }[] = [
  { value: 'standartiniai_projektai', label: 'Standartiniai projektai' },
  { value: 'n8n_vector_store', label: 'Nestandartiniai (vector store)' },
];

function renderCellValue(value: any): string {
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

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [selectedTable, setSelectedTable] = useState<TableName>('standartiniai_projektai');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [standartiniaiData, setStandartiniaiData] = useState<any[]>([]);
  const [nestandartiniaiData, setNestandartiniaiData] = useState<any[]>([]);
  const [loadingStandartiniai, setLoadingStandartiniai] = useState(true);
  const [loadingNestandartiniai, setLoadingNestandartiniai] = useState(true);
  const [errorStandartiniai, setErrorStandartiniai] = useState<string | null>(null);
  const [errorNestandartiniai, setErrorNestandartiniai] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: 'asc' });

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

  const currentData = selectedTable === 'standartiniai_projektai' ? standartiniaiData : nestandartiniaiData;
  const currentLoading = selectedTable === 'standartiniai_projektai' ? loadingStandartiniai : loadingNestandartiniai;
  const currentError = selectedTable === 'standartiniai_projektai' ? errorStandartiniai : errorNestandartiniai;
  const currentReload = selectedTable === 'standartiniai_projektai' ? loadStandartiniai : loadNestandartiniai;
  const currentLabel = TABLE_OPTIONS.find(o => o.value === selectedTable)!.label;

  const columns = useMemo(() => getColumns(currentData), [currentData]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return currentData;
    const q = searchQuery.toLowerCase();
    return currentData.filter(row =>
      columns.some(col => {
        const val = row[col];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [currentData, searchQuery, columns]);

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
  };

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
                {searchQuery ? 'Nieko nerasta' : 'Nėra duomenų'}
              </h3>
              <p className="text-sm text-base-content/60">
                {searchQuery
                  ? 'Pakeiskite paieškos užklausą'
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
                        <span>{formatColumnName(col)}</span>
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
                        className="whitespace-nowrap max-w-xs truncate"
                        title={String(row[col] ?? '')}
                      >
                        {renderCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-4 py-2 text-xs border-t border-base-content/10 flex items-center justify-between bg-base-200/50 text-base-content/50">
              <span>
                {searchQuery
                  ? `${sortedData.length} iš ${currentData.length} įrašų`
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
