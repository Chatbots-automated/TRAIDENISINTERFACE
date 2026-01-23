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
  fetchEnrichedTranscripts,
  filterTranscriptsByUser,
  ParsedTranscript,
  ParsedMessage,
  LinkedAppUser
} from '../lib/voiceflow';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';

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
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingProgress('Fetching transcripts...');
      // Use enriched transcripts to get linked app user info
      const data = await fetchEnrichedTranscripts();
      setTranscripts(data);
      setLoadingProgress('');
    } catch (err: any) {
      console.error('Error loading transcripts:', err);
      setError(err.message || 'Failed to load transcripts');
      setLoadingProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoadingProgress('Refreshing transcripts...');
    try {
      // Use enriched transcripts to get linked app user info
      const data = await fetchEnrichedTranscripts();
      setTranscripts(data);
      setError(null);
      setLoadingProgress('');
    } catch (err: any) {
      console.error('Error refreshing transcripts:', err);
      setError(err.message || 'Failed to refresh transcripts');
      setLoadingProgress('');
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
      <div className="h-full flex flex-col" style={{ background: colors.bg.secondary }}>
        {/* Header */}
        <div className="p-6" style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.white }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold" style={{ color: colors.text.primary }}>Transcripts</h2>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                View Voiceflow chat conversation history
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {user.is_admin && (
                <FilterButton
                  showOnlyMine={showOnlyMine}
                  onClick={() => setShowOnlyMine(!showOnlyMine)}
                />
              )}
              <RefreshButton
                onClick={handleRefresh}
                disabled={refreshing || loading}
                refreshing={refreshing}
              />
            </div>
          </div>

          <div className="text-sm" style={{ color: colors.text.tertiary }}>
            {displayTranscripts.length} conversation{displayTranscripts.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 p-3 rounded-lg" style={{
            color: colors.status.errorText,
            background: colors.status.error,
            border: `1px solid ${colors.status.errorBorder}`
          }}>
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Transcripts Data Table */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 vf-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-3 h-3 rounded-full animate-bounce" style={{ background: colors.border.default, animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 rounded-full animate-bounce" style={{ background: colors.border.default, animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 rounded-full animate-bounce" style={{ background: colors.border.default, animationDelay: '300ms' }}></div>
              </div>
              {loadingProgress && (
                <p className="text-sm" style={{ color: colors.text.tertiary }}>{loadingProgress}</p>
              )}
            </div>
          ) : displayTranscripts.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-16 h-16 mx-auto mb-4" style={{ color: colors.border.default }} />
              <h3 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
                No transcripts found
              </h3>
              <p className="mb-8 text-sm" style={{ color: colors.text.secondary }}>
                {showOnlyMine
                  ? 'Start a conversation to see your transcripts here'
                  : 'No conversations have been recorded yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayTranscripts.map((transcript) => (
                <TranscriptCard
                  key={transcript.id}
                  transcript={transcript}
                  onClick={() => setSelectedTranscript(transcript)}
                  formatTableDate={formatTableDate}
                />
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-7xl h-[85vh] flex flex-col min-w-0 overflow-hidden"
        style={{ background: colors.bg.white }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex-shrink-0 flex">
          {/* Left side header */}
          <div className="w-80 min-w-[280px] max-w-[320px] px-6 py-4" style={{ background: colors.bg.secondary }}>
            <h3 className="text-sm font-semibold" style={{ color: colors.text.secondary }}>Details</h3>
          </div>

          {/* Right side header */}
          <div className="flex-1 px-6 py-4" style={{
            borderBottom: `1px solid ${colors.border.default}`,
            borderLeft: `1px solid ${colors.border.default}`,
            background: colors.bg.secondary
          }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold truncate" style={{ color: colors.text.primary }}>
                  {transcript.appUser?.display_name || transcript.userName || 'Anonymous User'}
                </h2>
                <p className="text-sm mt-0.5 truncate" style={{ color: colors.text.secondary }}>{transcript.preview}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ExportButton onClick={() => alert('Export functionality coming soon!')} />
                <CloseButton onClick={onClose} />
              </div>
            </div>
          </div>
        </div>

        {/* Two-Panel Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Metadata */}
          <div className="w-80 min-w-[280px] max-w-[320px] overflow-y-auto flex-shrink-0" style={{
            borderRight: `1px solid ${colors.border.default}`,
            background: colors.bg.secondary,
            padding: '24px'
          }}>
            <div className="space-y-3">
              {/* Interface User (if linked) */}
              {transcript.appUser && (
                <>
                  <div className="pb-2 mb-2" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                        color: colors.interactive.accent,
                        background: colors.interactive.accentLight
                      }}>
                        Verified User
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: colors.text.tertiary }}>Name</span>
                    <span className="text-xs font-medium text-right" style={{ color: colors.text.primary }}>
                      {transcript.appUser.display_name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: colors.text.tertiary }}>Email</span>
                    <span className="text-xs text-right truncate max-w-[160px]" style={{ color: colors.text.primary }} title={transcript.appUser.email}>
                      {transcript.appUser.email}
                    </span>
                  </div>
                  {transcript.appUser.is_admin && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: colors.text.tertiary }}>Role</span>
                      <span className="text-xs font-medium text-right" style={{ color: colors.interactive.accent }}>
                        Admin
                      </span>
                    </div>
                  )}
                  <div className="my-2" style={{ borderBottom: `1px solid ${colors.border.default}` }} />
                </>
              )}

              {/* Date & Time */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: colors.text.tertiary }}>Date & Time</span>
                <span className="text-xs font-medium text-right" style={{ color: colors.text.primary }}>
                  {transcript.messages.length > 0
                    ? formatFullDate(transcript.messages[0].timestamp)
                    : formatFullDate(transcript.createdAt)
                  }
                </span>
              </div>

              {/* Session ID with copy feature */}
              <UserIDField sessionID={transcript.sessionID} />

              {/* Voiceflow User ID (if extracted) */}
              {transcript.voiceflowUserId && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: colors.text.tertiary }}>VF User ID</span>
                  <span className="text-xs font-mono text-right truncate max-w-[140px]" style={{ color: colors.text.primary }} title={transcript.voiceflowUserId}>
                    {transcript.voiceflowUserId.length > 18
                      ? transcript.voiceflowUserId.substring(0, 15) + '...'
                      : transcript.voiceflowUserId}
                  </span>
                </div>
              )}

              {/* Platform */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: colors.text.tertiary }}>Platform</span>
                <span className="text-xs text-right" style={{ color: colors.text.primary }}>Chat widget</span>
              </div>

              {/* Duration */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: colors.text.tertiary }}>Duration</span>
                <span className="text-xs font-medium text-right" style={{ color: colors.text.primary }}>{calculateDuration(transcript)}</span>
              </div>

              {/* Messages */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: colors.text.tertiary }}>Messages</span>
                <span className="text-xs font-medium text-right" style={{ color: colors.text.primary }}>{transcript.messageCount}</span>
              </div>

              {/* Credits Used */}
              {transcript.credits !== undefined && transcript.credits > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: colors.text.tertiary }}>Credits Used</span>
                  <span className="text-xs font-medium text-right" style={{ color: colors.text.primary }}>{transcript.credits}</span>
                </div>
              )}

              {/* Device Info */}
              {transcript.browser && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: colors.text.tertiary }}>Browser</span>
                  <span className="text-xs text-right" style={{ color: colors.text.primary }}>{transcript.browser}</span>
                </div>
              )}
              {transcript.device && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: colors.text.tertiary }}>Device</span>
                  <span className="text-xs text-right" style={{ color: colors.text.primary }}>{transcript.device}</span>
                </div>
              )}
              {transcript.os && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: colors.text.tertiary }}>OS</span>
                  <span className="text-xs text-right" style={{ color: colors.text.primary }}>{transcript.os}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Transcript */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: colors.bg.white }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '24px' }}>
              {transcript.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3" style={{ color: colors.border.default }} />
                    <p className="text-sm" style={{ color: colors.text.tertiary }}>No messages available</p>
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

// Session ID Field with copy functionality
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
      <span className="text-xs" style={{ color: colors.text.tertiary }}>Session ID</span>
      <div className="relative">
        <button
          onClick={handleCopy}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="text-xs font-mono text-right cursor-pointer transition-all duration-200 hover:scale-105"
          style={{ color: colors.text.primary }}
          title={sessionID}
        >
          {displayID}
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute right-0 top-full mt-1 px-2 py-1 text-xs rounded whitespace-nowrap z-10 pointer-events-none" style={{
            background: colors.text.primary,
            color: colors.bg.white
          }}>
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
            <span className="text-xs font-medium" style={{ color: colors.text.secondary }}>Traidenis</span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`px-4 py-3 text-sm leading-relaxed overflow-hidden ${
            isUser
              ? 'rounded-2xl rounded-tr-sm'
              : 'rounded-2xl rounded-tl-sm'
          }`}
          style={{
            background: isUser ? colors.interactive.accent : colors.bg.secondary,
            color: isUser ? colors.bg.white : colors.text.primary,
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
          <span className="text-xs" style={{ color: colors.text.tertiary }}>
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

// Filter Button Component
function FilterButton({ showOnlyMine, onClick }: { showOnlyMine: boolean; onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
      style={{
        background: showOnlyMine ? colors.interactive.accentLight : (isHovered ? colors.bg.secondary : colors.bg.primary),
        color: showOnlyMine ? colors.interactive.accent : colors.text.secondary
      }}
    >
      <Filter className="w-4 h-4" />
      {showOnlyMine ? 'All Transcripts' : 'My Transcripts'}
    </button>
  );
}

// Refresh Button Component
function RefreshButton({ onClick, disabled, refreshing }: { onClick: () => void; disabled: boolean; refreshing: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: disabled ? colors.interactive.accent : (isHovered ? colors.interactive.accentHover : colors.interactive.accent),
        color: colors.bg.white
      }}
    >
      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  );
}

// Export Button Component
function ExportButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="transition-colors p-2"
      style={{ color: isHovered ? colors.text.primary : colors.text.tertiary }}
      title="Export transcript"
    >
      <Download className="w-5 h-5" />
    </button>
  );
}

// Close Button Component
function CloseButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="transition-colors"
      style={{ color: isHovered ? colors.text.primary : colors.text.tertiary }}
      aria-label="Close modal"
    >
      <X className="w-5 h-5" />
    </button>
  );
}

// Transcript Card Component
function TranscriptCard({
  transcript,
  onClick,
  formatTableDate
}: {
  transcript: ParsedTranscript;
  onClick: () => void;
  formatTableDate: (transcript: ParsedTranscript) => string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="rounded-lg cursor-pointer transition-all"
      style={{
        padding: '14px 16px',
        background: isHovered ? colors.bg.secondary : colors.bg.white,
        boxShadow: isHovered ? '0 3px 6px 0 rgba(0, 0, 0, 0.08)' : '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        overflow: 'hidden'
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1" style={{ gap: '14px' }}>
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
              background: colors.interactive.accentLight,
              border: `1px solid ${colors.interactive.accent}33`
            }}>
              <MessageSquare className="w-5 h-5" style={{ color: colors.interactive.accent }} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold" style={{ color: colors.text.primary }}>
                {transcript.appUser?.display_name || transcript.userName || 'Anonymous User'}
              </h3>
              {transcript.appUser && (
                <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={{
                  background: colors.interactive.accentLight,
                  color: colors.interactive.accent
                }} title={`Verified: ${transcript.appUser.email}`}>
                  Verified
                </span>
              )}
              {transcript.unread && (
                <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={{
                  background: '#e0f2fe',
                  color: '#0369a1'
                }}>
                  New
                </span>
              )}
            </div>

            {transcript.appUser?.email && (
              <p className="text-xs mb-0.5" style={{ color: colors.text.tertiary }}>
                {transcript.appUser.email}
              </p>
            )}

            <p
              className="text-xs mb-1.5"
              style={{
                color: colors.text.tertiary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%'
              }}
            >
              {transcript.preview}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center rounded font-medium"
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: colors.text.secondary,
                  background: colors.bg.secondary
                }}
              >
                <Clock className="w-3 h-3 mr-1" />
                {formatTableDate(transcript)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center ml-4">
          <ChevronRight className="w-5 h-5" style={{ color: colors.text.tertiary }} />
        </div>
      </div>
    </div>
  );
}
