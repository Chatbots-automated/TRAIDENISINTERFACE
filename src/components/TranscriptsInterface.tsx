import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  RefreshCw,
  User as UserIcon,
  Clock,
  AlertCircle,
  Filter,
  X,
  Download,
  ChevronRight
} from 'lucide-react';
import {
  fetchParsedTranscripts,
  filterTranscriptsByUser,
  ParsedTranscript,
  ParsedMessage
} from '../lib/voiceflow';
import type { AppUser } from '../types';

interface TranscriptsInterfaceProps {
  user: AppUser;
}

export default function TranscriptsInterface({ user }: TranscriptsInterfaceProps) {
  const [transcripts, setTranscripts] = useState<ParsedTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<ParsedTranscript | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(!user.is_admin);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchParsedTranscripts();
      setTranscripts(data);
    } catch (err: any) {
      console.error('Error loading transcripts:', err);
      setError(err.message || 'Failed to load transcripts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchParsedTranscripts();
      setTranscripts(data);
      setError(null);
    } catch (err: any) {
      console.error('Error refreshing transcripts:', err);
      setError(err.message || 'Failed to refresh transcripts');
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('lt-LT', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (isYesterday) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('lt-LT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('lt-LT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (transcript: ParsedTranscript) => {
    if (transcript.messages.length === 0) return '0s';

    const start = new Date(transcript.messages[0].timestamp);
    const end = new Date(transcript.messages[transcript.messages.length - 1].timestamp);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);

    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  };

  const formatTableDate = (transcript: ParsedTranscript) => {
    // Use first message timestamp if available, otherwise fall back to createdAt
    const dateString = transcript.messages.length > 0
      ? transcript.messages[0].timestamp
      : transcript.createdAt;

    return new Date(dateString).toLocaleDateString('lt-LT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Checkbox handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === displayTranscripts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayTranscripts.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Filter transcripts based on user preference
  const displayTranscripts = showOnlyMine && !user.is_admin
    ? filterTranscriptsByUser(transcripts, user.id)
    : showOnlyMine
    ? filterTranscriptsByUser(transcripts, user.id)
    : transcripts;

  return (
    <>
      {/* Main List View */}
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Transcripts</h1>
              <p className="text-sm text-gray-500 mt-1">
                View Voiceflow chat conversation history
              </p>
            </div>
            <div className="flex items-center gap-3">
              {user.is_admin && (
                <button
                  onClick={() => setShowOnlyMine(!showOnlyMine)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    showOnlyMine
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {showOnlyMine ? 'All Transcripts' : 'My Transcripts'}
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            {displayTranscripts.length} conversation{displayTranscripts.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-8 mt-4 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Transcripts Data Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="px-8 py-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : displayTranscripts.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-base font-medium text-gray-900 mb-2">
                No transcripts found
              </h3>
              <p className="text-sm text-gray-500">
                {showOnlyMine
                  ? 'Start a conversation to see your transcripts here'
                  : 'No conversations have been recorded yet'}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === displayTranscripts.length && displayTranscripts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Messages
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayTranscripts.map((transcript) => (
                  <tr
                    key={transcript.id}
                    onClick={() => setSelectedTranscript(transcript)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(transcript.id)}
                        onChange={() => toggleSelect(transcript.id)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatTableDate(transcript)}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 font-mono text-xs max-w-xs truncate">
                      {transcript.sessionID}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {transcript.messageCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Two-Panel Modal View */}
      {selectedTranscript && (
        <TranscriptModal
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
          formatFullDate={formatFullDate}
          calculateDuration={calculateDuration}
        />
      )}
    </>
  );
}

// Two-Panel Modal Component (Voiceflow Style)
function TranscriptModal({
  transcript,
  onClose,
  formatFullDate,
  calculateDuration
}: {
  transcript: ParsedTranscript;
  onClose: () => void;
  formatFullDate: (date: string) => string;
  calculateDuration: (transcript: ParsedTranscript) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {transcript.userName || 'Anonymous User'}
            </h2>
            <p className="text-sm text-gray-500">{transcript.preview}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Export functionality could be added here
                alert('Export functionality coming soon!');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export transcript"
            >
              <Download className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Two-Panel Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Metadata */}
          <div className="w-80 border-r border-gray-200 overflow-y-auto p-6 bg-gray-50">
            <div className="space-y-6">
              {/* Metadata Section */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Metadata
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Date</div>
                    <div className="text-gray-900 text-sm">
                      {formatFullDate(transcript.createdAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">User ID</div>
                    <div className="text-gray-900 font-mono text-xs break-all">
                      {transcript.sessionID}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Platform</div>
                    <div className="text-gray-900 text-sm">Chat widget</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Duration</div>
                    <div className="text-gray-900 text-sm">{calculateDuration(transcript)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Messages</div>
                    <div className="text-gray-900 text-sm">{transcript.messageCount}</div>
                  </div>
                </div>
              </div>

              {/* Separator */}
              <div className="border-t border-gray-200"></div>

              {/* Device Info (if available) */}
              {(transcript.browser || transcript.device || transcript.os) && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Device Info
                    </h3>
                    <div className="space-y-3">
                      {transcript.browser && (
                        <div>
                          <div className="text-gray-400 text-xs mb-0.5">Browser</div>
                          <div className="text-gray-900 text-sm">{transcript.browser}</div>
                        </div>
                      )}
                      {transcript.device && (
                        <div>
                          <div className="text-gray-400 text-xs mb-0.5">Device</div>
                          <div className="text-gray-900 text-sm">{transcript.device}</div>
                        </div>
                      )}
                      {transcript.os && (
                        <div>
                          <div className="text-gray-400 text-xs mb-0.5">OS</div>
                          <div className="text-gray-900 text-sm">{transcript.os}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Separator */}
                  <div className="border-t border-gray-200"></div>
                </>
              )}

              {/* Evaluations Section (placeholder) */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Evaluations
                </h3>
                <div className="text-gray-400 text-xs">
                  No evaluations available
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Transcript */}
          <div className="flex-1 flex flex-col bg-white">
            {/* Transcript Header */}
            <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700">Transcript</h3>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {transcript.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-gray-500">No messages available</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {transcript.messages.map((message) => (
                    <CompactMessageBubble key={message.id} message={message} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact Message Bubble (High Visual Density)
function CompactMessageBubble({ message }: { message: ParsedMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[70%]">
        {/* Author label - only show for agent, removed for user */}
        {!isUser && (
          <div className="px-3 mb-0.5">
            <span className="text-xs text-gray-400">Traidenis</span>
          </div>
        )}

        {/* Message bubble - dense and clean, subtle background for agent */}
        <div
          className={`px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-lg'
              : 'bg-gray-50 text-gray-900 rounded-lg'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Timestamp - smaller and lighter */}
        <div className={`px-3 mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
          <span className="text-[11px] text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString('lt-LT', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
