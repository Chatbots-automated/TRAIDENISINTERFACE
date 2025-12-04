import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Filter, ChevronDown, ChevronRight, Calendar, User, Activity, AlertCircle } from 'lucide-react';
import { supabaseAdmin } from '../lib/supabase';
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
      let query = supabaseAdmin
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

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'debug':
        return 'bg-gray-50 text-gray-600 border border-gray-200';
      case 'info':
        return 'bg-blue-50 text-blue-600 border border-blue-200';
      case 'warn':
        return 'bg-yellow-50 text-yellow-600 border border-yellow-200';
      case 'error':
        return 'bg-red-50 text-red-600 border border-red-200';
      case 'critical':
        return 'bg-red-500 text-white border border-red-600';
      default:
        return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'auth':
        return 'bg-purple-50 text-purple-600 border border-purple-200';
      case 'chat':
        return 'bg-green-50 text-green-600 border border-green-200';
      case 'document':
        return 'bg-blue-50 text-blue-600 border border-blue-200';
      case 'user_management':
        return 'bg-orange-50 text-orange-600 border border-orange-200';
      case 'api':
        return 'bg-cyan-50 text-cyan-600 border border-cyan-200';
      case 'error':
        return 'bg-red-50 text-red-600 border border-red-200';
      case 'system':
        return 'bg-gray-50 text-gray-600 border border-gray-200';
      default:
        return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="vf-card w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-vf-lg animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vf-border bg-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-50 rounded-lg border border-gray-100">
              <Activity className="w-5 h-5 text-vf-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Application Logs</h2>
              <p className="text-xs text-vf-secondary">System activity and events</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-50 rounded-lg transition-all"
          >
            <X className="w-5 h-5 text-vf-secondary" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 px-5 py-3 border-b border-vf-border bg-gray-50">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="vf-input py-2 px-3 text-xs"
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
            className="vf-input py-2 px-3 text-xs"
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
            className="ml-auto px-4 py-2 bg-white border border-vf-border rounded-vf text-xs font-medium text-vf-secondary hover:bg-gray-50 transition-all disabled:opacity-50 flex items-center space-x-2 shadow-vf-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 vf-scrollbar bg-vf-background">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-vf-primary" />
                <p className="text-sm text-vf-secondary">Loading logs...</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-vf-secondary">
              <AlertCircle className="w-10 h-10 mb-3 text-gray-300" />
              <p className="text-base font-medium text-gray-900">No logs found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="vf-card overflow-hidden hover:shadow-vf transition-all"
              >
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 mb-1.5">
                        {expandedLog === log.id ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getLevelColor(log.level)}`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryColor(log.category)}`}>
                          {log.category}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-xs text-gray-900 font-medium mb-1.5 leading-relaxed">{log.message}</p>
                      <div className="flex items-center space-x-3 text-[11px] text-vf-secondary">
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
                  <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50 animate-in slide-in-from-top-2 duration-200">
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[11px]">
                        <span className="font-medium text-gray-700">ID:</span>
                        <span className="ml-2 text-vf-secondary font-mono">{log.id}</span>
                      </div>
                      {log.user_id && (
                        <div className="text-[11px]">
                          <span className="font-medium text-gray-700">User ID:</span>
                          <span className="ml-2 text-vf-secondary font-mono">{log.user_id}</span>
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="text-[11px]">
                          <span className="font-medium text-gray-700">Metadata:</span>
                          <pre className="mt-1 p-2 bg-white rounded-lg text-vf-secondary overflow-x-auto border border-gray-200 text-[10px]">
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
        <div className="px-5 py-3 border-t border-vf-border bg-white">
          <p className="text-[11px] text-vf-secondary text-center">
            Showing {logs.length} log {logs.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>
    </div>
  );
}
