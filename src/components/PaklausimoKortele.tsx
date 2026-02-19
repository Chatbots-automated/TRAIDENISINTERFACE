import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Copy, Check, ExternalLink, ArrowLeft, ChevronDown } from 'lucide-react';
import { fetchNestandartiniaiById } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord, AtsakymasMessage } from '../lib/dokumentaiService';
import { colors } from '../lib/designSystem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | null | undefined): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, string>;
  try { return JSON.parse(raw); } catch { return null; }
}

function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* plain text */ }
    return [{ text: raw }];
  }
  return null;
}

const TEXT_COLLAPSE_LIMIT = 280;

// ---------------------------------------------------------------------------
// Collapsible text block – shows preview with soft "Rodyti daugiau"
// ---------------------------------------------------------------------------

function CollapsibleText({ text }: { text: string }) {
  const needsCollapse = text.length > TEXT_COLLAPSE_LIMIT;
  const [expanded, setExpanded] = useState(false);

  if (!needsCollapse) {
    return <p className="text-[13.5px] leading-[1.7] whitespace-pre-wrap" style={{ color: colors.text.primary }}>{text}</p>;
  }

  return (
    <div>
      <p className="text-[13.5px] leading-[1.7] whitespace-pre-wrap" style={{ color: colors.text.primary }}>
        {expanded ? text : text.slice(0, TEXT_COLLAPSE_LIMIT).trimEnd() + '...'}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1.5 text-[12px] font-medium inline-flex items-center gap-1 transition-colors"
        style={{ color: colors.interactive.link }}
      >
        {expanded ? 'Rodyti mažiau' : 'Rodyti daugiau'}
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Content
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
      {/* ---- Header ---- */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-snug" style={{ color: colors.text.primary }}>
              {record.project_name || 'Paklausimas'}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: colors.text.tertiary }}>
              Nr. {record.id}
              {record.pateikimo_data && <> &middot; {record.pateikimo_data}</>}
            </p>
          </div>
          {onCopyUrl && (
            <button
              onClick={onCopyUrl}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={{
                background: urlCopied ? colors.accent.greenBg : 'transparent',
                color: urlCopied ? colors.accent.greenDark : colors.text.tertiary,
                border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.default}`,
              }}
            >
              {urlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {urlCopied ? 'Nukopijuota' : 'Kopijuoti nuorodą'}
            </button>
          )}
        </div>
      </div>

      {/* ---- Details row ---- */}
      {(record.klientas || (meta && Object.keys(meta).length > 0)) && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1 pb-5 mb-5"
          style={{ borderBottom: `1px solid ${colors.border.light}` }}
        >
          {record.klientas && (
            <div>
              <p className="text-[11px] font-medium mb-0.5" style={{ color: colors.text.tertiary }}>Klientas</p>
              <p className="text-[13.5px] font-medium" style={{ color: colors.text.primary }}>{record.klientas}</p>
            </div>
          )}
          {meta && Object.entries(meta).map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] font-medium mb-0.5 capitalize" style={{ color: colors.text.tertiary }}>{k.replace(/_/g, ' ')}</p>
              <p className="text-[13.5px]" style={{ color: colors.text.primary }}>{String(v)}</p>
            </div>
          ))}
          {record.ai && (
            <div>
              <p className="text-[11px] font-medium mb-0.5" style={{ color: colors.text.tertiary }}>AI</p>
              <p className="text-[13.5px]" style={{ color: colors.text.primary }}>{record.ai}</p>
            </div>
          )}
        </div>
      )}

      {/* ---- Description ---- */}
      {record.description && (
        <div className="mb-6">
          <p className="text-[12px] font-medium mb-2" style={{ color: colors.text.tertiary }}>Aprašymas</p>
          <CollapsibleText text={record.description} />
        </div>
      )}

      {/* ---- Atsakymai (conversation) ---- */}
      {messages && messages.length > 0 && (
        <div>
          <p className="text-[12px] font-medium mb-3" style={{ color: colors.text.tertiary }}>
            Atsakymai{messages.length > 1 && ` (${messages.length})`}
          </p>
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="pl-4"
                style={{ borderLeft: `2px solid ${colors.border.default}` }}
              >
                {(msg.from || msg.date) && (
                  <p className="text-[12px] mb-1" style={{ color: colors.text.tertiary }}>
                    {msg.from && <span className="font-medium" style={{ color: colors.text.secondary }}>{msg.from}</span>}
                    {msg.from && msg.date && ' · '}
                    {msg.date}
                  </p>
                )}
                <CollapsibleText text={msg.text} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
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
      className="fixed inset-0 flex items-center justify-center z-[9999] p-6"
      style={{ background: 'rgba(0, 0, 0, 0.18)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-2xl"
        style={{ background: colors.bg.white, boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-0 shrink-0">
          <button
            onClick={() => window.open(cardUrl, '_blank')}
            className="p-2 rounded-lg transition-colors"
            style={{ color: colors.text.tertiary }}
            onMouseEnter={e => (e.currentTarget.style.background = colors.bg.tertiary)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Atidaryti naujame lange"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: colors.text.tertiary }}
            onMouseEnter={e => (e.currentTarget.style.background = colors.bg.tertiary)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 pb-7 pt-1">
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
        <span className="loading loading-spinner loading-md" style={{ color: colors.text.tertiary }}></span>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: colors.bg.primary }}>
        <div className="text-center">
          <h2 className="text-base font-medium mb-1" style={{ color: colors.text.primary }}>{error || 'Nerastas'}</h2>
          <p className="text-sm mb-5" style={{ color: colors.text.tertiary }}>Patikrinkite nuorodą arba grįžkite atgal.</p>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: colors.interactive.primary, color: colors.interactive.primaryText }}
          >
            <ArrowLeft className="w-4 h-4" />
            Grįžti
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.bg.primary }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between"
        style={{ background: colors.bg.white, borderBottom: `1px solid ${colors.border.light}` }}
      >
        <button
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: colors.text.tertiary }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.text.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = colors.text.tertiary)}
        >
          <ArrowLeft className="w-4 h-4" />
          Atgal
        </button>
        <button
          onClick={handleCopyUrl}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
          style={{
            background: urlCopied ? colors.accent.greenBg : 'transparent',
            color: urlCopied ? colors.accent.greenDark : colors.text.tertiary,
            border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.default}`,
          }}
        >
          {urlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {urlCopied ? 'Nukopijuota' : 'Kopijuoti nuorodą'}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 py-10">
        <CardContent record={record} onCopyUrl={handleCopyUrl} urlCopied={urlCopied} />
      </div>
    </div>
  );
}
