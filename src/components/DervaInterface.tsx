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
  fetchDervaRecords,
  fetchVectorizedFileIds,
  insertDervaFile,
  deleteDervaFile,
  deleteDervaRecord,
  triggerVectorization,
  uploadFileToDirectus,
  notifyFileUpload,
  getFileViewUrl,
  getFileDownloadUrl,
  DervaFile,
  DervaRecord,
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
type DataSortColumn = 'id' | 'content' | 'file_id';

const FILES_COLUMNS: { key: FilesSortColumn; label: string; width?: string }[] = [
  { key: 'id', label: '#', width: 'w-14' },
  { key: 'file_name', label: 'Failo pavadinimas' },
  { key: 'file_size', label: 'Dydis', width: 'w-24' },
  { key: 'uploaded_by', label: 'Įkėlė', width: 'w-36' },
  { key: 'uploaded_at', label: 'Data', width: 'w-28' },
];

const DATA_COLUMNS: { key: DataSortColumn; label: string; width?: string }[] = [
  { key: 'id', label: '#', width: 'w-14' },
  { key: 'content', label: 'Turinys' },
  { key: 'file_id', label: 'Failo ID', width: 'w-24' },
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

type TabName = 'failai' | 'duomenys';

export default function DervaInterface({ user }: DervaInterfaceProps) {
  // Tab
  const [selectedTab, setSelectedTab] = useState<TabName>('failai');

  // Data
  const [files, setFiles] = useState<DervaFile[]>([]);
  const [dervaRecords, setDervaRecords] = useState<DervaRecord[]>([]);
  const [vectorizedIds, setVectorizedIds] = useState<Set<number>>(new Set());

  // Polling ref for post-upload vectorization check
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Loading
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [vectorizingId, setVectorizingId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DervaFile | null>(null);

  // Sorting
  const [filesSortConfig, setFilesSortConfig] = useState<{ column: FilesSortColumn; direction: 'asc' | 'desc' }>({
    column: 'uploaded_at',
    direction: 'desc',
  });
  const [dataSortConfig, setDataSortConfig] = useState<{ column: DataSortColumn; direction: 'asc' | 'desc' }>({
    column: 'id',
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
      const [filesData, vecIds] = await Promise.all([
        fetchDervaFiles(),
        fetchVectorizedFileIds(),
      ]);
      setFiles(filesData);
      setVectorizedIds(vecIds);
    } catch (err: any) {
      console.error('Error loading files:', err);
      addNotification('error', 'Klaida', 'Nepavyko įkelti failų sąrašo');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadDervaData = useCallback(async () => {
    try {
      setLoadingData(true);
      setDervaRecords(await fetchDervaRecords());
    } catch (err: any) {
      console.error('Error loading derva data:', err);
      addNotification('error', 'Klaida', 'Nepavyko įkelti duomenų');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { loadFiles(); loadDervaData(); }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const currentLoading = selectedTab === 'failai' ? loadingFiles : loadingData;
  const currentReload = selectedTab === 'failai' ? loadFiles : loadDervaData;

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

  // ---------- Sorting (derva data) ----------
  const sortedDervaRecords = useMemo(() => {
    if (!dataSortConfig.column) return dervaRecords;
    return [...dervaRecords].sort((a, b) => {
      const aVal: any = a[dataSortConfig.column];
      const bVal: any = b[dataSortConfig.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return dataSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return dataSortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return dataSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [dervaRecords, dataSortConfig]);

  const handleFilesSort = (column: FilesSortColumn) => {
    setFilesSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const handleDataSort = (column: DataSortColumn) => {
    setDataSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  // ---------- Tab change ----------
  const handleTabChange = (tab: TabName) => {
    setSelectedTab(tab);
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

      // 1. Upload binary to Directus file storage
      const directusFileId = await uploadFileToDirectus(selectedFile);

      // 2. Insert derva_files record
      const record = await insertDervaFile(
        selectedFile.name,
        selectedFile.size,
        selectedFile.type || 'application/octet-stream',
        directusFileId,
        user.email,
      );

      // 3. Notify n8n about the upload (fire-and-forget)
      notifyFileUpload(record.id, directusFileId);

      addNotification('success', 'Įkelta', `Failas "${selectedFile.name}" sėkmingai įkeltas`);
      clearSelectedFile();
      await loadFiles();

      // 4. Poll for vectorization — the n8n workflow runs async, so we
      //    check every 3 s (up to 60 s) until derva records appear for this file.
      if (pollRef.current) clearInterval(pollRef.current);
      const uploadedFileId = record.id;
      let elapsed = 0;
      pollRef.current = setInterval(async () => {
        elapsed += 3000;
        const vecIds = await fetchVectorizedFileIds();
        if (vecIds.has(uploadedFileId)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setVectorizedIds(vecIds);
          await loadDervaData();
        } else if (elapsed >= 60000) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    } catch (err: any) {
      console.error('Upload error:', err);
      addNotification('error', 'Klaida', err.message || 'Nepavyko įkelti failo');
    } finally {
      setUploading(false);
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
      const ok = await triggerVectorization(file.id, file.directus_file_id, file.file_name);
      if (ok) {
        addNotification('success', 'Vektorizuota', `"${file.file_name}" sėkmingai vektorizuotas`);
        await Promise.all([loadFiles(), loadDervaData()]);
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
      await Promise.all([loadFiles(), loadDervaData()]);
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message || 'Nepavyko ištrinti');
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- Delete derva record ----------
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);

  const handleDeleteRecord = async (record: DervaRecord) => {
    if (!confirm(`Ar tikrai norite ištrinti įrašą #${record.id}?`)) return;
    try {
      setDeletingRecordId(record.id);
      await deleteDervaRecord(record.id, record.file_id);
      addNotification('info', 'Ištrinta', `Įrašas #${record.id} pašalintas`);
      await Promise.all([loadFiles(), loadDervaData()]);
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message || 'Nepavyko ištrinti įrašo');
    } finally {
      setDeletingRecordId(null);
    }
  };

  // ---------- Sort arrow helper ----------
  const SortArrows = ({ column, config }: { column: string; config: { column: string; direction: string } }) => (
    <span className="inline-flex flex-col leading-none">
      <ChevronUp className={`w-2.5 h-2.5 ${config.column === column && config.direction === 'asc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
      <ChevronDown className={`w-2.5 h-2.5 -mt-0.5 ${config.column === column && config.direction === 'desc' ? 'text-macos-blue' : 'text-macos-gray-200'}`} />
    </span>
  );

  const isFailai = selectedTab === 'failai';

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: '#fdfcfb' }}
      onDragOver={isFailai ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isFailai ? (e) => { if (e.currentTarget === e.target) setDragOver(false); } : undefined}
      onDrop={isFailai ? handleDrop : undefined}
    >
      {/* Header — matches Dokumentai exactly */}
      <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
        {/* Top row: title + actions */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold" style={{ color: '#3d3935' }}>Dervų Failų Valdymas</h2>
          <div className="flex items-center gap-2">
            {isFailai && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-macos text-xs font-medium text-white transition-all hover:brightness-95"
                style={{ background: '#007AFF' }}
              >
                <Upload className="w-3.5 h-3.5" />
                Įkelti failą
              </button>
            )}
            <button
              onClick={currentReload}
              disabled={currentLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-macos text-xs font-medium transition-all hover:brightness-95"
              style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#5a5550' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${currentLoading ? 'animate-spin' : ''}`} />
              Atnaujinti
            </button>
          </div>
        </div>

        {/* Segmented control — same as Dokumentai */}
        <div className="flex items-center gap-4">
          <div className="inline-flex rounded-macos p-0.5 shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <button
              onClick={() => handleTabChange('failai')}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                selectedTab === 'failai' ? 'text-macos-gray-900' : 'text-macos-gray-400 hover:text-macos-gray-600'
              }`}
              style={selectedTab === 'failai' ? {
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              } : undefined}
            >
              Failai
            </button>
            <button
              onClick={() => handleTabChange('duomenys')}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                selectedTab === 'duomenys' ? 'text-macos-gray-900' : 'text-macos-gray-400 hover:text-macos-gray-600'
              }`}
              style={selectedTab === 'duomenys' ? {
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              } : undefined}
            >
              Duomenys
            </button>
          </div>
        </div>
      </div>

      {/* Upload preview bar (only on Failai tab) */}
      {isFailai && (selectedFile || dragOver) && (
        <div className="px-6 pt-3">
          {dragOver && !selectedFile && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-macos-lg text-sm font-medium"
              style={{ background: 'rgba(0,122,255,0.06)', color: '#007AFF', border: '2px dashed rgba(0,122,255,0.3)' }}
            >
              <Upload className="w-4 h-4" />
              Numeskite failą čia
            </div>
          )}
          {selectedFile && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-macos-lg"
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
              <button onClick={clearSelectedFile} className="p-1 rounded-full hover:bg-black/5 transition-colors">
                <X className="w-4 h-4" style={{ color: '#8a857f' }} />
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Table area */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {currentLoading ? (
          <div className="flex items-center justify-center h-64">
            <span className="loading loading-spinner loading-md text-macos-blue"></span>
          </div>
        ) : isFailai ? (
          /* =================== FAILAI TABLE =================== */
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
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Vektorizacija</span>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiles.length === 0 ? (
                  <tr><td colSpan={FILES_COLUMNS.length + 2} className="py-2.5">&nbsp;</td></tr>
                ) : sortedFiles.map((file) => {
                  const isVectorized = vectorizedIds.has(file.id);
                  return (
                    <tr
                      key={file.id}
                      style={{ borderBottom: '1px solid #f8f6f3' }}
                    >
                      <td className="px-3 py-2.5 w-14">
                        <span style={{ color: '#8a857f', fontSize: '12px' }}>{file.id}</span>
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

                      {/* Vektorizacija */}
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
        ) : (
          /* =================== DUOMENYS TABLE =================== */
          <div
            className="w-full overflow-x-auto rounded-macos-lg bg-white"
            style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                  {DATA_COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleDataSort(col.key)}
                      className={`px-3 py-3 text-left cursor-pointer select-none whitespace-nowrap ${col.width || ''}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>{col.label}</span>
                        <SortArrows column={col.key} config={dataSortConfig} />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDervaRecords.length === 0 ? (
                  <tr><td colSpan={DATA_COLUMNS.length + 1} className="py-2.5">&nbsp;</td></tr>
                ) : sortedDervaRecords.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid #f8f6f3' }}
                  >
                    <td className="px-3 py-2.5 w-14">
                      <span style={{ color: '#8a857f', fontSize: '12px' }}>{row.id}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="truncate max-w-[300px] inline-block align-middle"
                        style={{ color: '#3d3935', fontSize: '13px' }}
                        title={row.content}
                      >
                        {row.content.length > 80 ? row.content.slice(0, 80) + '…' : row.content}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 w-24">
                      <span style={{ color: '#5a5550', fontSize: '13px' }}>{row.file_id}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteRecord(row)}
                        disabled={deletingRecordId === row.id}
                        className="p-1.5 rounded-md transition-colors hover:bg-red-50"
                        title="Ištrinti"
                      >
                        {deletingRecordId === row.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#b91c1c' }} />
                          : <Trash2 className="w-3.5 h-3.5" style={{ color: '#b91c1c' }} />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ borderTop: '1px solid #f0ede8', color: '#8a857f' }}
            >
              <span>{dervaRecords.length} įrašų</span>
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
