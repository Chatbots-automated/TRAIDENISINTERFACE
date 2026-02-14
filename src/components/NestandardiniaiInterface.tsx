import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2, Search, ChevronDown, Coins, Download, Info } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { fetchProjects, searchProjects, VectorStoreProject } from '../lib/nestandardiniaiService';
import { getWebhookUrl } from '../lib/webhooksService';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';

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
  const [projects, setProjects] = useState<VectorStoreProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<VectorStoreProject | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Notification helper functions
  const addNotification = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title, message }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

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
      const projectsData = await fetchProjects();
      setProjects(projectsData);
    } catch (error) {
      console.error('Error loading projects:', error);
      addNotification('error', 'Klaida', 'Nepavyko užkrauti projektų sąrašo');
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
      const results = await searchProjects(query);
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
        addNotification('error', 'Klaida', 'Prašome pasirinkti .eml formato failą');
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
      addNotification('error', 'Klaida', 'Prašome pasirinkti tik PDF, DOC, DOCX, JPG, JPEG, PNG arba BMP failus');
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
      addNotification('error', 'Klaida', 'Prašome pasirinkti .eml formato failą');
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
      addNotification('error', 'Klaida', 'Nepavyko perskaityti .eml failo');
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
        addNotification('error', 'Klaida', 'Prašome pasirinkti .eml formato failą');
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
      addNotification('error', 'Klaida', 'Prašome pasirinkti tik PDF, DOC, DOCX, JPG, JPEG, PNG arba BMP failus');
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
        addNotification('error', 'Klaida', 'Prašome įvesti užklausos pavadinimą');
        return;
      }
      if (!requestText.trim()) {
        addNotification('error', 'Klaida', 'Prašome įvesti pokalbį su užsakovu');
        return;
      }
    } else if (selectedCard === 'find-similar') {
      if (!selectedFile) {
        addNotification('error', 'Klaida', 'Prašome pasirinkti failą');
        return;
      }
    } else if (selectedCard === 'upload-solution') {
      if (!selectedProject) {
        addNotification('error', 'Klaida', 'Prašome pasirinkti projektą');
        return;
      }
      if (!selectedFile) {
        addNotification('error', 'Klaida', 'Prašome pasirinkti failą');
        return;
      }
    }

    setUploading(true);
    setUploadSuccess(false);
    setError(null);
    setSuccessMessage(null);

    try {
      let successMsg = '';

      if (selectedCard === 'new-request') {
        await handleNewRequest();
        successMsg = 'Užklausa sėkmingai pateikta!';
      } else if (selectedCard === 'find-similar') {
        await handleFindSimilar();
        successMsg = 'Paieška sėkmingai įvykdyta!';
      } else if (selectedCard === 'upload-solution') {
        await handleUploadSolution();
        successMsg = 'Sprendimas sėkmingai įkeltas!';
      }

      setUploadSuccess(true);
      addNotification('success', 'Sėkmė', successMsg);

      // Reset form and button after showing checkmark
      setTimeout(() => {
        setUploadSuccess(false);
        setUploading(false);

        // Clear form data
        if (selectedCard === 'new-request') {
          setRequestName('');
          setRequestText('');
          setSelectedEmlFile(null);
          setSelectedDocuments([]);
          if (emlInputRef.current) emlInputRef.current.value = '';
          if (documentsInputRef.current) documentsInputRef.current.value = '';
        } else if (selectedCard === 'find-similar' || selectedCard === 'upload-solution') {
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }

        if (selectedCard === 'upload-solution') {
          setSelectedProject(null);
          setProjectSearchQuery('');
        }
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      addNotification('error', 'Klaida', `Operacija nepavyko: ${error.message}`);
      setUploadSuccess(false);
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
        project_name: responseData.subjectLine || requestName,
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
        project_name: responseData.subjectLine || selectedFile.name,
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
        vector_store_id: selectedProject.id,
        project_name: selectedProject.project_name,
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
    formData.append('vectorStoreId', String(selectedProject.id));
    formData.append('projectName', selectedProject.project_name);
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
        subjectLine: selectedProject.project_name,
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
        vector_store_id: selectedProject.id,
        project_name: selectedProject.project_name
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
      addNotification('error', 'Klaida', 'Nepavyko atsisiųsti failo');
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
    <div className="h-full flex flex-col bg-base-200/50">
      {/* Notification Container */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />

      {/* Header */}
      <div className="px-6 py-5 border-b border-base-content/10 bg-base-100/80">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold text-base-content">
            Nestandartiniai Projektai
          </h1>
          <p className="text-sm mt-1 text-base-content/60">
            Tvarkykite užklausas, sprendimus ir paieškos rezultatus
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
              {/* Three Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Card 1: New Request */}
                <button
                  onClick={() => handleCardSelect('new-request')}
                  className={`group text-left rounded-xl border transition-all duration-200 p-5 ${
                    selectedCard === 'new-request'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20 scale-[1.02]'
                      : selectedCard
                        ? 'border-base-content/10 bg-base-100 opacity-50 scale-[0.98]'
                        : 'border-base-content/10 bg-base-100 hover:border-primary/30 hover:shadow-md'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                    selectedCard === 'new-request' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60'
                  }`}>
                    <Upload className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm text-base-content mb-1">
                    Pateikti naują užklausą
                  </h3>
                  <p className="text-xs text-base-content/50 leading-relaxed">
                    Įveskite užklausos tekstą ir įkelkite dokumentus
                  </p>
                </button>

                {/* Card 2: Upload Solution */}
                <button
                  onClick={() => handleCardSelect('upload-solution')}
                  className={`group text-left rounded-xl border transition-all duration-200 p-5 ${
                    selectedCard === 'upload-solution'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20 scale-[1.02]'
                      : selectedCard
                        ? 'border-base-content/10 bg-base-100 opacity-50 scale-[0.98]'
                        : 'border-base-content/10 bg-base-100 hover:border-primary/30 hover:shadow-md'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                    selectedCard === 'upload-solution' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60'
                  }`}>
                    <Coins className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm text-base-content mb-1">
                    Pateikti sprendimą užklausai
                  </h3>
                  <p className="text-xs text-base-content/50 leading-relaxed">
                    Įkelti komercinį pasiūlymą projektui
                  </p>
                </button>

                {/* Card 3: Find Similar */}
                <button
                  onClick={() => handleCardSelect('find-similar')}
                  className={`group text-left rounded-xl border transition-all duration-200 p-5 ${
                    selectedCard === 'find-similar'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20 scale-[1.02]'
                      : selectedCard
                        ? 'border-base-content/10 bg-base-100 opacity-50 scale-[0.98]'
                        : 'border-base-content/10 bg-base-100 hover:border-primary/30 hover:shadow-md'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                    selectedCard === 'find-similar' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/60'
                  }`}>
                    <Search className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm text-base-content mb-1">
                    Rasti panašius
                  </h3>
                  <p className="text-xs text-base-content/50 leading-relaxed">
                    Ieškoti panašių gaminių ir dokumentų
                  </p>
                </button>
              </div>

              {/* Waiting state */}
              {!selectedCard && (
                <div className="py-16 text-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                  <p className="text-sm mt-4 text-base-content/50">
                    Pasirinkite operaciją
                  </p>
                </div>
              )}

              {/* Options Area - Appears with animation */}
              {selectedCard && (
                <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">

                  {/* New Request Options */}
                  {selectedCard === 'new-request' && (
                    <>
                      {/* Description */}
                      <div className="alert alert-soft alert-info text-xs">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <strong>Pateikite naują užklausą į duombazę</strong> – įveskite užklausos pavadinimą, susirašinėjimą su užsakovu ir, pasirinktinai, priedus.
                        </div>
                      </div>

                      {/* Request Name Input */}
                      <div>
                        <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                          Užklausos pavadinimas
                        </label>
                        <input
                          type="text"
                          value={requestName}
                          onChange={(e) => setRequestName(e.target.value)}
                          placeholder="Pvz.: Įmonės pavadinimas + užklausa + 1"
                          className="input input-sm w-full"
                        />
                        <p className="text-xs mt-1 text-base-content/40">
                          Rekomenduojama: Įmonės pavadinimas + užklausos aprašymas + indeksas (1, 2, 3...)
                        </p>
                      </div>

                      {/* Two-column layout for EML and Documents */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* EML File Upload */}
                        <div>
                          <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                            Pokalbis su užsakovu (.eml)
                          </label>

                          {!selectedEmlFile ? (
                            <button
                              onClick={() => emlInputRef.current?.click()}
                              className="w-full px-3 py-5 text-xs border-2 border-dashed border-base-content/15 rounded-lg bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-all"
                            >
                              <div className="flex flex-col items-center gap-1.5">
                                <Upload className="w-5 h-5 text-base-content/30" />
                                <span className="font-medium text-base-content/60">Pasirinkite .eml failą</span>
                                <span className="text-base-content/40">El. pašto susirašinėjimas</span>
                              </div>
                            </button>
                          ) : (
                            <div className="border border-base-content/10 rounded-lg p-3 bg-base-100">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-1.5 rounded bg-base-200 flex-shrink-0">
                                    <FileText className="w-4 h-4 text-base-content/60" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-base-content truncate">
                                      {selectedEmlFile.name}
                                    </p>
                                    <p className="text-xs text-base-content/40">
                                      {(selectedEmlFile.size / 1024).toFixed(1)} KB
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={removeEmlFile}
                                  className="btn btn-circle btn-text btn-xs"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          <input
                            ref={emlInputRef}
                            type="file"
                            onChange={handleEmlFileSelection}
                            className="hidden"
                            accept=".eml"
                          />
                        </div>

                        {/* Document Upload Area */}
                        <div>
                          <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                            Dokumentai {selectedDocuments.length > 0 && `(${selectedDocuments.length})`}
                          </label>
                          <div
                            onDrop={handleDocumentsDrop}
                            onDragOver={handleDragOver}
                            onClick={() => documentsInputRef.current?.click()}
                            className="border-2 border-dashed border-base-content/15 rounded-lg px-3 py-5 text-center cursor-pointer bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-all"
                          >
                            <Upload className="w-5 h-5 mx-auto mb-1.5 text-base-content/30" />
                            <p className="text-xs font-medium text-base-content/60 mb-0.5">
                              Nuvilkite dokumentus
                            </p>
                            <p className="text-xs text-base-content/40">
                              PDF, DOC, PNG, JPG, BMP
                            </p>
                          </div>

                          <input
                            ref={documentsInputRef}
                            type="file"
                            onChange={handleDocumentsSelection}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.bmp"
                            multiple
                          />
                        </div>
                      </div>

                      {/* Selected Documents List */}
                      {selectedDocuments.length > 0 && (
                        <div className="space-y-1.5">
                          {selectedDocuments.map((doc, index) => (
                            <div key={index} className="flex items-center justify-between p-2.5 rounded-lg border border-base-content/10 bg-base-100">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-base-200">
                                  <FileText className="w-4 h-4 text-base-content/60" />
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content truncate">
                                    {doc.name}
                                  </p>
                                  <p className="text-xs text-base-content/40">
                                    {(doc.size / (1024 * 1024)).toFixed(2)} MB
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeDocument(index);
                                }}
                                className="btn btn-circle btn-text btn-xs"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        onClick={handleSubmit}
                        disabled={!requestName.trim() || !requestText.trim() || uploading || uploadSuccess}
                        className={`btn w-full ${uploadSuccess ? 'btn-success' : 'btn-primary'} relative overflow-hidden`}
                      >
                        <span className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${uploading || uploadSuccess ? 'opacity-0' : 'opacity-100'}`}>
                          Pateikti Užklausą
                        </span>

                        {/* Loader state */}
                        {uploading && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="loading loading-spinner loading-sm"></span>
                          </span>
                        )}

                        {/* Success state */}
                        {uploadSuccess && !uploading && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-5 h-5" />
                          </span>
                        )}
                      </button>
                    </>
                  )}

                  {/* Upload Solution Options */}
                  {selectedCard === 'upload-solution' && (
                    <>
                      {/* Description */}
                      <div className="alert alert-soft alert-info text-xs">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <strong>Pasirinkite esamą projektą</strong> ir įkelkite komercinį pasiūlymą arba sprendimo dokumentą (PDF, Word, Excel).
                        </div>
                      </div>

                      {/* Project Selection */}
                      <div>
                        <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                          Pasirinkite projektą
                        </label>
                        <div className="relative" ref={projectDropdownRef}>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/40" />
                            <input
                              type="text"
                              value={selectedProject ? selectedProject.project_name : projectSearchQuery}
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
                              className="input input-sm w-full pl-9 pr-9"
                            />
                            {selectedProject ? (
                              <button
                                onClick={() => {
                                  setSelectedProject(null);
                                  setProjectSearchQuery('');
                                  loadProjects();
                                }}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 btn btn-circle btn-text btn-xs"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-base-content/40" />
                            )}
                          </div>

                          {/* Dropdown */}
                          {showProjectDropdown && !selectedProject && (
                            <div className="absolute z-10 w-full mt-1 bg-base-100 border border-base-content/10 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              {loadingProjects ? (
                                <div className="p-4 text-center">
                                  <span className="loading loading-spinner loading-sm text-primary"></span>
                                </div>
                              ) : projects.length === 0 ? (
                                <div className="p-4 text-center text-sm text-base-content/50">
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
                                      className="w-full text-left px-3 py-2.5 hover:bg-base-200 rounded text-sm text-base-content transition-colors"
                                    >
                                      {project.project_name}
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
                            <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                              Įkelti dokumentą
                            </label>
                            <div
                              onDrop={handleFileDrop}
                              onDragOver={handleDragOver}
                              onClick={triggerFileUpload}
                              className="border-2 border-dashed border-base-content/15 rounded-lg px-3 py-5 text-center cursor-pointer bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-all"
                            >
                              {selectedFile ? (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded flex items-center justify-center bg-base-200">
                                      <FileText className="w-4 h-4 text-base-content/60" />
                                    </div>
                                    <div className="text-left">
                                      <p className="text-xs font-medium text-base-content">
                                        {selectedFile.name}
                                      </p>
                                      <p className="text-xs text-base-content/40">
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
                                    className="btn btn-circle btn-text btn-xs"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 mx-auto mb-1.5 text-base-content/30" />
                                  <p className="text-xs font-medium text-base-content/60 mb-0.5">
                                    Nuvilkite failą arba spustelėkite
                                  </p>
                                  <p className="text-xs text-base-content/40">
                                    PDF, Word, Excel, TXT
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
                            className="btn btn-primary w-full"
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
                      <div className="alert alert-soft alert-info text-xs">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <strong>Įkelkite .eml formato failą</strong> – sistema ras panašius gaminius ir pateiks susijusius dokumentus, įskaitant PDF ir komercinius pasiūlymus.
                        </div>
                      </div>

                      {/* Upload Area */}
                      <div>
                        <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                          Pasirinkite failą
                        </label>
                        <div
                          onDrop={handleFileDrop}
                          onDragOver={handleDragOver}
                          onClick={triggerFileUpload}
                          className="border-2 border-dashed border-base-content/15 rounded-lg px-3 py-5 text-center cursor-pointer bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-all"
                        >
                          {selectedFile ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded flex items-center justify-center bg-base-200">
                                  <FileArchive className="w-4 h-4 text-base-content/60" />
                                </div>
                                <div className="text-left">
                                  <p className="text-xs font-medium text-base-content">
                                    {selectedFile.name}
                                  </p>
                                  <p className="text-xs text-base-content/40">
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
                                className="btn btn-circle btn-text btn-xs"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-5 h-5 mx-auto mb-1.5 text-base-content/30" />
                              <p className="text-xs font-medium text-base-content/60 mb-0.5">
                                Nuvilkite .eml failą arba spustelėkite
                              </p>
                              <p className="text-xs text-base-content/40">
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
                        className="btn btn-primary w-full"
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
