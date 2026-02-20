import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  AlertCircle,
  Check,
  X,
  FlaskConical,
  HardDriveDownload
} from 'lucide-react';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';
import {
  fetchDervaFiles,
  insertDervaFile,
  deleteDervaFile,
  triggerVectorization,
  DervaFile
} from '../lib/dervaService';

interface DervaInterfaceProps {
  user: AppUser;
}

const ACCEPTED_TYPES = '.pdf,.md,.txt,.doc,.docx';

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status, chunkCount }: { status: DervaFile['status']; chunkCount: number }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#b45309', border: '1px solid rgba(234,179,8,0.2)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Laukiama
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.2)' }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Apdorojama
        </span>
      );
    case 'vectorized':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Check className="w-3 h-3" />
          Vektorizuota{chunkCount > 0 ? ` (${chunkCount})` : ''}
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle className="w-3 h-3" />
          Klaida
        </span>
      );
  }
}

export default function DervaInterface({ user }: DervaInterfaceProps) {
  const [files, setFiles] = useState<DervaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await fetchDervaFiles();
      setFiles(data);
    } catch (err: any) {
      console.error('Error loading derva files:', err);
      if (loading) setError('Nepavyko įkelti failų sąrašo');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    loadFiles();
  }, []);

  // Poll for status updates while any file is pending/processing
  useEffect(() => {
    const hasPending = files.some(f => f.status === 'pending' || f.status === 'processing');
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(loadFiles, 5000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [files, loadFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError(null);

      // 1. Insert file record
      const record = await insertDervaFile(
        selectedFile.name,
        selectedFile.size,
        user.email,
      );

      // 2. Trigger n8n vectorization webhook
      const ok = await triggerVectorization(selectedFile, record.id, user.email);

      if (ok) {
        setSuccess(`Failas "${selectedFile.name}" sėkmingai išsiųstas vektorizavimui`);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError('Webhook grąžino klaidą. Patikrinkite n8n workflow.');
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFiles();
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Nepavyko įkelti failo');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, fileName: string) => {
    if (!confirm(`Ar tikrai norite ištrinti "${fileName}" ir visus su juo susijusius vektorius?`)) return;

    try {
      setDeletingId(id);
      await deleteDervaFile(id);
      setSuccess(`"${fileName}" ištrintas`);
      setTimeout(() => setSuccess(null), 3000);
      await loadFiles();
    } catch (err: any) {
      setError(err.message || 'Nepavyko ištrinti');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full overflow-auto" style={{ background: colors.bg.primary }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(59,130,246,0.1) 100%)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <FlaskConical className="w-6 h-6" style={{ color: '#15803d' }} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: colors.text.primary }}>Derva RAG</h1>
            <p className="text-sm mt-0.5" style={{ color: colors.text.tertiary }}>
              Vektorizuotų dokumentų valdymas dervos rekomendacijoms
            </p>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-sm"
            style={{ background: 'rgba(239,68,68,0.06)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.12)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-sm"
            style={{ background: 'rgba(34,197,94,0.06)', color: '#15803d', border: '1px solid rgba(34,197,94,0.12)' }}>
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Upload Section */}
        <div className="rounded-xl p-6 mb-8" style={{ background: colors.bg.white, border: `1px solid ${colors.border.default}` }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: colors.text.primary }}>
            Įkelti naują dokumentą
          </h2>

          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'scale-[1.01]' : ''}`}
            style={{
              borderColor: dragOver ? '#3b82f6' : colors.border.default,
              background: dragOver ? 'rgba(59,130,246,0.04)' : colors.bg.secondary,
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8" style={{ color: '#3b82f6' }} />
                <div className="text-left">
                  <p className="text-sm font-medium" style={{ color: colors.text.primary }}>{selectedFile.name}</p>
                  <p className="text-xs" style={{ color: colors.text.tertiary }}>{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="ml-4 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                >
                  <X className="w-4 h-4" style={{ color: colors.text.tertiary }} />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: colors.text.tertiary }} />
                <p className="text-sm" style={{ color: colors.text.secondary }}>
                  Nutempkite failą čia arba <span style={{ color: '#3b82f6' }}>pasirinkite</span>
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.tertiary }}>
                  PDF, MD, TXT, DOC, DOCX
                </p>
              </>
            )}
          </div>

          {/* Upload button */}
          {selectedFile && (
            <div className="flex justify-end mt-4">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{
                  background: uploading ? '#9ca3af' : 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)',
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Siunčiama...</span></>
                ) : (
                  <><HardDriveDownload className="w-4 h-4" /><span>Vektorizuoti</span></>
                )}
              </button>
            </div>
          )}
        </div>

        {/* File List */}
        <div className="rounded-xl" style={{ background: colors.bg.white, border: `1px solid ${colors.border.default}` }}>
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
            <h2 className="text-sm font-semibold" style={{ color: colors.text.primary }}>
              Įkelti dokumentai
            </h2>
            <p className="text-xs mt-0.5" style={{ color: colors.text.tertiary }}>
              {files.length} {files.length === 1 ? 'dokumentas' : files.length > 1 && files.length < 10 ? 'dokumentai' : 'dokumentų'}
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: colors.text.tertiary }} />
              <p className="text-sm" style={{ color: colors.text.tertiary }}>Kraunama...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: colors.bg.tertiary }}>
                <FileText className="w-7 h-7" style={{ color: colors.text.tertiary }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: colors.text.primary }}>Nėra įkeltų dokumentų</p>
              <p className="text-xs" style={{ color: colors.text.tertiary }}>
                Įkelkite PDF ar MD failą, kad pradėtumėte vektorizavimą
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>#</th>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Failo pavadinimas</th>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Dydis</th>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Įkėlė</th>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Data</th>
                    <th className="text-left text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Būsena</th>
                    <th className="text-right text-xs font-medium px-6 py-3" style={{ color: colors.text.tertiary }}>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file, idx) => (
                    <tr key={file.id}
                      className="transition-colors hover:bg-black/[0.02]"
                      style={{ borderBottom: idx < files.length - 1 ? `1px solid ${colors.border.light}` : 'none' }}>
                      <td className="px-6 py-3 text-xs" style={{ color: colors.text.tertiary }}>{file.id}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#3b82f6' }} />
                          <span className="text-sm font-medium" style={{ color: colors.text.primary }}>{file.file_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm" style={{ color: colors.text.secondary }}>{formatFileSize(file.file_size)}</td>
                      <td className="px-6 py-3 text-sm" style={{ color: colors.text.secondary }}>
                        {file.uploaded_by.split('@')[0]}
                      </td>
                      <td className="px-6 py-3 text-sm whitespace-nowrap" style={{ color: colors.text.secondary }}>
                        {new Date(file.uploaded_at).toLocaleDateString('lt-LT')}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={file.status} chunkCount={file.chunk_count} />
                        {file.status === 'error' && file.error_message && (
                          <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{file.error_message}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleDelete(file.id, file.file_name)}
                          disabled={deletingId === file.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Ištrinti"
                        >
                          {deletingId === file.id
                            ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#b91c1c' }} />
                            : <Trash2 className="w-4 h-4" style={{ color: '#b91c1c' }} />
                          }
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
