import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Coins, Download, Info } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { fetchNestandardiniaiProjects, searchProjectsBySubjectLine, NestandardinisProject } from '../lib/nestandardiniaiService';
import { getWebhookUrl } from '../lib/webhooksService';
import { colors } from '../lib/designSystem';
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
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WebhookResponse | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New request state
  const [requestName, setRequestName] = useState('');
  const [requestText, setRequestText] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [selectedEmlFile, setSelectedEmlFile] = useState<File | null>(null);
  const documentsInputRef = useRef<HTMLInputElement>(null);
  const emlInputRef = useRef<HTMLInputElement>(null);

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
    if (selectedCard === 'find-similar') {
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

  const handleDocumentsSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.bmp'];

    const invalidFiles = filesArray.filter(file => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      return !allowedExtensions.includes(fileExtension);
    });

    if (invalidFiles.length > 0) {
      setError('Prašome pasirinkti tik PDF, DOC, DOCX, JPG, JPEG, PNG arba BMP failus');
      return;
    }

    setSelectedDocuments(prev => [...prev, ...filesArray]);
    setError(null);
  };

  const removeDocument = (index: number) => {
    setSelectedDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleEmlFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== '.eml') {
      setError('Prašome pasirinkti .eml formato failą');
      return;
    }

    setSelectedEmlFile(file);

    // Read the .eml file content and set it as the request text
    try {
      const text = await file.text();
      setRequestText(text);
      setError(null);
    } catch (err) {
      console.error('Error reading .eml file:', err);
      setError('Nepavyko perskaityti .eml failo');
    }
  };

  const removeEmlFile = () => {
    setSelectedEmlFile(null);
    setRequestText('');
    if (emlInputRef.current) {
      emlInputRef.current.value = '';
    }
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    // Check file type
    if (selectedCard === 'find-similar') {
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

  const handleDocumentsDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.bmp'];

    const invalidFiles = filesArray.filter(file => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      return !allowedExtensions.includes(fileExtension);
    });

    if (invalidFiles.length > 0) {
      setError('Prašome pasirinkti tik PDF, DOC, DOCX, JPG, JPEG, PNG arba BMP failus');
      return;
    }

    setSelectedDocuments(prev => [...prev, ...filesArray]);
    setError(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    // Validation
    if (selectedCard === 'new-request') {
      if (!requestName.trim()) {
        setError('Prašome įvesti užklausos pavadinimą');
        return;
      }
      if (!requestText.trim()) {
        setError('Prašome įvesti pokalbį su užsakovu');
        return;
      }
    } else if (selectedCard === 'find-similar') {
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
    setUploadSuccess(false);
    setError(null);
    setSuccessMessage(null);

    try {
      if (selectedCard === 'new-request') {
        await handleNewRequest();
        setSuccessMessage('Užklausa sėkmingai pateikta!');
      } else if (selectedCard === 'find-similar') {
        await handleFindSimilar();
        setSuccessMessage('Paieška sėkmingai įvykdyta!');
      } else if (selectedCard === 'upload-solution') {
        await handleUploadSolution();
        setSuccessMessage('Sprendimas sėkmingai įkeltas!');
      }
      setUploadSuccess(true);

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(`Operacija nepavyko: ${error.message}`);
      setUploadSuccess(false);
    } finally {
      setUploading(false);
    }
  };

  const handleNewRequest = async () => {
    if (!requestName || !requestText) return;

    await appLogger.logDocument({
      action: 'new_request_started',
      userId: user.id,
      userEmail: user.email,
      filename: requestName,
      fileSize: selectedDocuments.reduce((sum, doc) => sum + doc.size, 0) + (selectedEmlFile?.size || 0),
      metadata: {
        project_id: projectId,
        upload_action: 'new-request',
        document_count: selectedDocuments.length,
        request_name: requestName,
        has_eml_file: !!selectedEmlFile
      }
    });

    const webhookUrl = await getWebhookUrl('n8n_upload_new');

    if (!webhookUrl) {
      throw new Error('Webhook "n8n_upload_new" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose.');
    }

    // Use FormData for binary file upload
    const formData = new FormData();
    formData.append('action', 'new-request');
    formData.append('requestName', requestName);
    formData.append('requestText', requestText);
    formData.append('userId', user.id);
    formData.append('userEmail', user.email);
    formData.append('projectId', projectId);
    formData.append('timestamp', new Date().toISOString());

    // Append the .eml file if it exists
    if (selectedEmlFile) {
      formData.append('emlFile', selectedEmlFile, selectedEmlFile.name);
    }

    // Append all documents
    selectedDocuments.forEach((doc, index) => {
      formData.append(`documents`, doc);
    });

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook užklausa nepavyko: ${webhookResponse.statusText}`);
    }

    // Handle response - can be JSON or plain text "Success"
    const responseText = await webhookResponse.text();
    let responseData: WebhookResponse;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Plain text response (e.g., "Success")
      responseData = {
        subjectLine: requestName,
        description: responseText || 'Užklausa sėkmingai pateikta',
        message: responseText || 'Success'
      };
    }

    await appLogger.logDocument({
      action: 'new_request_success',
      userId: user.id,
      userEmail: user.email,
      filename: requestName,
      fileSize: selectedDocuments.reduce((sum, doc) => sum + doc.size, 0) + (selectedEmlFile?.size || 0),
      metadata: {
        project_id: projectId,
        subject_line: responseData.subjectLine || requestName,
        upload_action: 'new-request',
        document_count: selectedDocuments.length,
        has_eml_file: !!selectedEmlFile
      }
    });
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

    // Handle response - can be JSON or plain text "Success"
    const responseText = await webhookResponse.text();
    let responseData: WebhookResponse;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Plain text response (e.g., "Success")
      responseData = {
        subjectLine: selectedFile.name,
        description: responseText || 'Paieška atlikta sėkmingai',
        message: responseText || 'Success'
      };
    }

    await appLogger.logDocument({
      action: 'eml_search_success',
      userId: user.id,
      userEmail: user.email,
      filename: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        project_id: projectId,
        subject_line: responseData.subjectLine || selectedFile.name,
        upload_action: 'find-similar'
      }
    });
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

    // Handle response - can be JSON or plain text "Success"
    const responseText = await webhookResponse.text();
    let responseData: WebhookResponse;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Plain text response (e.g., "Success")
      responseData = {
        subjectLine: selectedProject.subject_line,
        description: responseText || 'Komercinis pasiūlymas sėkmingai įkeltas',
        message: responseText || 'Success'
      };
    }

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
    setSuccessMessage(null);
    setUploadSuccess(false);
    setSelectedCard(null);
    setRequestName('');
    setRequestText('');
    setSelectedDocuments([]);
    setSelectedEmlFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (documentsInputRef.current) documentsInputRef.current.value = '';
    if (emlInputRef.current) emlInputRef.current.value = '';
  };

  const handleCardSelect = (card: SelectedCard) => {
    // Reset form when switching cards
    setSelectedFile(null);
    setSelectedProject(null);
    setProjectSearchQuery('');
    setError(null);
    setResponse(null);
    setRequestName('');
    setRequestText('');
    setSelectedDocuments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (documentsInputRef.current) documentsInputRef.current.value = '';

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
              {/* Card hover styles */}
              <style>{`
                .card-wrapper:not(.selected):not(.dimmed):hover {
                  box-shadow: ${colors.shadow.tealGlow} !important;
                  border-color: ${colors.accent.tealLight} !important;
                }
              `}</style>

              {/* Three Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Card 1: New Request */}
                <div
                  className={`card-wrapper rounded-xl transition-all duration-300 ${
                    selectedCard === 'new-request'
                      ? 'selected scale-105 z-10'
                      : selectedCard
                        ? 'dimmed opacity-50 scale-95'
                        : ''
                  }`}
                  style={{
                    background: colors.bg.white,
                    border: selectedCard === 'new-request'
                      ? `2px solid ${colors.border.dark}`
                      : `1px solid ${colors.border.default}`,
                    transform: selectedCard === 'new-request' ? 'translateY(-4px)' : undefined,
                    boxShadow: selectedCard === 'new-request'
                      ? colors.shadow.lg
                      : colors.shadow.sm
                  }}
                >
                  <button
                    onClick={() => handleCardSelect('new-request')}
                    className={`w-full p-5 rounded-xl text-left transition-all duration-200 ${
                      !selectedCard ? 'hover:scale-[0.99]' : ''
                    }`}
                    style={{
                      background: 'transparent'
                    }}
                  >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'new-request' ? colors.interactive.iconBgActive : colors.interactive.iconBg }}>
                    <Upload className="w-6 h-6" style={{ color: selectedCard === 'new-request' ? colors.bg.white : colors.text.secondary }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: colors.text.primary, fontSize: '15px' }}>
                    Pateikti naują užklausą
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: colors.text.tertiary }}>
                    Įveskite užklausos tekstą ir įkelkite dokumentus
                  </p>
                  </button>
                </div>

                {/* Card 2: Upload Solution */}
                <div
                  className={`card-wrapper rounded-xl transition-all duration-300 ${
                    selectedCard === 'upload-solution'
                      ? 'selected scale-105 z-10'
                      : selectedCard
                        ? 'dimmed opacity-50 scale-95'
                        : ''
                  }`}
                  style={{
                    background: colors.bg.white,
                    border: selectedCard === 'upload-solution'
                      ? `2px solid ${colors.border.dark}`
                      : `1px solid ${colors.border.default}`,
                    transform: selectedCard === 'upload-solution' ? 'translateY(-4px)' : undefined,
                    boxShadow: selectedCard === 'upload-solution'
                      ? colors.shadow.lg
                      : colors.shadow.sm
                  }}
                >
                  <button
                    onClick={() => handleCardSelect('upload-solution')}
                    className={`w-full p-5 rounded-xl text-left transition-all duration-200 ${
                      !selectedCard ? 'hover:scale-[0.99]' : ''
                    }`}
                    style={{
                      background: 'transparent'
                    }}
                  >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'upload-solution' ? colors.interactive.iconBgActive : colors.interactive.iconBg }}>
                    <Coins className="w-6 h-6" style={{ color: selectedCard === 'upload-solution' ? colors.bg.white : colors.text.secondary }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: colors.text.primary, fontSize: '15px' }}>
                    Pateikti sprendimą užklausai
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: colors.text.tertiary }}>
                    Įkelti komercinį pasiūlymą projektui
                  </p>
                  </button>
                </div>

                {/* Card 3: Find Similar */}
                <div
                  className={`card-wrapper rounded-xl transition-all duration-300 ${
                    selectedCard === 'find-similar'
                      ? 'selected scale-105 z-10'
                      : selectedCard
                        ? 'dimmed opacity-50 scale-95'
                        : ''
                  }`}
                  style={{
                    background: colors.bg.white,
                    border: selectedCard === 'find-similar'
                      ? `2px solid ${colors.border.dark}`
                      : `1px solid ${colors.border.default}`,
                    transform: selectedCard === 'find-similar' ? 'translateY(-4px)' : undefined,
                    boxShadow: selectedCard === 'find-similar'
                      ? colors.shadow.lg
                      : colors.shadow.sm
                  }}
                >
                  <button
                    onClick={() => handleCardSelect('find-similar')}
                    className={`w-full p-5 rounded-xl text-left transition-all duration-200 ${
                      !selectedCard ? 'hover:scale-[0.99]' : ''
                    }`}
                    style={{
                      background: 'transparent'
                    }}
                  >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                       style={{ background: selectedCard === 'find-similar' ? colors.interactive.iconBgActive : colors.interactive.iconBg }}>
                    <Search className="w-6 h-6" style={{ color: selectedCard === 'find-similar' ? colors.bg.white : colors.text.secondary }} />
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: colors.text.primary, fontSize: '15px' }}>
                    Rasti panašius
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: colors.text.tertiary }}>
                    Ieškoti panašių gaminių ir dokumentų
                  </p>
                  </button>
                </div>
              </div>

              {/* Loader when waiting for card selection */}
              {!selectedCard && (
                <div className="py-12 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-3 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
                  <p className="text-sm" style={{ color: '#8a857f' }}>
                    Pasirinkite operaciją
                  </p>
                </div>
              )}

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
                          <strong>Pateikite naują užklausą į duombazę</strong> – įveskite užklausos pavadinimą, susirašinėjimą su užsakovu ir, pasirinktinai, priedus.
                        </div>
                      </div>

                      {/* Request Name Input */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Užklausos pavadinimas
                        </label>
                        <input
                          type="text"
                          value={requestName}
                          onChange={(e) => setRequestName(e.target.value)}
                          placeholder="Pvz.: Įmonės pavadinimas + užklausa + 1"
                          className="w-full px-4 py-3 text-sm border rounded-lg"
                          style={{ borderColor: '#e8e5e0', background: 'white', color: '#3d3935' }}
                        />
                        <p className="text-xs mt-1.5" style={{ color: '#8a857f' }}>
                          Rekomenduojama: Įmonės pavadinimas + užklausos aprašymas + indeksas (1, 2, 3...)
                        </p>
                      </div>

                      {/* EML File Upload */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Pokalbis su užsakovu (.eml failas)
                        </label>

                        {!selectedEmlFile ? (
                          <button
                            onClick={() => emlInputRef.current?.click()}
                            className="w-full px-4 py-6 text-sm border-2 border-dashed rounded-lg transition-all hover:border-solid"
                            style={{
                              borderColor: '#e8e5e0',
                              background: '#fafaf9',
                              color: '#5a5550'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#5a5550';
                              e.currentTarget.style.background = '#f5f4f2';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#e8e5e0';
                              e.currentTarget.style.background = '#fafaf9';
                            }}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Upload className="w-6 h-6" style={{ color: '#8a857f' }} />
                              <span className="font-medium">Pasirinkite .eml failą</span>
                              <span className="text-xs" style={{ color: '#8a857f' }}>
                                El. pašto susirašinėjimo failas
                              </span>
                            </div>
                          </button>
                        ) : (
                          <div className="border rounded-lg p-4" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded" style={{ background: '#f0ede8' }}>
                                  <FileText className="w-5 h-5" style={{ color: '#5a5550' }} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium" style={{ color: '#3d3935' }}>
                                    {selectedEmlFile.name}
                                  </p>
                                  <p className="text-xs" style={{ color: '#8a857f' }}>
                                    {(selectedEmlFile.size / 1024).toFixed(2)} KB
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={removeEmlFile}
                                className="p-2 rounded hover:bg-gray-100"
                              >
                                <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                              </button>
                            </div>
                            {requestText && (
                              <div className="mt-3 p-3 rounded text-xs max-h-32 overflow-y-auto" style={{ background: '#fafaf9', color: '#5a5550' }}>
                                <pre className="whitespace-pre-wrap font-mono">{requestText.substring(0, 500)}{requestText.length > 500 ? '...' : ''}</pre>
                              </div>
                            )}
                          </div>
                        )}

                        <input
                          ref={emlInputRef}
                          type="file"
                          onChange={handleEmlFileSelection}
                          className="hidden"
                          accept=".eml"
                        />

                        <p className="text-xs mt-1.5" style={{ color: '#8a857f' }}>
                          Įkelkite .eml formatą el. pašto failą su pilnu susirašinėjimu
                        </p>
                      </div>

                      {/* Optional: Manual text input fallback */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Arba įveskite tekstą rankiniu būdu
                        </label>
                        <textarea
                          value={selectedEmlFile ? '' : requestText}
                          onChange={(e) => {
                            if (!selectedEmlFile) {
                              setRequestText(e.target.value);
                            }
                          }}
                          disabled={!!selectedEmlFile}
                          placeholder="Įklijuokite tikslų el. pašto susirašinėjimą su užsakovu..."
                          rows={6}
                          className="w-full px-4 py-3 text-sm border rounded-lg resize-none"
                          style={{ borderColor: '#e8e5e0', background: 'white', color: '#3d3935' }}
                        />
                      </div>

                      {/* Document Upload Area */}
                      <div>
                        <label className="text-sm font-semibold block mb-2.5" style={{ color: '#5a5550' }}>
                          Dokumentai {selectedDocuments.length > 0 && `(${selectedDocuments.length})`}
                        </label>
                        <div
                          onDrop={handleDocumentsDrop}
                          onDragOver={handleDragOver}
                          onClick={() => documentsInputRef.current?.click()}
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
                          <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: '#8a857f' }} />
                          <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>
                            Nuvilkite dokumentus arba spustelėkite
                          </p>
                          <p className="text-xs" style={{ color: '#8a857f' }}>
                            Priimami: PDF, DOC, DOCX, ekrano nuotraukos (PNG, JPG, BMP)
                          </p>
                        </div>

                        {/* Selected Documents List */}
                        {selectedDocuments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {selectedDocuments.map((doc, index) => (
                              <div key={index} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: '#e8e5e0', background: 'white' }}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0ede8' }}>
                                    <FileText className="w-5 h-5" style={{ color: '#5a5550' }} />
                                  </div>
                                  <div className="text-left flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: '#3d3935' }}>
                                      {doc.name}
                                    </p>
                                    <p className="text-xs" style={{ color: '#8a857f' }}>
                                      {(doc.size / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeDocument(index);
                                  }}
                                  className="p-2 rounded hover:bg-gray-100 flex-shrink-0"
                                >
                                  <X className="w-5 h-5" style={{ color: '#8a857f' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        ref={documentsInputRef}
                        type="file"
                        onChange={handleDocumentsSelection}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.bmp"
                        multiple
                      />

                      {/* Submit Button with animated states */}
                      <button
                        onClick={handleSubmit}
                        disabled={!requestName.trim() || !requestText.trim() || uploading || uploadSuccess}
                        className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
                        style={{
                          background: uploadSuccess ? '#10b981' : (requestName.trim() && requestText.trim() && !uploading) ? '#3d3935' : '#e8e5e0',
                          color: (requestName.trim() && requestText.trim()) || uploading || uploadSuccess ? 'white' : '#8a857f'
                        }}
                      >
                        <span className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${uploading || uploadSuccess ? 'opacity-0' : 'opacity-100'}`}>
                          Pateikti Užklausą
                        </span>

                        {/* Loader state */}
                        {uploading && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </span>
                        )}

                        {/* Success state */}
                        {uploadSuccess && !uploading && (
                          <span className="absolute inset-0 flex items-center justify-center animate-fade-in">
                            <Check className="w-5 h-5" />
                          </span>
                        )}
                      </button>

                      {/* Success/Error messages */}
                      {successMessage && !uploading && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg animate-fade-in" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} />
                          <span className="text-sm" style={{ color: '#166534' }}>{successMessage}</span>
                        </div>
                      )}

                      <style>{`
                        @keyframes fade-in {
                          from { opacity: 0; transform: scale(0.95); }
                          to { opacity: 1; transform: scale(1); }
                        }
                        .animate-fade-in {
                          animation: fade-in 0.3s ease-out;
                        }
                      `}</style>
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
                                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-blue-500 mx-auto"></div>
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
        </div>
      </div>
    </div>
  );
}
