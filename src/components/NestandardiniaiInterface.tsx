import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Plus, Package, Download } from 'lucide-react';
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
        setError('Only .eml files are supported.');
        return;
      }
    }

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
        setError('Only .eml files are supported.');
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
        setError('Please select an .eml file');
        return;
      }
    } else if (workflowMode === 'upload-solution') {
      if (!selectedProject) {
        setError('Please select a project');
        return;
      }
      if (!selectedFile) {
        setError('Please select a file');
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
      setError(`Operation failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadRequest = async () => {
    if (!selectedFile) return;

    await appLogger.logDocument({
      action: uploadAction === 'just-upload' ? 'eml_upload_started' : 'eml_search_started',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: { project_id: projectId, file_type: selectedFile.type, upload_action: uploadAction }
    });

    const base64Content = await fileToBase64(selectedFile);

    const webhookUrl = uploadAction === 'just-upload'
      ? import.meta.env.VITE_N8N_WEBHOOK_UPLOAD_NEW
      : import.meta.env.VITE_N8N_WEBHOOK_FIND_SIMILAR;

    if (!webhookUrl) {
      throw new Error('Webhook URL is not configured.');
    }

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
      throw new Error(`Webhook request failed: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

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

    const base64Content = await fileToBase64(selectedFile);
    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_UPLOAD_SOLUTION;

    if (!webhookUrl) {
      throw new Error('Webhook URL is not configured.');
    }

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
      throw new Error(`Webhook request failed: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

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
      setError('Please select a project');
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
        throw new Error('Webhook URL is not configured.');
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
        throw new Error(`Webhook request failed: ${webhookResponse.statusText}`);
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
      setError(`Search failed: ${error.message}`);

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
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const downloadFile = (file: ResponseFile) => {
    try {
      const byteCharacters = atob(file.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: file.mimeType });

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
      setError('Failed to download file');
    }
  };

  const getFileTypeLabel = (filename: string) => {
    const ext = filename.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
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
    <div className="h-full flex flex-col" style={{ background: '#faf8f5' }}>
      {/* Compact Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: '#e8dfd0', background: 'white' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-medium" style={{ color: '#5a4a3a' }}>
              Nestandartiniai Gaminiai
            </h1>

            {/* Compact mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setWorkflowMode('upload-request');
                  resetForm();
                }}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  workflowMode === 'upload-request' ? 'shadow-sm' : ''
                }`}
                style={{
                  background: workflowMode === 'upload-request' ? '#d4916f' : '#f5f1ea',
                  color: workflowMode === 'upload-request' ? 'white' : '#8a7a6a'
                }}
              >
                New Request
              </button>
              <button
                onClick={() => {
                  setWorkflowMode('upload-solution');
                  resetForm();
                  loadProjects();
                }}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  workflowMode === 'upload-solution' ? 'shadow-sm' : ''
                }`}
                style={{
                  background: workflowMode === 'upload-solution' ? '#d4916f' : '#f5f1ea',
                  color: workflowMode === 'upload-solution' ? 'white' : '#8a7a6a'
                }}
              >
                Upload Solution
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 pt-3 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto">
          {!response && !uploading && (
            <>
              {/* Upload Request Mode */}
              {workflowMode === 'upload-request' && (
                <div className="space-y-4">
                  {/* Compact Action Selection */}
                  <div className="flex gap-3">
                    <label className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-xs transition-colors" style={{ borderColor: uploadAction === 'find-similar' ? '#d4916f' : '#e8dfd0', background: uploadAction === 'find-similar' ? 'rgba(212, 145, 111, 0.05)' : 'white' }}>
                      <input
                        type="radio"
                        name="upload-action"
                        value="find-similar"
                        checked={uploadAction === 'find-similar'}
                        onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                        style={{ accentColor: '#d4916f' }}
                      />
                      <span style={{ color: '#5a4a3a' }}>Find similar</span>
                    </label>

                    <label className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-xs transition-colors" style={{ borderColor: uploadAction === 'just-upload' ? '#d4916f' : '#e8dfd0', background: uploadAction === 'just-upload' ? 'rgba(212, 145, 111, 0.05)' : 'white' }}>
                      <input
                        type="radio"
                        name="upload-action"
                        value="just-upload"
                        checked={uploadAction === 'just-upload'}
                        onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                        style={{ accentColor: '#d4916f' }}
                      />
                      <span style={{ color: '#5a4a3a' }}>Just upload</span>
                    </label>
                  </div>

                  {/* Compact Upload Area */}
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={handleDragOver}
                    onClick={triggerFileUpload}
                    className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors"
                    style={{ borderColor: '#e8dfd0', background: 'white' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#d4916f'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e8dfd0'}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileArchive className="w-5 h-5" style={{ color: '#d4916f' }} />
                          <div className="text-left">
                            <p className="text-sm font-medium" style={{ color: '#5a4a3a' }}>
                              {selectedFile.name}
                            </p>
                            <p className="text-xs" style={{ color: '#8a7a6a' }}>
                              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="p-1.5 rounded hover:bg-gray-100"
                        >
                          <X className="w-4 h-4" style={{ color: '#8a7a6a' }} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#d4916f' }} />
                        <p className="text-sm mb-1" style={{ color: '#5a4a3a' }}>
                          Drop .eml file or click to browse
                        </p>
                        <p className="text-xs" style={{ color: '#8a7a6a' }}>
                          Up to 25MB
                        </p>
                      </>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelection}
                    className="hidden"
                    accept=".eml"
                  />

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!selectedFile}
                    className="w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                    style={{
                      background: selectedFile ? '#d4916f' : '#e8dfd0',
                      color: 'white'
                    }}
                  >
                    {uploadAction === 'find-similar' ? 'Find Similar' : 'Upload'}
                  </button>
                </div>
              )}

              {/* Upload Solution Mode */}
              {workflowMode === 'upload-solution' && (
                <div className="space-y-4">
                  {/* Compact Project Selection */}
                  <div className="relative" ref={projectDropdownRef}>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#8a7a6a' }} />
                      <input
                        type="text"
                        value={selectedProject ? selectedProject.subject_line : projectSearchQuery}
                        onChange={(e) => {
                          if (!selectedProject) {
                            handleProjectSearch(e.target.value);
                          }
                        }}
                        onFocus={() => {
                          if (!selectedProject) {
                            setShowProjectDropdown(true);
                          }
                        }}
                        onClick={() => {
                          if (selectedProject) {
                            setSelectedProject(null);
                            setProjectSearchQuery('');
                            loadProjects();
                          }
                          setShowProjectDropdown(true);
                        }}
                        placeholder="Search project..."
                        className="w-full pl-9 pr-9 py-2 text-sm border rounded-lg"
                        style={{ borderColor: '#e8dfd0', background: 'white', color: '#5a4a3a' }}
                      />
                      {selectedProject ? (
                        <button
                          onClick={() => {
                            setSelectedProject(null);
                            setProjectSearchQuery('');
                            loadProjects();
                          }}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        >
                          <X className="w-4 h-4" style={{ color: '#8a7a6a' }} />
                        </button>
                      ) : (
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#8a7a6a' }} />
                      )}
                    </div>

                    {/* Dropdown */}
                    {showProjectDropdown && !selectedProject && (
                      <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ borderColor: '#e8dfd0' }}>
                        {loadingProjects ? (
                          <div className="p-4 text-center">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: '#d4916f' }} />
                          </div>
                        ) : projects.length === 0 ? (
                          <div className="p-4 text-center text-xs" style={{ color: '#8a7a6a' }}>
                            No projects found
                          </div>
                        ) : (
                          <div className="p-1">
                            {projects.map((project) => (
                              <button
                                key={project.id}
                                onClick={() => {
                                  setSelectedProject(project);
                                  setShowProjectDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm"
                                style={{ color: '#5a4a3a' }}
                              >
                                {project.subject_line}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Find Similar by Project */}
                  {selectedProject && (
                    <button
                      onClick={handleFindSimilarByProject}
                      disabled={uploading}
                      className="w-full py-2 rounded-lg text-xs font-medium border transition-colors"
                      style={{ borderColor: '#e8dfd0', color: '#5a4a3a', background: 'white' }}
                    >
                      Find similar for this project
                    </button>
                  )}

                  {/* File Upload for Solution */}
                  {selectedProject && (
                    <>
                      <div
                        onDrop={handleFileDrop}
                        onDragOver={handleDragOver}
                        onClick={triggerFileUpload}
                        className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors"
                        style={{ borderColor: '#e8dfd0', background: 'white' }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#d4916f'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e8dfd0'}
                      >
                        {selectedFile ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5" style={{ color: '#d4916f' }} />
                              <div className="text-left">
                                <p className="text-sm font-medium" style={{ color: '#5a4a3a' }}>
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs" style={{ color: '#8a7a6a' }}>
                                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                              className="p-1.5 rounded hover:bg-gray-100"
                            >
                              <X className="w-4 h-4" style={{ color: '#8a7a6a' }} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#d4916f' }} />
                            <p className="text-sm mb-1" style={{ color: '#5a4a3a' }}>
                              Drop commercial offer or click
                            </p>
                            <p className="text-xs" style={{ color: '#8a7a6a' }}>
                              PDF, Word, Excel, etc.
                            </p>
                          </>
                        )}
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelection}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                      />

                      <button
                        onClick={handleSubmit}
                        disabled={!selectedFile}
                        className="w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                        style={{
                          background: selectedFile ? '#d4916f' : '#e8dfd0',
                          color: 'white'
                        }}
                      >
                        Upload Solution
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {uploading && (
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: '#d4916f' }} />
              <p className="text-sm" style={{ color: '#8a7a6a' }}>
                Processing...
              </p>
            </div>
          )}

          {/* Response Display */}
          {response && !uploading && (
            <div className="space-y-3">
              {/* Success Message */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <Check className="w-4 h-4" style={{ color: '#16a34a' }} />
                <span className="text-sm" style={{ color: '#166534' }}>
                  {response.message || 'Success'}
                </span>
              </div>

              {/* Subject Line & Description */}
              {response.subjectLine && (
                <div className="p-3 rounded-lg border" style={{ borderColor: '#e8dfd0', background: 'white' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: '#5a4a3a' }}>
                    {response.subjectLine}
                  </p>
                  {response.description && (
                    <p className="text-xs" style={{ color: '#8a7a6a' }}>
                      {response.description}
                    </p>
                  )}
                </div>
              )}

              {/* Files */}
              {(response.emlFile || response.attachmentFile) && (
                <div className="space-y-2">
                  {response.emlFile && (
                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e8dfd0', background: 'white' }}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#d4916f' }} />
                        <span className="text-sm truncate" style={{ color: '#5a4a3a' }}>
                          {response.emlFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.emlFile!)}
                        className="px-3 py-1 rounded text-xs font-medium"
                        style={{ background: '#f5f1ea', color: '#d4916f' }}
                      >
                        Download
                      </button>
                    </div>
                  )}

                  {response.attachmentFile && (
                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e8dfd0', background: 'white' }}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#d4916f' }} />
                        <span className="text-sm truncate" style={{ color: '#5a4a3a' }}>
                          {response.attachmentFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.attachmentFile!)}
                        className="px-3 py-1 rounded text-xs font-medium"
                        style={{ background: '#f5f1ea', color: '#d4916f' }}
                      >
                        Download
                      </button>
                    </div>
                  )}

                  {response.emlFile && response.attachmentFile && (
                    <button
                      onClick={() => {
                        if (response.emlFile) downloadFile(response.emlFile);
                        if (response.attachmentFile) downloadFile(response.attachmentFile);
                      }}
                      className="w-full py-2 rounded-lg text-xs font-medium border"
                      style={{ borderColor: '#e8dfd0', color: '#5a4a3a', background: 'white' }}
                    >
                      Download all
                    </button>
                  )}
                </div>
              )}

              {/* New Operation */}
              <button
                onClick={resetForm}
                className="w-full py-2 rounded-lg text-xs font-medium border"
                style={{ borderColor: '#e8dfd0', color: '#8a7a6a', background: 'white' }}
              >
                New operation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
