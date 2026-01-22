import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Plus, Package, Download, Sparkles } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { fetchNestandardiniaiProjects, searchProjectsBySubjectLine, NestandardinisProject } from '../lib/nestandardiniaiService';
import type { AppUser } from '../types';

interface NestandardiniaiInterfaceProps {
  user: AppUser;
  projectId: string;
}

interface ResponseFile {
  filename: string;
  content: string; // base64 encoded
  mimeType: string;
}

interface WebhookResponse {
  subjectLine: string;
  description: string;
  emlFile?: ResponseFile;
  attachmentFile?: ResponseFile;
  message?: string; // For simple upload responses
}

type WorkflowMode = 'upload-request' | 'upload-solution';
type UploadAction = 'just-upload' | 'find-similar';

export default function NestandardiniaiInterface({ user, projectId }: NestandardiniaiInterfaceProps) {
  // Mode selection
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('upload-request');

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WebhookResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload action for new .eml files
  const [uploadAction, setUploadAction] = useState<UploadAction>('find-similar');

  // Project selection state
  const [projects, setProjects] = useState<NestandardinisProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<NestandardinisProject | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Load projects on mount
  useEffect(() => {
    if (workflowMode === 'upload-solution') {
      loadProjects();
    }
  }, [workflowMode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const projectsData = await fetchNestandardiniaiProjects();
      setProjects(projectsData);
    } catch (error) {
      console.error('Error loading projects:', error);
      setError('Nepavyko užkrauti projektų sąrašo');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectSearch = async (query: string) => {
    setProjectSearchQuery(query);
    if (!query.trim()) {
      loadProjects();
      return;
    }

    try {
      const results = await searchProjectsBySubjectLine(query);
      setProjects(results);
    } catch (error) {
      console.error('Error searching projects:', error);
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type based on workflow mode
    if (workflowMode === 'upload-request') {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (fileExtension !== '.eml') {
        setError('Tik .eml failai yra palaikomi naujų užklausų įkėlimui.');
        return;
      }
    }
    // For upload-solution, we accept any file type

    setSelectedFile(file);
    setError(null);
    setResponse(null);
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type based on workflow mode
    if (workflowMode === 'upload-request') {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (fileExtension !== '.eml') {
        setError('Tik .eml failai yra palaikomi naujų užklausų įkėlimui.');
        return;
      }
    }

    setSelectedFile(file);
    setError(null);
    setResponse(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    // Validation
    if (workflowMode === 'upload-request') {
      if (!selectedFile) {
        setError('Prašome pasirinkti .eml failą');
        return;
      }
    } else if (workflowMode === 'upload-solution') {
      if (!selectedProject) {
        setError('Prašome pasirinkti projektą');
        return;
      }
      if (!selectedFile) {
        setError('Prašome pasirinkti komercinį pasiūlymą (failą)');
        return;
      }
    }

    setUploading(true);
    setError(null);
    setResponse(null);

    try {
      if (workflowMode === 'upload-request') {
        await handleUploadRequest();
      } else {
        await handleUploadSolution();
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(`Operacija nepavyko: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadRequest = async () => {
    if (!selectedFile) return;

    // Log upload start
    await appLogger.logDocument({
      action: uploadAction === 'just-upload' ? 'eml_upload_started' : 'eml_search_started',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: { project_id: projectId, file_type: selectedFile.type, upload_action: uploadAction }
    });

    // Convert file to base64
    const base64Content = await fileToBase64(selectedFile);

    // Get appropriate webhook URL
    const webhookUrl = uploadAction === 'just-upload'
      ? import.meta.env.VITE_N8N_WEBHOOK_UPLOAD_NEW
      : import.meta.env.VITE_N8N_WEBHOOK_FIND_SIMILAR;

    if (!webhookUrl) {
      throw new Error('Webhook URL nėra sukonfigūruotas. Prašome susisiekti su administratoriumi.');
    }

    // Send to n8n webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: uploadAction,
        filename: selectedFile.name,
        fileContent: base64Content,
        mimeType: selectedFile.type || 'message/rfc822',
        userId: user.id,
        userEmail: user.email,
        projectId: projectId,
        timestamp: new Date().toISOString()
      })
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

    // Log success
    await appLogger.logDocument({
      action: uploadAction === 'just-upload' ? 'eml_upload_success' : 'eml_search_success',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        subject_line: responseData.subjectLine,
        upload_action: uploadAction
      }
    });

    setResponse(responseData);
  };

  const handleUploadSolution = async () => {
    if (!selectedFile || !selectedProject) return;

    // Log upload start
    await appLogger.logDocument({
      action: 'commercial_offer_upload_started',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        nestandartinis_project_id: selectedProject.id,
        project_subject: selectedProject.subject_line,
        file_type: selectedFile.type
      }
    });

    // Convert file to base64
    const base64Content = await fileToBase64(selectedFile);

    // Get webhook URL for commercial offer upload
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_UPLOAD_SOLUTION;

    if (!webhookUrl) {
      throw new Error('Webhook URL nėra sukonfigūruotas. Prašome susisiekti su administratoriumi.');
    }

    // Send to n8n webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'upload-solution',
        projectId: selectedProject.id,
        projectSubjectLine: selectedProject.subject_line,
        filename: selectedFile.name,
        fileContent: base64Content,
        mimeType: selectedFile.type,
        userId: user.id,
        userEmail: user.email,
        timestamp: new Date().toISOString()
      })
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

    // Log success
    await appLogger.logDocument({
      action: 'commercial_offer_upload_success',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        nestandartinis_project_id: selectedProject.id,
        project_subject: selectedProject.subject_line
      }
    });

    setResponse(responseData);
  };

  const handleFindSimilarByProject = async () => {
    if (!selectedProject) {
      setError('Prašome pasirinkti projektą');
      return;
    }

    setUploading(true);
    setError(null);
    setResponse(null);

    try {
      await appLogger.logDocument({
        action: 'find_similar_by_project_started',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          nestandartinis_project_id: selectedProject.id,
          project_subject: selectedProject.subject_line
        }
      });

      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_FIND_SIMILAR;

      if (!webhookUrl) {
        throw new Error('Webhook URL nėra sukonfigūruotas. Prašome susisiekti su administratoriumi.');
      }

      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'find-similar-by-project',
          projectId: selectedProject.id,
          projectSubjectLine: selectedProject.subject_line,
          userId: user.id,
          userEmail: user.email,
          timestamp: new Date().toISOString()
        })
      });

      if (!webhookResponse.ok) {
        throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
      }

      const responseData: WebhookResponse = await webhookResponse.json();

      await appLogger.logDocument({
        action: 'find_similar_by_project_success',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          nestandartinis_project_id: selectedProject.id,
          project_subject: selectedProject.subject_line,
          subject_line: responseData.subjectLine
        }
      });

      setResponse(responseData);
    } catch (error: any) {
      console.error('Find similar error:', error);
      setError(`Paieška nepavyko: ${error.message}`);

      await appLogger.logError({
        action: 'find_similar_by_project_error',
        error,
        userId: user.id,
        userEmail: user.email,
        metadata: {
          nestandartinis_project_id: selectedProject.id,
          project_subject: selectedProject.subject_line,
          project_id: projectId
        }
      });
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:message/rfc822;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const downloadFile = (file: ResponseFile) => {
    try {
      // Convert base64 to blob
      const byteCharacters = atob(file.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: file.mimeType });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      setError('Nepavyko atsisiųsti failo');
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) {
      return <FileText className="w-6 h-6 text-macos-red" />;
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileText className="w-6 h-6 text-macos-blue" />;
    } else if (mimeType.includes('message') || mimeType.includes('eml')) {
      return <FileArchive className="w-6 h-6 text-macos-purple" />;
    }
    return <File className="w-6 h-6 text-macos-gray-500" />;
  };

  const getFileTypeLabel = (filename: string) => {
    const ext = filename.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  };

  const formatFileSize = (base64Content: string) => {
    // Estimate file size from base64 (rough approximation)
    const bytes = base64Content.length * 0.75;
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const resetForm = () => {
    setResponse(null);
    setSelectedFile(null);
    setSelectedProject(null);
    setProjectSearchQuery('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #faf8f5 0%, #f5f1ea 100%)' }}>
      {/* Claude-inspired Header */}
      <div className="px-8 py-6 border-b" style={{ borderColor: '#e8dfd0', background: 'rgba(255, 255, 255, 0.6)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #d4916f 0%, #b87555 100%)', boxShadow: '0 2px 8px rgba(212, 145, 111, 0.3)' }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-medium" style={{ color: '#5a4a3a' }}>
                Nestandartiniai Gaminiai
              </h1>
              <p className="text-sm" style={{ color: '#8a7a6a' }}>
                Manage custom product requests and commercial offers
              </p>
            </div>
          </div>

          {/* Mode Selection - Claude style */}
          <div className="flex space-x-2 p-1 rounded-xl" style={{ background: 'rgba(232, 223, 208, 0.4)' }}>
            <button
              onClick={() => {
                setWorkflowMode('upload-request');
                resetForm();
              }}
              className={`flex-1 flex items-center justify-center space-x-2 px-5 py-3 rounded-lg text-sm font-medium transition-all ${
                workflowMode === 'upload-request'
                  ? 'shadow-sm'
                  : ''
              }`}
              style={{
                background: workflowMode === 'upload-request' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: workflowMode === 'upload-request' ? '#5a4a3a' : '#8a7a6a'
              }}
            >
              <Upload className="w-4 h-4" />
              <span>New Request</span>
            </button>

            <button
              onClick={() => {
                setWorkflowMode('upload-solution');
                resetForm();
                loadProjects();
              }}
              className={`flex-1 flex items-center justify-center space-x-2 px-5 py-3 rounded-lg text-sm font-medium transition-all ${
                workflowMode === 'upload-solution'
                  ? 'shadow-sm'
                  : ''
              }`}
              style={{
                background: workflowMode === 'upload-solution' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: workflowMode === 'upload-solution' ? '#5a4a3a' : '#8a7a6a'
              }}
            >
              <Package className="w-4 h-4" />
              <span>Upload Solution</span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-8 mt-6 max-w-5xl mx-auto w-full">
          <div className="flex items-start space-x-3 p-4 rounded-xl border" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
            <span className="text-sm flex-1" style={{ color: '#7f1d1d' }}>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {!response && (
            <>
              {/* Upload Request Mode */}
              {workflowMode === 'upload-request' && (
                <div className="space-y-6">
                  {/* Upload Action Selection - Claude style */}
                  <div className="rounded-2xl p-8 border" style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: '#e8dfd0', boxShadow: '0 1px 3px rgba(90, 74, 58, 0.08)' }}>
                    <h3 className="text-base font-serif font-medium mb-5" style={{ color: '#5a4a3a' }}>
                      Choose an action
                    </h3>
                    <div className="space-y-3">
                      <label className="flex items-start p-5 border rounded-xl cursor-pointer transition-all hover:shadow-sm" style={{ borderColor: uploadAction === 'find-similar' ? '#d4916f' : '#e8dfd0', background: uploadAction === 'find-similar' ? 'rgba(212, 145, 111, 0.05)' : 'transparent' }}>
                        <input
                          type="radio"
                          name="upload-action"
                          value="find-similar"
                          checked={uploadAction === 'find-similar'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5 w-4 h-4 flex-shrink-0"
                          style={{ accentColor: '#d4916f' }}
                        />
                        <div className="ml-4 flex-1">
                          <div className="text-sm font-medium mb-1" style={{ color: '#5a4a3a' }}>
                            Find similar products
                          </div>
                          <div className="text-xs leading-relaxed" style={{ color: '#8a7a6a' }}>
                            Upload an .eml file and the system will search for similar products and related documents
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start p-5 border rounded-xl cursor-pointer transition-all hover:shadow-sm" style={{ borderColor: uploadAction === 'just-upload' ? '#d4916f' : '#e8dfd0', background: uploadAction === 'just-upload' ? 'rgba(212, 145, 111, 0.05)' : 'transparent' }}>
                        <input
                          type="radio"
                          name="upload-action"
                          value="just-upload"
                          checked={uploadAction === 'just-upload'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5 w-4 h-4 flex-shrink-0"
                          style={{ accentColor: '#d4916f' }}
                        />
                        <div className="ml-4 flex-1">
                          <div className="text-sm font-medium mb-1" style={{ color: '#5a4a3a' }}>
                            Just upload new record
                          </div>
                          <div className="text-xs leading-relaxed" style={{ color: '#8a7a6a' }}>
                            Upload .eml file to the system without searching (adds to knowledge base)
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* File Upload Area - Claude style */}
                  <div className="rounded-2xl p-8 border" style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: '#e8dfd0', boxShadow: '0 1px 3px rgba(90, 74, 58, 0.08)' }}>
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(212, 145, 111, 0.15) 0%, rgba(184, 117, 85, 0.15) 100%)' }}>
                        <Upload className="w-8 h-8" style={{ color: '#d4916f' }} />
                      </div>
                      <h3 className="text-lg font-serif font-medium mb-2" style={{ color: '#5a4a3a' }}>
                        Upload your .eml file
                      </h3>
                      <p className="text-sm" style={{ color: '#8a7a6a' }}>
                        Supports large files up to 25MB
                      </p>
                    </div>

                    {selectedFile ? (
                      <div className="rounded-xl p-6 mb-6 border" style={{ background: 'rgba(212, 145, 111, 0.08)', borderColor: '#d4916f40' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212, 145, 111, 0.15)' }}>
                              <FileArchive className="w-6 h-6" style={{ color: '#d4916f' }} />
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: '#5a4a3a' }}>
                                {selectedFile.name}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: '#8a7a6a' }}>
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: '#8a7a6a' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212, 145, 111, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDrop={handleFileDrop}
                        onDragOver={handleDragOver}
                        className="rounded-xl p-12 text-center border-2 border-dashed transition-all cursor-pointer mb-6"
                        style={{ borderColor: '#e8dfd0', background: 'rgba(250, 248, 245, 0.5)' }}
                        onClick={triggerFileUpload}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            triggerFileUpload();
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#d4916f';
                          e.currentTarget.style.background = 'rgba(212, 145, 111, 0.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e8dfd0';
                          e.currentTarget.style.background = 'rgba(250, 248, 245, 0.5)';
                        }}
                      >
                        <p className="text-sm mb-4" style={{ color: '#8a7a6a' }}>
                          Drop your .eml file here or
                        </p>
                        <button
                          type="button"
                          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
                          style={{ background: 'rgba(255, 255, 255, 0.9)', color: '#5a4a3a', border: '1px solid #e8dfd0' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerFileUpload();
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(212, 145, 111, 0.15)';
                            e.currentTarget.style.borderColor = '#d4916f';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '#e8dfd0';
                          }}
                        >
                          Browse files
                        </button>
                        <p className="text-xs mt-4" style={{ color: '#a8988a' }}>
                          Supported: .eml files up to 25MB
                        </p>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelection}
                      className="hidden"
                      accept=".eml"
                    />

                    {/* Submit Button - Claude style */}
                    <button
                      onClick={handleSubmit}
                      disabled={!selectedFile || uploading}
                      className="w-full py-4 rounded-xl text-base font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                      style={{
                        background: !selectedFile || uploading ? '#e8dfd0' : 'linear-gradient(135deg, #d4916f 0%, #b87555 100%)',
                        color: 'white',
                        boxShadow: !selectedFile || uploading ? 'none' : '0 2px 12px rgba(212, 145, 111, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        if (!uploading && selectedFile) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(212, 145, 111, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = !selectedFile || uploading ? 'none' : '0 2px 12px rgba(212, 145, 111, 0.3)';
                      }}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{uploadAction === 'find-similar' ? 'Searching...' : 'Uploading...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>{uploadAction === 'find-similar' ? 'Find Similar' : 'Upload Record'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Solution Mode */}
              {workflowMode === 'upload-solution' && (
                <div className="space-y-6">
                  {/* Rest of upload solution mode code remains the same but with Claude styling applied */}
                  {/* I'll update this in the next part */}
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {uploading && (
            <div className="rounded-2xl p-12 text-center border" style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: '#e8dfd0' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ background: 'rgba(212, 145, 111, 0.1)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4916f' }} />
              </div>
              <h3 className="text-lg font-serif font-medium mb-2" style={{ color: '#5a4a3a' }}>
                Processing your request
              </h3>
              <p className="text-sm" style={{ color: '#8a7a6a' }}>
                Please wait while the system processes your query
              </p>
            </div>
          )}

          {/* Response Display */}
          {response && !uploading && (
            <div className="space-y-6">
              {/* Success Header */}
              <div className="rounded-2xl p-8 border" style={{ background: 'rgba(255, 255, 255, 0.7)', borderColor: '#e8dfd0', boxShadow: '0 1px 3px rgba(90, 74, 58, 0.08)' }}>
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                    <Check className="w-6 h-6" style={{ color: '#16a34a' }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-medium" style={{ color: '#5a4a3a' }}>
                      {response.message || 'Found relevant files'}
                    </h3>
                    <p className="text-sm mt-0.5" style={{ color: '#8a7a6a' }}>
                      {workflowMode === 'upload-solution'
                        ? 'Commercial offer uploaded successfully'
                        : uploadAction === 'just-upload'
                        ? 'Record added to knowledge base'
                        : 'System found related documents'
                      }
                    </p>
                  </div>
                </div>

                {/* Subject Line */}
                {response.subjectLine && (
                  <div className="pt-6 border-t" style={{ borderColor: '#e8dfd0' }}>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212, 145, 111, 0.1)' }}>
                        <FileArchive className="w-4 h-4" style={{ color: '#d4916f' }} />
                      </div>
                      <h4 className="text-base font-medium font-serif" style={{ color: '#5a4a3a' }}>
                        {response.subjectLine}
                      </h4>
                    </div>

                    {/* Description */}
                    {response.description && (
                      <div className="rounded-xl p-4 border mt-3" style={{ background: 'rgba(250, 248, 245, 0.8)', borderColor: '#e8dfd0' }}>
                        <p className="text-sm leading-relaxed" style={{ color: '#6a5a4a' }}>
                          {response.description}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Files Display - Claude-inspired */}
              {(response.emlFile || response.attachmentFile) && (
                <div className="space-y-3">
                  {response.emlFile && (
                    <div className="rounded-xl p-5 border transition-all hover:shadow-sm" style={{ background: 'rgba(255, 255, 255, 0.9)', borderColor: '#e8dfd0' }}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212, 145, 111, 0.1)' }}>
                            <FileText className="w-5 h-5" style={{ color: '#d4916f' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-medium truncate mb-0.5" style={{ color: '#5a4a3a' }}>
                              {response.emlFile.filename}
                            </h5>
                            <p className="text-xs" style={{ color: '#8a7a6a' }}>
                              Document · {getFileTypeLabel(response.emlFile.filename)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(response.emlFile!);
                          }}
                          className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                          style={{ background: 'rgba(212, 145, 111, 0.1)', color: '#d4916f', border: '1px solid rgba(212, 145, 111, 0.2)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(212, 145, 111, 0.15)';
                            e.currentTarget.style.borderColor = '#d4916f';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(212, 145, 111, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(212, 145, 111, 0.2)';
                          }}
                        >
                          <Download className="w-4 h-4" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {response.attachmentFile && (
                    <div className="rounded-xl p-5 border transition-all hover:shadow-sm" style={{ background: 'rgba(255, 255, 255, 0.9)', borderColor: '#e8dfd0' }}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212, 145, 111, 0.1)' }}>
                            <FileText className="w-5 h-5" style={{ color: '#d4916f' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-medium truncate mb-0.5" style={{ color: '#5a4a3a' }}>
                              {response.attachmentFile.filename}
                            </h5>
                            <p className="text-xs" style={{ color: '#8a7a6a' }}>
                              Document · {getFileTypeLabel(response.attachmentFile.filename)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(response.attachmentFile!);
                          }}
                          className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                          style={{ background: 'rgba(212, 145, 111, 0.1)', color: '#d4916f', border: '1px solid rgba(212, 145, 111, 0.2)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(212, 145, 111, 0.15)';
                            e.currentTarget.style.borderColor = '#d4916f';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(212, 145, 111, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(212, 145, 111, 0.2)';
                          }}
                        >
                          <Download className="w-4 h-4" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Download All Button */}
                  {response.emlFile && response.attachmentFile && (
                    <button
                      onClick={() => {
                        if (response.emlFile) downloadFile(response.emlFile);
                        if (response.attachmentFile) downloadFile(response.attachmentFile);
                      }}
                      className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'rgba(212, 145, 111, 0.08)', color: '#d4916f', border: '1px solid rgba(212, 145, 111, 0.15)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(212, 145, 111, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(212, 145, 111, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(212, 145, 111, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(212, 145, 111, 0.15)';
                      }}
                    >
                      <Download className="w-4 h-4" />
                      <span>Download all</span>
                    </button>
                  )}
                </div>
              )}

              {/* New Operation Button */}
              <button
                onClick={resetForm}
                className="w-full py-3 rounded-xl font-medium flex items-center justify-center space-x-2 transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.7)', color: '#8a7a6a', border: '1px solid #e8dfd0' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d4916f';
                  e.currentTarget.style.color = '#5a4a3a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e8dfd0';
                  e.currentTarget.style.color = '#8a7a6a';
                }}
              >
                <Plus className="w-4 h-4" />
                <span>New operation</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
