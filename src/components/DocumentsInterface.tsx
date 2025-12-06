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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState('{}');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [chunkingStrategy, setChunkingStrategy] = useState('');
  const [showMetadataInput, setShowMetadataInput] = useState(false);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
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

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadMetadata('{}');
    setChunkingStrategy('');
    setShowMetadataInput(false);
    setShowStrategyDropdown(false);
    setShowMetadataModal(true);
  };

  const performUpload = async () => {
    if (!selectedFile) return;

    setUploadingFile(true);
    setError(null);
    setShowMetadataModal(false);

    try {
      // Log upload start
      await appLogger.logDocument({
        action: 'upload_started',
        userId: user.id,
        userEmail: user.email,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        metadata: { project_id: projectId, file_type: selectedFile.type }
      });

      const formData = new FormData();
      formData.append('file', selectedFile);

      // Merge system metadata with user-provided metadata
      let userMetadata = {};
      try {
        userMetadata = JSON.parse(uploadMetadata);
      } catch (e) {
        console.warn('Invalid user metadata, using empty object');
      }

      // Add metadata filter based on chunking strategy
      let metadataFilter = {};
      if (chunkingStrategy === 'standartinis') {
        metadataFilter = { UserDocs: 'Standartinis' };
      } else if (chunkingStrategy === 'nestandartinis') {
        metadataFilter = { UserDocs: 'Nestandartinis' };
      } else if (chunkingStrategy === 'bendra') {
        metadataFilter = { UserDocs: 'General' };
      }

      const systemMetadata = {
        uploaded_by: user.email,
        user_id: user.id,
        project_id: projectId,
        upload_date: new Date().toISOString(),
        ...metadataFilter
      };

      const finalMetadata = { ...systemMetadata, ...userMetadata };
      formData.append('metadata', JSON.stringify(finalMetadata));

      console.log('Uploading file:', selectedFile.name, 'to Voiceflow Knowledge Base...');

      const apiKey = import.meta.env.VITE_VOICEFLOW_API_KEY;

      // Build URL with query parameters based on chunking strategy
      const baseUrl = 'https://api.voiceflow.com/v1/knowledge-base/docs/upload';
      const queryParams = new URLSearchParams();

      if (chunkingStrategy === 'standartinis' || chunkingStrategy === 'nestandartinis') {
        // Smart Chunking - enable smart chunking features
        queryParams.append('llmBasedChunks', 'true');
        queryParams.append('llmPrependContext', 'true');
        queryParams.append('markdownConversion', 'true');
      } else if (chunkingStrategy === 'bendra') {
        // FAQ optimization - use smaller chunks for FAQ-style Q&A
        queryParams.append('maxChunkSize', '500');
        queryParams.append('llmGeneratedQ', 'true');
      }

      const uploadUrl = queryParams.toString()
        ? `${baseUrl}?${queryParams.toString()}`
        : baseUrl;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `${response.status} ${response.statusText}`;

        await appLogger.logDocument({
          action: 'upload_failed',
          userId: user.id,
          userEmail: user.email,
          filename: selectedFile.name,
          fileSize: selectedFile.size,
          level: 'error',
          metadata: {
            project_id: projectId,
            error: errorMessage,
            response_data: errorData
          }
        });
        throw new Error(`Upload to Voiceflow failed: ${errorMessage}`);
      }

      const result = await response.json();
      console.log('Voiceflow upload successful:', result);

      // Log upload success
      await appLogger.logDocument({
        action: 'upload_success',
        userId: user.id,
        userEmail: user.email,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        metadata: {
          project_id: projectId,
          voiceflow_result: result,
          document_id: result.data?.documentID || result.documentID
        }
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSelectedFile(null);
      setUploadMetadata('{}');
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
          filename: selectedFile.name,
          file_size: selectedFile.size,
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

  const getDocumentTitle = (document: any): string => {
    const metadata = formatMetadataForDisplay(document.metadata);
    const metadataEntries = Object.entries(metadata);

    // Priority 1: Check for common title fields
    const titleFields = ['title', 'name', 'filename', 'file_name', 'document_name'];
    for (const field of titleFields) {
      if (metadata[field]) {
        return String(metadata[field]);
      }
    }

    // Priority 2: Use the first metadata field if it exists and has a meaningful value
    if (metadataEntries.length > 0) {
      const [key, value] = metadataEntries[0];
      const formattedKey = key.replace(/_/g, ' ').toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Format the value nicely
      let formattedValue = String(value);
      // If value is too long, truncate it
      if (formattedValue.length > 60) {
        formattedValue = formattedValue.substring(0, 60) + '...';
      }

      return `${formattedKey}: ${formattedValue}`;
    }

    // Priority 3: Fall back to Document #ID
    return `Document #${document.id}`;
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
              onChange={handleFileSelection}
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

      {/* Import File Modal (Voiceflow Style) */}
      {showMetadataModal && selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Import file</h3>
                <button
                  onClick={() => {
                    setShowMetadataModal(false);
                    setSelectedFile(null);
                    setChunkingStrategy('');
                    setShowMetadataInput(false);
                    setShowStrategyDropdown(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* File(s) Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File(s)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                  <p className="text-sm text-gray-600 mb-3">
                    <span className="font-mono text-gray-900">{selectedFile.name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Supported file types: pdf, txt, docx - 10mb max.
                </p>
              </div>

              {/* LLM Chunking Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LLM chunking strategy
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-left flex items-center justify-between hover:border-gray-400 transition-colors"
                  >
                    <span className={chunkingStrategy ? 'text-gray-900' : 'text-gray-500'}>
                      {chunkingStrategy === 'standartinis' && 'Standartinis Komercinis'}
                      {chunkingStrategy === 'nestandartinis' && 'Nestandartinis Komercinis'}
                      {chunkingStrategy === 'bendra' && 'Bendra'}
                      {!chunkingStrategy && 'Select strategy (optional)'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showStrategyDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showStrategyDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                      <div className="p-2 space-y-1">
                        {/* Standartinis Komercinis */}
                        <label className="flex items-start p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="standartinis"
                            checked={chunkingStrategy === 'standartinis'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-gray-900">
                              Standartinis Komercinis
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Skirta standartiniams komerciniams dokumentams su aiškia struktūra. Naudoja pažangų AI skaidymą pagal tematiką.
                            </div>
                          </div>
                        </label>

                        {/* Nestandartinis Komercinis */}
                        <label className="flex items-start p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="nestandartinis"
                            checked={chunkingStrategy === 'nestandartinis'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-gray-900">
                              Nestandartinis Komercinis
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Skirtų sudėtingiems dokumentams su įvairiomis temomis. Optimizuotas AI skaidymas su konteksto priedu.
                            </div>
                          </div>
                        </label>

                        {/* Bendra */}
                        <label className="flex items-start p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="bendra"
                            checked={chunkingStrategy === 'bendra'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-gray-900">
                              Bendra (DUK optimizacija)
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Sukuria pavyzdinius klausimus kiekvienai sekcijai. Geriausias pasirinkimas DUK kūrimui.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Metadata
                  </label>
                  <button
                    onClick={() => setShowMetadataInput(!showMetadataInput)}
                    className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    <Plus className={`w-4 h-4 text-gray-600 transition-transform ${showMetadataInput ? 'rotate-45' : ''}`} />
                  </button>
                </div>

                {showMetadataInput && (
                  <div className="space-y-3">
                    <textarea
                      value={uploadMetadata}
                      onChange={(e) => setUploadMetadata(e.target.value)}
                      placeholder='{"category": "product_info", "tags": ["important"]}'
                      className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-xs"
                    />
                    <p className="text-xs text-gray-500">
                      Add custom key-value pairs as JSON. System metadata will be added automatically.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowMetadataModal(false);
                  setSelectedFile(null);
                  setUploadMetadata('{}');
                  setChunkingStrategy('');
                  setShowMetadataInput(false);
                  setShowStrategyDropdown(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={performUpload}
                disabled={uploadingFile}
                className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {uploadingFile ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <span>Import</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 vf-scrollbar">
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
          <div className="space-y-2.5">
            {displayDocuments.map((document) => (
              <div
                key={document.id}
                className="bg-white rounded-lg cursor-pointer transition-all"
                style={{
                  padding: '18px 20px',
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
                    <div className="flex items-start flex-1" style={{ gap: '18px' }}>
                      <div className="flex-shrink-0" style={{ paddingTop: '2px' }}>
                        <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center border border-green-100">
                          <FileText className="w-6 h-6 text-green-600" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold text-gray-900" style={{ fontSize: '16px' }}>
                            {getDocumentTitle(document)}
                          </h3>
                          {vectorSearchMode && document.similarity && (
                            <span className="px-2.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                              {Math.round(document.similarity * 100)}% match
                            </span>
                          )}
                        </div>

                        {/* Single-line preview with ellipsis */}
                        <p
                          className="text-sm mb-2"
                          style={{
                            color: '#777',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                          }}
                        >
                          {document.content}
                        </p>

                        {/* Metadata pill */}
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center rounded font-medium"
                            style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              color: '#4a5568',
                              backgroundColor: '#e2e8f0'
                            }}
                          >
                            {Object.keys(formatMetadataForDisplay(document.metadata)).length} fields
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMetadataExpansion(document.id);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                          >
                            {expandedMetadata.has(document.id) ? (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                <span>Hide details</span>
                              </>
                            ) : (
                              <>
                                <ChevronRight className="w-3 h-3" />
                                <span>View details</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Expanded Metadata Section */}
                        {expandedMetadata.has(document.id) && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-3">
                            {/* Edit Button */}
                            <div className="flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDoc(document);
                                }}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingMetadata(viewingMetadata === document.id ? null : document.id);
                                }}
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

                    <div className="flex items-center space-x-1 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMetadataExpansion(document.id);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View metadata"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDoc(document);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit document"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(document.id);
                        }}
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