import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Coins, Download, Info } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { fetchNestandardiniaiProjects, searchProjectsBySubjectLine, NestandardinisProject } from '../lib/nestandardiniaiService';
import { getWebhookUrl } from '../lib/webhooksService';
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
  message?: string;
}

type SelectedCard = 'new-request' | 'upload-solution' | 'find-similar' | null;

export default function NestandardiniaiInterface({ user, projectId }: NestandardiniaiInterfaceProps) {
  // Card selection
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WebhookResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Project selection state
  const [projects, setProjects] = useState<NestandardinisProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<NestandardinisProject | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Load projects when upload-solution card is selected
  useEffect(() => {
    if (selectedCard === 'upload-solution') {
      loadProjects();
    }
  }, [selectedCard]);

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

    // Check file type based on selected card
    if (selectedCard === 'new-request' || selectedCard === 'find-similar') {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (fileExtension !== '.eml') {
        setError('Prašome pasirinkti .eml formato failą');
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

    // Check file type
    if (selectedCard === 'new-request' || selectedCard === 'find-similar') {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (fileExtension !== '.eml') {
        setError('Prašome pasirinkti .eml formato failą');
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
    if (selectedCard === 'new-request' || selectedCard === 'find-similar') {
      if (!selectedFile) {
        setError('Prašome pasirinkti failą');
        return;
      }
    } else if (selectedCard === 'upload-solution') {
      if (!selectedProject) {
        setError('Prašome pasirinkti projektą');
        return;
      }
      if (!selectedFile) {
        setError('Prašome pasirinkti failą');
        return;
      }
    }

    setUploading(true);
    setError(null);
    setResponse(null);

    try {
      if (selectedCard === 'new-request') {
        await handleNewRequest();
      } else if (selectedCard === 'find-similar') {
        await handleFindSimilar();
      } else if (selectedCard === 'upload-solution') {
        await handleUploadSolution();
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(`Operacija nepavyko: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleNewRequest = async () => {
    if (!selectedFile) return;

    await appLogger.logDocument({
      action: 'eml_upload_started',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: { project_id: projectId, file_type: selectedFile.type, upload_action: 'just-upload' }
    });

    const webhookUrl = await getWebhookUrl('n8n_upload_new');

    if (!webhookUrl) {
      throw new Error('Webhook "n8n_upload_new" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose.');
    }

    // Use FormData for binary file upload
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('action', 'just-upload');
    formData.append('filename', selectedFile.name);
    formData.append('mimeType', selectedFile.type || 'message/rfc822');
    formData.append('userId', user.id);
    formData.append('userEmail', user.email);
    formData.append('projectId', projectId);
    formData.append('timestamp', new Date().toISOString());

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

    await appLogger.logDocument({
      action: 'eml_upload_success',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        subject_line: responseData.subjectLine,
        upload_action: 'just-upload'
      }
    });

    setResponse(responseData);
  };

  const handleFindSimilar = async () => {
    if (!selectedFile) return;

    await appLogger.logDocument({
      action: 'eml_search_started',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: { project_id: projectId, file_type: selectedFile.type, upload_action: 'find-similar' }
    });

    const webhookUrl = await getWebhookUrl('n8n_find_similar');

    if (!webhookUrl) {
      throw new Error('Webhook "n8n_find_similar" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose.');
    }

    // Use FormData for binary file upload
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('action', 'find-similar');
    formData.append('filename', selectedFile.name);
    formData.append('mimeType', selectedFile.type || 'message/rfc822');
    formData.append('userId', user.id);
    formData.append('userEmail', user.email);
    formData.append('projectId', projectId);
    formData.append('timestamp', new Date().toISOString());

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
    }

    const responseData: WebhookResponse = await webhookResponse.json();

    await appLogger.logDocument({
      action: 'eml_search_success',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        subject_line: responseData.subjectLine,
        upload_action: 'find-similar'
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

    const webhookUrl = await getWebhookUrl('n8n_upload_solution');

    if (!webhookUrl) {
      throw new Error('Webhook "n8n_upload_solution" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose.');
    }

    // Use FormData for binary file upload
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('action', 'upload-solution');
    formData.append('nestandartiniaiProjectId', selectedProject.id);
    formData.append('projectSubjectLine', selectedProject.subject_line);
    formData.append('filename', selectedFile.name);
    formData.append('mimeType', selectedFile.type || 'application/octet-stream');
    formData.append('userId', user.id);
    formData.append('userEmail', user.email);
    formData.append('timestamp', new Date().toISOString());

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
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
      setError('Nepavyko atsisiųsti failo');
    }
  };

  const resetForm = () => {
    setResponse(null);
    setSelectedFile(null);
    setSelectedProject(null);
    setProjectSearchQuery('');
    setError(null);
    setSelectedCard(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCardSelect = (card: SelectedCard) => {
    // Reset form when switching cards
    setSelectedFile(null);
    setSelectedProject(null);
    setProjectSearchQuery('');
    setError(null);
    setResponse(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setSelectedCard(card);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b" style={{ borderColor: '#f0ede8', background: 'white' }}>
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-semibold mb-1" style={{ color: '#3d3935' }}>
            Nestandartiniai Projektai
          </h1>
          <p className="text-sm" style={{ color: '#8a857f' }}>
            Tvarkykite užklausas, sprendimus ir paieškos rezultatus
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 pt-5 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {!response && !uploading && (
            <>
              {/* Three Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Card 1: New Request */}
                <button
                  onClick={() => handleCardSelect('new-request')}
                  className={`p-5 rounded-xl border-2 text-left transition-all duration-300 ${
                    selectedCard === 'new-request'
                      ? 'shadow-lg scale-105 z-10'
                      : selectedCard
                        ? 'opacity-50 scale-95'
                        : 'hover:shadow-md'
                  }`}
                  style={{
                    borderColor: selectedCard === 'new-request' ? '#5a5550' : '#e8e5e0',
                    background: selectedCard === 'new-request' ? '#faf9f7' : 'white',
                    transform: selectedCard === 'new-request' ? 'translateY(-4px)' : undefined
                  }}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'new-request' ? '#5a5550' : '#f0ede8' }}>
                    <Upload className="w-6 h-6" style={{ color: selectedCard === 'new-request' ? 'white' : '#5a5550' }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: '#3d3935', fontSize: '15px' }}>
                    Pateikti naują užklausą
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#8a857f' }}>
                    Įkelti naują .eml failą į sistemą
                  </p>
                </button>

                {/* Card 2: Upload Solution */}
                <button
                  onClick={() => handleCardSelect('upload-solution')}
                  className={`p-5 rounded-xl border-2 text-left transition-all duration-300 ${
                    selectedCard === 'upload-solution'
                      ? 'shadow-lg scale-105 z-10'
                      : selectedCard
                        ? 'opacity-50 scale-95'
                        : 'hover:shadow-md'
                  }`}
                  style={{
                    borderColor: selectedCard === 'upload-solution' ? '#5a5550' : '#e8e5e0',
                    background: selectedCard === 'upload-solution' ? '#faf9f7' : 'white',
                    transform: selectedCard === 'upload-solution' ? 'translateY(-4px)' : undefined
                  }}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'upload-solution' ? '#5a5550' : '#f0ede8' }}>
                    <Coins className="w-6 h-6" style={{ color: selectedCard === 'upload-solution' ? 'white' : '#5a5550' }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: '#3d3935', fontSize: '15px' }}>
                    Pateikti sprendimą užklausai
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#8a857f' }}>
                    Įkelti komercinį pasiūlymą projektui
                  </p>
                </button>

                {/* Card 3: Find Similar */}
                <button
                  onClick={() => handleCardSelect('find-similar')}
                  className={`p-5 rounded-xl border-2 text-left transition-all duration-300 ${
                    selectedCard === 'find-similar'
                      ? 'shadow-lg scale-105 z-10'
                      : selectedCard
                        ? 'opacity-50 scale-95'
                        : 'hover:shadow-md'
                  }`}
                  style={{
                    borderColor: selectedCard === 'find-similar' ? '#5a5550' : '#e8e5e0',
                    background: selectedCard === 'find-similar' ? '#faf9f7' : 'white',
                    transform: selectedCard === 'find-similar' ? 'translateY(-4px)' : undefined
                  }}
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'find-similar' ? '#5a5550' : '#f0ede8' }}>
                    <Search className="w-6 h-6" style={{ color: selectedCard === 'find-similar' ? 'white' : '#5a5550' }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: '#3d3935', fontSize: '15px' }}>
                    Rasti panašius
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#8a857f' }}>
                    Ieškoti panašių gaminių ir dokumentų
                  </p>
                </button>
              </div>

              {/* Options Area - Appears with fade-in animation */}
              {selectedCard && (
                <div
                  className="max-w-3xl mx-auto space-y-5"
                  style={{
                    animation: 'fadeIn 0.3s ease-in-out'
                  }}
                >
                  <style>{`
                    @keyframes fadeIn {
                      from { opacity: 0; transform: translateY(-10px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>

                  {/* New Request Options */}
                  {selectedCard === 'new-request' && (
                    <>
                      {/* Description */}
                      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg text-sm" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
                        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#5a5550' }} />
                        <div style={{ color: '#5a5550' }}>
                          <strong>Įkelkite naują užklausos failą (.eml formatas)</strong> – failas bus pridėtas į žinių bazę tolimesniam apdorojimui ir analizei.
                        </div>
                      </div>

                      {/* Upload Area */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Pasirinkite failą
                        </label>
                        <div
                          onDrop={handleFileDrop}
                          onDragOver={handleDragOver}
                          onClick={triggerFileUpload}
                          className="border-2 border-dashed rounded-lg px-5 py-8 text-center cursor-pointer transition-all"
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
                                <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: '#f0ede8' }}>
                                  <FileArchive className="w-5 h-5" style={{ color: '#5a5550' }} />
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
                                className="p-2 rounded hover:bg-gray-100"
                              >
                                <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: '#8a857f' }} />
                              <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>
                                Nuvilkite .eml failą arba spustelėkite
                              </p>
                              <p className="text-xs" style={{ color: '#8a857f' }}>
                                Reikalingas .eml formatas
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
                        className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: selectedFile ? '#3d3935' : '#e8e5e0',
                          color: selectedFile ? 'white' : '#8a857f'
                        }}
                      >
                        Įkelti Užklausą
                      </button>
                    </>
                  )}

                  {/* Upload Solution Options */}
                  {selectedCard === 'upload-solution' && (
                    <>
                      {/* Description */}
                      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg text-sm" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
                        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#5a5550' }} />
                        <div style={{ color: '#5a5550' }}>
                          <strong>Pasirinkite esamą projektą</strong> ir įkelkite komercinį pasiūlymą arba sprendimo dokumentą (PDF, Word, Excel).
                        </div>
                      </div>

                      {/* Project Selection */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Pasirinkite projektą
                        </label>
                        <div className="relative" ref={projectDropdownRef}>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#8a857f' }} />
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
                              placeholder="Ieškokite pagal projekto pavadinimą..."
                              className="w-full pl-10 pr-10 py-3 text-sm border rounded-lg"
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
                                <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                              </button>
                            ) : (
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#8a857f' }} />
                            )}
                          </div>

                          {/* Dropdown */}
                          {showProjectDropdown && !selectedProject && (
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                              {loadingProjects ? (
                                <div className="p-4 text-center">
                                  <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#5a5550' }} />
                                </div>
                              ) : projects.length === 0 ? (
                                <div className="p-4 text-center text-sm" style={{ color: '#8a857f' }}>
                                  Projektų nerasta
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
                                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded text-sm transition-colors"
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

                      {/* File Upload for Solution */}
                      {selectedProject && (
                        <>
                          <div>
                            <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                              Įkelti dokumentą
                            </label>
                            <div
                              onDrop={handleFileDrop}
                              onDragOver={handleDragOver}
                              onClick={triggerFileUpload}
                              className="border-2 border-dashed rounded-lg px-5 py-8 text-center cursor-pointer transition-all"
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
                                    <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: '#f0ede8' }}>
                                      <FileText className="w-5 h-5" style={{ color: '#5a5550' }} />
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
                                    className="p-2 rounded hover:bg-gray-100"
                                  >
                                    <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: '#8a857f' }} />
                                  <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>
                                    Nuvilkite failą arba spustelėkite
                                  </p>
                                  <p className="text-xs" style={{ color: '#8a857f' }}>
                                    Priimami: PDF, Word, Excel, TXT
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
                            className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: selectedFile ? '#3d3935' : '#e8e5e0',
                              color: selectedFile ? 'white' : '#8a857f'
                            }}
                          >
                            Įkelti Komercinį Pasiūlymą
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {/* Find Similar Options */}
                  {selectedCard === 'find-similar' && (
                    <>
                      {/* Description */}
                      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg text-sm" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
                        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#5a5550' }} />
                        <div style={{ color: '#5a5550' }}>
                          <strong>Įkelkite .eml formato failą</strong> – sistema ras panašius gaminius ir pateiks susijusius dokumentus, įskaitant PDF ir komercinius pasiūlymus.
                        </div>
                      </div>

                      {/* Upload Area */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Pasirinkite failą
                        </label>
                        <div
                          onDrop={handleFileDrop}
                          onDragOver={handleDragOver}
                          onClick={triggerFileUpload}
                          className="border-2 border-dashed rounded-lg px-5 py-8 text-center cursor-pointer transition-all"
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
                                <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: '#f0ede8' }}>
                                  <FileArchive className="w-5 h-5" style={{ color: '#5a5550' }} />
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
                                className="p-2 rounded hover:bg-gray-100"
                              >
                                <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: '#8a857f' }} />
                              <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>
                                Nuvilkite .eml failą arba spustelėkite
                              </p>
                              <p className="text-xs" style={{ color: '#8a857f' }}>
                                Reikalingas .eml formatas
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
                        className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: selectedFile ? '#3d3935' : '#e8e5e0',
                          color: selectedFile ? 'white' : '#8a857f'
                        }}
                      >
                        Rasti Panašius Gaminius
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {uploading && (
            <div className="py-20 text-center max-w-3xl mx-auto">
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: '#5a5550' }} />
              <p className="text-base font-semibold mb-2" style={{ color: '#3d3935' }}>
                Apdorojama jūsų užklausa
              </p>
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Palaukite, kol apdorosime jūsų failą...
              </p>
            </div>
          )}

          {/* Response Display */}
          {response && !uploading && (
            <div className="space-y-5 max-w-3xl mx-auto">
              {/* Success Message */}
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <Check className="w-5 h-5" style={{ color: '#16a34a' }} />
                <span className="text-sm font-semibold" style={{ color: '#166534' }}>
                  {response.message || 'Operacija sėkmingai užbaigta'}
                </span>
              </div>

              {/* Subject Line & Description */}
              {response.subjectLine && (
                <div className="p-5 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                  <p className="text-base font-semibold mb-2" style={{ color: '#3d3935' }}>
                    {response.subjectLine}
                  </p>
                  {response.description && (
                    <p className="text-sm leading-relaxed" style={{ color: '#5a5550' }}>
                      {response.description}
                    </p>
                  )}
                </div>
              )}

              {/* Files */}
              {(response.emlFile || response.attachmentFile) && (
                <div className="space-y-3">
                  {response.emlFile && (
                    <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0ede8' }}>
                          <FileText className="w-5 h-5" style={{ color: '#5a5550' }} />
                        </div>
                        <span className="text-sm truncate font-medium" style={{ color: '#3d3935' }}>
                          {response.emlFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.emlFile!)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border"
                        style={{ background: 'white', color: '#3d3935', borderColor: '#e8e5e0' }}
                      >
                        Atsisiųsti
                      </button>
                    </div>
                  )}

                  {response.attachmentFile && (
                    <div className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0ede8' }}>
                          <FileText className="w-5 h-5" style={{ color: '#5a5550' }} />
                        </div>
                        <span className="text-sm truncate font-medium" style={{ color: '#3d3935' }}>
                          {response.attachmentFile.filename}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadFile(response.attachmentFile!)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border"
                        style={{ background: 'white', color: '#3d3935', borderColor: '#e8e5e0' }}
                      >
                        Atsisiųsti
                      </button>
                    </div>
                  )}

                  {response.emlFile && response.attachmentFile && (
                    <button
                      onClick={() => {
                        if (response.emlFile) downloadFile(response.emlFile);
                        if (response.attachmentFile) downloadFile(response.attachmentFile);
                      }}
                      className="w-full py-2.5 rounded-lg text-sm font-medium border"
                      style={{ borderColor: '#e8e5e0', color: '#3d3935', background: 'white' }}
                    >
                      Atsisiųsti visus failus
                    </button>
                  )}
                </div>
              )}

              {/* New Operation */}
              <button
                onClick={resetForm}
                className="w-full py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: '#e8e5e0', color: '#5a5550', background: 'white' }}
              >
                Pradėti naują operaciją
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
