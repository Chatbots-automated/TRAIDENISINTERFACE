import React, { useState, useRef } from 'react';
import { Upload, FileText, X, AlertTriangle, Check, Paperclip } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { getWebhookUrl } from '../lib/webhooksService';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

interface NestandardiniaiInterfaceProps {
  user: AppUser;
  projectId: string;
}

export default function NestandardiniaiInterface({ user, projectId }: NestandardiniaiInterfaceProps) {
  // Form state
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title, message }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // --- File handling ---

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setAttachments(prev => [...prev, ...newFiles]);
    // Reset input so re-selecting the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    setAttachments(prev => [...prev, ...Array.from(files)]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- Validation & submit ---

  const handleCreateClick = () => {
    const missing: string[] = [];
    if (!name.trim()) missing.push('Pavadinimas');
    if (!text.trim()) missing.push('Tekstas');
    if (attachments.length === 0) missing.push('Priedai');

    if (missing.length > 0) {
      setMissingFields(missing);
      setShowWarningModal(true);
      return;
    }

    // All fields present — submit directly
    submitRequest();
  };

  const handleWarningContinue = () => {
    setShowWarningModal(false);
    submitRequest();
  };

  const handleWarningCancel = () => {
    setShowWarningModal(false);
  };

  const submitRequest = async () => {
    setUploading(true);
    setUploadSuccess(false);

    try {
      await appLogger.logDocument({
        action: 'ndk_manual_upload_started',
        userId: user.id,
        userEmail: user.email,
        filename: name || '(be pavadinimo)',
        fileSize: attachments.reduce((sum, f) => sum + f.size, 0),
        metadata: {
          project_id: projectId,
          upload_action: 'ndk_manual_upload',
          attachment_count: attachments.length,
          request_name: name,
          has_text: !!text.trim(),
        },
      });

      const webhookUrl = await getWebhookUrl('ndk_manual_upload');

      if (!webhookUrl) {
        throw new Error(
          'Webhook "ndk_manual_upload" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose.'
        );
      }

      // Upload files to Directus first (same pattern as PaklausimoKortele)
      const uploadedFileIds: string[] = [];
      for (const file of attachments) {
        const form = new FormData();
        form.append('file', file);
        const resp = await fetch(`${DIRECTUS_URL}/files`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          body: form,
        });
        if (!resp.ok) throw new Error(`Failo įkėlimas nepavyko: ${resp.status}`);
        const json = await resp.json();
        uploadedFileIds.push(json.data.id);
      }

      // Send webhook as JSON (matching all working webhooks in the app)
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          text,
          userId: user.id,
          userEmail: user.email,
          projectId,
          timestamp: new Date().toISOString(),
          uploaded_file_ids: uploadedFileIds,
          attachment_count: attachments.length,
          attachment_names: attachments.map(f => f.name),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook užklausa nepavyko: ${response.statusText}`);
      }

      await appLogger.logDocument({
        action: 'ndk_manual_upload_success',
        userId: user.id,
        userEmail: user.email,
        filename: name || '(be pavadinimo)',
        fileSize: attachments.reduce((sum, f) => sum + f.size, 0),
        metadata: {
          project_id: projectId,
          upload_action: 'ndk_manual_upload',
          attachment_count: attachments.length,
          request_name: name,
          uploaded_file_ids: uploadedFileIds,
        },
      });

      setUploadSuccess(true);
      addNotification('success', 'Sėkmė', 'Paklausimas sėkmingai sukurtas!');

      // Reset form after showing success
      setTimeout(() => {
        setUploadSuccess(false);
        setUploading(false);
        setName('');
        setText('');
        setAttachments([]);
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      addNotification('error', 'Klaida', `Operacija nepavyko: ${error.message}`);
      setUploadSuccess(false);
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #f8f7f5 0%, #f0eee9 50%, #eae7e2 100%)' }}>
      {/* Notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />

      {/* Header — frosted glass */}
      <div
        className="px-6 py-5 border-b"
        style={{
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderColor: 'rgba(255, 255, 255, 0.5)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold text-base-content">
            Nestandartiniai Projektai
          </h1>
          <p className="text-sm mt-1 text-base-content/60">
            Sukurkite naują paklausimą pateikdami pavadinimą, tekstą ir priedus
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Glass card wrapper */}
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: 'rgba(255, 255, 255, 0.45)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)',
            }}
          >
            {/* Name field */}
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                Pavadinimas
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Įveskite paklausimo pavadinimą..."
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.08)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(0, 0, 0, 0.06)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Text field */}
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                Tekstas
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Įveskite paklausimo tekstą..."
                rows={8}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y leading-relaxed transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.08)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(0, 0, 0, 0.06)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
                Priedai {attachments.length > 0 && `(${attachments.length})`}
              </label>

              {/* Drop zone — glass style */}
              <div
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl px-3 py-5 text-center cursor-pointer transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.35)',
                  border: '2px dashed rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                }}
              >
                <Upload className="w-5 h-5 mx-auto mb-1.5 text-base-content/30" />
                <p className="text-xs font-medium text-base-content/60 mb-0.5">
                  Nuvilkite failus arba spustelėkite
                </p>
                <p className="text-xs text-base-content/40">
                  Bet koks failo formatas
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelection}
                className="hidden"
                multiple
              />
            </div>

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-2.5 rounded-xl transition-all duration-150"
                    style={{
                      background: 'rgba(255, 255, 255, 0.5)',
                      border: '1px solid rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59, 130, 246, 0.08)' }}
                      >
                        <Paperclip className="w-3.5 h-3.5 text-blue-500/70" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-xs font-medium text-base-content truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-base-content/40">
                          {file.size < 1024 * 1024
                            ? `${(file.size / 1024).toFixed(1)} KB`
                            : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5 text-base-content/40 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleCreateClick}
              disabled={uploading || uploadSuccess}
              className="w-full py-2.5 rounded-xl text-sm font-medium relative overflow-hidden transition-all duration-300 disabled:opacity-60"
              style={{
                background: uploadSuccess
                  ? 'rgba(16, 185, 129, 0.85)'
                  : 'rgba(59, 130, 246, 0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
              }}
              onMouseEnter={(e) => {
                if (!uploading && !uploadSuccess) {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.95)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                if (!uploading && !uploadSuccess) {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.85)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.15)';
                }
              }}
            >
              <span
                className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${
                  uploading || uploadSuccess ? 'opacity-0' : 'opacity-100'
                }`}
              >
                Sukurti Paklausimą
              </span>

              {/* Loader */}
              {uploading && !uploadSuccess && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="loading loading-spinner loading-sm"></span>
                </span>
              )}

              {/* Success checkmark */}
              {uploadSuccess && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Warning Modal — glass style */}
      {showWarningModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={handleWarningCancel}
        >
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255, 255, 255, 0.75)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255,255,255,0.3) inset',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(0, 0, 0, 0.06)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-base-content">
                  Trūksta duomenų
                </h3>
                <p className="text-xs text-base-content/50">
                  Kai kurie laukai neužpildyti
                </p>
              </div>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4">
              <p className="text-sm text-base-content/70 mb-3">
                Šie laukai neužpildyti:
              </p>
              <ul className="space-y-1.5 mb-4">
                {missingFields.map((field) => (
                  <li key={field} className="flex items-center gap-2 text-sm text-base-content/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                    {field}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-base-content/50">
                Ar norite tęsti be šių duomenų?
              </p>
            </div>

            {/* Modal footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-3 border-t"
              style={{ borderColor: 'rgba(0, 0, 0, 0.06)', background: 'rgba(0, 0, 0, 0.02)' }}
            >
              <button
                onClick={handleWarningCancel}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'rgba(0, 0, 0, 0.05)', color: '#5a5550' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)')}
              >
                Grįžti
              </button>
              <button
                onClick={handleWarningContinue}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'rgba(245, 158, 11, 0.8)', color: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(245, 158, 11, 0.95)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(245, 158, 11, 0.8)')}
              >
                Tęsti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
