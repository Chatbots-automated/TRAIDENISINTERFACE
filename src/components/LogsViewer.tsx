import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  Activity,
  AlertCircle,
  Server,
  Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AppUser } from '../types';

interface LogsViewerProps {
  isOpen?: boolean;
  onClose?: () => void;
  user: AppUser;
  embed?: boolean;
}

interface LogEntry {
  id: string;
  level: string;
  category: string;
  action: string;
  message: string;
  user_email: string | null;
  user_id: string | null;
  metadata: any;
  timestamp: string;
  created_at: string;
}

interface TableOption {
  label: string;
  value: string;
}

const DEFAULT_TABLE_OPTIONS: TableOption[] = [
  { label: 'Application Logs', value: 'application_logs' },
  { label: 'Chat Threads', value: 'chat_items' },
  { label: 'Documents', value: 'documents' },
  { label: 'Users', value: 'app_users' },
  { label: 'Project Members', value: 'project_members' },
];

export default function LogsViewer({ isOpen = false, onClose, user, embed = false }: LogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [tableOptions, setTableOptions] = useState<TableOption[]>(DEFAULT_TABLE_OPTIONS);
  const [selectedTable, setSelectedTable] = useState<string>(DEFAULT_TABLE_OPTIONS[0].value);
  const [customTable, setCustomTable] = useState('');
  const [genericRows, setGenericRows] = useState<Record<string, any>[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);

  const categories = ['all', 'auth', 'chat', 'document', 'user_management', 'system', 'api', 'error'];
  const levels = ['all', 'debug', 'info', 'warn', 'error', 'critical'];
  const isApplicationLogs = selectedTable === 'application_logs';
  const isActive = embed || isOpen;

  const loadApplicationLogs = async () => {
    try {
      setLoading(true);
      setTableError(null);
      setExpandedLog(null);
      setGenericRows([]);
      let query = supabase
        .from('application_logs' as any)
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      if (selectedLevel !== 'all') {
        query = query.eq('level', selectedLevel);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading logs:', error);
        throw error;
      }

      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGenericRows = async () => {
    try {
      setLoading(true);
      setTableError(null);
      setExpandedLog(null);
      setLogs([]);
      const { data, error } = await supabase
        .from(selectedTable as any)
        .select('*')
        .limit(100);

      if (error) {
        throw error;
      }

      setGenericRows(data || []);
    } catch (error: any) {
      console.error(`Error loading data from ${selectedTable}:`, error);
      setGenericRows([]);
      setTableError(error.message || 'Unable to load table data.');
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentView = () => {
    if (isApplicationLogs) {
      loadApplicationLogs();
    } else {
      loadGenericRows();
    }
  };

  const handleAddCustomTable = () => {
    const cleaned = customTable.trim();
    if (!cleaned) return;
    if (!tableOptions.some((option) => option.value === cleaned)) {
      setTableOptions((prev) => [...prev, { label: cleaned, value: cleaned }]);
    }
    setSelectedTable(cleaned);
    setCustomTable('');
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'debug':
        return 'bg-gray-100 text-gray-700';
      case 'info':
        return 'bg-blue-100 text-blue-700';
      case 'warn':
        return 'bg-yellow-100 text-yellow-700';
      case 'error':
        return 'bg-red-100 text-red-700';
      case 'critical':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'auth':
        return 'bg-purple-100 text-purple-700';
      case 'chat':
        return 'bg-green-100 text-green-700';
      case 'document':
        return 'bg-blue-100 text-blue-700';
      case 'user_management':
        return 'bg-orange-100 text-orange-700';
      case 'api':
        return 'bg-cyan-100 text-cyan-700';
      case 'error':
        return 'bg-red-100 text-red-700';
      case 'system':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  useEffect(() => {
    if (!isActive || !isApplicationLogs) return;
    loadApplicationLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isApplicationLogs, selectedCategory, selectedLevel]);

  useEffect(() => {
    if (!isActive || isApplicationLogs) return;
    loadGenericRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isApplicationLogs, selectedTable]);

  if (!embed && !isOpen) return null;

  const columns = useMemo(() => {
    if (isApplicationLogs || genericRows.length === 0) return [];
    const keys = new Set<string>();
    genericRows.forEach((row) => {
      Object.keys(row || {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [genericRows, isApplicationLogs]);

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return value.toString();
  };

  const innerContent = (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Activity className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {isApplicationLogs ? 'Application Logs' : 'Supabase Table Explorer'}
            </h2>
            <p className="text-sm text-gray-600">
              {isApplicationLogs
                ? 'View system activity and events'
                : `Browsing latest rows from "${selectedTable}"`}
            </p>
          </div>
        </div>
        {!embed && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Table</span>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              {tableOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={customTable}
                onChange={(e) => setCustomTable(e.target.value)}
                placeholder="Custom table..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              <button
                onClick={handleAddCustomTable}
                className="inline-flex items-center justify-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            onClick={refreshCurrentView}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isApplicationLogs && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters</span>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat.replace('_', ' ')}
                </option>
              ))}
            </select>

            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level === 'all' ? 'All Levels' : level.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white">
        {tableError && (
          <div className="flex items-center space-x-2 p-3 rounded-xl bg-red-50 text-red-700 border border-red-100">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{tableError}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : isApplicationLogs ? (
          logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertCircle className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">No logs found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        {expandedLog === log.id ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLevelColor(log.level)}`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(log.category)}`}>
                          {log.category}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 font-medium mb-1">{log.message}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        {log.user_email && (
                          <div className="flex items-center space-x-1">
                            <User className="w-3 h-3" />
                            <span>{log.user_email}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {expandedLog === log.id && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3 space-y-2">
                      <div className="text-xs">
                        <span className="font-medium text-gray-700">ID:</span>
                        <span className="ml-2 text-gray-600 font-mono">{log.id}</span>
                      </div>
                      {log.user_id && (
                        <div className="text-xs">
                          <span className="font-medium text-gray-700">User ID:</span>
                          <span className="ml-2 text-gray-600 font-mono">{log.user_id}</span>
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="text-xs">
                          <span className="font-medium text-gray-700">Metadata:</span>
                          <pre className="mt-1 p-2 bg-gray-50 rounded text-gray-600 overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )
        ) : genericRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <AlertCircle className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">No rows found</p>
            <p className="text-sm">Try switching tables or refreshing.</p>
          </div>
        ) : (
          genericRows.map((row, index) => (
            <div
              key={row.id || row.uuid || `${selectedTable}-${index}`}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{selectedTable}</p>
                  <p className="text-xs text-gray-500">Row #{index + 1}</p>
                </div>
                {row.id && (
                  <span className="text-xs font-mono text-gray-500 truncate max-w-[200px]">
                    {row.id}
                  </span>
                )}
              </div>
              <div className="p-4 overflow-x-auto">
                {columns.length > 0 ? (
                  <table className="min-w-full text-sm">
                    <tbody>
                      {columns.map((column) => (
                        <tr key={column} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium text-gray-500 whitespace-nowrap align-top">
                            {column.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2 text-gray-900">
                            {typeof row[column] === 'object' && row[column] !== null ? (
                              <pre className="bg-gray-50 rounded-lg p-2 text-xs overflow-x-auto">
                                {formatValue(row[column])}
                              </pre>
                            ) : (
                              formatValue(row[column])
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(row, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {isApplicationLogs
            ? `Showing ${logs.length} log entries`
            : `Showing ${genericRows.length} rows from ${selectedTable}`}
        </p>
      </div>
      </div>
  );

  if (embed) {
    return (
      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {innerContent}
      </div>
    </div>
  );
}
