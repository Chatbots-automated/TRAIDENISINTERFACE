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
    <div className="h-full flex flex-col bg-macos-gray-50">
      {/* Header */}
      <div className="p-6 border-b border-black/5 bg-white/80 backdrop-blur-macos">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-macos-gray-900 tracking-macos-tight">
              Nestandartiniai Gaminiai
            </h2>
            <p className="text-sm text-macos-gray-500 mt-1">
              Valdykite nestandardinių gaminių užklausas ir komercinius pasiūlymus
            </p>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="macos-segmented-control">
          <button
            onClick={() => {
              setWorkflowMode('upload-request');
              resetForm();
            }}
            className={`macos-segment flex items-center space-x-2 ${workflowMode === 'upload-request' ? 'active' : ''}`}
          >
            <Upload className="w-4 h-4" />
            <span>Nauja Užklausa</span>
          </button>

          <button
            onClick={() => {
              setWorkflowMode('upload-solution');
              resetForm();
              loadProjects();
            }}
            className={`macos-segment flex items-center space-x-2 ${workflowMode === 'upload-solution' ? 'active' : ''}`}
          >
            <Package className="w-4 h-4" />
            <span>Įkelti Sprendimą</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20 macos-animate-slide-down">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-macos-red hover:text-macos-red/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {!response && (
            <>
              {/* Upload Request Mode */}
              {workflowMode === 'upload-request' && (
                <div className="space-y-6">
                  {/* Upload Action Selection */}
                  <div className="macos-card p-6">
                    <h3 className="text-base font-semibold text-macos-gray-900 mb-4">
                      Pasirinkite veiksmą
                    </h3>
                    <div className="space-y-3">
                      <label className="flex items-start p-4 border-[0.5px] border-macos-gray-300 rounded-macos cursor-pointer hover:border-macos-blue hover:bg-macos-blue/5 transition-all">
                        <input
                          type="radio"
                          name="upload-action"
                          value="find-similar"
                          checked={uploadAction === 'find-similar'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5 w-4 h-4 text-macos-blue border-macos-gray-300 focus:ring-macos-blue"
                        />
                        <div className="ml-3 flex-1">
                          <div className="text-sm font-semibold text-macos-gray-900">
                            Rasti panašius gaminius
                          </div>
                          <div className="text-xs text-macos-gray-500 mt-0.5">
                            Įkelkite .eml failą ir sistema ras panašius gaminius bei susijusius dokumentus
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start p-4 border-[0.5px] border-macos-gray-300 rounded-macos cursor-pointer hover:border-macos-blue hover:bg-macos-blue/5 transition-all">
                        <input
                          type="radio"
                          name="upload-action"
                          value="just-upload"
                          checked={uploadAction === 'just-upload'}
                          onChange={(e) => setUploadAction(e.target.value as UploadAction)}
                          className="mt-0.5 w-4 h-4 text-macos-blue border-macos-gray-300 focus:ring-macos-blue"
                        />
                        <div className="ml-3 flex-1">
                          <div className="text-sm font-semibold text-macos-gray-900">
                            Tiesiog įkelti naują įrašą
                          </div>
                          <div className="text-xs text-macos-gray-500 mt-0.5">
                            Įkelkite .eml failą į sistemą be paieškos (papildo žinių bazę)
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* File Upload Area */}
                  <div className="macos-card p-8 macos-animate-fade">
                    <div className="text-center mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-macos-purple/10 rounded-macos-xl mb-4">
                        <Upload className="w-8 h-8 text-macos-purple" />
                      </div>
                      <h3 className="text-lg font-semibold text-macos-gray-900 mb-2">
                        Įkelkite .eml failą
                      </h3>
                      <p className="text-sm text-macos-gray-500">
                        Palaikomi dideli failai (10mb ir daugiau)
                      </p>
                    </div>

                    {selectedFile ? (
                      <div className="border-[0.5px] border-macos-purple/30 rounded-macos-lg p-6 bg-macos-purple/5 mb-6 macos-animate-slide-down">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-macos-purple/10 rounded-macos flex items-center justify-center">
                              <FileArchive className="w-6 h-6 text-macos-purple" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-macos-gray-900">
                                {selectedFile.name}
                              </p>
                              <p className="text-xs text-macos-gray-500">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="p-2 text-macos-gray-400 hover:text-macos-red hover:bg-macos-red/10 rounded-macos transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDrop={handleFileDrop}
                        onDragOver={handleDragOver}
                        className="border-[0.5px] border-dashed border-macos-gray-300 rounded-macos-lg p-12 text-center bg-macos-gray-50 transition-all cursor-pointer hover:border-macos-purple hover:bg-macos-purple/5 mb-6"
                        onClick={triggerFileUpload}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            triggerFileUpload();
                          }
                        }}
                      >
                        <p className="text-sm text-macos-gray-600 mb-4">
                          Nutempkite .eml failą čia arba
                        </p>
                        <button
                          type="button"
                          className="macos-btn macos-btn-secondary px-8 py-3 rounded-macos-lg font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerFileUpload();
                          }}
                        >
                          Naršyti failus
                        </button>
                        <p className="text-xs text-macos-gray-500 mt-4">
                          Palaikomi failai: .eml (iki 25MB)
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

                    {/* Submit Button */}
                    <button
                      onClick={handleSubmit}
                      disabled={!selectedFile || uploading}
                      className="w-full macos-btn macos-btn-primary py-4 rounded-macos-lg font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 macos-animate-spring"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{uploadAction === 'find-similar' ? 'Ieškoma...' : 'Įkeliama...'}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          <span>{uploadAction === 'find-similar' ? 'Rasti Panašų' : 'Įkelti Įrašą'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Solution Mode */}
              {workflowMode === 'upload-solution' && (
                <div className="space-y-6">
                  {/* Project Selection */}
                  <div className="macos-card p-6">
                    <h3 className="text-base font-semibold text-macos-gray-900 mb-4">
                      Pasirinkite projektą
                    </h3>

                    <div className="relative" ref={projectDropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-macos-gray-400 w-4 h-4" />
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
                          placeholder="Ieškokite projekto pagal tema..."
                          className="macos-input w-full pl-10 pr-10 py-3 text-sm rounded-macos-lg"
                        />
                        {selectedProject && (
                          <button
                            onClick={() => {
                              setSelectedProject(null);
                              setProjectSearchQuery('');
                              loadProjects();
                            }}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-macos-gray-400 hover:text-macos-red"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {!selectedProject && (
                          <ChevronDown className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-macos-gray-400 w-4 h-4 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
                        )}
                      </div>

                      {/* Dropdown */}
                      {showProjectDropdown && !selectedProject && (
                        <div className="absolute z-10 w-full mt-2 bg-white/95 backdrop-blur-macos border-[0.5px] border-black/10 rounded-macos-lg shadow-macos-lg max-h-80 overflow-y-auto macos-animate-slide-down">
                          {loadingProjects ? (
                            <div className="p-8 text-center">
                              <Loader2 className="w-6 h-6 text-macos-blue animate-spin mx-auto mb-2" />
                              <p className="text-sm text-macos-gray-500">Kraunami projektai...</p>
                            </div>
                          ) : projects.length === 0 ? (
                            <div className="p-8 text-center">
                              <p className="text-sm text-macos-gray-500">Projektų nerasta</p>
                            </div>
                          ) : (
                            <div className="p-2">
                              {projects.map((project) => (
                                <button
                                  key={project.id}
                                  onClick={() => {
                                    setSelectedProject(project);
                                    setShowProjectDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-macos-blue/10 rounded-macos transition-colors"
                                >
                                  <div className="font-medium text-sm text-macos-gray-900">
                                    {project.subject_line}
                                  </div>
                                  <div className="text-xs text-macos-gray-500 mt-1">
                                    {new Date(project.created_at).toLocaleDateString('lt-LT')}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Find Similar by Project Button */}
                    {selectedProject && (
                      <div className="mt-4">
                        <button
                          onClick={handleFindSimilarByProject}
                          disabled={uploading}
                          className="w-full macos-btn macos-btn-secondary py-3 rounded-macos-lg font-medium flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {uploading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Ieškoma...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-4 h-4" />
                              <span>Rasti panašius šiam projektui</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* File Upload for Solution */}
                  {selectedProject && (
                    <div className="macos-card p-8">
                      <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-macos-blue/10 rounded-macos-xl mb-4">
                          <FileText className="w-8 h-8 text-macos-blue" />
                        </div>
                        <h3 className="text-lg font-semibold text-macos-gray-900 mb-2">
                          Įkelkite komercinį pasiūlymą
                        </h3>
                        <p className="text-sm text-macos-gray-500">
                          Projektui: <span className="font-semibold text-macos-gray-700">{selectedProject.subject_line}</span>
                        </p>
                      </div>

                      {selectedFile ? (
                        <div className="border-[0.5px] border-macos-blue/30 rounded-macos-lg p-6 bg-macos-blue/5 mb-6 macos-animate-slide-down">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-12 h-12 bg-macos-blue/10 rounded-macos flex items-center justify-center">
                                <FileText className="w-6 h-6 text-macos-blue" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-macos-gray-900">
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs text-macos-gray-500">
                                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                              className="p-2 text-macos-gray-400 hover:text-macos-red hover:bg-macos-red/10 rounded-macos transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onDrop={handleFileDrop}
                          onDragOver={handleDragOver}
                          className="border-[0.5px] border-dashed border-macos-gray-300 rounded-macos-lg p-12 text-center bg-macos-gray-50 transition-all cursor-pointer hover:border-macos-blue hover:bg-macos-blue/5 mb-6"
                          onClick={triggerFileUpload}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              triggerFileUpload();
                            }
                          }}
                        >
                          <p className="text-sm text-macos-gray-600 mb-4">
                            Nutempkite failą čia arba
                          </p>
                          <button
                            type="button"
                            className="macos-btn macos-btn-secondary px-8 py-3 rounded-macos-lg font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFileUpload();
                            }}
                          >
                            Naršyti failus
                          </button>
                          <p className="text-xs text-macos-gray-500 mt-4">
                            Palaikomi failai: PDF, Word, Excel, ir kiti (iki 25MB)
                          </p>
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelection}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                      />

                      {/* Submit Button */}
                      <button
                        onClick={handleSubmit}
                        disabled={!selectedFile || uploading}
                        className="w-full macos-btn macos-btn-primary py-4 rounded-macos-lg font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Įkeliama...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5" />
                            <span>Įkelti Sprendimą</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {uploading && (
            <div className="macos-card p-12 text-center macos-animate-fade">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-macos-blue/10 rounded-full mb-6">
                <Loader2 className="w-8 h-8 text-macos-blue animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-macos-gray-900 mb-2">
                Apdorojama užklausa...
              </h3>
              <p className="text-sm text-macos-gray-500">
                Prašome palaukti, kol sistema apdoroja jūsų užklausą
              </p>
            </div>
          )}

          {/* Response Display */}
          {response && !uploading && (
            <div className="space-y-6 macos-animate-fade">
              {/* Success Header */}
              <div className="macos-card p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-macos-green/10 rounded-full flex items-center justify-center">
                    <Check className="w-6 h-6 text-macos-green" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-macos-gray-900">
                      {response.message || 'Rasti aktualūs failai'}
                    </h3>
                    <p className="text-sm text-macos-gray-500">
                      {workflowMode === 'upload-solution'
                        ? 'Komercinis pasiūlymas sėkmingai įkeltas'
                        : uploadAction === 'just-upload'
                        ? 'Įrašas sėkmingai įkeltas į sistemą'
                        : 'Sistema sėkmingai rado susijusius dokumentus'
                      }
                    </p>
                  </div>
                </div>

                {/* Subject Line */}
                {response.subjectLine && (
                  <div className="border-t border-black/5 pt-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-8 h-8 bg-macos-purple/10 rounded-macos flex items-center justify-center flex-shrink-0">
                        <FileArchive className="w-4 h-4 text-macos-purple" />
                      </div>
                      <h4 className="text-base font-semibold text-macos-gray-900">
                        {response.subjectLine}
                      </h4>
                    </div>

                    {/* Description */}
                    {response.description && (
                      <div className="bg-macos-gray-50 rounded-macos p-4 border-[0.5px] border-black/5">
                        <p className="text-sm text-macos-gray-700 leading-relaxed">
                          {response.description}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Files Display - Reference Image Style */}
              {(response.emlFile || response.attachmentFile) && (
                <div className="space-y-4">
                  {response.emlFile && (
                    <div
                      className="macos-card p-5 macos-animate-slide-up border-[0.5px] border-black/10 hover:border-black/20 transition-all"
                      style={{ animationDelay: '0.1s' }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Icon + Text */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-macos flex items-center justify-center bg-macos-gray-100 flex-shrink-0">
                            <FileText className="w-5 h-5 text-macos-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-medium text-macos-gray-900 truncate mb-0.5">
                              {response.emlFile.filename}
                            </h5>
                            <p className="text-xs text-macos-gray-500">
                              Document · {getFileTypeLabel(response.emlFile.filename)}
                            </p>
                          </div>
                        </div>

                        {/* Right: Download Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(response.emlFile!);
                          }}
                          className="macos-btn macos-btn-secondary px-5 py-2 rounded-macos-lg text-sm font-medium flex items-center gap-2 flex-shrink-0"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {response.attachmentFile && (
                    <div
                      className="macos-card p-5 macos-animate-slide-up border-[0.5px] border-black/10 hover:border-black/20 transition-all"
                      style={{ animationDelay: '0.2s' }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Icon + Text */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-macos flex items-center justify-center bg-macos-gray-100 flex-shrink-0">
                            <FileText className="w-5 h-5 text-macos-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-sm font-medium text-macos-gray-900 truncate mb-0.5">
                              {response.attachmentFile.filename}
                            </h5>
                            <p className="text-xs text-macos-gray-500">
                              Document · {getFileTypeLabel(response.attachmentFile.filename)}
                            </p>
                          </div>
                        </div>

                        {/* Right: Download Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(response.attachmentFile!);
                          }}
                          className="macos-btn macos-btn-secondary px-5 py-2 rounded-macos-lg text-sm font-medium flex items-center gap-2 flex-shrink-0"
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
                      className="w-full macos-btn macos-btn-secondary py-3 rounded-macos-lg font-medium flex items-center justify-center gap-2 mt-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download all</span>
                    </button>
                  )}
                </div>
              )}

              {/* New Search Button */}
              <button
                onClick={resetForm}
                className="w-full macos-btn macos-btn-secondary py-3 rounded-macos-lg font-medium flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Nauja operacija</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
