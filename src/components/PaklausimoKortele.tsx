import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Copy, Check, ExternalLink, ArrowLeft, FileText, Brain, MessageSquare } from 'lucide-react';
import { fetchNestandartiniaiById } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord, AtsakymasMessage } from '../lib/dokumentaiService';
import { colors } from '../lib/designSystem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, string>;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Parse atsakymas – handles plain text (legacy) and JSON array */
function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // plain text – wrap as single message
    }
    return [{ text: raw }];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Inline label+value row */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider w-32 text-right" style={{ color: colors.text.tertiary }}>
        {label}
      </span>
      <span className="text-sm" style={{ color: colors.text.primary }}>{value}</span>
    </div>
  );
}

/** Conversation thread for atsakymas */
function MessageThread({ messages }: { messages: AtsakymasMessage[] }) {
  return (
    <div className="space-y-2">
      {messages.map((msg, i) => (
        <div
          key={i}
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: colors.bg.white,
            border: `1px solid ${colors.border.light}`,
            color: colors.text.primary,
          }}
        >
          {(msg.from || msg.date) && (
            <div className="flex items-center gap-2 mb-1.5 text-xs" style={{ color: colors.text.tertiary }}>
              {msg.from && <span className="font-medium">{msg.from}</span>}
              {msg.from && msg.date && <span>·</span>}
              {msg.date && <span>{msg.date}</span>}
            </div>
          )}
          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
        </div>
      ))}
    </div>
  );
}

/** Section header */
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-5">
      <span style={{ color: colors.text.tertiary }}>{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.text.tertiary }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Content – shared between modal and standalone page
// ---------------------------------------------------------------------------

interface CardContentProps {
  record: NestandartiniaiRecord;
  onCopyUrl?: () => void;
  urlCopied?: boolean;
}

function CardContent({ record, onCopyUrl, urlCopied }: CardContentProps) {
  const meta = parseMetadata(record.metadata);
  const messages = parseAtsakymas(record.atsakymas);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: colors.text.tertiary }}>
            Paklausimas #{record.id}
          </p>
          <h3 className="text-lg font-semibold leading-tight" style={{ color: colors.text.primary }}>
            {record.project_name || 'Be pavadinimo'}
          </h3>
        </div>
        {onCopyUrl && (
          <button
            onClick={onCopyUrl}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
            style={{
              background: urlCopied ? colors.accent.greenBg : colors.bg.tertiary,
              color: urlCopied ? colors.accent.greenDark : colors.text.tertiary,
              border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.light}`,
            }}
          >
            {urlCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {urlCopied ? 'Nukopijuota' : 'Nuoroda'}
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderBottom: `1px solid ${colors.border.light}` }} />

      {/* Core fields – compact inline layout */}
      <div className="py-2">
        <Field label="Klientas" value={record.klientas} />
        <Field label="Pateikimo data" value={record.pateikimo_data} />
        <Field label="AI" value={typeof record.ai === 'string' ? record.ai : null} />
      </div>

      {/* Description */}
      {record.description && (
        <>
          <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} label="Aprašymas" />
          <div
            className="rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed"
            style={{ background: colors.bg.white, border: `1px solid ${colors.border.light}`, color: colors.text.primary }}
          >
            {record.description}
          </div>
        </>
      )}

      {/* Atsakymas conversation thread */}
      {messages && messages.length > 0 && (
        <>
          <SectionLabel icon={<MessageSquare className="w-3.5 h-3.5" />} label={`Atsakymai (${messages.length})`} />
          <MessageThread messages={messages} />
        </>
      )}

      {/* Metadata – compact tag-style display */}
      {meta && Object.keys(meta).length > 0 && (
        <>
          <SectionLabel icon={<Brain className="w-3.5 h-3.5" />} label="Metadata" />
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(meta).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                style={{ background: colors.bg.tertiary, color: colors.text.secondary, border: `1px solid ${colors.border.light}` }}
              >
                <span style={{ color: colors.text.tertiary }}>{k}:</span>
                <span className="font-medium">{String(v)}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal version – used from the table
// ---------------------------------------------------------------------------

interface PaklausimoModalProps {
  record: NestandartiniaiRecord;
  onClose: () => void;
}

export function PaklausimoModal({ record, onClose }: PaklausimoModalProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(cardUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ background: 'rgba(0, 0, 0, 0.25)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col rounded-xl"
        style={{ background: colors.bg.primary, border: `1px solid ${colors.border.default}`, boxShadow: colors.shadow.xl }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text.tertiary }}>
            Paklausimo kortelė
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => window.open(cardUrl, '_blank')}
              className="p-1.5 rounded-md transition-colors hover:bg-base-200"
              title="Atidaryti naujame skirtuke"
            >
              <ExternalLink className="w-4 h-4" style={{ color: colors.text.tertiary }} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md transition-colors hover:bg-base-200">
              <X className="w-4 h-4" style={{ color: colors.text.tertiary }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <CardContent record={record} onCopyUrl={handleCopyUrl} urlCopied={urlCopied} />
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
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchNestandartiniaiById(Number(id));
        if (!data) { setError('Įrašas nerastas'); return; }
        setRecord(data);
      } catch (err: any) {
        setError(err?.message || 'Nepavyko gauti duomenų');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: colors.bg.primary }}>
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-sm mt-4" style={{ color: colors.text.tertiary }}>Kraunama...</p>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: colors.bg.primary }}>
        <div className="text-center max-w-sm">
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: colors.border.default }} />
          <h2 className="text-base font-semibold mb-1" style={{ color: colors.text.primary }}>{error || 'Nerastas'}</h2>
          <p className="text-xs mb-5" style={{ color: colors.text.tertiary }}>Patikrinkite nuorodą arba grįžkite atgal.</p>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{ background: colors.interactive.primary, color: colors.interactive.primaryText }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dokumentai
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.bg.primary }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-5 py-2.5 flex items-center justify-between"
        style={{ background: colors.bg.white, borderBottom: `1px solid ${colors.border.light}`, boxShadow: colors.shadow.sm }}
      >
        <button
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-70"
          style={{ color: colors.text.tertiary }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dokumentai
        </button>
        <button
          onClick={handleCopyUrl}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: urlCopied ? colors.accent.greenBg : colors.bg.tertiary,
            color: urlCopied ? colors.accent.greenDark : colors.text.tertiary,
            border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.light}`,
          }}
        >
          {urlCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {urlCopied ? 'Nukopijuota' : 'Kopijuoti nuorodą'}
        </button>
      </div>

      {/* Card */}
      <div className="max-w-xl mx-auto px-5 py-6">
        <CardContent record={record} onCopyUrl={handleCopyUrl} urlCopied={urlCopied} />
      </div>
    </div>
  );
}
