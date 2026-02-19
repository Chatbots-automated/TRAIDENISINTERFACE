import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, ExternalLink, ArrowLeft, Link2 } from 'lucide-react';
import { fetchNestandartiniaiById } from '../lib/dokumentaiService';
import type { NestandartiniaiRecord, AtsakymasMessage } from '../lib/dokumentaiService';

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

// ---------------------------------------------------------------------------
// Card Content
// ---------------------------------------------------------------------------

function CardContent({ record, cardUrl }: { record: NestandartiniaiRecord; cardUrl: string }) {
  const meta = parseMetadata(record.metadata);
  const messages = parseAtsakymas(record.atsakymas);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(cardUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-base-100 rounded-xl border border-base-content/10 overflow-hidden">
      {/* Title area */}
      <div className="px-6 pt-6 pb-4 border-b border-base-content/8">
        <h2 className="text-xl font-bold text-base-content">
          {record.project_name || 'Paklausimas'}
        </h2>
        <p className="text-sm text-base-content/50 mt-1">
          Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}
        </p>

        {/* Copy URL */}
        <button onClick={copy} className="btn btn-sm btn-ghost gap-1.5 mt-3 text-base-content/50 hover:text-base-content">
          <Link2 className="w-3.5 h-3.5" />
          {copied ? 'Nukopijuota!' : 'Kopijuoti nuorodą'}
        </button>
      </div>

      {/* Details grid */}
      <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-3 border-b border-base-content/8">
        {record.klientas && (
          <div>
            <dt className="text-xs text-base-content/40 mb-0.5">Klientas</dt>
            <dd className="text-sm font-medium text-base-content">{record.klientas}</dd>
          </div>
        )}
        {record.pateikimo_data && (
          <div>
            <dt className="text-xs text-base-content/40 mb-0.5">Pateikimo data</dt>
            <dd className="text-sm text-base-content">{record.pateikimo_data}</dd>
          </div>
        )}
        {record.ai && (
          <div>
            <dt className="text-xs text-base-content/40 mb-0.5">AI</dt>
            <dd className="text-sm text-base-content">{record.ai}</dd>
          </div>
        )}
        {meta && Object.entries(meta).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-base-content/40 mb-0.5 capitalize">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-sm text-base-content">{String(v)}</dd>
          </div>
        ))}
      </div>

      {/* Description */}
      {record.description && (
        <div className="px-6 py-4 border-b border-base-content/8">
          <h3 className="text-xs text-base-content/40 mb-2">Aprašymas</h3>
          <p className="text-sm text-base-content leading-relaxed whitespace-pre-wrap">{record.description}</p>
        </div>
      )}

      {/* Atsakymai */}
      {messages && messages.length > 0 && (
        <div className="px-6 py-4">
          <h3 className="text-xs text-base-content/40 mb-3">
            Atsakymai{messages.length > 1 ? ` (${messages.length})` : ''}
          </h3>
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className="bg-base-200/50 rounded-lg px-4 py-3">
                {(msg.from || msg.date) && (
                  <p className="text-xs text-base-content/50 mb-1">
                    {msg.from && <span className="font-medium text-base-content/70">{msg.from}</span>}
                    {msg.from && msg.date && ' · '}
                    {msg.date}
                  </p>
                )}
                <p className="text-sm text-base-content leading-relaxed whitespace-pre-wrap">{msg.text}</p>
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

export function PaklausimoModal({ record, onClose }: { record: NestandartiniaiRecord; onClose: () => void }) {
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col bg-base-100 rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-3 pt-3 shrink-0">
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-ghost btn-square"
            title="Atidaryti naujame lange"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="btn btn-sm btn-ghost btn-square">
            <X className="w-4 h-4" />
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
      <div className="min-h-screen flex items-center justify-center bg-base-200/50">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200/50">
        <div className="text-center">
          <p className="text-lg font-medium text-base-content mb-1">{error || 'Nerastas'}</p>
          <p className="text-sm text-base-content/50 mb-4">Patikrinkite nuorodą arba grįžkite atgal.</p>
          <button onClick={() => navigate('/documents')} className="btn btn-sm btn-primary gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Grįžti
          </button>
        </div>
      </div>
    );
  }

  const cardUrl = window.location.href;

  return (
    <div className="min-h-screen bg-base-200/50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-base-100 border-b border-base-content/10 px-6 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/documents')} className="btn btn-sm btn-ghost gap-1.5">
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
