import React, { useState, useEffect } from 'react';
import { MessageSquare, Search, Calendar, AlertCircle } from 'lucide-react';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';

interface TranscriptsInterfaceProps {
  user: AppUser;
}

interface Transcript {
  id: string;
  created_at: string;
  message_count: number;
  session_id: string;
}

export default function TranscriptsInterface({ user }: TranscriptsInterfaceProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      setLoading(true);
      // TODO: Implement Supabase query to fetch transcripts
      // For now, just set empty array
      setTranscripts([]);
    } catch (error) {
      console.error('Error loading transcripts:', error);
      setError('Failed to load transcripts');
    } finally {
      setLoading(false);
    }
  };

  const filteredTranscripts = transcripts.filter(t =>
    t.session_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col" style={{ background: colors.bg.primary }}>
      {/* Header */}
      <div className="p-6 border-b" style={{
        borderColor: colors.border.light,
        background: colors.bg.white + 'CC'
      }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: colors.text.primary }}>Transcripts</h2>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
              View conversation history
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.text.tertiary }} />
          <input
            type="text"
            placeholder="Search transcripts..."
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
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-lg flex items-center space-x-3" style={{ background: colors.status.errorBg }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: colors.status.errorText }} />
          <p className="text-sm" style={{ color: colors.status.errorText }}>{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
              <p className="text-sm" style={{ color: colors.text.secondary }}>Loading transcripts...</p>
            </div>
          </div>
        ) : filteredTranscripts.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.tertiary }} />
              <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>No transcripts yet</h3>
              <p className="text-sm" style={{ color: colors.text.secondary }}>
                {searchQuery ? 'No transcripts match your search' : 'Transcripts will appear here'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTranscripts.map((transcript) => (
              <div
                key={transcript.id}
                className="p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: colors.bg.white,
                  borderColor: colors.border.default
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <MessageSquare className="w-5 h-5" style={{ color: colors.interactive.accent }} />
                    <div>
                      <p className="font-medium" style={{ color: colors.text.primary }}>
                        Session {transcript.session_id.substring(0, 8)}
                      </p>
                      <p className="text-xs" style={{ color: colors.text.tertiary }}>
                        {transcript.message_count} messages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-xs" style={{ color: colors.text.secondary }}>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(transcript.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
