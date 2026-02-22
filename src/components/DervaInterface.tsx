import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  Check,
  X,
  RefreshCw,
  Eye,
  Download,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { AppUser } from '../types';
import NotificationContainer, { Notification } from './NotificationContainer';
import {
  fetchDervaFiles,
  insertDervaFile,
  deleteDervaFile,
  triggerVectorization,
  uploadFileToDirectus,
  getFileViewUrl,
  getFileDownloadUrl,
  DervaFile,
} from '../lib/dervaService';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DervaInterfaceProps {
  user: AppUser;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPTED_TYPES = '.pdf,.md,.txt,.doc,.docx';

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Column defs
// ---------------------------------------------------------------------------

type FilesSortColumn = 'id' | 'file_name' | 'file_size' | 'uploaded_by' | 'uploaded_at';

const FILES_COLUMNS: { key: FilesSortColumn; label: string; width?: string }[] = [
  { key: 'id', label: '#', width: 'w-14' },
  { key: 'file_name', label: 'Failo pavadinimas' },
  { key: 'file_size', label: 'Dydis', width: 'w-24' },
  { key: 'uploaded_by', label: 'Įkėlė', width: 'w-36' },
  { key: 'uploaded_at', label: 'Data', width: 'w-28' },
];

// ---------------------------------------------------------------------------
// File preview modal
// ---------------------------------------------------------------------------

function FilePreviewModal({ file, onClose }: { file: DervaFile; onClose: () => void }) {
  if (!file.directus_file_id) return null;
  const url = getFileViewUrl(file.directus_file_id);
  const isPdf = file.mime_type?.includes('pdf');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ height: '85vh', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid #f0ede8' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 shrink-0" style={{ color: '#3b82f6' }} />
            <span className="text-sm font-medium truncate" style={{ color: '#3d3935' }}>
              {file.file_name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={getFileDownloadUrl(file.directus_file_id!)}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5"
              title="Atsisiųsti"
            >
              <Download className="w-4 h-4" style={{ color: '#8a857f' }} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors hover:bg-black/5"
            >
              <X className="w-4 h-4" style={{ color: '#8a857f' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="w-full h-full" style={{ height: 'calc(85vh - 52px)' }}>
          {isPdf ? (
            <iframe
              src={`${url}#toolbar=1`}
              className="w-full h-full border-0"
              title={file.file_name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <FileText className="w-16 h-16" style={{ color: '#d4cfc8' }} />
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Peržiūra nepalaiko šio failo formato
              </p>
              <a
                href={getFileDownloadUrl(file.directus_file_id!)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-macos text-xs font-medium text-white"
                style={{ background: '#007AFF' }}
              >
                <Download className="w-3.5 h-3.5" />
                Atsisiųsti failą
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DervaInterface({ user }: DervaInterfaceProps) {
  // Data
  const [files, setFiles] = useState<DervaFile[]>([]);

  // Loading
  const [loadingFiles, setLoadingFiles] = useState(true);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [vectorizingId, setVectorizingId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DervaFile | null>(null);

  // Sorting
  const [filesSortConfig, setFilesSortConfig] = useState<{ column: FilesSortColumn; direction: 'asc' | 'desc' }>({
    column: 'uploaded_at',
    direction: 'desc',
  });

  // Toast notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const addNotification = (type: Notification['type'], title: string, message: string) => {
    const id = `n-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title, message }]);
  };
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Data loading ----------
  const loadFiles = useCallback(async () => {
    try {
      setLoadingFiles(true);
      setFiles(await fetchDervaFiles());
    } catch (err: any) {
      console.error('Error loading files:', err);
      addNotification('error', 'Klaida', 'Nepavyko įkelti failų sąrašo');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, []);

  // ---------- Sorting (files) ----------
  const sortedFiles = useMemo(() => {
    if (!filesSortConfig.column) return files;
    return [...files].sort((a, b) => {
      const aVal: any = a[filesSortConfig.column];
      const bVal: any = b[filesSortConfig.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return filesSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return filesSortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return filesSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [files, filesSortConfig]);

  const handleFilesSort = (column: FilesSortColumn) => {
    setFilesSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  // ---------- File selection ----------
  const MAX_FILES = 30;

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setSelectedFiles(prev => {
      const combined = [...prev, ...arr];
      if (combined.length > MAX_FILES) {
        setTimeout(() => addNotification('info', 'Limitas', `Maksimalus failų skaičius – ${MAX_FILES}. Pertekliniai failai pašalinti.`), 0);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------- Upload ----------
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    const toUpload = [...selectedFiles];
    let succeeded = 0;
    let failed = 0;

    try {
      setUploading(true);
      setUploadProgress({ current: 0, total: toUpload.length });

      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        setUploadProgress({ current: i + 1, total: toUpload.length });
        try {
          const directusFileId = await uploadFileToDirectus(file);
          await insertDervaFile(
            file.name,
            file.size,
            file.type || 'application/octet-stream',
            directusFileId,
            user.full_name || user.display_name || user.email,
          );
          succeeded++;
        } catch (err: any) {
          console.error(`Upload error for "${file.name}":`, err);
          failed++;
        }
      }

      if (failed === 0) {
        addNotification('success', 'Įkelta', succeeded === 1
          ? `Failas sėkmingai įkeltas`
          : `${succeeded} failai sėkmingai įkelti`);
      } else {
        addNotification('info', 'Dalinė sėkmė', `Įkelta: ${succeeded}, nepavyko: ${failed}`);
      }

      clearSelectedFiles();
      await loadFiles();
    } catch (err: any) {
      console.error('Upload error:', err);
      addNotification('error', 'Klaida', err.message || 'Nepavyko įkelti failų');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // ---------- Vectorize ----------
  const handleVectorize = async (file: DervaFile) => {
    if (!file.directus_file_id) {
      addNotification('error', 'Klaida', 'Failas neturi Directus nuorodos');
      return;
    }
    try {
      setVectorizingId(file.id);
      const ok = await triggerVectorization(file.directus_file_id, file.file_name, file.id);
      if (ok) {
        // n8n may still be writing embeddings after the webhook responds.
        // Poll until the embedding appears or we time out.
        let found = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          const refreshed = await fetchDervaFiles();
          const updated = refreshed.find(f => f.id === file.id);
          if (updated?.embedding) {
            found = true;
            setFiles(refreshed);
            break;
          }
        }
        if (!found) {
          // Fallback: just reload whatever is there
          await loadFiles();
        }
        addNotification('success', 'Vektorizuota', `"${file.file_name}" sėkmingai vektorizuotas`);
      } else {
        addNotification('error', 'Klaida', 'Webhook grąžino klaidą. Patikrinkite n8n workflow.');
      }
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message || 'Nepavyko paleisti vektorizavimo');
    } finally {
      setVectorizingId(null);
    }
  };

  // ---------- Delete ----------
  const handleDelete = async (file: DervaFile) => {
    if (!confirm(`Ar tikrai norite ištrinti "${file.file_name}"?`)) return;
    try {
      setDeletingId(file.id);
      await deleteDervaFile(file.id, file.directus_file_id);
      addNotification('info', 'Ištrinta', `"${file.file_name}" pašalintas`);
      await loadFiles();
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message || 'Nepavyko ištrinti');
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- Sort arrow helper ----------
  const SortArrows = ({ column, config }: { column: string; config: { column: string; direction: string } }) => (
    <span className="inline-flex flex-col leading-none">
      <ChevronUp className={`w-2.5 h-2.5 ${config.column === column && config.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
      <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${config.column === column && config.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
    </span>
  );

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: '#fdfcfb' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Dervų Failų Valdymas</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-macos text-xs font-medium text-white transition-all hover:brightness-95"
              style={{ background: '#007AFF' }}
            >
              <Upload className="w-3.5 h-3.5" />
              Įkelti failus
            </button>
            <button
              onClick={loadFiles}
              disabled={loadingFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-macos text-xs font-medium transition-all hover:brightness-95"
              style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
              Atnaujinti
            </button>
          </div>
        </div>
      </div>

      {/* Upload preview bar */}
      {(selectedFiles.length > 0 || dragOver) && (
        <div className="px-6 pt-3">
          {dragOver && selectedFiles.length === 0 && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-macos-lg text-sm font-medium"
              style={{ background: 'rgba(0,122,255,0.06)', color: '#007AFF', border: '2px dashed rgba(0,122,255,0.3)' }}
            >
              <Upload className="w-4 h-4" />
              Numeskite failus čia (maks. {MAX_FILES})
            </div>
          )}
          {selectedFiles.length > 0 && (
            <div
              className="rounded-macos-lg overflow-hidden"
              style={{ background: '#fff', border: '1px solid rgba(0,122,255,0.2)' }}
            >
              {/* File list */}
              <div className="max-h-[180px] overflow-y-auto divide-y" style={{ borderColor: '#f0ede8' }}>
                {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center gap-3 px-4 py-2">
                    <FileText className="w-4 h-4 shrink-0" style={{ color: '#007AFF' }} />
                    <p className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: '#3d3935' }}>{file.name}</p>
                    <span className="text-xs shrink-0" style={{ color: '#8a857f' }}>{formatFileSize(file.size)}</span>
                    {!uploading && (
                      <button onClick={() => removeSelectedFile(idx)} className="p-0.5 rounded-full hover:bg-black/5 transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions bar */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #f0ede8', background: '#faf9f7' }}>
                <span className="text-xs" style={{ color: '#8a857f' }}>
                  {uploading && uploadProgress
                    ? `Įkeliama ${uploadProgress.current} / ${uploadProgress.total}...`
                    : `${selectedFiles.length} ${selectedFiles.length === 1 ? 'failas' : 'failai'} pasirinkti`
                  }
                </span>
                <div className="flex items-center gap-2">
                  {!uploading && (
                    <button onClick={clearSelectedFiles} className="text-xs px-3 py-1.5 rounded-macos transition-colors hover:bg-black/5" style={{ color: '#5a5550' }}>
                      Atšaukti
                    </button>
                  )}
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-macos text-xs font-medium text-white transition-all hover:brightness-95 disabled:opacity-60"
                    style={{ background: '#007AFF' }}
                  >
                    {uploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Įkeliama...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" /> Įkelti {selectedFiles.length > 1 ? `(${selectedFiles.length})` : ''}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Table area */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loadingFiles ? (
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-md text-macos-blue"></span>
          </div>
        ) : (
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  {FILES_COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleFilesSort(col.key)}
                      className={`px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap ${col.width || ''}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{col.label}</span>
                        <SortArrows column={col.key} config={filesSortConfig} />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Embedding</span>
                  </th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Vektorizacija</span>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiles.length === 0 ? (
                  <tr><td colSpan={FILES_COLUMNS.length + 3} className="py-2.5">&nbsp;</td></tr>
                ) : sortedFiles.map((file, idx) => {
                  const isVectorized = !!file.embedding;
                  return (
                    <tr
                      key={file.id}
                      style={{ borderBottom: '1px solid #f8f6f3' }}
                    >
                      <td className="px-3 py-2.5 w-14">
                        <span style={{ color: '#8a857f', fontSize: '12px' }}>{idx + 1}</span>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#3b82f6' }} />
                          <button
                            onClick={() => file.directus_file_id ? setPreviewFile(file) : null}
                            className="text-[13px] font-medium truncate max-w-[300px] text-left hover:underline"
                            style={{ color: '#3d3935', cursor: file.directus_file_id ? 'pointer' : 'default' }}
                            title={file.file_name}
                          >
                            {file.file_name}
                          </button>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 w-24">
                        <span style={{ color: '#5a5550', fontSize: '13px' }}>{formatFileSize(file.file_size)}</span>
                      </td>

                      <td className="px-3 py-2.5 w-36">
                        <span style={{ color: '#5a5550', fontSize: '13px' }}>{file.uploaded_by.split('@')[0]}</span>
                      </td>

                      <td className="px-3 py-2.5 w-28">
                        <span className="whitespace-nowrap" style={{ color: '#5a5550', fontSize: '13px' }}>
                          {new Date(file.uploaded_at).toLocaleDateString('lt-LT')}
                        </span>
                      </td>

                      {/* Embedding snippet */}
                      <td className="px-3 py-2.5 max-w-[120px]">
                        {file.embedding ? (
                          <span
                            className="font-mono truncate block"
                            style={{ color: '#8a857f', fontSize: '11px' }}
                            title={file.embedding}
                          >
                            {file.embedding.slice(0, 30)}...
                          </span>
                        ) : (
                          <span style={{ color: '#c4bfb8', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      {/* Vektorizacija */}
                      <td className="px-3 py-2.5 text-center">
                        {isVectorized ? (
                          <Check className="w-4 h-4 inline-block" style={{ color: '#15803d' }} />
                        ) : (
                          <button
                            onClick={() => handleVectorize(file)}
                            disabled={vectorizingId === file.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer hover:brightness-95"
                            style={{
                              background: '#fff',
                              border: '1px solid rgba(234,88,12,0.4)',
                              color: vectorizingId === file.id ? '#8a857f' : '#3d3935',
                            }}
                          >
                            {vectorizingId === file.id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Vektorizuojama...</>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#ea580c' }} />
                                Pradėti
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {file.directus_file_id && (
                            <>
                              <button
                                onClick={() => setPreviewFile(file)}
                                className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                                title="Peržiūrėti"
                              >
                                <Eye className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                              </button>
                              <a
                                href={getFileDownloadUrl(file.directus_file_id)}
                                className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                                title="Atsisiųsti"
                              >
                                <Download className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                              </a>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(file)}
                            disabled={deletingId === file.id}
                            className="p-1.5 rounded-md transition-colors hover:bg-red-50"
                            title="Ištrinti"
                          >
                            {deletingId === file.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#b91c1c' }} />
                              : <Trash2 className="w-3.5 h-3.5" style={{ color: '#b91c1c' }} />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}
            >
              <span>{files.length} {files.length === 1 ? 'failas' : 'failų'}</span>
            </div>
          </div>
        )}
      </div>

      {/* File preview modal */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Global toast notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </div>
  );
}
