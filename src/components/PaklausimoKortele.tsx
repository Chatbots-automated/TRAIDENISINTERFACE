import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, ExternalLink, ArrowLeft, Link2, ChevronDown, Plus } from 'lucide-react';
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

// Fields that appear in the "main info" grid (from metadata)
const MAIN_META_KEYS = ['orientacija', 'talpa', 'derva', 'DN', 'koncentracija', 'talpa_tipas'];

function isMainMetaKey(key: string): boolean {
  return MAIN_META_KEYS.includes(key);
}

const META_LABELS: Record<string, string> = {
  orientacija: 'Orientacija',
  talpa: 'Talpa',
  derva: 'Derva',
  DN: 'Diametras (DN)',
  koncentracija: 'Koncentracija',
  talpa_tipas: 'Talpos tipas',
};

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
        className="flex items-center gap-1.5 w-full text-left py-2 text-sm font-medium text-macos-gray-500 hover:text-macos-gray-700 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
        {title}
      </button>
      {open && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble (matches SDK style)
// ---------------------------------------------------------------------------

function ChatBubble({
  message,
  side,
}: {
  message: AtsakymasMessage;
  side: 'left' | 'right';
}) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${
          side === 'right'
            ? 'text-white'
            : 'text-macos-gray-900'
        }`}
        style={
          side === 'right'
            ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }
            : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/70' : 'text-macos-gray-400'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}
            {message.date}
          </p>
        )}
        <div
          className="text-[15px] leading-relaxed whitespace-pre-wrap overflow-y-auto"
          style={{ maxHeight: '6.5em' }}
        >
          {message.text}
        </div>
      </div>
    </div>
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
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] w-72 rounded-3xl px-4 py-2.5 ${
          side === 'right'
            ? 'text-white'
            : 'text-macos-gray-900'
        }`}
        style={
          side === 'right'
            ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }
            : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={side === 'right' ? 'Komandos žinutė...' : 'Gavėjo žinutė...'}
          rows={4}
          className={`w-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed placeholder:opacity-50 ${
            side === 'right' ? 'text-white placeholder:text-white/40' : 'text-macos-gray-900 placeholder:text-macos-gray-400'
          }`}
        />
        <div className={`flex gap-2 justify-end mt-1 pt-1 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-macos-gray-200'}`}>
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
// Card Content (shared between modal & standalone page)
// ---------------------------------------------------------------------------

function CardContent({
  record,
  cardUrl,
  onMessagesUpdate,
}: {
  record: NestandartiniaiRecord;
  cardUrl: string;
  onMessagesUpdate?: (messages: AtsakymasMessage[]) => void;
}) {
  const meta = parseMetadata(record.metadata);
  const [messages, setMessages] = useState<AtsakymasMessage[]>(() => parseAtsakymas(record.atsakymas));
  const [copied, setCopied] = useState(false);
  const [addingSide, setAddingSide] = useState<'left' | 'right' | null>(null);
  const [saving, setSaving] = useState(false);

  const mainMeta = Object.entries(meta).filter(([k]) => isMainMetaKey(k));
  const extraMeta = Object.entries(meta).filter(([k]) => !isMainMetaKey(k));

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
    <div className="bg-white rounded-macos-lg overflow-hidden" style={{ border: '0.5px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
      {/* Top accent strip */}
      <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: '#3d3935' }}>
              {record.project_name || 'Paklausimas'}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: '#8a857f' }}>
              Nr. {record.id}
              {record.pateikimo_data && ` · ${record.pateikimo_data}`}
            </p>
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

        {/* Copy link */}
        <button
          onClick={copy}
          className="flex items-center gap-1.5 mt-3 text-xs transition-colors"
          style={{ color: '#8a857f' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#3d3935')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8a857f')}
        >
          <Link2 className="w-3.5 h-3.5" />
          {copied ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
        </button>
      </div>

      {/* Main info grid */}
      {mainMeta.length > 0 && (
        <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-3" style={{ borderTop: '1px solid #f0ede8' }}>
          {mainMeta.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs" style={{ color: '#8a857f' }}>
                {META_LABELS[key] || key.replace(/_/g, ' ')}
              </dt>
              <dd className="text-sm font-medium mt-0.5" style={{ color: '#3d3935' }}>
                {String(value)}
              </dd>
            </div>
          ))}
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
      {(extraMeta.length > 0 || record.ai) && (
        <div className="px-6" style={{ borderTop: '1px solid #f0ede8' }}>
          <CollapsibleSection title="Papildomi duomenys">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 pb-3">
              {record.ai && (
                <div>
                  <dt className="text-xs" style={{ color: '#8a857f' }}>AI</dt>
                  <dd className="text-sm mt-0.5" style={{ color: '#3d3935' }}>{record.ai}</dd>
                </div>
              )}
              {extraMeta.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs capitalize" style={{ color: '#8a857f' }}>{key.replace(/_/g, ' ')}</dt>
                  <dd className="text-sm mt-0.5" style={{ color: '#3d3935' }}>{String(value)}</dd>
                </div>
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
        <div className="mb-3">
          {messages.map((msg, i) => (
            <ChatBubble
              key={i}
              message={msg}
              side={msg.role === 'team' ? 'right' : 'left'}
            />
          ))}

          {/* New message input */}
          {addingSide && (
            <NewMessageBubble
              side={addingSide}
              onSave={text => handleSaveMessage(text, addingSide)}
              onCancel={() => setAddingSide(null)}
            />
          )}
        </div>

        {/* Add message buttons */}
        {!addingSide && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setAddingSide('left')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
              style={{ background: '#f8f8f9', border: '1px solid #e5e5e6', color: '#5a5550' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f0f2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8f8f9'; }}
            >
              <Plus className="w-3.5 h-3.5" />
              Gavėjas
            </button>
            <button
              onClick={() => setAddingSide('right')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full text-white transition-all"
              style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <Plus className="w-3.5 h-3.5" />
              Komanda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
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
        className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-macos-xl"
        style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)' }}
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

        {/* Scrollable card */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          <CardContent record={record} cardUrl={cardUrl} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone page – /paklausimas/:id
// ---------------------------------------------------------------------------

export default function PaklausimoKortelePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      <div className="min-h-screen flex items-center justify-center bg-macos-gray-50">
        <span className="loading loading-spinner loading-md text-macos-blue"></span>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-macos-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium mb-1" style={{ color: '#3d3935' }}>{error || 'Nerastas'}</p>
          <p className="text-sm mb-4" style={{ color: '#8a857f' }}>Patikrinkite nuorodą arba grįžkite atgal.</p>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-macos text-sm font-medium text-white transition-all"
            style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Grįžti
          </button>
        </div>
      </div>
    );
  }

  const cardUrl = window.location.href;

  return (
    <div className="min-h-screen bg-macos-gray-50">
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 bg-white/80 px-6 py-3 flex items-center"
        style={{ backdropFilter: 'blur(20px) saturate(180%)', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}
      >
        <button
          onClick={() => navigate('/documents')}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: '#007AFF' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Atgal
        </button>
      </div>

      {/* Card */}
      <div className="max-w-xl mx-auto p-6">
        <CardContent record={record} cardUrl={cardUrl} />
      </div>
    </div>
  );
}
