import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Filter, ChevronDown, ChevronRight, Calendar, User, Activity, AlertCircle } from 'lucide-react';
import { dbAdmin } from '../lib/database';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';

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

export default function LogsViewer({ isOpen, onClose, user }: LogsViewerProps) {
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

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'debug':
      case 'info':
        return { background: colors.bg.secondary, color: colors.text.secondary, border: `1px solid ${colors.border.default}` };
      case 'warn':
        return { background: '#fef9ee', color: '#92400e', border: '1px solid #fde68a' };
      case 'error':
        return { background: colors.status.error, color: colors.status.errorText, border: `1px solid ${colors.status.errorBorder}` };
      case 'critical':
        return { background: colors.status.errorText, color: '#ffffff', border: `1px solid ${colors.status.errorText}` };
      default:
        return { background: colors.bg.secondary, color: colors.text.secondary, border: `1px solid ${colors.border.default}` };
    }
  };

  const getCategoryStyle = (category: string) => {
    switch (category) {
      case 'auth':
      case 'user_management':
        return { background: colors.interactive.accentLight, color: colors.interactive.accent, border: `1px solid ${colors.interactive.accent}33` };
      case 'chat':
      case 'document':
      case 'api':
        return { background: colors.bg.secondary, color: colors.text.secondary, border: `1px solid ${colors.border.default}` };
      case 'error':
        return { background: colors.status.error, color: colors.status.errorText, border: `1px solid ${colors.status.errorBorder}` };
      case 'system':
      default:
        return { background: colors.bg.secondary, color: colors.text.secondary, border: `1px solid ${colors.border.default}` };
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
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl shadow-xl"
        style={{ background: colors.bg.white, border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b rounded-t-xl" style={{
          borderColor: colors.border.light,
          background: colors.bg.secondary
        }}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg border" style={{
              background: colors.icon.default,
              borderColor: colors.border.light
            }}>
              <Activity className="w-5 h-5" style={{ color: colors.interactive.accent }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>Application Logs</h2>
              <p className="text-xs" style={{ color: colors.text.secondary }}>System activity and events</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 rounded-lg transition-colors"
            style={{ color: colors.text.tertiary }}
            onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 px-5 py-3 border-b" style={{
          borderColor: colors.border.default,
          background: colors.bg.secondary
        }}>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4" style={{ color: colors.text.secondary }} />
            <span className="text-sm font-medium" style={{ color: colors.text.primary }}>Filters:</span>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="py-2 px-3 text-xs rounded-lg border"
            style={{
              borderColor: colors.border.default,
              background: colors.bg.white,
              color: colors.text.primary
            }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat.replace('_', ' ')}
              </option>
            ))}
          </select>

          {/* Level Filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="py-2 px-3 text-xs rounded-lg border"
            style={{
              borderColor: colors.border.default,
              background: colors.bg.white,
              color: colors.text.primary
            }}
          >
            {levels.map((level) => (
              <option key={level} value={level}>
                {level === 'all' ? 'All Levels' : level.toUpperCase()}
              </option>
            ))}
          </select>

          <button
            onClick={loadLogs}
            disabled={loading}
            className="ml-auto px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center space-x-2 border"
            style={{
              background: colors.bg.white,
              borderColor: colors.border.default,
              color: colors.text.secondary
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = colors.bg.secondary)}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.background = colors.bg.white)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ background: colors.bg.primary }}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: colors.interactive.accent }} />
                <p className="text-sm" style={{ color: colors.text.secondary }}>Loading logs...</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <AlertCircle className="w-10 h-10 mb-3" style={{ color: colors.text.tertiary }} />
              <p className="text-base font-medium" style={{ color: colors.text.primary }}>No logs found</p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>Try adjusting your filters</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="overflow-hidden rounded-lg border transition-all"
                style={{
                  background: colors.bg.white,
                  borderColor: colors.border.default
                }}
              >
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full p-3 text-left transition-colors"
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 mb-1.5">
                        {expandedLog === log.id ? (
                          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.tertiary }} />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.text.tertiary }} />
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={getLevelStyle(log.level)}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={getCategoryStyle(log.category)}>
                          {log.category}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{
                          background: colors.bg.secondary,
                          color: colors.text.secondary,
                          border: `1px solid ${colors.border.default}`
                        }}>
                          {log.action}
                        </span>
                      </div>
                      <p className="text-xs font-medium mb-1.5 leading-relaxed" style={{ color: colors.text.primary }}>{log.message}</p>
                      <div className="flex items-center space-x-3 text-[11px]" style={{ color: colors.text.secondary }}>
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

                {/* Expanded Details */}
                {expandedLog === log.id && (
                  <div className="px-3 pb-3 border-t" style={{
                    borderColor: colors.border.light,
                    background: colors.bg.secondary
                  }}>
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[11px]">
                        <span className="font-medium" style={{ color: colors.text.primary }}>ID:</span>
                        <span className="ml-2 font-mono" style={{ color: colors.text.secondary }}>{log.id}</span>
                      </div>
                      {log.user_id && (
                        <div className="text-[11px]">
                          <span className="font-medium" style={{ color: colors.text.primary }}>User ID:</span>
                          <span className="ml-2 font-mono" style={{ color: colors.text.secondary }}>{log.user_id}</span>
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="text-[11px]">
                          <span className="font-medium" style={{ color: colors.text.primary }}>Metadata:</span>
                          <pre className="mt-1 p-2 rounded-lg overflow-x-auto border text-[10px]" style={{
                            background: colors.bg.white,
                            color: colors.text.secondary,
                            borderColor: colors.border.default
                          }}>
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t rounded-b-xl" style={{
          borderColor: colors.border.light,
          background: colors.bg.secondary
        }}>
          <p className="text-[11px] text-center" style={{ color: colors.text.secondary }}>
            Showing {logs.length} log {logs.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>
    </div>
  );
}
