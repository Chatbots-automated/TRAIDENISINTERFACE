import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Bot,
  Clock,
  Monitor,
  Smartphone,
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('lt-LT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('lt-LT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDeviceIcon = (device?: string) => {
    if (!device) return <Monitor className="w-3 h-3" />;
    const d = device.toLowerCase();
    if (d.includes('mobile') || d.includes('phone') || d.includes('android') || d.includes('iphone')) {
      return <Smartphone className="w-3 h-3" />;
    }
    return <Monitor className="w-3 h-3" />;
  };

  // Filter transcripts based on user preference
  const displayTranscripts = showOnlyMine && !user.is_admin
    ? filterTranscriptsByUser(transcripts, user.id)
    : showOnlyMine
    ? filterTranscriptsByUser(transcripts, user.id)
    : transcripts;

  return (
    <div className="h-full flex flex-col bg-vf-background">
      {/* Header */}
      <div className="p-6 border-b border-vf-border bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Transcripts</h2>
            <p className="text-sm text-vf-secondary mt-1">
              View Voiceflow chat conversation history
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Filter toggle (admin only sees this) */}
            {user.is_admin && (
              <button
                onClick={() => setShowOnlyMine(!showOnlyMine)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-vf text-sm font-medium transition-all ${
                  showOnlyMine
                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>{showOnlyMine ? 'My Transcripts' : 'All Transcripts'}</span>
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="vf-btn vf-btn-primary px-5 py-2.5 flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="font-medium">Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-4 text-sm text-vf-secondary">
          <span>{displayTranscripts.length} conversation{displayTranscripts.length !== 1 ? 's' : ''}</span>
          {transcripts.length !== displayTranscripts.length && (
            <span className="text-gray-400">({transcripts.length} total)</span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Transcripts List */}
      <div className="flex-1 overflow-y-auto p-6 vf-scrollbar">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-vf animate-pulse" />
            ))}
          </div>
        ) : displayTranscripts.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No transcripts found
            </h3>
            <p className="text-vf-secondary mb-4 text-sm">
              {showOnlyMine
                ? 'Start a conversation with the Voiceflow chat to see your transcripts here'
                : 'No conversations have been recorded yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayTranscripts.map((transcript) => (
              <div
                key={transcript.id}
                className="vf-card overflow-hidden hover:shadow-vf transition-all"
              >
                {/* Transcript Header */}
                <button
                  onClick={() => toggleExpand(transcript.id)}
                  className="w-full p-4 flex items-start justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start space-x-4 flex-1">
                    {/* User Avatar */}
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
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

                    {/* Transcript Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {transcript.userName || 'Anonymous User'}
                        </h3>
                        {transcript.unread && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-vf-secondary line-clamp-2 mb-2">
                        {transcript.preview}
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-gray-400">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(transcript.createdAt)}</span>
                        </span>
                        <span>{transcript.messageCount} messages</span>
                        {transcript.device && (
                          <span className="flex items-center space-x-1">
                            {getDeviceIcon(transcript.device)}
                            <span>{transcript.browser || transcript.device}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className="flex-shrink-0 ml-4">
                    {expandedTranscript === transcript.id ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Messages */}
                {expandedTranscript === transcript.id && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 max-h-96 overflow-y-auto">
                    {transcript.messages.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No messages available
                      </p>
                    ) : (
                      <div className="space-y-3">
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

// Message Bubble Component
function MessageBubble({ message }: { message: ParsedMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-lg ${
          isUser
            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        <div className="flex items-center space-x-2 mb-1">
          {isUser ? (
            <UserIcon className="w-3 h-3" />
          ) : (
            <Bot className="w-3 h-3" />
          )}
          <span className={`text-xs ${isUser ? 'text-purple-100' : 'text-gray-500'}`}>
            {isUser ? 'User' : 'Traidenis'}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p className={`text-xs mt-1 ${isUser ? 'text-purple-200' : 'text-gray-400'}`}>
          {new Date(message.timestamp).toLocaleTimeString('lt-LT', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>
    </div>
  );
}
