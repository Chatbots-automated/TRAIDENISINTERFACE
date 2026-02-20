import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  Check,
  X,
  FlaskConical,
  Search,
  RefreshCw,
  Eye,
  Download,
  ChevronUp,
  ChevronDown,
  Zap,
  AlertCircle,
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  fetchDervaFiles,
  fetchVectorizedFileIds,
  insertDervaFile,
  deleteDervaFile,
  triggerVectorization,
  uploadFileToDirectus,
  getFileViewUrl,
  getFileDownloadUrl,
  DervaFile,
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

type SortColumn = 'id' | 'file_name' | 'file_size' | 'uploaded_by' | 'uploaded_at';

const COLUMNS: { key: SortColumn; label: string; width?: string }[] = [
  { key: 'id', label: '#', width: 'w-14' },
  { key: 'file_name', label: 'Failo pavadinimas' },
  { key: 'file_size', label: 'Dydis', width: 'w-24' },
  { key: 'uploaded_by', label: 'Įkėlė', width: 'w-36' },
  { key: 'uploaded_at', label: 'Data', width: 'w-28' },
];

export default function DervaInterface({ user }: DervaInterfaceProps) {
  const [files, setFiles] = useState<DervaFile[]>([]);
  const [vectorizedIds, setVectorizedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [vectorizingId, setVectorizingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'uploaded_at',
    direction: 'desc',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [filesData, vecIds] = await Promise.all([
        fetchDervaFiles(),
        fetchVectorizedFileIds(),
      ]);
      setFiles(filesData);
      setVectorizedIds(vecIds);
    } catch (err: any) {
      console.error('Error loading derva data:', err);
      if (loading) setError('Nepavyko įkelti duomenų');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => { loadData(); }, []);

  // ---------- Filtering ----------
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(f =>
      f.file_name.toLowerCase().includes(q) ||
      f.uploaded_by.toLowerCase().includes(q) ||
      String(f.id).includes(q)
    );
  }, [files, searchQuery]);

  // ---------- Sorting ----------
  const sortedFiles = useMemo(() => {
    if (!sortConfig.column) return filteredFiles;
    return [...filteredFiles].sort((a, b) => {
      const aVal: any = a[sortConfig.column];
      const bVal: any = b[sortConfig.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredFiles, sortConfig]);

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  // ---------- File selection ----------
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

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------- Upload ----------
  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      setUploading(true);
      setError(null);

      // 1. Upload binary to Directus file storage
      const directusFileId = await uploadFileToDirectus(selectedFile);

      // 2. Insert derva_files record
      await insertDervaFile(
        selectedFile.name,
        selectedFile.size,
        selectedFile.type || 'application/octet-stream',
        directusFileId,
        user.email,
      );

      setSuccess(`Failas "${selectedFile.name}" sėkmingai įkeltas`);
      setTimeout(() => setSuccess(null), 4000);
      clearSelectedFile();
      await loadData();
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Nepavyko įkelti failo');
    } finally {
      setUploading(false);
    }
  };

  // ---------- Vectorize ----------
  const handleVectorize = async (file: DervaFile) => {
    if (!file.directus_file_id) {
      setError('Failas neturi Directus nuorodos');
      return;
    }
    try {
      setVectorizingId(file.id);
      setError(null);
      const ok = await triggerVectorization(file.id, file.directus_file_id, file.file_name);
      if (ok) {
        setSuccess(`"${file.file_name}" sėkmingai vektorizuotas`);
        setTimeout(() => setSuccess(null), 4000);
        await loadData();
      } else {
        setError('Webhook grąžino klaidą. Patikrinkite n8n workflow.');
      }
    } catch (err: any) {
      setError(err.message || 'Nepavyko paleisti vektorizavimo');
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
      setSuccess(`"${file.file_name}" ištrintas`);
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Nepavyko ištrinti');
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = files.length;

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
        {/* Title row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.08)' }}
            >
              <FlaskConical className="w-[18px] h-[18px]" style={{ color: '#15803d' }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Derva RAG</h2>
              <p className="text-xs mt-0.5" style={{ color: '#8a857f' }}>
                Dokumentų vektorizavimas dervos rekomendacijoms
              </p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); loadData(); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-macos text-xs font-medium transition-all hover:brightness-95"
            style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atnaujinti
          </button>
        </div>

        {/* Search + Upload button */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a857f' }} />
            <input
              type="text"
              placeholder="Ieškoti..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 text-sm rounded-macos pl-9 pr-3 outline-none transition-all"
              style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-macos text-xs font-medium text-white transition-all hover:brightness-95"
            style={{ background: '#007AFF' }}
          >
            <Upload className="w-3.5 h-3.5" />
            Įkelti failą
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Messages */}
      <div className="px-6">
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-macos text-sm mt-4"
            style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-macos text-sm mt-4"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#15803d' }}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Selected file preview bar */}
        {selectedFile && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-macos-lg mt-4"
            style={{ background: '#fff', border: '1px solid rgba(0,122,255,0.2)' }}
          >
            <FileText className="w-5 h-5 shrink-0" style={{ color: '#007AFF' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#3d3935' }}>{selectedFile.name}</p>
              <p className="text-xs" style={{ color: '#8a857f' }}>{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-macos text-xs font-medium text-white transition-all"
              style={{ background: uploading ? '#9ca3af' : '#007AFF' }}
            >
              {uploading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Įkeliama...</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Įkelti</>
              )}
            </button>
            <button
              onClick={clearSelectedFile}
              className="p-1 rounded-full hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4" style={{ color: '#8a857f' }} />
            </button>
          </div>
        )}

        {/* Drag overlay hint */}
        {dragOver && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-macos-lg mt-4 text-sm font-medium"
            style={{ background: 'rgba(0,122,255,0.06)', color: '#007AFF', border: '2px dashed rgba(0,122,255,0.3)' }}
          >
            <Upload className="w-4 h-4" />
            Numeskite failą čia
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-md text-macos-blue"></span>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-center">
            <div>
              <p className="text-base font-medium mb-1" style={{ color: '#3d3935' }}>
                {searchQuery ? 'Nieko nerasta' : 'Nėra įkeltų dokumentų'}
              </p>
              <p className="text-sm" style={{ color: '#8a857f' }}>
                {searchQuery
                  ? 'Pakeiskite paieškos užklausą'
                  : 'Įkelkite PDF ar kitą failą, kad pradėtumėte'
                }
              </p>
            </div>
          </div>
        ) : (
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap ${col.width || ''}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{col.label}</span>
                        <span className="inline-flex flex-col leading-none">
                          <ChevronUp className={`w-2.5 h-2.5 ${sortConfig.column === col.key && sortConfig.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                          <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${sortConfig.column === col.key && sortConfig.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Vektorizuota</span>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiles.map((file) => {
                  const isVectorized = vectorizedIds.has(file.id);
                  return (
                    <tr
                      key={file.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid #f8f6f3' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      {/* # */}
                      <td className="px-3 py-2.5 w-14">
                        <span style={{ color: '#8a857f', fontSize: '12px' }}>{file.id}</span>
                      </td>

                      {/* File name (clickable to view) */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#3b82f6' }} />
                          {file.directus_file_id ? (
                            <a
                              href={getFileViewUrl(file.directus_file_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] font-medium hover:underline truncate max-w-[300px]"
                              style={{ color: '#3d3935' }}
                              title={file.file_name}
                            >
                              {file.file_name}
                            </a>
                          ) : (
                            <span
                              className="text-[13px] font-medium truncate max-w-[300px]"
                              style={{ color: '#3d3935' }}
                              title={file.file_name}
                            >
                              {file.file_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-3 py-2.5 w-24">
                        <span style={{ color: '#5a5550', fontSize: '13px' }}>{formatFileSize(file.file_size)}</span>
                      </td>

                      {/* Uploaded by */}
                      <td className="px-3 py-2.5 w-36">
                        <span style={{ color: '#5a5550', fontSize: '13px' }}>{file.uploaded_by.split('@')[0]}</span>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2.5 w-28">
                        <span className="whitespace-nowrap" style={{ color: '#5a5550', fontSize: '13px' }}>
                          {new Date(file.uploaded_at).toLocaleDateString('lt-LT')}
                        </span>
                      </td>

                      {/* Vektorizuota */}
                      <td className="px-3 py-2.5">
                        {isVectorized ? (
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full"
                            style={{ background: 'rgba(34,197,94,0.12)' }}
                            title="Vektorizuota"
                          >
                            <Check className="w-4 h-4" style={{ color: '#15803d' }} />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleVectorize(file)}
                            disabled={vectorizingId === file.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer"
                            style={{
                              background: vectorizingId === file.id ? 'rgba(0,0,0,0.04)' : 'rgba(0,122,255,0.08)',
                              color: vectorizingId === file.id ? '#8a857f' : '#007AFF',
                              border: `0.5px solid ${vectorizingId === file.id ? 'rgba(0,0,0,0.08)' : 'rgba(0,122,255,0.15)'}`,
                            }}
                          >
                            {vectorizingId === file.id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Vektorizuojama...</>
                            ) : (
                              <><Zap className="w-3 h-3" /> Vektorizuoti</>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {file.directus_file_id && (
                            <>
                              <a
                                href={getFileViewUrl(file.directus_file_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                                title="Peržiūrėti"
                              >
                                <Eye className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                              </a>
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

            {/* Footer */}
            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}
            >
              <span>
                {sortedFiles.length < totalCount
                  ? `${sortedFiles.length} iš ${totalCount} įrašų`
                  : `${totalCount} ${totalCount === 1 ? 'dokumentas' : 'dokumentų'}`
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
