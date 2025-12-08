import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, X, Search, Filter, Trash2, AlertCircle, Check } from 'lucide-react';
import { fetchVoiceflowDocuments, deleteVoiceflowDocument, getDocumentTitle, getDaysAgo, VoiceflowDocument } from '../lib/voiceflowKB';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';

interface DocumentsInterfaceProps {
  user: AppUser;
  projectId: string;
}

export default function DocumentsInterface({ user, projectId }: DocumentsInterfaceProps) {
  const [documents, setDocuments] = useState<VoiceflowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState('{}');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [chunkingStrategy, setChunkingStrategy] = useState('');
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await fetchVoiceflowDocuments();
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadMetadata('{}');
    setChunkingStrategy('');
    setShowStrategyDropdown(false);
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type
    const acceptedTypes = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedTypes.includes(fileExtension)) {
      setError('Unsupported file type. Please upload PDF, DOC, DOCX, TXT, or MD files.');
      return;
    }

    setSelectedFile(file);
    setUploadMetadata('{}');
    setChunkingStrategy('');
    setShowStrategyDropdown(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const openUploadModal = () => {
    setSelectedFile(null);
    setUploadMetadata('{}');
    setChunkingStrategy('');
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

  const handleDeleteDocument = async (documentID: string) => {
    if (!confirm('Are you sure you want to delete this document from Voiceflow Knowledge Base?')) return;

    try {
      const doc = documents.find(d => d.documentID === documentID);
      await deleteVoiceflowDocument(documentID);

      await appLogger.logDocument({
        action: 'delete',
        userId: user.id,
        userEmail: user.email,
        documentId: documentID,
        filename: getDocumentTitle(doc || { documentID }),
        metadata: { document_metadata: doc?.integrationMetadata }
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadDocuments();
    } catch (error: any) {
      setError(error.message);
      await appLogger.logError({
        action: 'document_delete_error',
        error: error.message,
        userId: user.id,
        userEmail: user.email,
        metadata: { document_id: documentID }
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

  const renderMetadataValue = (value: any): string => {
    if (typeof value === 'string') {
      // Handle newlines in strings
      return value.replace(/\\n/g, '\n');
    }
    return String(value);
  };

  const getDisplayDocuments = () => {
    // Filter documents by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return documents.filter(doc => {
        const title = getDocumentTitle(doc).toLowerCase();
        const metadata = JSON.stringify(formatDocumentMetadata(doc)).toLowerCase();
        return title.includes(query) || metadata.includes(query);
      });
    }
    // No search, show all documents
    return documents;
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
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
              onClick={openUploadModal}
              disabled={uploadingFile}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {uploadingFile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload Document</span>
                </>
              )}
            </button>

            {/* Hidden file input */}
            <input
              id="file-upload-input"
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelection}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md"
              aria-describedby="file-type-info"
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
              placeholder="Search documents by name or metadata..."
              className="vf-input w-full pl-11 pr-4 py-3 text-sm"
            />
          </div>

          <button className="px-4 py-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
            <Filter className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>


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
      {showMetadataModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center p-4 pt-20">
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full min-h-[550px] flex flex-col"
            role="dialog"
            aria-labelledby="import-modal-title"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 id="import-modal-title" className="text-base font-semibold text-gray-900">
                  Import file
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowMetadataModal(false);
                    setSelectedFile(null);
                    setChunkingStrategy('');
                    setShowStrategyDropdown(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* File(s) Section */}
              <div>
                <label htmlFor="file-upload-input" className="block text-sm font-medium text-gray-700 mb-2">
                  File(s)
                </label>
                {selectedFile ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-white">
                    <p className="text-sm text-gray-600 mb-3">
                      <span className="font-mono text-gray-900">{selectedFile.name}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-white transition-colors cursor-pointer"
                    onClick={triggerFileUpload}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerFileUpload();
                      }
                    }}
                    aria-describedby="file-type-info"
                  >
                    <p className="text-sm text-gray-600 mb-3">
                      Drop file(s) here or
                    </p>
                    <button
                      type="button"
                      className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFileUpload();
                      }}
                    >
                      Browse
                    </button>
                  </div>
                )}
                <p id="file-type-info" className="text-xs text-gray-500 mt-2">
                  Supported file types: pdf, txt, docx - 10mb max.
                </p>
              </div>

              {/* Dokumento Tipas */}
              <div>
                <label htmlFor="chunking-strategy-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Dokumento Tipas
                </label>
                <div className="relative">
                  <button
                    id="chunking-strategy-select"
                    type="button"
                    onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-left flex items-center justify-between hover:border-gray-400 transition-colors"
                    aria-haspopup="listbox"
                    aria-expanded={showStrategyDropdown}
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
                    <div
                      className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
                      role="listbox"
                    >
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

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowMetadataModal(false);
                  setSelectedFile(null);
                  setUploadMetadata('{}');
                  setChunkingStrategy('');
                  setShowStrategyDropdown(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performUpload}
                disabled={uploadingFile || !selectedFile}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
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
              {searchQuery ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="text-vf-secondary mb-8 text-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Upload your first document to get started'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={openUploadModal}
                className="px-8 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
              >
                Upload Document
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayDocuments.map((document) => (
              <div
                key={document.documentID}
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
                        </div>

                        {/* Document ID or URL preview */}
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
                          {document.data?.url || `ID: ${document.documentID.substring(0, 20)}...`}
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
                            {Object.keys(formatDocumentMetadata(document)).length} fields
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMetadataExpansion(document.documentID);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                          >
                            {expandedMetadata.has(document.documentID) ? (
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
                        {expandedMetadata.has(document.documentID) && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-3">
                            {/* Metadata Display */}
                            {Object.keys(formatDocumentMetadata(document)).length === 0 ? (
                              <p className="text-sm text-gray-500 italic">No metadata</p>
                            ) : (
                              <div className="space-y-2">
                                {Object.entries(formatDocumentMetadata(document)).map(([key, value]) => (
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
                                  setViewingMetadata(viewingMetadata === document.documentID ? null : document.documentID);
                                }}
                                className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                              >
                                <Code className="w-3 h-3" />
                                <span>{viewingMetadata === document.documentID ? 'Hide' : 'Show'} Raw JSON</span>
                              </button>

                              {viewingMetadata === document.documentID && (
                                <div className="mt-2 p-2 bg-gray-900 rounded text-xs">
                                  <pre className="text-green-400 overflow-x-auto">
                                    {JSON.stringify(formatDocumentMetadata(document), null, 2)}
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
                          toggleMetadataExpansion(document.documentID);
                        }}
                        className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                        title="View metadata"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(document.documentID);
                        }}
                        className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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