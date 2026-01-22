import React, { useState, useRef } from 'react';
import { Upload, FileText, X, AlertCircle, Check, File, FileArchive, Loader2 } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
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
}

export default function NestandardiniaiInterface({ user, projectId }: NestandardiniaiInterfaceProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<WebhookResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if file is .eml
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== '.eml') {
      setError('Tik .eml failai yra palaikomi. Prašome įkelti .eml failą.');
      return;
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
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== '.eml') {
      setError('Tik .eml failai yra palaikomi. Prašome įkelti .eml failą.');
      return;
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

  const handleSearchSimilar = async () => {
    if (!selectedFile) {
      setError('Prašome pasirinkti .eml failą');
      return;
    }

    setUploading(true);
    setError(null);
    setResponse(null);

    try {
      // Log upload start
      await appLogger.logDocument({
        action: 'eml_search_started',
        userId: user.id,
        userEmail: user.email,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        metadata: { project_id: projectId, file_type: selectedFile.type }
      });

      // Convert file to base64
      const base64Content = await fileToBase64(selectedFile);

      // Get webhook URL from environment variable
      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;

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
        action: 'eml_search_success',
        userId: user.id,
        userEmail: user.email,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        metadata: {
          project_id: projectId,
          subject_line: responseData.subjectLine
        }
      });

      setResponse(responseData);
    } catch (error: any) {
      console.error('EML search error:', error);
      setError(`Paieška nepavyko: ${error.message}`);

      await appLogger.logError({
        action: 'eml_search_error',
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
              Įkelkite .eml failą ir raskite panašius gaminius
            </p>
          </div>
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
          {/* Upload Area */}
          {!response && (
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

              {/* Search Button */}
              <button
                onClick={handleSearchSimilar}
                disabled={!selectedFile || uploading}
                className="w-full macos-btn macos-btn-primary py-4 rounded-macos-lg font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 macos-animate-spring"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Ieškoma panašių...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Rasti Panašų</span>
                  </>
                )}
              </button>
            </div>
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
                Prašome palaukti, kol sistema suranda panašius gaminius
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
                      Rasti aktualūs failai
                    </h3>
                    <p className="text-sm text-macos-gray-500">
                      Sistema sėkmingai rado susijusius dokumentus
                    </p>
                  </div>
                </div>

                {/* Subject Line */}
                <div className="border-t border-black/5 pt-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-8 h-8 bg-macos-purple/10 rounded-macos flex items-center justify-center flex-shrink-0">
                      <FileArchive className="w-4 h-4 text-macos-purple" />
                    </div>
                    <h4 className="text-base font-semibold text-macos-gray-900">
                      {response.subjectLine || 'Nestandartiniai Gaminiai'}
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
              </div>

              {/* Files Display - Claude.ai Project Style */}
              <div className="space-y-3">
                {response.emlFile && (
                  <div
                    onClick={() => downloadFile(response.emlFile!)}
                    className="macos-card p-4 hover:shadow-macos-lg transition-all cursor-pointer group macos-animate-slide-up border-[0.5px] border-macos-purple/20"
                    style={{ animationDelay: '0.1s' }}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-macos-purple/10 rounded-macos-lg flex items-center justify-center flex-shrink-0 group-hover:bg-macos-purple/20 transition-colors">
                        {getFileIcon(response.emlFile.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h5 className="text-sm font-semibold text-macos-gray-900 truncate">
                            {response.emlFile.filename}
                          </h5>
                          <span className="px-2 py-0.5 bg-macos-purple/10 text-macos-purple text-[10px] font-bold rounded uppercase flex-shrink-0">
                            {getFileTypeLabel(response.emlFile.filename)}
                          </span>
                        </div>
                        <p className="text-xs text-macos-gray-500">
                          {formatFileSize(response.emlFile.content)}
                        </p>
                      </div>
                      <div className="text-macos-gray-400 group-hover:text-macos-purple transition-colors">
                        <Upload className="w-5 h-5 transform rotate-180" />
                      </div>
                    </div>
                  </div>
                )}

                {response.attachmentFile && (
                  <div
                    onClick={() => downloadFile(response.attachmentFile!)}
                    className="macos-card p-4 hover:shadow-macos-lg transition-all cursor-pointer group macos-animate-slide-up border-[0.5px] border-macos-blue/20"
                    style={{ animationDelay: '0.2s' }}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-macos-blue/10 rounded-macos-lg flex items-center justify-center flex-shrink-0 group-hover:bg-macos-blue/20 transition-colors">
                        {getFileIcon(response.attachmentFile.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h5 className="text-sm font-semibold text-macos-gray-900 truncate">
                            {response.attachmentFile.filename}
                          </h5>
                          <span className="px-2 py-0.5 bg-macos-blue/10 text-macos-blue text-[10px] font-bold rounded uppercase flex-shrink-0">
                            {getFileTypeLabel(response.attachmentFile.filename)}
                          </span>
                        </div>
                        <p className="text-xs text-macos-gray-500">
                          {formatFileSize(response.attachmentFile.content)}
                        </p>
                      </div>
                      <div className="text-macos-gray-400 group-hover:text-macos-blue transition-colors">
                        <Upload className="w-5 h-5 transform rotate-180" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* New Search Button */}
              <button
                onClick={() => {
                  setResponse(null);
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="w-full macos-btn macos-btn-secondary py-3 rounded-macos-lg font-medium flex items-center justify-center space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span>Nauja paieška</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
