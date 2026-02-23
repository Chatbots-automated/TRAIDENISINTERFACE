import React, { useState, useRef } from 'react';
import { Upload, FileText, X, AlertTriangle, Check, Loader2, Paperclip } from 'lucide-react';
import { appLogger } from '../lib/appLogger';
import { getWebhookUrl } from '../lib/webhooksService';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';

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
    setAttachments(prev => [...prev, ...Array.from(files)]);
    // Reset input so re-selecting the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    setAttachments(prev => [...prev, ...Array.from(files)]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
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

      const formData = new FormData();
      formData.append('name', name);
      formData.append('text', text);
      formData.append('userId', user.id);
      formData.append('userEmail', user.email);
      formData.append('projectId', projectId);
      formData.append('timestamp', new Date().toISOString());

      // Append each attachment as binary
      attachments.forEach((file) => {
        formData.append('attachments', file, file.name);
      });

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
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
    <div className="h-full flex flex-col bg-base-200/50">
      {/* Notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />

      {/* Header */}
      <div className="px-6 py-5 border-b border-base-content/10 bg-base-100/80">
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
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-5">

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
              className="input input-sm w-full"
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
              className="textarea textarea-sm w-full resize-y leading-relaxed"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="text-xs font-semibold block mb-1.5 text-base-content/70">
              Priedai {attachments.length > 0 && `(${attachments.length})`}
            </label>

            {/* Drop zone */}
            <div
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-base-content/15 rounded-lg px-3 py-5 text-center cursor-pointer bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-all"
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
                  className="flex items-center justify-between p-2.5 rounded-lg border border-base-content/10 bg-base-100"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-base-200">
                      <Paperclip className="w-4 h-4 text-base-content/60" />
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
                    className="btn btn-circle btn-text btn-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleCreateClick}
            disabled={uploading || uploadSuccess}
            className={`btn w-full ${uploadSuccess ? 'btn-success' : 'btn-primary'} relative overflow-hidden`}
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

      {/* Warning Modal */}
      {showWarningModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={handleWarningCancel}
        >
          <div
            className="relative w-full max-w-md mx-4 bg-base-100 rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-base-content/10">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-warning/15">
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
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-content/10 bg-base-200/30">
              <button
                onClick={handleWarningCancel}
                className="btn btn-sm btn-soft"
              >
                Grįžti
              </button>
              <button
                onClick={handleWarningContinue}
                className="btn btn-sm btn-warning"
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
