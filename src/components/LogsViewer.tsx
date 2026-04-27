import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Filter, ChevronDown, ChevronRight, Activity, AlertCircle } from 'lucide-react';
import { dbAdmin } from '../lib/database';
import type { AppUser } from '../types';

interface LogsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
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

export default function LogsViewer({ isOpen, onClose, user: _user }: LogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const categories = ['all', 'auth', 'chat', 'document', 'user_management', 'system', 'api', 'error'];
  const levels = ['all', 'debug', 'info', 'warn', 'error', 'critical'];

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, selectedCategory, selectedLevel]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      let query = dbAdmin
        .from('application_logs')
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

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case 'debug': return 'badge badge-soft text-xs';
      case 'info': return 'badge badge-soft badge-success text-xs';
      case 'warn': return 'badge badge-soft badge-warning text-xs';
      case 'error': return 'badge badge-soft badge-error text-xs';
      case 'critical': return 'badge badge-error text-xs';
      default: return 'badge badge-soft text-xs';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(36,35,34,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white border"
        style={{ borderColor: 'var(--app-border)', borderRadius: '18px', boxShadow: '0 18px 54px rgba(36,35,34,0.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-base-content">Programos žurnalai</h2>
              <p className="text-xs text-base-content/50">Sistemos veikla ir įvykiai</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="app-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 px-5 py-3" style={{ borderBottom: '1px solid var(--app-border)', background: 'rgba(247,247,245,0.68)' }}>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-base-content/45" />
            <span className="text-sm font-medium text-base-content">Filtrai:</span>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="app-form-field py-2 px-3 text-xs"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'Visos kategorijos' : cat.replace('_', ' ')}
              </option>
            ))}
          </select>

          {/* Level Filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="app-form-field py-2 px-3 text-xs"
          >
            {levels.map((level) => (
              <option key={level} value={level}>
                {level === 'all' ? 'Visi lygiai' : level.toUpperCase()}
              </option>
            ))}
          </select>

          <button
            onClick={loadLogs}
            disabled={loading}
            className="ml-auto app-text-btn disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atnaujinti</span>
          </button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ background: 'var(--app-bg)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-base-content/55">Kraunami žurnalai...</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <AlertCircle className="w-10 h-10 mb-3 text-base-content/25" />
              <p className="text-base font-medium text-base-content">Žurnalų nerasta</p>
              <p className="text-sm mt-1 text-base-content/50">Pabandykite pakeisti filtrus</p>
            </div>
          ) : (
            <div className="app-table-shell">
              <table className="app-data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Lygis</th>
                    <th>Kategorija</th>
                    <th>Veiksmas</th>
                    <th>Žinutė</th>
                    <th>Naudotojas</th>
                    <th>Laikas</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className="cursor-pointer"
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      >
                        <td className="w-6">
                          {expandedLog === log.id ? (
                            <ChevronDown className="w-3.5 h-3.5 text-base-content/35" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-base-content/35" />
                          )}
                        </td>
                        <td>
                          <span className={getLevelBadgeClass(log.level)}>
                            {log.level.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-xs text-base-content/70">{log.category.replace('_', ' ')}</td>
                        <td className="text-xs font-mono text-base-content/60">{log.action}</td>
                        <td className="max-w-xs truncate text-xs" title={log.message}>{log.message}</td>
                        <td className="text-xs whitespace-nowrap">{log.user_email || '—'}</td>
                        <td className="text-xs whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                      </tr>
                      {expandedLog === log.id && (
                        <tr>
                          <td colSpan={7} className="bg-base-200/50">
                            <div className="space-y-1.5 text-[11px] py-1">
                              <div>
                                <span className="font-medium text-base-content">ID:</span>
                                <span className="ml-2 font-mono text-base-content/60">{log.id}</span>
                              </div>
                              {log.user_id && (
                                <div>
                                  <span className="font-medium text-base-content">Naudotojo ID:</span>
                                  <span className="ml-2 font-mono text-base-content/60">{log.user_id}</span>
                                </div>
                              )}
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div>
                                  <span className="font-medium text-base-content">Metaduomenys:</span>
                                  <pre className="mt-1 p-2 rounded-lg overflow-x-auto border text-[10px] bg-white text-base-content/65 border-base-content/10">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="app-table-footer">
          <p className="text-[11px] text-center">
            {logs.length === 1 ? 'Rodomas 1 įrašas' : `Rodoma ${logs.length} įrašų`}
          </p>
        </div>
      </div>
    </div>
  );
}
