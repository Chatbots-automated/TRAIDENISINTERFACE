import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Plus, Package, Download, Info } from 'lucide-react';
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
      setError('Failed to load projects list');
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
        setError('Only .eml files are supported for new requests.');
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
        setError('Only .eml files are supported for new requests.');
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
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>
      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: '#f0ede8', background: 'white' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-medium mb-0.5" style={{ color: '#3d3935' }}>
                Nestandartiniai Gaminiai
              </h1>
              <p className="text-xs" style={{ color: '#8a857f' }}>
                Manage custom product requests and commercial offers
              </p>
            </div>

            {/* Clear mode selector with labels */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setWorkflowMode('upload-request');
                  resetForm();
                }}
                className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                  workflowMode === 'upload-request' ? 'shadow-sm' : ''
                }`}
                style={{
                  background: workflowMode === 'upload-request' ? '#3d3935' : 'white',
                  color: workflowMode === 'upload-request' ? 'white' : '#3d3935',
                  borderColor: workflowMode === 'upload-request' ? '#3d3935' : '#e8e5e0'
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>New Request</span>
                </div>
              </button>
              <button
                onClick={() => {
                  setWorkflowMode('upload-solution');
                  resetForm();
                  loadProjects();
                }}
                className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                  workflowMode === 'upload-solution' ? 'shadow-sm' : ''
                }`}
                style={{
                  background: workflowMode === 'upload-solution' ? '#3d3935' : 'white',
                  color: workflowMode === 'upload-solution' ? 'white' : '#3d3935',
                  borderColor: workflowMode === 'upload-solution' ? '#3d3935' : '#e8e5e0'
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Upload Solution</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 pt-4 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
            <AlertCircle className="w-4 h-4" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl mx-auto">
          {!response && !uploading && (
            <>
              {/* Upload Request Mode */}
              {workflowMode === 'upload-request' && (
                <div className="space-y-4">
                  {/* Action Selection with context */}
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: '#5a5550' }}>
                      What would you like to do?
                    </label>
                    <div className="flex gap-3">
                      <label className="flex-1 flex items-start gap-2.5 px-3 py-2.5 border rounded-lg cursor-pointer text-xs transition-all" style={{ borderColor: uploadAction === 'find-similar' ? '#5a5550' : '#e8e5e0', background: uploadAction === 'find-similar' ? '#faf9f7' : 'white' }}>
                        <input
                          type="radio"
                          name="upload-action"
                          value="find-similar"
                          checked={uploadAction === 'find-similar'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5"
                          style={{ accentColor: '#5a5550' }}
                        />
                        <div>
                          <div className="font-medium mb-0.5" style={{ color: '#3d3935' }}>Find similar products</div>
                          <div style={{ color: '#8a857f' }}>Search for related items and documents</div>
                        </div>
                      </label>

                      <label className="flex-1 flex items-start gap-2.5 px-3 py-2.5 border rounded-lg cursor-pointer text-xs transition-all" style={{ borderColor: uploadAction === 'just-upload' ? '#5a5550' : '#e8e5e0', background: uploadAction === 'just-upload' ? '#faf9f7' : 'white' }}>
                        <input
                          type="radio"
                          name="upload-action"
                          value="just-upload"
                          checked={uploadAction === 'just-upload'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5"
                          style={{ accentColor: '#5a5550' }}
                        />
                        <div>
                          <div className="font-medium mb-0.5" style={{ color: '#3d3935' }}>Just upload</div>
                          <div style={{ color: '#8a857f' }}>Add to knowledge base without search</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Contextual help message */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#5a5550' }} />
                    <div style={{ color: '#5a5550' }}>
                      {uploadAction === 'find-similar'
                        ? 'Upload a .eml email file to find similar products and receive related documents including PDFs and commercial offers.'
                        : 'Upload a .eml email file to add it to the knowledge base. Only .eml format is accepted for new requests.'
                      }
                    </div>
                  </div>

                  {/* Upload Area */}
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: '#5a5550' }}>
                      Select file
                    </label>
                    <div
                      onDrop={handleFileDrop}
                      onDragOver={handleDragOver}
                      onClick={triggerFileUpload}
                      className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-all"
                      style={{ borderColor: '#e8e5e0', background: 'white' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#5a5550';
                        e.currentTarget.style.background = '#faf9f7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e8e5e0';
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      {selectedFile ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: '#f0ede8' }}>
                              <FileArchive className="w-4 h-4" style={{ color: '#5a5550' }} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: '#3d3935' }}>
                                {selectedFile.name}
                              </p>
                              <p className="text-xs" style={{ color: '#8a857f' }}>
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
                            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: '#8a857f' }} />
                          <p className="text-sm mb-1" style={{ color: '#3d3935' }}>
                            Drop .eml file or click to browse
                          </p>
                          <p className="text-xs" style={{ color: '#8a857f' }}>
                            Required: .eml format • Max: 25MB
                          </p>
                        </>
                      )}
                    </div>
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
                    className="w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: selectedFile ? '#3d3935' : '#e8e5e0',
                      color: selectedFile ? 'white' : '#8a857f'
                    }}
                  >
                    {uploadAction === 'find-similar' ? 'Find Similar Products' : 'Upload to Knowledge Base'}
                  </button>
                </div>
              )}

              {/* Upload Solution Mode */}
              {workflowMode === 'upload-solution' && (
                <div className="space-y-4">
                  {/* Context message */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#5a5550' }} />
                    <div style={{ color: '#5a5550' }}>
                      Select an existing project and upload your commercial offer or solution file (PDF, Word, Excel, etc.)
                    </div>
                  </div>

                  {/* Project Selection */}
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: '#5a5550' }}>
                      Select project
                    </label>
                    <div className="relative" ref={projectDropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#8a857f' }} />
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
                          placeholder="Search by project name..."
                          className="w-full pl-9 pr-9 py-2.5 text-sm border rounded-lg"
                          style={{ borderColor: '#e8e5e0', background: 'white', color: '#3d3935' }}
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
                            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
                          </button>
                        ) : (
                          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#8a857f' }} />
                        )}
                      </div>

                      {/* Dropdown */}
                      {showProjectDropdown && !selectedProject && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                          {loadingProjects ? (
                            <div className="p-4 text-center">
                              <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: '#5a5550' }} />
                            </div>
                          ) : projects.length === 0 ? (
                            <div className="p-4 text-center text-xs" style={{ color: '#8a857f' }}>
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
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm transition-colors"
                                  style={{ color: '#3d3935' }}
                                >
                                  {project.subject_line}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Find Similar by Project */}
                  {selectedProject && (
                    <button
                      onClick={handleFindSimilarByProject}
                      disabled={uploading}
                      className="w-full py-2 rounded-lg text-xs font-medium border transition-colors"
                      style={{ borderColor: '#e8e5e0', color: '#3d3935', background: 'white' }}
                    >
                      Find similar products for this project
                    </button>
                  )}

                  {/* File Upload for Solution */}
                  {selectedProject && (
                    <>
                      <div>
                        <label className="text-xs font-medium block mb-2" style={{ color: '#5a5550' }}>
                          Upload commercial offer
                        </label>
                        <div
                          onDrop={handleFileDrop}
                          onDragOver={handleDragOver}
                          onClick={triggerFileUpload}
                          className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-all"
                          style={{ borderColor: '#e8e5e0', background: 'white' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#5a5550';
                            e.currentTarget.style.background = '#faf9f7';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#e8e5e0';
                            e.currentTarget.style.background = 'white';
                          }}
                        >
                          {selectedFile ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: '#f0ede8' }}>
                                  <FileText className="w-4 h-4" style={{ color: '#5a5550' }} />
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-medium" style={{ color: '#3d3935' }}>
                                    {selectedFile.name}
                                  </p>
                                  <p className="text-xs" style={{ color: '#8a857f' }}>
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
                                <X className="w-4 h-4" style={{ color: '#8a857f' }} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: '#8a857f' }} />
                              <p className="text-sm mb-1" style={{ color: '#3d3935' }}>
                                Drop file or click to browse
                              </p>
                              <p className="text-xs" style={{ color: '#8a857f' }}>
                                Accepted: PDF, Word, Excel, TXT • Max: 25MB
                              </p>
                            </>
                          )}
                        </div>
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
                        className="w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: selectedFile ? '#3d3935' : '#e8e5e0',
                          color: selectedFile ? 'white' : '#8a857f'
                        }}
                      >
                        Upload Commercial Offer
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {uploading && (
            <div className="py-16 text-center">
              <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" style={{ color: '#5a5550' }} />
              <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>
                Processing your request
              </p>
              <p className="text-xs" style={{ color: '#8a857f' }}>
                Please wait while we process your file...
              </p>
            </div>
          )}

          {/* Response Display */}
          {response && !uploading && (
            <div className="space-y-4">
              {/* Success Message */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <Check className="w-4 h-4" style={{ color: '#16a34a' }} />
                <span className="text-sm font-medium" style={{ color: '#166534' }}>
                  {response.message || 'Operation completed successfully'}
                </span>
              </div>

              {/* Subject Line & Description */}
              {response.subjectLine && (
                <div className="p-4 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                  <p className="text-sm font-medium mb-2" style={{ color: '#3d3935' }}>
                    {response.subjectLine}
                  </p>
                  {response.description && (
                    <p className="text-xs leading-relaxed" style={{ color: '#5a5550' }}>
                      {response.description}
                    </p>
                  )}
                </div>
              )}

              {/* Files */}
              {(response.emlFile || response.attachmentFile) && (
                <div className="space-y-2">
                  {response.emlFile && (
                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0ede8' }}>
                          <FileText className="w-4 h-4" style={{ color: '#5a5550' }} />
                        </div>
                        <span className="text-sm truncate" style={{ color: '#3d3935' }}>
                          {response.emlFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.emlFile!)}
                        className="px-3 py-1.5 rounded text-xs font-medium border"
                        style={{ background: 'white', color: '#3d3935', borderColor: '#e8e5e0' }}
                      >
                        Download
                      </button>
                    </div>
                  )}

                  {response.attachmentFile && (
                    <div className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0ede8' }}>
                          <FileText className="w-4 h-4" style={{ color: '#5a5550' }} />
                        </div>
                        <span className="text-sm truncate" style={{ color: '#3d3935' }}>
                          {response.attachmentFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.attachmentFile!)}
                        className="px-3 py-1.5 rounded text-xs font-medium border"
                        style={{ background: 'white', color: '#3d3935', borderColor: '#e8e5e0' }}
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
                      style={{ borderColor: '#e8e5e0', color: '#3d3935', background: 'white' }}
                    >
                      Download all files
                    </button>
                  )}
                </div>
              )}

              {/* New Operation */}
              <button
                onClick={resetForm}
                className="w-full py-2 rounded-lg text-xs font-medium border"
                style={{ borderColor: '#e8e5e0', color: '#5a5550', background: 'white' }}
              >
                Start new operation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
