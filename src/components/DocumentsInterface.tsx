import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, X, Search, Filter, CreditCard as Edit3, Trash2, Eye, Plus, AlertCircle, Check, Save, ChevronDown, ChevronRight, Code, Zap, File } from 'lucide-react';
import { Document } from '../types';
import { createDocument, updateDocument, deleteDocument, getDocuments } from '../lib/supabase';
import { searchDocumentsClient, SearchResult } from '../lib/vectorSearch';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocMetadata, setNewDocMetadata] = useState('{}');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedMetadata, setExpandedMetadata] = useState<Set<string>>(new Set());
  const [viewingMetadata, setViewingMetadata] = useState<string | null>(null);
  const [vectorSearchResults, setVectorSearchResults] = useState<SearchResult[]>([]);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const [vectorSearchMode, setVectorSearchMode] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await getDocuments();
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!newDocContent.trim()) return;

    setSaving(true);
    setError(null);

    try {
      let metadata = {};
      try {
        metadata = JSON.parse(newDocMetadata);
      } catch (e) {
        throw new Error('Invalid JSON in metadata field');
      }

      const { error } = await createDocument(newDocContent, metadata);
      if (error) throw error;

      setNewDocContent('');
      setNewDocMetadata('{}');
      setShowCreateForm(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadDocuments();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError(null);

    try {
      // Log upload start
      await appLogger.logDocument({
        action: 'upload_started',
        userId: user.id,
        userEmail: user.email,
        filename: file.name,
        fileSize: file.size,
        metadata: { project_id: projectId, file_type: file.type }
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);
      formData.append('user_id', user.id);

      console.log('Uploading file:', file.name, 'to webhook...');

      const response = await fetch('https://209f05431d92.ngrok-free.app/webhook/88b13b24-9857-49f4-a713-41b2964177f7', {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true'
        },
        body: formData
      });

      if (!response.ok) {
        await appLogger.logDocument({
          action: 'upload_failed',
          userId: user.id,
          userEmail: user.email,
          filename: file.name,
          fileSize: file.size,
          level: 'error',
          metadata: {
            project_id: projectId,
            error: `${response.status} ${response.statusText}`
          }
        });
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);

      // Log upload success
      await appLogger.logDocument({
        action: 'upload_success',
        userId: user.id,
        userEmail: user.email,
        filename: file.name,
        fileSize: file.size,
        metadata: { project_id: projectId, result }
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadDocuments();
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(`Upload failed: ${error.message}`);

      await appLogger.logError({
        action: 'document_upload_error',
        error,
        userId: user.id,
        userEmail: user.email,
        metadata: {
          filename: file.name,
          file_size: file.size,
          project_id: projectId
        }
      });
    } finally {
      setUploadingFile(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleUpdateDocument = async () => {
    if (!editingDoc) return;

    setSaving(true);
    setError(null);

    try {
      let metadata = editingDoc.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          throw new Error('Invalid JSON in metadata field');
        }
      }

      const { error } = await updateDocument(editingDoc.id, editingDoc.content, metadata);
      if (error) throw error;

      await appLogger.logDocument({
        action: 'update',
        userId: user.id,
        userEmail: user.email,
        documentId: editingDoc.id,
        metadata: { content_length: editingDoc.content.length }
      });

      setEditingDoc(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadDocuments();
    } catch (error: any) {
      setError(error.message);
      await appLogger.logError({
        action: 'document_update_error',
        error: error.message,
        userId: user.id,
        userEmail: user.email,
        metadata: { document_id: editingDoc.id }
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const doc = documents.find(d => d.id === id);
      const { error } = await deleteDocument(id);
      if (error) throw error;

      await appLogger.logDocument({
        action: 'delete',
        userId: user.id,
        userEmail: user.email,
        documentId: id,
        filename: doc?.metadata?.filename,
        metadata: { document_metadata: doc?.metadata }
      });

      await loadDocuments();
    } catch (error: any) {
      setError(error.message);
      await appLogger.logError({
        action: 'document_delete_error',
        error: error.message,
        userId: user.id,
        userEmail: user.email,
        metadata: { document_id: id }
      });
    }
  };

  const toggleMetadataExpansion = (docId: string) => {
    const newExpanded = new Set(expandedMetadata);
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId);
    } else {
      newExpanded.add(docId);
    }
    setExpandedMetadata(newExpanded);
  };

  const formatMetadataForDisplay = (metadata: any) => {
    if (!metadata) return {};
    
    // If it's already an object, return it
    if (typeof metadata === 'object' && metadata !== null) {
      return metadata;
    }
    
    // If it's a string, try to parse it
    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch (e) {
        console.error('Failed to parse metadata:', e);
        return {};
      }
    }
    
    return {};
  };

  const renderMetadataValue = (value: any): string => {
    if (typeof value === 'string') {
      // Handle newlines in strings
      return value.replace(/\\n/g, '\n');
    }
    return String(value);
  };

  const getDisplayDocuments = () => {
    // If we're in vector search mode and have results, show those
    if (vectorSearchMode && vectorSearchResults.length > 0) {
      return vectorSearchResults.map(result => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        similarity: result.similarity
      }));
    }
    
    // Otherwise, show regular filtered documents
    if (searchQuery.trim()) {
      // Traditional text search
      return documents.filter(doc =>
        doc.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(doc.metadata).toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else {
      // No search, show all documents
      return documents;
    }
  };

  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) {
      setVectorSearchMode(false);
      setVectorSearchResults([]);
      return;
    }

    setIsVectorSearching(true);
    setError(null);

    try {
      const results = await searchDocumentsClient(searchQuery, {
        match_count: 10,
        min_similarity: 0.1
      });

      setVectorSearchResults(results);
      setVectorSearchMode(true);
    } catch (error: any) {
      console.error('Vector search error:', error);
      setError(`Vector search failed: ${error.message}`);
      setVectorSearchMode(false);
      setVectorSearchResults([]);
    } finally {
      setIsVectorSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Reset vector search mode when query changes
    if (vectorSearchMode) {
      setVectorSearchMode(false);
      setVectorSearchResults([]);
    }
  };

  const displayDocuments = getDisplayDocuments();

  return (
    <div className="h-full flex flex-col bg-vf-background">
      {/* Header */}
      <div className="p-6 border-b border-vf-border bg-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Documents</h2>
            <p className="text-sm text-vf-secondary mt-1">Create, edit, and organize your documents</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={triggerFileUpload}
              disabled={uploadingFile}
              className="vf-btn vf-btn-primary px-6 py-2.5 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingFile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span className="font-medium">Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span className="font-medium">Upload Document</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-2.5 border border-vf-border text-vf-secondary rounded-vf hover:bg-gray-50 transition-all flex items-center space-x-2 font-medium shadow-vf-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Manually</span>
            </button>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md"
            />
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-vf-secondary w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search documents by content, metadata, or use AI vector search..."
              className="vf-input w-full pl-11 pr-4 py-3 text-sm"
            />
          </div>

          {/* Vector Search Button */}
          <button
            onClick={handleVectorSearch}
            disabled={!searchQuery.trim() || isVectorSearching}
            className="px-5 py-3 bg-purple-600 text-white rounded-vf hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium shadow-vf-sm"
          >
            {isVectorSearching ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>AI Search</span>
              </>
            )}
          </button>

          <button className="p-3 border border-vf-border rounded-vf hover:bg-gray-50 transition-all shadow-vf-sm">
            <Filter className="w-5 h-5 text-vf-secondary" />
          </button>
        </div>
      </div>

      {/* Create Document Form */}
      {showCreateForm && (
        <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b border-green-200">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Create New Document</h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
              <textarea
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Enter document content..."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Metadata (JSON)</label>
              <textarea
                value={newDocMetadata}
                onChange={(e) => setNewDocMetadata(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleCreateDocument}
                disabled={saving || !newDocContent.trim()}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Create Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg">
          <Check className="w-5 h-5" />
          <span className="text-sm">Operation completed successfully!</span>
        </div>
      )}
      {/* Documents List */}
      <div className="flex-1 overflow-y-auto p-6 vf-scrollbar">
        {/* Search Mode Indicator */}
        {vectorSearchMode && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-vf shadow-vf-sm">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-800">
                AI Vector Search Results for "{searchQuery}"
              </span>
              <button
                onClick={() => {
                  setVectorSearchMode(false);
                  setVectorSearchResults([]);
                  setSearchQuery('');
                }}
                className="ml-auto text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-purple-600 mt-2">
              Found {vectorSearchResults.length} semantically similar documents
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-vf animate-pulse" />
            ))}
          </div>
        ) : displayDocuments.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery
                ? (vectorSearchMode ? 'No similar documents found' : 'No documents found')
                : 'No documents yet'
              }
            </h3>
            <p className="text-vf-secondary mb-8 text-sm">
              {searchQuery
                ? (vectorSearchMode ? 'Try adjusting your search terms or use regular search' : 'Try adjusting your search terms or use AI search')
                : 'Create your first document to get started'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="vf-btn vf-btn-primary px-8 py-3"
              >
                Create Document
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {displayDocuments.map((document) => (
              <div
                key={document.id}
                className="vf-card p-5 hover:shadow-vf transition-all cursor-pointer"
              >
                {editingDoc?.id === document.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                      <textarea
                        value={editingDoc.content || ''}
                        onChange={(e) => setEditingDoc({...editingDoc, content: e.target.value})}
                        className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Metadata (JSON)</label>
                      <textarea
                        value={typeof editingDoc.metadata === 'object' 
                          ? JSON.stringify(editingDoc.metadata, null, 2)
                          : editingDoc.metadata || '{}'
                        }
                        onChange={(e) => {
                          setEditingDoc({...editingDoc, metadata: e.target.value});
                        }}
                        className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                        placeholder='{"key": "value"}'
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleUpdateDocument}
                        disabled={saving}
                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50 flex items-center space-x-2"
                      >
                        {saving ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => setEditingDoc(null)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="w-14 h-14 bg-green-50 rounded-vf flex items-center justify-center flex-shrink-0 border border-green-100">
                        <FileText className="w-6 h-6 text-green-600" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 mb-1.5">
                          Document #{document.id}
                          {vectorSearchMode && document.similarity && (
                            <span className="ml-2 px-2.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                              {Math.round(document.similarity * 100)}% match
                            </span>
                          )}
                        </h3>
                        <div className="text-sm text-vf-secondary mb-3 leading-relaxed">
                          <p className="line-clamp-3">{document.content}</p>
                        </div>
                        
                        {/* Metadata Section */}
                        <div className="mt-3">
                          <button
                            onClick={() => toggleMetadataExpansion(document.id)}
                            className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            {expandedMetadata.has(document.id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <span>
                              Metadata ({Object.keys(formatMetadataForDisplay(document.metadata)).length} fields)
                            </span>
                          </button>
                          
                          {expandedMetadata.has(document.id) && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border space-y-3">
                              {/* Edit Button */}
                              <div className="flex justify-end">
                                <button
                                  onClick={() => setEditingDoc(document)}
                                  className="px-3 py-1 text-xs bg-gradient-to-r from-green-500 to-blue-500 text-white rounded hover:from-green-600 hover:to-blue-600 transition-all flex items-center space-x-1"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit Metadata</span>
                                </button>
                              </div>
                              
                              {/* Metadata Display */}
                              {Object.keys(formatMetadataForDisplay(document.metadata)).length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No metadata</p>
                              ) : (
                                <div className="space-y-2">
                                  {Object.entries(formatMetadataForDisplay(document.metadata)).map(([key, value]) => (
                                    <div key={key} className="border-b border-gray-200 pb-2 last:border-b-0">
                                      <div className="flex items-start justify-between">
                                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                          {key.replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      <div className="mt-1">
                                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                                          {renderMetadataValue(value)}
                                        </pre>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Raw JSON View Button */}
                              <div className="mt-3 pt-2 border-t border-gray-200">
                                <button
                                  onClick={() => setViewingMetadata(viewingMetadata === document.id ? null : document.id)}
                                  className="flex items-center space-x-1 text-xs text-green-600 hover:text-green-700 transition-colors"
                                >
                                  <Code className="w-3 h-3" />
                                  <span>{viewingMetadata === document.id ? 'Hide' : 'Show'} Raw JSON</span>
                                </button>
                                
                                {viewingMetadata === document.id && (
                                  <div className="mt-2 p-2 bg-gray-900 rounded text-xs">
                                    <pre className="text-green-400 overflow-x-auto">
                                      {typeof document.metadata === 'object' 
                                        ? JSON.stringify(document.metadata, null, 2)
                                        : document.metadata
                                      }
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => toggleMetadataExpansion(document.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View metadata"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingDoc(document)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit document"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteDocument(document.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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