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
      <div className="h-full flex flex-col bg-vf-background">
        {/* Header */}
        <div className="p-6 border-b border-vf-border bg-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Transcripts</h2>
              <p className="text-sm text-vf-secondary mt-1">
                View Voiceflow chat conversation history
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {user.is_admin && (
                <button
                  onClick={() => setShowOnlyMine(!showOnlyMine)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
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
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {displayTranscripts.length} conversation{displayTranscripts.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Transcripts Data Table */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 vf-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          ) : displayTranscripts.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No transcripts found
              </h3>
              <p className="text-vf-secondary mb-8 text-sm">
                {showOnlyMine
                  ? 'Start a conversation to see your transcripts here'
                  : 'No conversations have been recorded yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayTranscripts.map((transcript) => (
                <div
                  key={transcript.id}
                  onClick={() => setSelectedTranscript(transcript)}
                  className="bg-white rounded-lg cursor-pointer transition-all"
                  style={{
                    padding: '14px 16px',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f7f7f7';
                    e.currentTarget.style.boxShadow = '0 3px 6px 0 rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.02)';
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1" style={{ gap: '14px' }}>
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center border border-indigo-100">
                          <MessageSquare className="w-5 h-5 text-indigo-600" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-bold text-gray-900">
                            {transcript.userName || 'Anonymous User'}
                          </h3>
                          {transcript.unread && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                              New
                            </span>
                          )}
                        </div>

                        {/* Preview message with ellipsis */}
                        <p
                          className="text-xs mb-1.5"
                          style={{
                            color: '#777',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                          }}
                        >
                          {transcript.preview}
                        </p>

                        {/* Metadata pills */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="inline-flex items-center rounded font-medium"
                            style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              color: '#4a5568',
                              backgroundColor: '#e2e8f0'
                            }}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {formatTableDate(transcript)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center ml-4">
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center p-4 pt-12">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl h-[85vh] flex flex-col min-w-0 overflow-hidden">
        {/* Modal Header */}
        <div className="flex-shrink-0 flex">
          {/* Left side header */}
          <div className="w-80 min-w-[280px] max-w-[320px] px-6 py-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Details</h3>
          </div>

          {/* Right side header */}
          <div className="flex-1 px-6 py-4 border-b border-l border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 truncate">
                  {transcript.userName || 'Anonymous User'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{transcript.preview}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    alert('Export functionality coming soon!');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                  title="Export transcript"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Two-Panel Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Metadata */}
          <div className="w-80 min-w-[280px] max-w-[320px] border-r border-gray-200 overflow-y-auto bg-gray-50 flex-shrink-0" style={{ padding: '24px' }}>
            <div className="space-y-3">
              {/* Date & Time */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Date & Time</span>
                <span className="text-xs text-gray-900 font-medium text-right">
                  {transcript.messages.length > 0
                    ? formatFullDate(transcript.messages[0].timestamp)
                    : formatFullDate(transcript.createdAt)
                  }
                </span>
              </div>

              {/* User ID with copy feature */}
              <UserIDField sessionID={transcript.sessionID} />

              {/* Platform */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Platform</span>
                <span className="text-xs text-gray-900 text-right">Chat widget</span>
              </div>

              {/* Duration */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Duration</span>
                <span className="text-xs text-gray-900 font-medium text-right">{calculateDuration(transcript)}</span>
              </div>

              {/* Messages */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Messages</span>
                <span className="text-xs text-gray-900 font-medium text-right">{transcript.messageCount}</span>
              </div>

              {/* Credits Used */}
              {transcript.credits !== undefined && transcript.credits > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Credits Used</span>
                  <span className="text-xs text-gray-900 font-medium text-right">{transcript.credits}</span>
                </div>
              )}

              {/* Device Info */}
              {transcript.browser && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Browser</span>
                  <span className="text-xs text-gray-900 text-right">{transcript.browser}</span>
                </div>
              )}
              {transcript.device && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Device</span>
                  <span className="text-xs text-gray-900 text-right">{transcript.device}</span>
                </div>
              )}
              {transcript.os && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">OS</span>
                  <span className="text-xs text-gray-900 text-right">{transcript.os}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Transcript */}
          <div className="flex-1 flex flex-col bg-white min-w-0 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '24px' }}>
              {transcript.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No messages available</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-full">
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

// UserID Field with copy functionality
function UserIDField({ sessionID }: { sessionID: string }) {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionID);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Truncate if longer than 20 characters
  const displayID = sessionID.length > 20 ? sessionID.substring(0, 17) + '...' : sessionID;

  return (
    <div className="flex items-center justify-between group relative">
      <span className="text-xs text-gray-500">User ID</span>
      <div className="relative">
        <button
          onClick={handleCopy}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="text-xs text-gray-900 font-mono text-right cursor-pointer transition-all duration-200 hover:scale-105"
          title={sessionID}
        >
          {displayID}
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none">
            {copied ? 'Copied!' : 'Click to copy'}
          </div>
        )}
      </div>
    </div>
  );
}

// Message Bubble Component
function CompactMessageBubble({ message }: { message: ParsedMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
      <div className="max-w-[85%] min-w-[100px] flex flex-col">
        {/* Author label - only show for agent */}
        {!isUser && (
          <div className="mb-1.5 px-1">
            <span className="text-xs font-medium text-gray-500">Traidenis</span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`px-4 py-3 text-sm leading-relaxed overflow-hidden ${
            isUser
              ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm'
              : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
          }`}
          style={{
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            hyphens: 'auto'
          }}
        >
          <p className="whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
            {message.content}
          </p>
        </div>

        {/* Timestamp */}
        <div className={`mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
          <span className="text-xs text-gray-400">
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
