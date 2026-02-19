import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { X, ExternalLink, Link2, ChevronDown, Plus } from 'lucide-react';
import { fetchNestandartiniaiById, updateNestandartiniaiAtsakymas } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord, AtsakymasMessage } from '../lib/dokumentaiService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, string>;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* plain text */ }
    return [{ text: raw }];
  }
  return [];
}

// The ordered metadata fields for the info grid
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
  ...INFO_ROW_1.map(r => r.key),
  ...INFO_ROW_2.map(r => r.key),
  'pritaikymas', 'talpa',
]);

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-2.5 text-sm font-medium transition-colors"
        style={{ color: '#5a5550' }}
      >
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
        {title}
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble (matches SDK style) - auto-sizes 1→4 lines then scrolls
// ---------------------------------------------------------------------------

function ChatBubble({
  message,
  side,
}: {
  message: AtsakymasMessage;
  side: 'left' | 'right';
}) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          side === 'right' ? 'text-white' : 'text-macos-gray-900'
        }`}
        style={
          side === 'right'
            ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
            : { background: '#f0f0f2', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/60' : 'text-macos-gray-400'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}
            {message.date}
          </p>
        )}
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto"
          style={{ maxHeight: 'calc(1.625rem * 4)' }}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-growing textarea (1 line → 4 lines max, then scrolls)
// ---------------------------------------------------------------------------

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 22; // ~text-sm leading-relaxed
    const maxHeight = lineHeight * 4;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ resize: 'none', minHeight: '22px' }}
      rows={1}
    />
  );
}

// ---------------------------------------------------------------------------
// New message input bubble
// ---------------------------------------------------------------------------

function NewMessageBubble({
  side,
  onSave,
  onCancel,
}: {
  side: 'left' | 'right';
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div
        className={`max-w-[80%] w-72 rounded-2xl px-4 py-2.5 ${
          side === 'right' ? 'text-white' : 'text-macos-gray-900'
        }`}
        style={
          side === 'right'
            ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
            : { background: '#f0f0f2', border: '1px solid #e5e5e6' }
        }
      >
        <AutoTextarea
          value={text}
          onChange={setText}
          placeholder={side === 'right' ? 'Komandos žinutė...' : 'Gavėjo žinutė...'}
          className={`w-full bg-transparent border-none outline-none text-sm leading-relaxed placeholder:opacity-50 ${
            side === 'right' ? 'text-white placeholder:text-white/40' : 'text-macos-gray-900 placeholder:text-macos-gray-400'
          }`}
        />
        <div className={`flex gap-2 justify-end mt-1.5 pt-1.5 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-macos-gray-200'}`}>
          <button
            onClick={onCancel}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              side === 'right'
                ? 'text-white/70 hover:text-white hover:bg-white/10'
                : 'text-macos-gray-400 hover:text-macos-gray-600 hover:bg-macos-gray-100'
            }`}
          >
            Atšaukti
          </button>
          <button
            onClick={handleSave}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              side === 'right'
                ? 'text-white bg-white/20 hover:bg-white/30'
                : 'text-macos-blue bg-macos-blue/10 hover:bg-macos-blue/20'
            }`}
          >
            Išsaugoti
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info field component
// ---------------------------------------------------------------------------

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
// Card Content (shared between modal & standalone page)
// ---------------------------------------------------------------------------

function CardContent({
  record,
  cardUrl,
  readOnly = false,
  onMessagesUpdate,
}: {
  record: NestandartiniaiRecord;
  cardUrl: string;
  readOnly?: boolean;
  onMessagesUpdate?: (messages: AtsakymasMessage[]) => void;
}) {
  const meta = parseMetadata(record.metadata);
  const [messages, setMessages] = useState<AtsakymasMessage[]>(() => parseAtsakymas(record.atsakymas));
  const [copied, setCopied] = useState(false);
  const [addingSide, setAddingSide] = useState<'left' | 'right' | null>(null);
  const [saving, setSaving] = useState(false);

  const extraMeta = Object.entries(meta).filter(([k]) => !ALL_MAIN_KEYS.has(k));
  const hasInfoRow1 = INFO_ROW_1.some(f => meta[f.key]);
  const hasInfoRow2 = INFO_ROW_2.some(f => meta[f.key]);

  const copy = () => {
    navigator.clipboard.writeText(cardUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveMessage = async (text: string, side: 'left' | 'right') => {
    const newMsg: AtsakymasMessage = {
      text,
      role: side === 'left' ? 'recipient' : 'team',
      date: new Date().toISOString().slice(0, 10),
    };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setAddingSide(null);

    try {
      setSaving(true);
      await updateNestandartiniaiAtsakymas(record.id, updated);
      onMessagesUpdate?.(updated);
    } catch (err) {
      console.error('Failed to save message:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white rounded-macos-lg overflow-hidden flex flex-col"
      style={{
        border: '0.5px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        height: '100%',
      }}
    >
      {/* Top accent strip */}
      <div className="h-1.5 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#3d3935' }}>
                {record.project_name || 'Paklausimas'}
              </h2>
              {meta.pritaikymas && (
                <p className="text-sm mt-0.5" style={{ color: '#5a5550' }}>
                  {meta.pritaikymas}
                </p>
              )}
              {!meta.pritaikymas && (
                <p className="text-sm mt-0.5" style={{ color: '#8a857f' }}>
                  Nr. {record.id}
                  {record.pateikimo_data && ` · ${record.pateikimo_data}`}
                </p>
              )}
            </div>
            {record.klientas && (
              <span
                className="shrink-0 text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(0, 122, 255, 0.08)', color: '#007AFF' }}
              >
                {record.klientas}
              </span>
            )}
          </div>

          {/* Copy link – only in editable mode */}
          {!readOnly && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 mt-3 text-xs transition-colors hover:opacity-70"
              style={{ color: '#8a857f' }}
            >
              <Link2 className="w-3.5 h-3.5" />
              {copied ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
            </button>
          )}
        </div>

        {/* Main info grid – 3 columns, 2 rows */}
        {(hasInfoRow1 || hasInfoRow2) && (
          <div className="px-6 py-4" style={{ borderTop: '1px solid #f0ede8' }}>
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {INFO_ROW_1.map(f => (
                <InfoField key={f.key} label={f.label} value={meta[f.key]} />
              ))}
              {INFO_ROW_2.map(f => (
                <InfoField key={f.key} label={f.label} value={meta[f.key]} />
              ))}
            </div>
          </div>
        )}

        {/* Collapsible description */}
        {record.description && (
          <div className="px-6" style={{ borderTop: '1px solid #f0ede8' }}>
            <CollapsibleSection title="Aprašymas">
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto rounded-macos p-3 mb-3"
                style={{ color: '#3d3935', background: '#faf9f7', border: '1px solid #f0ede8', maxHeight: '160px' }}
              >
                {record.description}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* Collapsible extra metadata */}
        {(extraMeta.length > 0 || record.ai || meta.talpa) && (
          <div className="px-6" style={{ borderTop: '1px solid #f0ede8' }}>
            <CollapsibleSection title="Papildomi duomenys">
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 pb-3">
                {meta.talpa && <InfoField label="Talpa" value={meta.talpa} />}
                {record.ai && <InfoField label="AI" value={record.ai} />}
                {record.pateikimo_data && <InfoField label="Pateikimo data" value={record.pateikimo_data} />}
                {extraMeta.map(([key, value]) => (
                  <InfoField key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* Susirašinėjimas */}
        <div className="px-6 pb-5" style={{ borderTop: '1px solid #f0ede8' }}>
          <div className="flex items-center justify-between pt-4 pb-3">
            <h3 className="text-sm font-medium" style={{ color: '#5a5550' }}>
              Susirašinėjimas
              {messages.length > 0 && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: '#8a857f' }}>
                  ({messages.length})
                </span>
              )}
            </h3>
            {saving && (
              <span className="text-xs" style={{ color: '#8a857f' }}>Saugoma...</span>
            )}
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="mb-3">
              {messages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  message={msg}
                  side={msg.role === 'team' ? 'right' : 'left'}
                />
              ))}
            </div>
          )}

          {/* New message input */}
          {!readOnly && addingSide && (
            <div className="mb-3">
              <NewMessageBubble
                side={addingSide}
                onSave={text => handleSaveMessage(text, addingSide)}
                onCancel={() => setAddingSide(null)}
              />
            </div>
          )}

          {/* Add message buttons – only in editable mode */}
          {!readOnly && !addingSide && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setAddingSide('left')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all hover:brightness-95"
                style={{ background: '#f0f0f2', border: '1px solid #e5e5e6', color: '#5a5550' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Gavėjas
              </button>
              <button
                onClick={() => setAddingSide('right')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-white transition-all hover:brightness-95"
                style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Komanda
              </button>
            </div>
          )}

          {/* Empty state for read-only */}
          {readOnly && messages.length === 0 && (
            <p className="text-sm py-2" style={{ color: '#8a857f' }}>Nėra žinučių.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (editable, used from within the app)
// ---------------------------------------------------------------------------

export function PaklausimoModal({ record, onClose }: { record: NestandartiniaiRecord; onClose: () => void }) {
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col bg-white rounded-macos-xl overflow-hidden"
        style={{
          maxWidth: '640px',
          height: 'min(85vh, 720px)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-4 pt-3 shrink-0">
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100"
            title="Atidaryti naujame lange"
          >
            <ExternalLink className="w-4 h-4" style={{ color: '#8a857f' }} />
          </a>
          <button onClick={onClose} className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100">
            <X className="w-4 h-4" style={{ color: '#8a857f' }} />
          </button>
        </div>

        {/* Card fills the modal */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          <CardContent record={record} cardUrl={cardUrl} />
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

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchNestandartiniaiById(Number(id));
        if (!data) { setError('Įrašas nerastas'); return; }
        setRecord(data);
      } catch (err: any) {
        setError(err?.message || 'Nepavyko gauti duomenų');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}>
        <span className="loading loading-spinner loading-md text-macos-blue"></span>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}>
        <div className="text-center">
          <p className="text-lg font-medium mb-1" style={{ color: '#3d3935' }}>{error || 'Nerastas'}</p>
          <p className="text-sm" style={{ color: '#8a857f' }}>Patikrinkite nuorodą.</p>
        </div>
      </div>
    );
  }

  const cardUrl = window.location.href;

  return (
    <div
      className="h-screen flex items-center justify-center p-6 overflow-hidden"
      style={{ background: '#fdfcfb' }}
    >
      <div
        className="w-full"
        style={{ maxWidth: '640px', height: 'min(90vh, 780px)' }}
      >
        <CardContent record={record} cardUrl={cardUrl} readOnly />
      </div>
    </div>
  );
}
