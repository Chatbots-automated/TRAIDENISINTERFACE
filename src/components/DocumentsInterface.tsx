import React, { useState, useEffect } from 'react';
import { FileText, Search, Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_email: string;
}

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [projectId]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      // TODO: Implement Supabase query to fetch documents
      // For now, just set empty array
      setDocuments([]);
    } catch (error) {
      console.error('Error loading documents:', error);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col" style={{ background: colors.bg.primary }}>
      {/* Header */}
      <div className="p-6 border-b" style={{
        borderColor: colors.border.light,
        background: colors.bg.white + 'CC' // 80% opacity
      }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: colors.text.primary }}>Documents</h2>
            <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>Manage your documents</p>
          </div>
          <button
            className="px-6 py-2.5 rounded-lg font-medium flex items-center space-x-2 transition-colors"
            style={{
              background: colors.interactive.accent,
              color: '#ffffff'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.interactive.accentHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = colors.interactive.accent)}
          >
            <Plus className="w-4 h-4" />
            <span>New Document</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.text.tertiary }} />
          <input
            type="text"
            placeholder="Search documents..."
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

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-lg flex items-center space-x-3" style={{ background: colors.status.errorBg }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: colors.status.errorText }} />
          <p className="text-sm" style={{ color: colors.status.errorText }}>{error}</p>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-4 rounded-lg flex items-center space-x-3" style={{ background: colors.status.successBg }}>
          <Check className="w-5 h-5 flex-shrink-0" style={{ color: colors.status.successText }} />
          <p className="text-sm" style={{ color: colors.status.successText }}>Document saved successfully</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
              <p className="text-sm" style={{ color: colors.text.secondary }}>Loading documents...</p>
            </div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.tertiary }} />
              <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>No documents yet</h3>
              <p className="text-sm" style={{ color: colors.text.secondary }}>
                {searchQuery ? 'No documents match your search' : 'Create your first document to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="p-5 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: colors.bg.white,
                  borderColor: colors.border.default
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <FileText className="w-5 h-5" style={{ color: colors.interactive.accent }} />
                  <button
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    style={{ color: colors.status.errorText }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-medium mb-2 line-clamp-1" style={{ color: colors.text.primary }}>
                  {doc.title}
                </h3>
                <p className="text-sm line-clamp-2 mb-3" style={{ color: colors.text.secondary }}>
                  {doc.content}
                </p>
                <p className="text-xs" style={{ color: colors.text.tertiary }}>
                  {new Date(doc.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
