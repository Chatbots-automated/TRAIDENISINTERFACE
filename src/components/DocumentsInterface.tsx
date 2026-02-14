import React, { useState, useEffect, useMemo } from 'react';
import { Search, AlertCircle, RefreshCw, Database, ChevronUp, ChevronDown } from 'lucide-react';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';
import { fetchStandartiniaiProjektai, fetchNestandartiniaiDokumentai } from '../lib/dokumentaiService';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

type TabType = 'standartiniai' | 'nestandartiniai';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: string;
  direction: SortDirection;
}

/**
 * Render a cell value for display in the table.
 * Handles objects, arrays, booleans, nulls, and long strings.
 */
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

/**
 * Extract column names from data rows. Places 'id' first if present.
 */
function getColumns(rows: any[]): string[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  // Put 'id' first, then sort the rest alphabetically
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

/**
 * Format a column name for display: replace underscores with spaces, capitalize first letter.
 */
function formatColumnName(col: string): string {
  return col.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [activeTab, setActiveTab] = useState<TabType>('standartiniai');
  const [standartiniaiData, setStandartiniaiData] = useState<any[]>([]);
  const [nestandartiniaiData, setNestandartiniaiData] = useState<any[]>([]);
  const [loadingStandartiniai, setLoadingStandartiniai] = useState(true);
  const [loadingNestandartiniai, setLoadingNestandartiniai] = useState(true);
  const [errorStandartiniai, setErrorStandartiniai] = useState<string | null>(null);
  const [errorNestandartiniai, setErrorNestandartiniai] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: 'asc' });

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
      console.error('Error loading standartiniai:', err);
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
      console.error('Error loading nestandartiniai:', err);
      setErrorNestandartiniai(err?.message || 'Nepavyko gauti duomenų');
    } finally {
      setLoadingNestandartiniai(false);
    }
  };

  // Determine current dataset
  const currentData = activeTab === 'standartiniai' ? standartiniaiData : nestandartiniaiData;
  const currentLoading = activeTab === 'standartiniai' ? loadingStandartiniai : loadingNestandartiniai;
  const currentError = activeTab === 'standartiniai' ? errorStandartiniai : errorNestandartiniai;
  const currentReload = activeTab === 'standartiniai' ? loadStandartiniai : loadNestandartiniai;

  const columns = useMemo(() => getColumns(currentData), [currentData]);

  // Filter rows by search query across all visible columns
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

  // Sort filtered data
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

  // Reset sort when switching tabs
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchQuery('');
    setSortConfig({ column: '', direction: 'asc' });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: colors.bg.primary }}>
      {/* Header */}
      <div className="p-6 border-b" style={{
        borderColor: colors.border.light,
        background: colors.bg.white + 'CC'
      }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: colors.text.primary }}>Dokumentai</h2>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              Duomenų bazės lentelės
            </p>
          </div>
          <button
            onClick={currentReload}
            disabled={currentLoading}
            className="px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors text-sm"
            style={{
              background: colors.interactive.secondary,
              color: colors.interactive.secondaryText
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.interactive.secondaryHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = colors.interactive.secondary)}
          >
            <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
            <span>Atnaujinti</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-4 p-1 rounded-lg" style={{ background: colors.bg.tertiary }}>
          <button
            onClick={() => handleTabChange('standartiniai')}
            className="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150"
            style={{
              background: activeTab === 'standartiniai' ? colors.bg.white : 'transparent',
              color: activeTab === 'standartiniai' ? colors.text.primary : colors.text.tertiary,
              boxShadow: activeTab === 'standartiniai' ? colors.shadow.sm : 'none'
            }}
          >
            Standartiniai
            {!loadingStandartiniai && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{
                background: activeTab === 'standartiniai' ? colors.bg.tertiary : 'transparent',
                color: colors.text.tertiary
              }}>
                {standartiniaiData.length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('nestandartiniai')}
            className="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150"
            style={{
              background: activeTab === 'nestandartiniai' ? colors.bg.white : 'transparent',
              color: activeTab === 'nestandartiniai' ? colors.text.primary : colors.text.tertiary,
              boxShadow: activeTab === 'nestandartiniai' ? colors.shadow.sm : 'none'
            }}
          >
            Nestandartiniai
            {!loadingNestandartiniai && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{
                background: activeTab === 'nestandartiniai' ? colors.bg.tertiary : 'transparent',
                color: colors.text.tertiary
              }}>
                {nestandartiniaiData.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.text.tertiary }} />
          <input
            type="text"
            placeholder="Ieškoti..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm"
            style={{
              background: colors.bg.white,
              border: `1px solid ${colors.border.default}`,
              color: colors.text.primary
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {currentError && (
        <div className="mx-6 mt-4 p-4 rounded-lg flex items-center space-x-3" style={{ background: colors.status.errorBg }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: colors.status.errorText }} />
          <p className="text-sm" style={{ color: colors.status.errorText }}>{currentError}</p>
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-6">
        {currentLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
              <p className="text-sm" style={{ color: colors.text.secondary }}>Kraunama...</p>
            </div>
          </div>
        ) : sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.tertiary }} />
              <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>
                {searchQuery ? 'Nieko nerasta' : 'Nėra duomenų'}
              </h3>
              <p className="text-sm" style={{ color: colors.text.secondary }}>
                {searchQuery
                  ? 'Pakeiskite paieškos užklausą'
                  : `Lentelė ${activeTab === 'standartiniai' ? 'standartiniai_projektai' : 'n8n_vector_store'} tuščia`
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden" style={{
            borderColor: colors.border.default,
            background: colors.bg.white
          }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: colors.bg.tertiary }}>
                    {columns.map(col => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-4 py-3 text-left font-semibold cursor-pointer select-none whitespace-nowrap"
                        style={{ color: colors.text.primary, borderBottom: `1px solid ${colors.border.default}` }}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{formatColumnName(col)}</span>
                          <span className="inline-flex flex-col" style={{ lineHeight: 0 }}>
                            <ChevronUp
                              className="w-3 h-3"
                              style={{
                                color: sortConfig.column === col && sortConfig.direction === 'asc'
                                  ? colors.text.primary
                                  : colors.text.quaternary
                              }}
                            />
                            <ChevronDown
                              className="w-3 h-3 -mt-0.5"
                              style={{
                                color: sortConfig.column === col && sortConfig.direction === 'desc'
                                  ? colors.text.primary
                                  : colors.text.quaternary
                              }}
                            />
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row, rowIndex) => (
                    <tr
                      key={row.id ?? rowIndex}
                      className="transition-colors"
                      style={{
                        borderBottom: rowIndex < sortedData.length - 1 ? `1px solid ${colors.border.light}` : undefined
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.secondary)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    >
                      {columns.map(col => (
                        <td
                          key={col}
                          className="px-4 py-3 whitespace-nowrap max-w-xs truncate"
                          style={{ color: colors.text.secondary }}
                          title={String(row[col] ?? '')}
                        >
                          {renderCellValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer with row count */}
            <div className="px-4 py-2 text-xs border-t flex items-center justify-between" style={{
              borderColor: colors.border.light,
              color: colors.text.tertiary,
              background: colors.bg.secondary
            }}>
              <span>
                {searchQuery
                  ? `${sortedData.length} iš ${currentData.length} įrašų`
                  : `${sortedData.length} įrašų`
                }
              </span>
              <span style={{ color: colors.text.quaternary }}>
                {activeTab === 'standartiniai' ? 'standartiniai_projektai' : 'n8n_vector_store'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
