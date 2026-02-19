import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  X, ExternalLink, Link2, ChevronDown, Plus,
  LayoutList, MessageSquare, CheckSquare, Sparkles, GitCompareArrows, Paperclip,
} from 'lucide-react';
import {
  fetchNestandartiniaiById,
  updateNestandartiniaiAtsakymas,
  updateNestandartiniaiTasks,
  updateNestandartiniaiAiConversation,
} from '../lib/dokumentaiService';
import type {
  NestandartiniaiRecord, AtsakymasMessage, TaskItem, AiConversationMessage, SimilarProject,
} from '../lib/dokumentaiService';

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

type ModalTab = 'bendra' | 'susirasinejimas' | 'uzduotys' | 'failai' | 'ai' | 'panasus';

const TABS: { id: ModalTab; label: string; icon: React.ElementType }[] = [
  { id: 'bendra', label: 'Bendra', icon: LayoutList },
  { id: 'susirasinejimas', label: 'Susirašinėjimas', icon: MessageSquare },
  { id: 'uzduotys', label: 'Užduotys', icon: CheckSquare },
  { id: 'failai', label: 'Failai', icon: Paperclip },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'panasus', label: 'Panašūs', icon: GitCompareArrows },
];

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left py-2.5 text-sm font-medium transition-colors" style={{ color: '#5a5550' }}>
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
      <dt className="text-xs" style={{ color: '#8a857f' }}>{label}</dt>
      <dd className="text-sm font-medium mt-0.5" style={{ color: '#3d3935' }}>{value}</dd>
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
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-macos-gray-900'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f0f0f2', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/60' : 'text-macos-gray-400'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}{message.date}
          </p>
        )}
        <div className="text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'calc(1.625rem * 4)' }}>
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
      <div className={`max-w-[80%] w-72 rounded-2xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-macos-gray-900'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f0f0f2', border: '1px solid #e5e5e6' }
        }
      >
        <AutoTextarea value={text} onChange={setText} placeholder={side === 'right' ? 'Komandos žinutė...' : 'Gavėjo žinutė...'} className={`w-full bg-transparent border-none outline-none text-sm leading-relaxed placeholder:opacity-50 ${side === 'right' ? 'text-white placeholder:text-white/40' : 'text-macos-gray-900 placeholder:text-macos-gray-400'}`} />
        <div className={`flex gap-2 justify-end mt-1.5 pt-1.5 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-macos-gray-200'}`}>
          <button onClick={onCancel} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${side === 'right' ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-macos-gray-400 hover:text-macos-gray-600 hover:bg-macos-gray-100'}`}>Atšaukti</button>
          <button onClick={() => { const t = text.trim(); if (t) onSave(t); }} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${side === 'right' ? 'text-white bg-white/20 hover:bg-white/30' : 'text-macos-blue bg-macos-blue/10 hover:bg-macos-blue/20'}`}>Išsaugoti</button>
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
        <div style={{ borderTop: '1px solid #f0ede8' }}>
          <CollapsibleSection title="Aprašymas" defaultOpen>
            <div className="text-sm leading-[1.7] whitespace-pre-wrap overflow-y-auto rounded-macos p-4 mb-3" style={{ color: '#3d3935', background: '#faf9f7', border: '1px solid #f0ede8', maxHeight: '220px' }}>
              {record.description}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Extra metadata */}
      {(extraMeta.length > 0 || record.ai || meta.talpa) && (
        <div style={{ borderTop: '1px solid #f0ede8' }}>
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

function TabSusirasinejimas({ record, readOnly }: { record: NestandartiniaiRecord; readOnly?: boolean }) {
  const [messages, setMessages] = useState<AtsakymasMessage[]>(() => parseAtsakymas(record.atsakymas));
  const [addingSide, setAddingSide] = useState<'left' | 'right' | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (text: string, side: 'left' | 'right') => {
    const msg: AtsakymasMessage = { text, role: side === 'left' ? 'recipient' : 'team', date: new Date().toISOString().slice(0, 10) };
    const updated = [...messages, msg];
    setMessages(updated);
    setAddingSide(null);
    try { setSaving(true); await updateNestandartiniaiAtsakymas(record.id, updated); } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: '#8a857f' }}>
          {messages.length > 0 ? `${messages.length} žinutės` : 'Nėra žinučių'}
        </p>
        {saving && <span className="text-xs" style={{ color: '#8a857f' }}>Saugoma...</span>}
      </div>

      {messages.map((msg, i) => (
        <ChatBubble key={i} message={msg} side={msg.role === 'team' ? 'right' : 'left'} />
      ))}

      {!readOnly && addingSide && (
        <NewMessageBubble side={addingSide} onSave={t => handleSave(t, addingSide)} onCancel={() => setAddingSide(null)} />
      )}

      {!readOnly && !addingSide && (
        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid #f0ede8' }}>
          <button onClick={() => setAddingSide('left')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all hover:brightness-95" style={{ background: '#f0f0f2', border: '1px solid #e5e5e6', color: '#5a5550' }}>
            <Plus className="w-3.5 h-3.5" /> Gavėjas
          </button>
          <button onClick={() => setAddingSide('right')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-white transition-all hover:brightness-95" style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
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
        <p className="text-xs" style={{ color: '#8a857f' }}>
          {tasks.length > 0 ? `${tasks.filter(t => t.completed).length}/${tasks.length} atlikta` : 'Nėra užduočių'}
        </p>
        {saving && <span className="text-xs" style={{ color: '#8a857f' }}>Saugoma...</span>}
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
              <p className={`text-sm leading-snug ${task.completed ? 'line-through' : ''}`} style={{ color: task.completed ? '#8a857f' : '#3d3935' }}>
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor(task.priority) }} />
                <span className="text-xs" style={{ color: '#8a857f' }}>{task.created_at}</span>
                {task.due_date && <span className="text-xs" style={{ color: '#8a857f' }}>→ {task.due_date}</span>}
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
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #f0ede8' }}>
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Nauja užduotis..."
            className="flex-1 text-sm px-3 py-2 rounded-macos outline-none transition-all"
            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
          />
          <button onClick={addTask} className="text-xs px-3 py-2 rounded-macos font-medium text-white transition-all hover:brightness-95" style={{ background: '#007AFF' }}>
            Pridėti
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Failai (placeholder)
// ---------------------------------------------------------------------------

function TabFailai({ readOnly }: { readOnly?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Paperclip className="w-10 h-10 mb-3" style={{ color: '#d4cfc8' }} />
      <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>Failai</p>
      <p className="text-xs max-w-[240px]" style={{ color: '#8a857f', lineHeight: '1.6' }}>
        Brėžiniai, sutartys ir kiti dokumentai bus čia.
        {!readOnly && ' Directus failų sistemoje reikia sukonfigūruoti M2M ryšį.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: AI
// ---------------------------------------------------------------------------

function TabAI({ record, readOnly }: { record: NestandartiniaiRecord; readOnly?: boolean }) {
  const [conversation, setConversation] = useState<AiConversationMessage[]>(() => parseJSON<AiConversationMessage[]>(record.ai_conversation) || []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: AiConversationMessage = { role: 'user', text, timestamp: new Date().toISOString() };
    const updated = [...conversation, userMsg];
    setConversation(updated);
    setInput('');
    try { setSaving(true); await updateNestandartiniaiAiConversation(record.id, updated); } catch (e) { console.error(e); } finally { setSaving(false); }
    // TODO: Call n8n webhook for AI response
  };

  return (
    <div>
      {/* AI recommendation */}
      {record.ai && (
        <div className="mb-5">
          <p className="text-xs font-medium mb-2" style={{ color: '#8a857f' }}>AI rekomendacija</p>
          <div className="text-sm leading-[1.7] whitespace-pre-wrap rounded-macos p-4" style={{ color: '#3d3935', background: 'linear-gradient(135deg, rgba(0,122,255,0.04) 0%, rgba(175,82,222,0.04) 100%)', border: '1px solid rgba(0,122,255,0.1)' }}>
            {record.ai}
          </div>
        </div>
      )}

      {/* Conversation */}
      {conversation.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium mb-3" style={{ color: '#8a857f' }}>Pokalbis</p>
          {conversation.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2.5`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'text-white' : 'text-macos-gray-900'}`}
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }
                  : { background: '#f0f0f2', border: '1px solid #e5e5e6' }
                }
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'calc(1.625rem * 6)' }}>
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {!readOnly && (
        <div className="flex items-end gap-2 pt-3" style={{ borderTop: conversation.length > 0 || record.ai ? '1px solid #f0ede8' : 'none' }}>
          <AutoTextarea
            value={input}
            onChange={setInput}
            placeholder="Klauskite AI..."
            className="flex-1 text-sm px-3 py-2 rounded-macos outline-none transition-all bg-transparent"
            // Inline style on the wrapper instead
          />
          <button
            onClick={sendMessage}
            disabled={saving || !input.trim()}
            className="text-xs px-3 py-2 rounded-macos font-medium text-white transition-all hover:brightness-95 disabled:opacity-40"
            style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
          >
            {saving ? '...' : 'Siųsti'}
          </button>
        </div>
      )}
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
        <div className="space-y-2">
          {projects.map((p, i) => (
            <a
              key={p.id}
              href={`/paklausimas/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-macos transition-colors"
              style={{ background: 'rgba(0,0,0,0.02)', border: '0.5px solid rgba(0,0,0,0.06)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#3d3935' }}>
                  {p.project_name || `Projektas #${p.id}`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8a857f' }}>ID: {p.id}</p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ml-3" style={{ background: 'rgba(52,199,89,0.1)', color: '#34C759' }}>
                {Math.round(p.similarity_score * 100)}%
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitCompareArrows className="w-10 h-10 mb-3" style={{ color: '#d4cfc8' }} />
          <p className="text-sm font-medium mb-1" style={{ color: '#3d3935' }}>Panašūs projektai</p>
          <p className="text-xs max-w-[240px]" style={{ color: '#8a857f', lineHeight: '1.6' }}>
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
  const meta = parseMetadata(record.metadata);
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(cardUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-6"
      style={{ background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col bg-white rounded-macos-xl overflow-hidden"
        style={{ maxWidth: '960px', height: 'min(90vh, 860px)', boxShadow: '0 32px 64px rgba(0,0,0,0.14), 0 12px 24px rgba(0,0,0,0.06)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Accent strip */}
        <div className="h-1.5 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate" style={{ color: '#3d3935' }}>
                {record.project_name || 'Paklausimas'}
              </h2>
              {meta.pritaikymas ? (
                <p className="text-sm mt-0.5 truncate" style={{ color: '#5a5550' }}>{meta.pritaikymas}</p>
              ) : (
                <p className="text-sm mt-0.5" style={{ color: '#8a857f' }}>
                  Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {record.klientas && (
                <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                  {record.klientas}
                </span>
              )}
              <button onClick={copy} className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100" title="Kopijuoti nuorodą">
                <Link2 className="w-4 h-4" style={{ color: copied ? '#34C759' : '#8a857f' }} />
              </button>
              <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100" title="Atidaryti naujame lange">
                <ExternalLink className="w-4 h-4" style={{ color: '#8a857f' }} />
              </a>
              <button onClick={onClose} className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100">
                <X className="w-4 h-4" style={{ color: '#8a857f' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Body: sidebar tabs + content */}
        <div className="flex flex-1 min-h-0">
          {/* Side tabs */}
          <div className="w-[160px] shrink-0 py-3 px-2" style={{ borderRight: '1px solid #f0ede8', background: '#faf9f7' }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-macos text-left text-sm transition-all mb-0.5 ${active ? 'font-medium' : ''}`}
                  style={active
                    ? { background: '#fff', color: '#007AFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                    : { color: '#5a5550' }
                  }
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = ''; }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {activeTab === 'bendra' && <TabBendra record={record} meta={meta} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={record} />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} />}
            {activeTab === 'failai' && <TabFailai />}
            {activeTab === 'ai' && <TabAI record={record} />}
            {activeTab === 'panasus' && <TabPanasus record={record} />}
          </div>
        </div>
      </div>
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

  if (loading) return <div className="h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}><span className="loading loading-spinner loading-md text-macos-blue"></span></div>;
  if (error || !record) return <div className="h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}><div className="text-center"><p className="text-lg font-medium mb-1" style={{ color: '#3d3935' }}>{error || 'Nerastas'}</p><p className="text-sm" style={{ color: '#8a857f' }}>Patikrinkite nuorodą.</p></div></div>;

  const meta = parseMetadata(record.metadata);

  // Read-only tabs (no Failai since it's just a placeholder)
  const readOnlyTabs = TABS.filter(t => t.id !== 'failai');

  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden" style={{ background: '#fdfcfb' }}>
      <div className="w-full flex flex-col bg-white rounded-macos-xl overflow-hidden" style={{ maxWidth: '960px', height: 'min(90vh, 860px)', border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        {/* Accent strip */}
        <div className="h-1.5 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate" style={{ color: '#3d3935' }}>{record.project_name || 'Paklausimas'}</h2>
              {meta.pritaikymas ? (
                <p className="text-sm mt-0.5 truncate" style={{ color: '#5a5550' }}>{meta.pritaikymas}</p>
              ) : (
                <p className="text-sm mt-0.5" style={{ color: '#8a857f' }}>Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}</p>
              )}
            </div>
            {record.klientas && (
              <span className="text-xs font-medium px-3 py-1 rounded-full shrink-0" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>{record.klientas}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[160px] shrink-0 py-3 px-2" style={{ borderRight: '1px solid #f0ede8', background: '#faf9f7' }}>
            {readOnlyTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-macos text-left text-sm transition-all mb-0.5 ${active ? 'font-medium' : ''}`}
                  style={active ? { background: '#fff', color: '#007AFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#5a5550' }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {activeTab === 'bendra' && <TabBendra record={record} meta={meta} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={record} readOnly />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} readOnly />}
            {activeTab === 'ai' && <TabAI record={record} readOnly />}
            {activeTab === 'panasus' && <TabPanasus record={record} />}
          </div>
        </div>
      </div>
    </div>
  );
}
