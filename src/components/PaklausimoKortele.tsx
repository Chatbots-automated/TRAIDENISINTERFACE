import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  X, ExternalLink, Link2, ChevronDown, Plus,
  LayoutList, MessageSquare, CheckSquare, Beaker, GitCompareArrows, Paperclip,
  Upload, FileText, Trash2, Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, Eye,
} from 'lucide-react';
import {
  fetchNestandartiniaiById,
  updateNestandartiniaiAtsakymas,
  updateNestandartiniaiTasks,
  updateNestandartiniaiAiConversation,
  updateNestandartiniaiField,
} from '../lib/dokumentaiService';
import type {
  NestandartiniaiRecord, AtsakymasMessage, TaskItem, AiConversationMessage, SimilarProject,
} from '../lib/dokumentaiService';
import { getWebhookUrl } from '../lib/webhooksService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, string>;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function parseJSON<T>(raw: T | string | null): T | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
    return [{ text: raw }];
  }
  return [];
}

// Metadata field definitions
const INFO_ROW_1 = [
  { key: 'orientacija', label: 'Orientacija' },
  { key: 'talpa_tipas', label: 'Talpos tipas' },
  { key: 'DN', label: 'Diametras (DN)' },
];
const INFO_ROW_2 = [
  { key: 'chemija', label: 'Chemija' },
  { key: 'derva', label: 'Derva' },
  { key: 'koncentracija', label: 'Koncentracija' },
];
const ALL_MAIN_KEYS = new Set([
  ...INFO_ROW_1.map(r => r.key), ...INFO_ROW_2.map(r => r.key),
  'pritaikymas', 'talpa',
]);

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type ModalTab = 'bendra' | 'susirasinejimas' | 'uzduotys' | 'failai' | 'derva' | 'panasus';

const TABS: { id: ModalTab; label: string; icon: React.ElementType }[] = [
  { id: 'bendra', label: 'Bendra', icon: LayoutList },
  { id: 'susirasinejimas', label: 'Susirašinėjimas', icon: MessageSquare },
  { id: 'uzduotys', label: 'Užduotys', icon: CheckSquare },
  { id: 'failai', label: 'Failai', icon: Paperclip },
  { id: 'derva', label: 'Derva', icon: Beaker },
  { id: 'panasus', label: 'Panašūs', icon: GitCompareArrows },
];

// ---------------------------------------------------------------------------
// Markdown renderer for recommendation / AI text
// ---------------------------------------------------------------------------

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.substring(currentIndex, match.index));
    }
    if (match[1]) {
      parts.push(<code key={match.index} className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: '#f0ede8', color: '#5a5550' }}>{match[1].slice(1, -1)}</code>);
    } else if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[2].slice(2, -2)}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3].slice(1, -1)}</em>);
    }
    currentIndex = match.index + match[0].length;
  }
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  return parts.length > 0 ? parts : text;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="text-sm leading-[1.7]" style={{ color: '#3d3935' }}>
      {lines.map((line, idx) => {
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-base font-semibold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(4))}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-lg font-bold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(3))}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-xl font-bold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(2))}</h1>;
        }
        if (line.startsWith('---') || line.startsWith('***')) {
          return <hr key={idx} className="my-3" style={{ borderColor: '#f0ede8' }} />;
        }
        if (line.match(/^[-*]\s/)) {
          return <li key={idx} className="ml-4 list-disc" style={{ color: '#3d3935' }}>{formatInline(line.substring(2))}</li>;
        }
        if (line.match(/^\d+\.\s/)) {
          return <li key={idx} className="ml-4 list-decimal" style={{ color: '#3d3935' }}>{formatInline(line.substring(line.indexOf('.') + 2))}</li>;
        }
        if (line.trim() === '') {
          return <div key={idx} className="h-2" />;
        }
        return <p key={idx}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left py-2.5 text-sm font-medium transition-colors text-base-content/60 hover:text-base-content/80">
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        {title}
      </button>
      {open && children}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return <div />;
  return (
    <div>
      <dt className="text-xs text-base-content/40">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 text-base-content">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

function ChatBubble({ message, side }: { message: AtsakymasMessage; side: 'left' | 'right' }) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div
        className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-base-content'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/60' : 'text-base-content/40'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}{message.date}
          </p>
        )}
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'calc(1.625rem * 4)' }}>
          {message.text}
        </div>
      </div>
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const adjust = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    const max = 22 * 4;
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, []);
  useEffect(() => { adjust(); }, [value, adjust]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={className} style={{ resize: 'none', minHeight: '22px' }} rows={1} />;
}

function NewMessageBubble({ side, onSave, onCancel }: { side: 'left' | 'right'; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div className={`max-w-[80%] w-72 rounded-3xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-base-content'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        <AutoTextarea value={text} onChange={setText} placeholder={side === 'right' ? 'Komandos žinutė...' : 'Gavėjo žinutė...'} className={`w-full bg-transparent border-none outline-none text-[15px] leading-relaxed placeholder:opacity-50 ${side === 'right' ? 'text-white placeholder:text-white/40' : 'text-base-content placeholder:text-base-content/30'}`} />
        <div className={`flex gap-2 justify-end mt-1.5 pt-1.5 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-base-content/10'}`}>
          <button onClick={onCancel} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${side === 'right' ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5'}`}>Atšaukti</button>
          <button onClick={() => { const t = text.trim(); if (t) onSave(t); }} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${side === 'right' ? 'text-white bg-white/20 hover:bg-white/30' : 'text-primary bg-primary/10 hover:bg-primary/20'}`}>Išsaugoti</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Bendra
// ---------------------------------------------------------------------------

function TabBendra({ record, meta }: { record: NestandartiniaiRecord; meta: Record<string, string> }) {
  const extraMeta = Object.entries(meta).filter(([k]) => !ALL_MAIN_KEYS.has(k));
  const hasRow1 = INFO_ROW_1.some(f => meta[f.key]);
  const hasRow2 = INFO_ROW_2.some(f => meta[f.key]);

  return (
    <div className="space-y-0">
      {/* Info grid */}
      {(hasRow1 || hasRow2) && (
        <div className="pb-4">
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            {INFO_ROW_1.map(f => <InfoField key={f.key} label={f.label} value={meta[f.key]} />)}
            {INFO_ROW_2.map(f => <InfoField key={f.key} label={f.label} value={meta[f.key]} />)}
          </div>
        </div>
      )}

      {/* Description */}
      {record.description && (
        <div className="border-t border-base-content/10">
          <CollapsibleSection title="Aprašymas" defaultOpen>
            <div className="text-sm leading-[1.7] whitespace-pre-wrap overflow-y-auto rounded-lg p-4 mb-3 text-base-content bg-base-content/[0.02] border border-base-content/5" style={{ maxHeight: '220px' }}>
              {record.description}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Extra metadata */}
      {(extraMeta.length > 0 || record.derva || meta.talpa) && (
        <div className="border-t border-base-content/10">
          <CollapsibleSection title="Papildomi duomenys">
            <div className="grid grid-cols-3 gap-x-6 gap-y-2 pb-3">
              {meta.talpa && <InfoField label="Talpa" value={meta.talpa} />}
              {record.pateikimo_data && <InfoField label="Pateikimo data" value={record.pateikimo_data} />}
              {extraMeta.map(([k, v]) => <InfoField key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Susirašinėjimas
// ---------------------------------------------------------------------------

function TabSusirasinejimas({ record, readOnly, pendingMessages, onAddMessage }: {
  record: NestandartiniaiRecord;
  readOnly?: boolean;
  pendingMessages?: AtsakymasMessage[];
  onAddMessage?: (msg: AtsakymasMessage) => void;
}) {
  const existingMessages = parseAtsakymas(record.atsakymas);
  const allMessages = [...existingMessages, ...(pendingMessages || [])];
  const [addingSide, setAddingSide] = useState<'left' | 'right' | null>(null);
  const pendingCount = pendingMessages?.length || 0;

  const handleSave = (text: string, side: 'left' | 'right') => {
    const msg: AtsakymasMessage = { text, role: side === 'left' ? 'recipient' : 'team', date: new Date().toISOString().slice(0, 10) };
    onAddMessage?.(msg);
    setAddingSide(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {allMessages.length > 0 ? `${allMessages.length} žinutės` : 'Nėra žinučių'}
          {pendingCount > 0 && <span className="text-amber-500 ml-1.5">({pendingCount} naujos)</span>}
        </p>
      </div>

      {allMessages.map((msg, i) => (
        <ChatBubble key={i} message={msg} side={msg.role === 'team' ? 'right' : 'left'} />
      ))}

      {!readOnly && addingSide && (
        <NewMessageBubble side={addingSide} onSave={t => handleSave(t, addingSide)} onCancel={() => setAddingSide(null)} />
      )}

      {!readOnly && !addingSide && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-base-content/10">
          <button onClick={() => setAddingSide('left')} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-3xl transition-all text-base-content" style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}>
            <Plus className="w-3.5 h-3.5" /> Gavėjas
          </button>
          <button onClick={() => setAddingSide('right')} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-3xl text-white transition-all hover:brightness-95" style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
            <Plus className="w-3.5 h-3.5" /> Komanda
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Užduotys
// ---------------------------------------------------------------------------

function TabUzduotys({ record, readOnly }: { record: NestandartiniaiRecord; readOnly?: boolean }) {
  const [tasks, setTasks] = useState<TaskItem[]>(() => (parseJSON<TaskItem[]>(record.tasks) || []));
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (updated: TaskItem[]) => {
    setTasks(updated);
    try { setSaving(true); await updateNestandartiniaiTasks(record.id, updated); } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    save([...tasks, { id: crypto.randomUUID(), title, completed: false, created_at: new Date().toISOString().slice(0, 10), priority: 'medium' }]);
    setNewTitle('');
  };

  const toggle = (id: string) => save(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const remove = (id: string) => save(tasks.filter(t => t.id !== id));

  const priorityColor = (p?: string) => {
    if (p === 'high') return '#FF3B30';
    if (p === 'low') return '#34C759';
    return '#FF9500';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {tasks.length > 0 ? `${tasks.filter(t => t.completed).length}/${tasks.length} atlikta` : 'Nėra užduočių'}
        </p>
        {saving && <span className="text-xs text-base-content/40">Saugoma...</span>}
      </div>

      <div className="space-y-1.5">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-macos transition-colors group"
            style={{ background: task.completed ? 'rgba(0,0,0,0.02)' : 'transparent' }}
          >
            {!readOnly ? (
              <button onClick={() => toggle(task.id)} className="mt-0.5 shrink-0">
                <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all"
                  style={task.completed
                    ? { background: '#007AFF', border: 'none' }
                    : { background: '#fff', border: '1.5px solid #d4cfc8' }
                  }
                >
                  {task.completed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </button>
            ) : (
              <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center mt-0.5 shrink-0"
                style={task.completed ? { background: '#007AFF' } : { background: '#fff', border: '1.5px solid #d4cfc8' }}
              >
                {task.completed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${task.completed ? 'line-through text-base-content/40' : 'text-base-content'}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor(task.priority) }} />
                <span className="text-xs text-base-content/40">{task.created_at}</span>
                {task.due_date && <span className="text-xs text-base-content/40">→ {task.due_date}</span>}
              </div>
            </div>
            {!readOnly && (
              <button onClick={() => remove(task.id)} className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded transition-all" style={{ color: '#FF3B30' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add task */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-base-content/10">
          <div className="flex-1 flex items-center rounded-3xl border border-base-content/8 px-4 py-2 transition-all focus-within:border-base-content/15 focus-within:shadow-sm" style={{ background: '#f8f8f9' }}>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Nauja užduotis..."
              className="flex-1 bg-transparent text-[15px] text-base-content placeholder:text-base-content/30 outline-none border-none"
            />
          </div>
          <button onClick={addTask} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all bg-base-content text-base-100 hover:opacity-80">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Failai
// ---------------------------------------------------------------------------

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

interface AttachedFile {
  directus_file_id: string;
  file_name: string;
  filename_disk: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

/** A file selected locally but not yet uploaded to Directus */
interface PendingFile {
  localId: string;
  file: File;
}

/**
 * The `files` column (now text type) stores comma-separated Directus file UUIDs.
 * e.g. "uuid1,uuid2,uuid3" or a single "uuid1".
 */
function getFileIds(record: NestandartiniaiRecord): string[] {
  if (!record.files || typeof record.files !== 'string') return [];
  return record.files.split(',').map(s => s.trim()).filter(s => s.length >= 32);
}

function formatFileSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function TabFailai({ record, readOnly, pendingFiles, onAddFiles, onRemovePendingFile }: {
  record: NestandartiniaiRecord;
  readOnly?: boolean;
  pendingFiles?: PendingFile[];
  onAddFiles?: (files: File[]) => void;
  onRemovePendingFile?: (localId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCount = pendingFiles?.length || 0;

  // Fetch metadata for ALL existing file UUIDs from Directus
  const [existingFiles, setExistingFiles] = useState<AttachedFile[]>([]);
  const fileIds = getFileIds(record);
  const fileIdsKey = fileIds.join(',');
  useEffect(() => {
    if (fileIds.length === 0) { setExistingFiles([]); return; }
    const ids = fileIds;
    Promise.all(
      ids.map(fileId =>
        fetch(`${DIRECTUS_URL}/files/${fileId}`, {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
        })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(json => {
            const f = json.data;
            return {
              directus_file_id: f.id,
              file_name: f.filename_download || 'Failas',
              filename_disk: f.filename_disk || '',
              file_size: f.filesize || 0,
              mime_type: f.type || '',
              uploaded_at: f.uploaded_on || '',
            } as AttachedFile;
          })
          .catch(() => null)
      )
    ).then(results => setExistingFiles(results.filter(Boolean) as AttachedFile[]));
  }, [fileIdsKey]);

  const totalCount = existingFiles.length + pendingCount;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    const fileArray = Array.from(selected); // snapshot before clearing input
    if (fileInputRef.current) fileInputRef.current.value = '';
    onAddFiles?.(fileArray);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {totalCount > 0 ? `${totalCount} ${totalCount === 1 ? 'failas' : 'failai'}` : 'Nėra failų'}
          {pendingCount > 0 && <span className="text-amber-500 ml-1.5">({pendingCount} nauji)</span>}
        </p>
        {!readOnly && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-3xl text-white transition-all hover:opacity-80"
            style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
          >
            <Upload className="w-3.5 h-3.5" /> Įkelti
          </button>
        )}
      </div>

      {/* Existing files table */}
      {existingFiles.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-base-content/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-content/10 bg-base-content/[0.02]">
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40">Pavadinimas</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40 w-20">Dydis</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-base-content/40 w-24">Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {existingFiles.map((file, idx) => (
                <tr key={file.directus_file_id} className="border-b border-base-content/5 last:border-b-0 hover:bg-base-content/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs text-base-content/40">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className="text-sm text-base-content truncate max-w-[200px]" title={file.file_name}>{file.file_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-base-content/40">{formatFileSize(file.file_size)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <a
                        href={`${DIRECTUS_URL}/assets/${file.directus_file_id}?access_token=${DIRECTUS_TOKEN}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-lg transition-colors hover:bg-base-content/5"
                        title="Peržiūrėti"
                      >
                        <Eye className="w-3.5 h-3.5 text-base-content/40" />
                      </a>
                      <a
                        href={`${DIRECTUS_URL}/assets/${file.directus_file_id}?access_token=${DIRECTUS_TOKEN}&download`}
                        className="p-1 rounded-lg transition-colors hover:bg-base-content/5"
                        title="Atsisiųsti"
                      >
                        <Download className="w-3.5 h-3.5 text-base-content/40" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending files - separate section for visibility */}
      {pendingCount > 0 && (
        <div className={`rounded-xl border-2 border-dashed overflow-hidden ${existingFiles.length > 0 ? 'mt-3' : ''}`} style={{ borderColor: '#d97706' }}>
          <div className="px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5" style={{ background: 'rgba(217,119,6,0.12)', color: '#d97706' }}>
            <Upload className="w-3 h-3" />
            Paruošti įkėlimui ({pendingCount})
          </div>
          {pendingFiles!.map((pf) => (
            <div
              key={`pending-${pf.localId}`}
              className="flex items-center gap-3 px-3 py-2 border-t"
              style={{ borderColor: 'rgba(217,119,6,0.2)' }}
            >
              <FileText className="w-4 h-4 shrink-0" style={{ color: '#d97706' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-base-content truncate" title={pf.file.name}>{pf.file.name}</p>
                <p className="text-[11px] text-base-content/40">{formatFileSize(pf.file.size)}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706' }}>Laukia</span>
              {!readOnly && (
                <button
                  onClick={() => onRemovePendingFile?.(pf.localId)}
                  className="p-1 rounded-lg transition-colors hover:bg-error/10 shrink-0"
                  title="Pašalinti"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
          <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center bg-base-content/[0.06]">
            <Paperclip className="w-5 h-5 text-base-content/30" />
          </div>
          <p className="text-sm font-semibold text-base-content">Nėra failų</p>
        </div>
      )}

      {!readOnly && (
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Derva
// ---------------------------------------------------------------------------

function TabDerva({ record, readOnly }: { record: NestandartiniaiRecord; readOnly?: boolean }) {
  const [dervaResult, setDervaResult] = useState<string | null>(record.derva || null);
  const [selecting, setSelecting] = useState(false);
  const [dervaError, setDervaError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // AI conversation (secondary feature)
  const [conversation, setConversation] = useState<AiConversationMessage[]>(() => parseJSON<AiConversationMessage[]>(record.ai_conversation) || []);
  const [input, setInput] = useState('');
  const [chatSaving, setChatSaving] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const triggerDervaSelect = async () => {
    setDervaError(null);
    setSuccess(false);
    setSelecting(true);

    try {
      const webhookUrl = await getWebhookUrl('n8n_derva_select');
      if (!webhookUrl) {
        setDervaError('Webhook "n8n_derva_select" nesukonfigūruotas. Nustatykite jį Webhooks nustatymuose.');
        return;
      }

      const meta = typeof record.metadata === 'string' ? record.metadata : JSON.stringify(record.metadata);
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.id,
          project_name: record.project_name,
          description: record.description,
          metadata: meta,
          klientas: record.klientas,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Serverio klaida (${resp.status})${errText ? `: ${errText}` : ''}`);
      }

      // Webhook returns only a status code. Fetch the actual recommendation
      // from the n8n_vector_store "derva" column.
      const updated = await fetchNestandartiniaiById(record.id);
      const recommendation = updated?.derva || null;
      setDervaResult(recommendation);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e: any) {
      console.error('Derva select error:', e);
      setDervaError(e.message || 'Nepavyko gauti dervos rekomendacijos');
      // The webhook may have completed server-side — try fetching the latest value
      try {
        const updated = await fetchNestandartiniaiById(record.id);
        if (updated?.derva) setDervaResult(updated.derva);
      } catch { /* ignore */ }
    } finally {
      setSelecting(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setChatError(null);
    const userMsg: AiConversationMessage = { role: 'user', text, timestamp: new Date().toISOString() };
    const withUserMsg = [...conversation, userMsg];
    setConversation(withUserMsg);
    setInput('');

    try {
      setChatSaving(true);
      await updateNestandartiniaiAiConversation(record.id, withUserMsg);

      const webhookUrl = await getWebhookUrl('n8n_ai_conversation');
      if (webhookUrl) {
        const meta = typeof record.metadata === 'string' ? record.metadata : JSON.stringify(record.metadata);
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record_id: record.id,
            project_name: record.project_name,
            description: record.description,
            metadata: meta,
            klientas: record.klientas,
            derva: dervaResult,
            chat_history: withUserMsg,
            user_request: text,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const aiText = typeof data === 'string' ? data : (data.response || data.text || data.message || data.output || JSON.stringify(data));
          const aiMsg: AiConversationMessage = { role: 'assistant', text: aiText, timestamp: new Date().toISOString() };
          const withAiMsg = [...withUserMsg, aiMsg];
          setConversation(withAiMsg);
          await updateNestandartiniaiAiConversation(record.id, withAiMsg);
        } else {
          setChatError(`Webhook klaida: ${resp.status}`);
        }
      } else {
        setChatError('Webhook "n8n_ai_conversation" nesukonfigūruotas.');
      }
    } catch (e: any) {
      console.error(e);
      setChatError(e.message || 'Nepavyko gauti AI atsakymo');
    } finally {
      setChatSaving(false);
    }
  };

  return (
    <div>
      {/* ── Derva selection section ── */}
      <div className="mb-6">
        <div className="flex items-center justify-end mb-3">
          {!readOnly && (
            <button
              onClick={triggerDervaSelect}
              disabled={selecting}
              className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-3xl text-white transition-all hover:opacity-80 disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
            >
              {selecting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizuojama...</>
                : dervaResult
                  ? <><RefreshCw className="w-3.5 h-3.5" /> Parinkti iš naujo</>
                  : <><Beaker className="w-3.5 h-3.5" /> Parinkti dervą</>
              }
            </button>
          )}
        </div>


        {/* Loading state */}
        {selecting && (
          <div className="rounded-xl p-6 mb-4 text-center border border-primary/15 bg-primary/[0.03]">
            <div className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center bg-primary/10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
            <p className="text-sm font-semibold text-base-content">Vyksta dervos parinkimas...</p>
          </div>
        )}

        {/* Success toast */}
        {success && !selecting && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-success/10 text-success border border-success/15">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Dervos rekomendacija sėkmingai atnaujinta
          </div>
        )}

        {/* Error */}
        {dervaError && (
          <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-error/5 text-error border border-error/10">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{dervaError}</span>
          </div>
        )}

        {/* Recommendation display */}
        {dervaResult && !selecting ? (
          <div className="rounded-xl p-4 border border-blue-200/60" style={{ background: 'rgba(219, 234, 254, 0.25)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Beaker className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-medium text-primary">Rekomendacija</p>
            </div>
            <MarkdownText text={dervaResult} />
          </div>
        ) : !selecting && !dervaResult && (
          <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
            <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center bg-primary/10">
              <Beaker className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-base-content">Derva dar neparinkta</p>
          </div>
        )}
      </div>

      {/* ── AI conversation section ── */}
      <div className="pt-5 border-t border-base-content/10">
        <CollapsibleSection title="AI pokalbis" defaultOpen={conversation.length > 0}>
          {conversation.length > 0 && (
            <div className="mb-4">
              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2.5`}>
                  <div
                    className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${msg.role === 'user' ? 'text-base-content' : 'text-base-content'}`}
                    style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                  >
                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(1.625rem * 6)' }}>
                      {msg.role === 'assistant'
                        ? <MarkdownText text={msg.text} />
                        : <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {chatSaving && (
            <div className="flex justify-start mb-2.5">
              <div className="rounded-3xl px-4 py-2.5" style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}>
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-base-content/40" />
                  <span className="text-xs text-base-content/40">AI rašo...</span>
                </div>
              </div>
            </div>
          )}

          {chatError && (
            <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-error/5 text-error border border-error/10">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{chatError}</span>
            </div>
          )}

          {!readOnly && (
            <div className={`flex items-end gap-2 pt-3 ${conversation.length > 0 ? 'border-t border-base-content/10' : ''}`}>
              <div className="flex-1 flex items-end rounded-3xl border border-base-content/8 px-4 py-2 transition-all focus-within:border-base-content/15 focus-within:shadow-sm" style={{ background: '#f8f8f9' }}>
                <AutoTextarea
                  value={input}
                  onChange={setInput}
                  placeholder="Klauskite AI apie dervą..."
                  className="flex-1 bg-transparent text-[15px] text-base-content placeholder:text-base-content/30 outline-none border-none py-0.5"
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={chatSaving || !input.trim()}
                className="flex-shrink-0 w-8 h-8 mb-0.5 flex items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:bg-base-content/10 disabled:text-base-content/25 bg-base-content text-base-100 hover:opacity-80"
              >
                {chatSaving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                }
              </button>
            </div>
          )}

        </CollapsibleSection>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Panašūs
// ---------------------------------------------------------------------------

function TabPanasus({ record }: { record: NestandartiniaiRecord }) {
  const projects = parseJSON<SimilarProject[]>(record.similar_projects) || [];

  return (
    <div>
      {projects.length > 0 ? (
        <div className="space-y-1.5">
          {projects.map((p, i) => (
            <a
              key={p.id}
              href={`/paklausimas/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150 border border-transparent hover:bg-base-content/[0.03] hover:border-base-content/10"
              style={{ background: 'rgba(0,0,0,0.02)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate text-base-content">
                  {p.project_name || `Projektas #${p.id}`}
                </p>
                <p className="text-xs mt-0.5 text-base-content/40">ID: {p.id}</p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-3 bg-success/10 text-success">
                {Math.round(p.similarity_score * 100)}%
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center bg-base-content/[0.06]">
            <GitCompareArrows className="w-5 h-5 text-base-content/30" />
          </div>
          <p className="text-sm font-medium mb-1 text-base-content">Panašūs projektai</p>
          <p className="text-xs max-w-[240px] text-base-content/40" style={{ lineHeight: '1.6' }}>
            Panašiausi projektai bus rodomi, kai bus sugeneruoti per n8n.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (editable, used from within the app)
// ---------------------------------------------------------------------------

export function PaklausimoModal({ record, onClose }: { record: NestandartiniaiRecord; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<ModalTab>('bendra');
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dirtyTabs, setDirtyTabs] = useState<Set<ModalTab>>(new Set());
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const meta = parseMetadata(record.metadata);
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;
  const [copied, setCopied] = useState(false);
  const hasContextChanges = dirtyTabs.size > 0;

  // Pending data: stored locally until Atnaujinti is pressed
  const [pendingMessages, setPendingMessages] = useState<AtsakymasMessage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const copy = () => {
    navigator.clipboard.writeText(cardUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const addPendingMessage = useCallback((msg: AtsakymasMessage) => {
    setPendingMessages(prev => [...prev, msg]);
    setDirtyTabs(prev => new Set(prev).add('susirasinejimas'));
  }, []);

  const addPendingFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const newPending = files.map(f => ({ localId: crypto.randomUUID(), file: f }));
    setPendingFiles(prev => [...prev, ...newPending]);
    setDirtyTabs(prev => new Set(prev).add('failai'));
  }, []);

  const removePendingFile = useCallback((localId: string) => {
    setPendingFiles(prev => {
      const next = prev.filter(pf => pf.localId !== localId);
      // If no pending files left, clear the dirty flag for failai
      if (next.length === 0) {
        setDirtyTabs(prev2 => {
          const s = new Set(prev2);
          s.delete('failai');
          return s;
        });
      }
      return next;
    });
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateStatus('idle');
    try {
      // 1. Save pending messages to DB
      if (pendingMessages.length > 0) {
        const existingMessages = parseAtsakymas(record.atsakymas);
        const allMessages = [...existingMessages, ...pendingMessages];
        await updateNestandartiniaiAtsakymas(record.id, allMessages);
      }

      // 2. Upload pending files to Directus and store last UUID in `files` field
      const uploadedFileIds: string[] = [];
      if (pendingFiles.length > 0) {
        for (const pf of pendingFiles) {
          const form = new FormData();
          form.append('file', pf.file);
          const resp = await fetch(`${DIRECTUS_URL}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            body: form,
          });
          if (!resp.ok) throw new Error(`Failo įkėlimas nepavyko: ${resp.status}`);
          const json = await resp.json();
          uploadedFileIds.push(json.data.id);
        }

        // Append new UUIDs to existing ones, store comma-separated in `files`
        const existingIds = getFileIds(record);
        const allIds = [...new Set([...existingIds, ...uploadedFileIds])];
        await updateNestandartiniaiField(record.id, 'files', allIds.join(','));
      }

      // 3. Trigger webhook (include uploaded file UUIDs so the handler can process them)
      const webhookUrl = await getWebhookUrl('nestandartinio_iraso_atnaujinimas');
      if (!webhookUrl) throw new Error('Webhook nesukonfigūruotas');
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.id,
          ...(uploadedFileIds.length > 0 ? { uploaded_file_ids: uploadedFileIds } : {}),
        }),
      });
      if (!resp.ok) throw new Error(`Klaida: ${resp.status}`);

      // 4. Clear pending state
      setUpdateStatus('success');
      setPendingMessages([]);
      setPendingFiles([]);
      setDirtyTabs(new Set());
      setShowCloseConfirm(false);
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Update error:', err);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = () => {
    if (hasContextChanges) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-6"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={handleClose}
    >
      <div
        className="w-full flex flex-col bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl"
        style={{ maxWidth: '960px', height: 'min(90vh, 860px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Accent strip */}
        <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-base-content/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold truncate text-base-content" style={{ letterSpacing: '-0.02em' }}>
                {record.project_name || 'Paklausimas'}
              </h2>
              {meta.pritaikymas ? (
                <p className="text-sm mt-0.5 truncate text-base-content/50">{meta.pritaikymas}</p>
              ) : (
                <p className="text-sm mt-0.5 text-base-content/40">
                  Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {record.klientas && (
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">
                  {record.klientas}
                </span>
              )}
              <button onClick={copy} className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5" title="Kopijuoti nuorodą">
                <Link2 className={`w-4 h-4 ${copied ? '' : 'text-base-content/40'}`} style={copied ? { color: '#34C759' } : undefined} />
              </button>
              <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5" title="Atidaryti naujame lange">
                <ExternalLink className="w-4 h-4 text-base-content/40" />
              </a>
              <button onClick={handleClose} className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5">
                <X className="w-4 h-4 text-base-content/40" />
              </button>
            </div>
          </div>
        </div>

        {/* Body: sidebar tabs + content */}
        <div className="flex flex-1 min-h-0">
          {/* Side tabs */}
          <div className="w-[160px] shrink-0 py-3 px-2 border-r border-base-content/10 bg-base-200/40">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 mb-0.5 ${active ? 'font-medium bg-base-100 border border-base-content/15 shadow-sm text-primary' : 'text-base-content/60 hover:bg-base-content/5'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{tab.label}</span>
                  {dirtyTabs.has(tab.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                </button>
              );
            })}
            {/* Context update button */}
            <button
              onClick={handleUpdate}
              disabled={updating}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-3xl text-xs font-medium transition-all mt-2 ${
                updateStatus === 'success'
                  ? 'text-success bg-success/10 border border-success/20'
                  : updateStatus === 'error'
                    ? 'text-error bg-error/5 border border-error/15'
                    : hasContextChanges
                      ? 'text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100'
                      : 'text-base-content/40 border border-base-content/8 hover:bg-base-content/5'
              } disabled:opacity-60`}
              style={!hasContextChanges && updateStatus === 'idle' ? { background: '#f8f8f9' } : undefined}
            >
              {updating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Atnaujinama...</>
                : updateStatus === 'success'
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Atnaujinta</>
                  : updateStatus === 'error'
                    ? <><AlertCircle className="w-3.5 h-3.5" /> Klaida</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> Atnaujinti</>
              }
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-base-100">
            {activeTab === 'bendra' && <TabBendra record={record} meta={meta} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={record} pendingMessages={pendingMessages} onAddMessage={addPendingMessage} />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} />}
            {activeTab === 'failai' && <TabFailai record={record} pendingFiles={pendingFiles} onAddFiles={addPendingFiles} onRemovePendingFile={removePendingFile} />}
            {activeTab === 'derva' && <TabDerva record={record} />}
            {activeTab === 'panasus' && <TabPanasus record={record} />}
          </div>
        </div>
      </div>

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="bg-base-100 rounded-xl border border-base-content/10 shadow-2xl p-6 max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm font-semibold text-base-content">Neatnaujintas kontekstas</p>
            </div>
            <p className="text-xs text-base-content/50 mb-5" style={{ lineHeight: '1.6' }}>
              Pridėjote naujų duomenų, bet nepaleidote konteksto atnaujinimo. Projekto aprašymas ir metaduomenys nebus atnaujinti pagal naujus duomenis.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="text-xs px-4 py-2 rounded-3xl text-base-content/50 hover:bg-base-content/5 transition-colors"
              >
                Uždaryti
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="text-xs px-4 py-2 rounded-3xl font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)' }}
              >
                {updating ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />Atnaujinama...</> : 'Atnaujinti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone page – /paklausimas/:id (read-only, shareable)
// ---------------------------------------------------------------------------

export default function PaklausimoKortelePage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<NestandartiniaiRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('bendra');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try { setLoading(true); const d = await fetchNestandartiniaiById(Number(id)); if (!d) { setError('Įrašas nerastas'); return; } setRecord(d); }
      catch (err: any) { setError(err?.message || 'Nepavyko gauti duomenų'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-base-100"><span className="loading loading-spinner loading-md text-primary"></span></div>;
  if (error || !record) return <div className="h-screen flex items-center justify-center bg-base-100"><div className="text-center"><p className="text-lg font-medium mb-1 text-base-content">{error || 'Nerastas'}</p><p className="text-sm text-base-content/40">Patikrinkite nuorodą.</p></div></div>;

  const meta = parseMetadata(record.metadata);

  const readOnlyTabs = TABS;

  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden bg-base-100">
      <div className="w-full flex flex-col bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl" style={{ maxWidth: '960px', height: 'min(90vh, 860px)' }}>
        {/* Accent strip */}
        <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-base-content/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold truncate text-base-content" style={{ letterSpacing: '-0.02em' }}>{record.project_name || 'Paklausimas'}</h2>
              {meta.pritaikymas ? (
                <p className="text-sm mt-0.5 truncate text-base-content/50">{meta.pritaikymas}</p>
              ) : (
                <p className="text-sm mt-0.5 text-base-content/40">Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}</p>
              )}
            </div>
            {record.klientas && (
              <span className="text-xs font-medium px-3 py-1 rounded-full shrink-0 bg-primary/10 text-primary">{record.klientas}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[160px] shrink-0 py-3 px-2 border-r border-base-content/10 bg-base-200/40">
            {readOnlyTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 mb-0.5 ${active ? 'font-medium bg-base-100 border border-base-content/15 shadow-sm text-primary' : 'text-base-content/60 hover:bg-base-content/5'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-base-100">
            {activeTab === 'bendra' && <TabBendra record={record} meta={meta} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={record} readOnly />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} readOnly />}
            {activeTab === 'failai' && <TabFailai record={record} readOnly />}
            {activeTab === 'derva' && <TabDerva record={record} readOnly />}
            {activeTab === 'panasus' && <TabPanasus record={record} />}
          </div>
        </div>
      </div>
    </div>
  );
}
