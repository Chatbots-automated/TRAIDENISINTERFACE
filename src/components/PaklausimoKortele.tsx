import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Copy, Check, ExternalLink, ArrowLeft, FileText, User, Calendar, Package, Brain, MessageSquare, Tag } from 'lucide-react';
import { fetchNestandartiniaiById } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord } from '../lib/dokumentaiService';
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

/** Field display configuration */
const FIELD_CONFIG: { key: keyof NestandartiniaiRecord; label: string; icon: React.ReactNode }[] = [
  { key: 'id', label: 'ID', icon: <Tag className="w-4 h-4" /> },
  { key: 'klientas', label: 'Klientas', icon: <User className="w-4 h-4" /> },
  { key: 'project_name', label: 'Projekto pavadinimas', icon: <Package className="w-4 h-4" /> },
  { key: 'pateikimo_data', label: 'Pateikimo data', icon: <Calendar className="w-4 h-4" /> },
  { key: 'description', label: 'Aprašymas', icon: <FileText className="w-4 h-4" /> },
  { key: 'atsakymas', label: 'Atsakymas', icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'ai', label: 'AI', icon: <Brain className="w-4 h-4" /> },
];

// ---------------------------------------------------------------------------
// Card Content – reused by both standalone page and modal
// ---------------------------------------------------------------------------

interface CardContentProps {
  record: NestandartiniaiRecord;
  onCopyUrl?: () => void;
  urlCopied?: boolean;
}

function CardContent({ record, onCopyUrl, urlCopied }: CardContentProps) {
  const meta = parseMetadata(record.metadata);

  return (
    <div className="space-y-6">
      {/* Header band */}
      <div
        className="rounded-xl px-6 py-5"
        style={{ background: `linear-gradient(135deg, ${colors.bg.secondary}, ${colors.bg.tertiary})`, border: `1px solid ${colors.border.light}` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: colors.text.tertiary }}>
              Paklausimo kortelė #{record.id}
            </p>
            <h3 className="text-lg font-semibold truncate" style={{ color: colors.text.primary }}>
              {record.project_name || 'Be pavadinimo'}
            </h3>
            {record.klientas && (
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                {record.klientas}
              </p>
            )}
          </div>
          {onCopyUrl && (
            <button
              onClick={onCopyUrl}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: urlCopied ? colors.accent.greenBg : colors.bg.white,
                color: urlCopied ? colors.accent.greenDark : colors.text.secondary,
                border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.default}`,
              }}
            >
              {urlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {urlCopied ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {FIELD_CONFIG.map(({ key, label, icon }) => {
          if (key === 'id') return null; // ID is already in the header
          const value = record[key];
          if (value === null || value === undefined || value === '') return null;

          const isLong = typeof value === 'string' && value.length > 100;

          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ color: colors.text.tertiary }}>{icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text.tertiary }}>
                  {label}
                </span>
              </div>
              <div
                className={`rounded-lg px-4 py-3 text-sm ${isLong ? 'whitespace-pre-wrap' : ''}`}
                style={{
                  background: colors.bg.white,
                  border: `1px solid ${colors.border.light}`,
                  color: colors.text.primary,
                  lineHeight: 1.6,
                }}
              >
                {String(value)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Metadata section */}
      {meta && Object.keys(meta).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4" style={{ color: colors.text.tertiary }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text.tertiary }}>
              Metadata
            </span>
          </div>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${colors.border.light}` }}
          >
            <div className="divide-y" style={{ borderColor: colors.border.light }}>
              {Object.entries(meta).map(([k, v]) => (
                <div key={k} className="flex items-start px-4 py-2.5 text-sm" style={{ background: colors.bg.white }}>
                  <span
                    className="shrink-0 w-36 font-medium text-xs uppercase tracking-wide"
                    style={{ color: colors.text.tertiary, paddingTop: '1px' }}
                  >
                    {k}
                  </span>
                  <span className="break-all" style={{ color: colors.text.primary }}>
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
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

  const handleOpenInNewTab = () => {
    window.open(cardUrl, '_blank');
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ border: `1px solid ${colors.border.default}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${colors.border.light}` }}
        >
          <h2 className="text-base font-semibold" style={{ color: colors.text.primary }}>
            Paklausimo kortelė
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenInNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: colors.bg.tertiary, color: colors.text.secondary }}
              title="Atidaryti naujame skirtuke"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Atidaryti
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-base-200"
            >
              <X className="w-5 h-5" style={{ color: colors.text.tertiary }} />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 p-6" style={{ background: colors.bg.primary }}>
          <CardContent record={record} onCopyUrl={handleCopyUrl} urlCopied={urlCopied} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone page version – accessed via /paklausimas/:id
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
    const loadRecord = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchNestandartiniaiById(Number(id));
        if (!data) {
          setError('Įrašas nerastas');
          return;
        }
        setRecord(data);
      } catch (err: any) {
        setError(err?.message || 'Nepavyko gauti duomenų');
      } finally {
        setLoading(false);
      }
    };
    loadRecord();
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
          <p className="text-sm mt-4" style={{ color: colors.text.tertiary }}>Kraunama kortelė...</p>
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: colors.bg.primary }}>
        <div className="text-center max-w-md">
          <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.quaternary }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: colors.text.primary }}>
            {error || 'Įrašas nerastas'}
          </h2>
          <p className="text-sm mb-6" style={{ color: colors.text.tertiary }}>
            Patikrinkite nuorodą arba grįžkite į dokumentų sąrašą.
          </p>
          <button
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: colors.interactive.primary,
              color: colors.interactive.primaryText,
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Grįžti į dokumentus
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
        style={{ background: colors.bg.white, borderBottom: `1px solid ${colors.border.light}`, boxShadow: colors.shadow.sm }}
      >
        <button
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-2 text-sm font-medium transition-all hover:opacity-70"
          style={{ color: colors.text.secondary }}
        >
          <ArrowLeft className="w-4 h-4" />
          Dokumentai
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: urlCopied ? colors.accent.greenBg : colors.bg.tertiary,
              color: urlCopied ? colors.accent.greenDark : colors.text.secondary,
              border: `1px solid ${urlCopied ? colors.accent.greenBorder : colors.border.default}`,
            }}
          >
            {urlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {urlCopied ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
          </button>
        </div>
      </div>

      {/* Card content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <CardContent record={record} onCopyUrl={handleCopyUrl} urlCopied={urlCopied} />
      </div>
    </div>
  );
}
