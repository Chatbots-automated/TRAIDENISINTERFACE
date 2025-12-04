import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Clock,
  AlertCircle,
  Filter
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
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(!user.is_admin);
  const [refreshing, setRefreshing] = useState(false);

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

  const toggleExpand = (transcriptId: string) => {
    setExpandedTranscript(prev => prev === transcriptId ? null : transcriptId);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('lt-LT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return formatTime(dateString);
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

  // Filter transcripts based on user preference
  const displayTranscripts = showOnlyMine && !user.is_admin
    ? filterTranscriptsByUser(transcripts, user.id)
    : showOnlyMine
    ? filterTranscriptsByUser(transcripts, user.id)
    : transcripts;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Simple Header */}
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

        {/* Stats */}
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

      {/* Transcripts List */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
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
          <div className="space-y-2">
            {displayTranscripts.map((transcript) => (
              <div
                key={transcript.id}
                className={`border border-gray-200 rounded-lg overflow-hidden transition-all ${
                  expandedTranscript === transcript.id ? 'shadow-sm' : 'hover:border-gray-300'
                }`}
              >
                {/* Transcript Header */}
                <button
                  onClick={() => toggleExpand(transcript.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                    {transcript.userImage ? (
                      <img
                        src={transcript.userImage}
                        alt={transcript.userName || 'User'}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-white" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {transcript.userName || 'Anonymous User'}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {transcript.preview}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(transcript.createdAt)}
                      </span>
                      <span>{transcript.messageCount} messages</span>
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className="flex-shrink-0">
                    {expandedTranscript === transcript.id ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Messages */}
                {expandedTranscript === transcript.id && (
                  <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
                    {transcript.messages.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">
                        No messages available
                      </p>
                    ) : (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {transcript.messages.map((message) => (
                          <MessageBubble key={message.id} message={message} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Clean Message Bubble Component (Voiceflow style)
function MessageBubble({ message }: { message: ParsedMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className="flex flex-col gap-1">
      {/* Author label */}
      <div className={`flex items-center gap-2 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <span className="text-xs text-gray-500">
          {isUser ? 'User' : 'Traidenis'}
        </span>
      </div>

      {/* Message bubble */}
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`px-4 py-2.5 rounded-lg max-w-[70%] ${
            isUser
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-gray-200 text-gray-900'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>

      {/* Timestamp */}
      <div className={`px-1 ${isUser ? 'text-right' : 'text-left'}`}>
        <span className="text-xs text-gray-400">
          {new Date(message.timestamp).toLocaleTimeString('lt-LT', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  );
}
