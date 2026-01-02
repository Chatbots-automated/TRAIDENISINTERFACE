import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, X, Search, Filter, Trash2, AlertCircle, Check, Globe, ChevronDown, RefreshCw } from 'lucide-react';
import {
  fetchVoiceflowDocuments,
  deleteVoiceflowDocument,
  uploadVoiceflowDocument,
  getDocumentTitle,
  getDaysAgo,
  VoiceflowDocument
} from '../lib/voiceflowKB';
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
      // API now fetches only pdf, text, docx documents (excludes URLs)
      const docs = await fetchVoiceflowDocuments();
      setDocuments(docs || []);
      console.log(`[Documents] Loaded ${docs?.length || 0} user documents (pdf, text, docx)`);
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

      // Merge system metadata with user-provided metadata
      let userMetadata = {};
      try {
        userMetadata = JSON.parse(uploadMetadata);
      } catch (e) {
        console.warn('Invalid user metadata, using empty object');
      }

      // ALWAYS set KB:UserDocs metadata based on chunking strategy
      // This ensures all uploaded documents are tagged and can be filtered in the UserDocs folder
      let docsValue = 'Default'; // Default value if no strategy selected
      if (chunkingStrategy === 'standartinis') {
        docsValue = 'Standartinis';
      } else if (chunkingStrategy === 'nestandartinis') {
        docsValue = 'Nestandartinis';
      } else if (chunkingStrategy === 'bendra') {
        docsValue = 'General';
      }

      const metadataFilter: Record<string, string> = { 'KB:UserDocs': docsValue };

      const finalMetadata = {
        uploaded_by: user.email,
        user_id: user.id,
        project_id: projectId,
        upload_date: new Date().toISOString(),
        ...metadataFilter,
        ...userMetadata
      };

      console.log('Uploading file:', selectedFile.name, 'to Voiceflow Knowledge Base...');

      // Use the centralized upload service with proper options
      const result = await uploadVoiceflowDocument({
        file: selectedFile,
        metadata: finalMetadata,
        // Chunking strategy options based on document type
        llmBasedChunks: chunkingStrategy === 'standartinis' || chunkingStrategy === 'nestandartinis',
        llmPrependContext: chunkingStrategy === 'standartinis' || chunkingStrategy === 'nestandartinis',
        markdownConversion: chunkingStrategy === 'standartinis' || chunkingStrategy === 'nestandartinis',
        maxChunkSize: chunkingStrategy === 'bendra' ? 500 : undefined,
        llmGeneratedQ: chunkingStrategy === 'bendra',
      });

      if (!result.success) {
        await appLogger.logDocument({
          action: 'upload_failed',
          userId: user.id,
          userEmail: user.email,
          filename: selectedFile.name,
          fileSize: selectedFile.size,
          level: 'error',
          metadata: {
            project_id: projectId,
            error: result.error,
            response_data: result.data
          }
        });
        throw new Error(`Upload to Voiceflow failed: ${result.error}`);
      }

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
          voiceflow_result: result.data,
          document_id: result.documentID
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

  const toggleTitleExpansion = (docId: string) => {
    const newExpanded = new Set(expandedTitles);
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId);
    } else {
      newExpanded.add(docId);
    }
    setExpandedTitles(newExpanded);
  };

  const getDisplayDocuments = () => {
    // Filter documents by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return documents.filter(doc => {
        const title = getDocumentTitle(doc).toLowerCase();
        const type = doc.data?.type?.toLowerCase() || '';
        const tags = doc.tags?.join(' ').toLowerCase() || '';
        const status = doc.status?.type?.toLowerCase() || '';
        return title.includes(query) || type.includes(query) || tags.includes(query) || status.includes(query);
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
    <div className="h-full flex flex-col bg-macos-gray-50">
      {/* Header */}
      <div className="p-6 border-b border-black/5 bg-white/80 backdrop-blur-macos">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-macos-gray-900 tracking-macos-tight">Documents</h2>
            <p className="text-sm text-macos-gray-500 mt-1">Create, edit, and organize your documents</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={openUploadModal}
              disabled={uploadingFile}
              className="macos-btn macos-btn-primary px-6 py-2.5 rounded-macos-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {uploadingFile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
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
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-macos-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search documents by name or metadata..."
              className="macos-input w-full pl-11 pr-4 py-2.5 text-sm rounded-macos-lg"
            />
          </div>

          <button className="p-2.5 bg-macos-gray-100 rounded-macos-lg hover:bg-macos-gray-200 transition-colors border-[0.5px] border-black/5">
            <Filter className="w-5 h-5 text-macos-gray-600" />
          </button>
        </div>
      </div>


      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-green bg-macos-green/10 p-3 rounded-macos border-[0.5px] border-macos-green/20">
          <Check className="w-5 h-5" />
          <span className="text-sm">Operation completed successfully!</span>
        </div>
      )}

      {/* Import File Modal (macOS Style) */}
      {showMetadataModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-20">
          <div
            className="macos-animate-spring bg-white/95 backdrop-blur-macos rounded-macos-xl shadow-macos-window max-w-md w-full min-h-[550px] flex flex-col border-[0.5px] border-black/10"
            role="dialog"
            aria-labelledby="import-modal-title"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-black/5 bg-macos-gray-50/50 rounded-t-macos-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="macos-window-controls p-0">
                    <button
                      onClick={() => {
                        setShowMetadataModal(false);
                        setSelectedFile(null);
                        setChunkingStrategy('');
                        setShowStrategyDropdown(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="w-6 h-6 rounded-full bg-macos-gray-100 hover:bg-macos-gray-200 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-macos-gray-500" />
                    </button>
                  </div>
                </div>
                <h2 id="import-modal-title" className="text-base font-semibold text-macos-gray-900 absolute left-1/2 transform -translate-x-1/2">
                  Import file
                </h2>
                <div className="w-16" />
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* File(s) Section */}
              <div>
                <label htmlFor="file-upload-input" className="block text-sm font-medium text-macos-gray-700 mb-2">
                  File(s)
                </label>
                {selectedFile ? (
                  <div className="border-[0.5px] border-dashed border-macos-gray-300 rounded-macos-lg p-6 text-center bg-macos-gray-50">
                    <p className="text-sm text-macos-gray-600 mb-3">
                      <span className="font-mono text-macos-gray-900">{selectedFile.name}</span>
                    </p>
                    <p className="text-xs text-macos-gray-500">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={handleDragOver}
                    className="border-[0.5px] border-dashed border-macos-gray-300 rounded-macos-lg p-8 text-center bg-macos-gray-50 transition-colors cursor-pointer hover:border-macos-blue hover:bg-macos-blue/5"
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
                    <p className="text-sm text-macos-gray-600 mb-3">
                      Drop file(s) here or
                    </p>
                    <button
                      type="button"
                      className="macos-btn macos-btn-secondary px-6 py-2.5 rounded-macos-lg font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFileUpload();
                      }}
                    >
                      Browse
                    </button>
                  </div>
                )}
                <p id="file-type-info" className="text-xs text-macos-gray-500 mt-2">
                  Supported file types: pdf, txt, docx - 10mb max.
                </p>
              </div>

              {/* Dokumento Tipas - REQUIRED */}
              <div>
                <label htmlFor="chunking-strategy-select" className="block text-sm font-medium text-macos-gray-700 mb-2">
                  Dokumento Tipas <span className="text-macos-red">*</span>
                </label>
                <div className="relative">
                  <button
                    id="chunking-strategy-select"
                    type="button"
                    onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                    className={`w-full px-3 py-2.5 border-[0.5px] rounded-macos-lg bg-white text-sm text-left flex items-center justify-between hover:border-macos-gray-400 transition-colors ${
                      !chunkingStrategy ? 'border-macos-gray-200' : 'border-macos-blue'
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={showStrategyDropdown}
                  >
                    <span className={chunkingStrategy ? 'text-macos-gray-900' : 'text-macos-gray-500'}>
                      {chunkingStrategy === 'standartinis' && 'Standartinis Komercinis'}
                      {chunkingStrategy === 'nestandartinis' && 'Nestandartinis Komercinis'}
                      {chunkingStrategy === 'bendra' && 'Bendra'}
                      {!chunkingStrategy && 'Pasirinkite dokumento tipą...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-macos-gray-400 transition-transform duration-200 ${showStrategyDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showStrategyDropdown && (
                    <div
                      className="absolute z-10 w-full mt-2 bg-white/95 backdrop-blur-macos border-[0.5px] border-black/10 rounded-macos-lg shadow-macos-lg max-h-96 overflow-y-auto macos-animate-slide-down"
                      role="listbox"
                    >
                      <div className="p-2 space-y-1">
                        {/* Standartinis Komercinis */}
                        <label className="flex items-start p-3 hover:bg-macos-blue/10 rounded-macos cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="standartinis"
                            checked={chunkingStrategy === 'standartinis'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-macos-blue border-macos-gray-300 focus:ring-macos-blue"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-macos-gray-900">
                              Standartinis Komercinis
                            </div>
                            <div className="text-xs text-macos-gray-500 mt-0.5">
                              Skirta standartiniams komerciniams dokumentams su aiškia struktūra. Naudoja pažangų AI skaidymą pagal tematiką.
                            </div>
                          </div>
                        </label>

                        {/* Nestandartinis Komercinis */}
                        <label className="flex items-start p-3 hover:bg-macos-blue/10 rounded-macos cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="nestandartinis"
                            checked={chunkingStrategy === 'nestandartinis'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-macos-blue border-macos-gray-300 focus:ring-macos-blue"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-macos-gray-900">
                              Nestandartinis Komercinis
                            </div>
                            <div className="text-xs text-macos-gray-500 mt-0.5">
                              Skirtų sudėtingiems dokumentams su įvairiomis temomis. Optimizuotas AI skaidymas su konteksto priedu.
                            </div>
                          </div>
                        </label>

                        {/* Bendra */}
                        <label className="flex items-start p-3 hover:bg-macos-blue/10 rounded-macos cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="chunking-strategy"
                            value="bendra"
                            checked={chunkingStrategy === 'bendra'}
                            onChange={(e) => {
                              setChunkingStrategy(e.target.value);
                              setShowStrategyDropdown(false);
                            }}
                            className="mt-0.5 w-4 h-4 text-macos-blue border-macos-gray-300 focus:ring-macos-blue"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-semibold text-macos-gray-900">
                              Bendra (DUK optimizacija)
                            </div>
                            <div className="text-xs text-macos-gray-500 mt-0.5">
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
            <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-3">
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
                className="macos-btn macos-btn-secondary px-6 py-2.5 rounded-macos-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performUpload}
                disabled={uploadingFile || !selectedFile || !chunkingStrategy}
                className="macos-btn macos-btn-primary px-6 py-2.5 rounded-macos-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title={!chunkingStrategy ? 'Pasirinkite dokumento tipą' : !selectedFile ? 'Pasirinkite failą' : 'Importuoti dokumentą'}
              >
                {uploadingFile ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-macos-gray-100 rounded-macos-lg animate-pulse" />
            ))}
          </div>
        ) : displayDocuments.length === 0 ? (
          <div className="text-center py-16 macos-animate-fade">
            <FileText className="w-16 h-16 text-macos-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-macos-gray-900 mb-2 tracking-macos-tight">
              {searchQuery ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="text-macos-gray-500 mb-8 text-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Upload your first document to get started'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={openUploadModal}
                className="macos-btn macos-btn-primary px-8 py-3 rounded-macos-lg font-medium"
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
                className="bg-white rounded-macos-lg cursor-pointer transition-all duration-150 border-[0.5px] border-black/5 hover:border-black/10 hover:shadow-macos"
                style={{
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
                  overflow: 'hidden'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center flex-1" style={{ gap: '14px' }}>
                    {/* Icon and Status Badge */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-macos flex items-center justify-center bg-macos-blue/10 border-[0.5px] border-macos-blue/20">
                        {document.data?.type === 'url' ? (
                          <Globe className="w-5 h-5 text-macos-blue" />
                        ) : (
                          <FileText className="w-5 h-5 text-macos-blue" />
                        )}
                      </div>
                      {/* Status Badge */}
                      {document.status?.type && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase ${
                            document.status.type === 'SUCCESS' ? 'bg-macos-green/15 text-macos-green' :
                            document.status.type === 'PENDING' ? 'bg-macos-orange/15 text-macos-orange' :
                            document.status.type === 'ERROR' ? 'bg-macos-red/15 text-macos-red' : 'bg-macos-gray-100 text-macos-gray-600'
                          }`}
                        >
                          {document.status.type}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Clickable Title */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTitleExpansion(document.documentID);
                          }}
                          className="text-sm font-semibold text-macos-gray-900 cursor-pointer transition-all hover:text-macos-blue"
                          style={{
                            ...(expandedTitles.has(document.documentID) ? {} : {
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '500px'
                            })
                          }}
                        >
                          {getDocumentTitle(document)}
                        </h3>
                      </div>

                      {/* Data Type, UserDocs Type, and Tags */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {document.data?.type && (
                          <span className="text-xs text-macos-gray-500 font-medium">
                            {document.data.type.toUpperCase()}
                          </span>
                        )}
                        {/* Show KB:UserDocs type (document category) */}
                        {document.integrationMetadata?.['KB:UserDocs'] && (
                          <>
                            <span className="text-macos-gray-300">•</span>
                            <span
                              className={`inline-flex items-center rounded-md font-medium text-[11px] px-2 py-0.5 ${
                                document.integrationMetadata['KB:UserDocs'] === 'Standartinis' ? 'bg-macos-blue/10 text-macos-blue' :
                                document.integrationMetadata['KB:UserDocs'] === 'Nestandartinis' ? 'bg-macos-orange/10 text-macos-orange' :
                                document.integrationMetadata['KB:UserDocs'] === 'General' ? 'bg-macos-green/10 text-macos-green' : 'bg-macos-gray-100 text-macos-gray-600'
                              }`}
                            >
                              {document.integrationMetadata['KB:UserDocs']}
                            </span>
                          </>
                        )}
                        {document.tags && document.tags.length > 0 && (
                          <>
                            <span className="text-macos-gray-300">•</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {document.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-md font-medium text-[11px] px-2 py-0.5 bg-macos-gray-100 text-macos-gray-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Date - Days Ago */}
                      <div className="text-xs text-macos-gray-500">
                        {document.createdAt && getDaysAgo(document.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center ml-4 gap-1">
                    {/* Retry button for failed documents */}
                    {document.status?.type === 'ERROR' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setError('Šis dokumentas nepavyko apdoroti. Prašome ištrinti ir įkelti iš naujo.');
                        }}
                        className="p-2.5 text-macos-orange hover:bg-macos-orange/10 rounded-macos transition-colors"
                        title="Pakartoti apdorojimą (Retry)"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDocument(document.documentID);
                      }}
                      className="p-2.5 text-macos-red hover:bg-macos-red/10 rounded-macos transition-colors"
                      title="Ištrinti dokumentą"
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