import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, FileText, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import MaterialSlateView from '../MaterialSlateView';
import { createSablonas, deleteSablonas, fetchSablonai, generateStructuredJson, updateSablonas } from '../../lib/sablonaiService';
import type { MedziaguSablonas } from '../../lib/sablonaiService';

export function SablonaiTab() {
  const [sablonai, setSablonai] = useState<MedziaguSablonas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [capacityFilter, setCapacityFilter] = useState('');
  const [draftCard, setDraftCard] = useState<{
    localId: string;
    id: number | null;
    name: string;
    rawText: string;
    isSaving: boolean;
    saveError: string | null;
  } | null>(null);
  const [showSavedHint, setShowSavedHint] = useState(false);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Generate / structurize
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSablonai(await fetchSablonai());
    } catch (err: any) {
      setError(err?.message || 'Nepavyko gauti duomenų');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setExpandedCards(prev => {
      const next = { ...prev };
      for (const s of sablonai) {
        const key = String(s.id);
        if (!(key in next)) next[key] = false;
      }
      return next;
    });
  }, [sablonai]);

  useEffect(() => {
    if (!draftCard) return;
    const timer = window.setTimeout(() => {
      draftTextareaRef.current?.focus();
      draftTextareaRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftCard?.localId]);

  useEffect(() => {
    const shouldWarn = !!draftCard && (draftCard.isSaving || (!!draftCard.rawText.trim() && !draftCard.id));
    if (!shouldWarn) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draftCard]);

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const willExpand = !prev[id];
      if (!willExpand) return { ...prev, [id]: false };
      const collapsed: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) collapsed[key] = false;
      collapsed[id] = true;
      return collapsed;
    });
  };

  const startNew = () => {
    if (draftCard) {
      setExpandedCards(prev => {
        const collapsed: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) collapsed[key] = false;
        collapsed[draftCard.localId] = true;
        return collapsed;
      });
      draftTextareaRef.current?.focus();
      return;
    }

    const localId = `new-${Date.now()}`;
    setDraftCard({ localId, id: null, name: '', rawText: '', isSaving: false, saveError: null });
    setExpandedCards(prev => {
      const collapsed: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) collapsed[key] = false;
      collapsed[localId] = true;
      return collapsed;
    });
  };

  const filteredSablonai = useMemo(() => {
    const normalized = capacityFilter.trim();
    if (!normalized) return sablonai;
    return sablonai.filter(s => {
      const title = s.name
        .normalize('NFKC')
        .replace(/[–—]/g, '-');

      // Primary: V + capacity in any spacing/hyphen format (e.g. V-230, V - 230, V- 230, V230)
      const vMatches = Array.from(title.matchAll(/v\s*[-]?\s*(\d+)/gi)).map(m => m[1]);
      if (vMatches.includes(normalized)) return true;

      // Fallback: plain numeric token match, if title was entered without V prefix
      return new RegExp(`\\b${normalized}\\b`).test(title);
    });
  }, [sablonai, capacityFilter]);

  const upsertLocalTemplate = useCallback((next: Partial<MedziaguSablonas> & { id: number }) => {
    setSablonai(prev => {
      const i = prev.findIndex(s => s.id === next.id);
      if (i === -1) return [next as MedziaguSablonas, ...prev];
      const copy = [...prev];
      copy[i] = { ...copy[i], ...next };
      return copy;
    });
  }, []);

  useEffect(() => {
    if (!draftCard) return;
    const rawText = draftCard.rawText.trim();
    if (!rawText) return;

    const timer = window.setTimeout(async () => {
      const inferredName = draftCard.name.trim() || rawText.split('\n')[0].trim() || 'Naujas šablonas';
      setDraftCard(prev => prev ? { ...prev, isSaving: true, saveError: null, name: inferredName } : prev);
      try {
        if (!draftCard.id) {
          const created = await createSablonas({ name: inferredName, raw_text: rawText, structured_json: null });
          setDraftCard(prev => prev ? { ...prev, id: created.id, isSaving: false } : prev);
          upsertLocalTemplate(created);
          setShowSavedHint(true);
        } else {
          await updateSablonas(draftCard.id, { name: inferredName, raw_text: rawText });
          setDraftCard(prev => prev ? { ...prev, isSaving: false } : prev);
          upsertLocalTemplate({ id: draftCard.id, name: inferredName, raw_text: rawText });
          setShowSavedHint(true);
        }
      } catch (err: any) {
        setDraftCard(prev => prev ? { ...prev, isSaving: false, saveError: err?.message || 'Nepavyko automatiškai išsaugoti' } : prev);
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [draftCard?.rawText, draftCard?.name, draftCard?.id, upsertLocalTemplate]);

  useEffect(() => {
    if (!showSavedHint) return;
    const timer = window.setTimeout(() => setShowSavedHint(false), 1200);
    return () => window.clearTimeout(timer);
  }, [showSavedHint]);

  const handleViewGenerate = async (s: MedziaguSablonas) => {
    setGenerating(true);
    setGeneratingId(s.id);
    setFormError(null);
    try {
      const json = await generateStructuredJson(s.raw_text.trim());
      await updateSablonas(s.id, { structured_json: json });
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Nepavyko sugeneruoti struktūros');
    } finally {
      setGenerating(false);
      setGeneratingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await deleteSablonas(id);
      setConfirmDeleteId(null);
      await loadData();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleFinishDraft = async () => {
    if (!draftCard) return;
    const rawText = draftCard.rawText.trim();
    if (!rawText) {
      setDraftCard(null);
      return;
    }

    const inferredName = draftCard.name.trim() || rawText.split('\n')[0].trim() || 'Naujas šablonas';
    setDraftCard(prev => prev ? { ...prev, isSaving: true, saveError: null, name: inferredName } : prev);
    try {
      let targetId = draftCard.id;
      if (!targetId) {
        const created = await createSablonas({ name: inferredName, raw_text: rawText, structured_json: null });
        targetId = created.id;
        upsertLocalTemplate(created);
      } else {
        await updateSablonas(targetId, { name: inferredName, raw_text: rawText });
        upsertLocalTemplate({ id: targetId, name: inferredName, raw_text: rawText });
      }
      setDraftCard(null);
      if (targetId) {
        setExpandedCards(prev => {
          const collapsed: Record<string, boolean> = {};
          for (const key of Object.keys(prev)) collapsed[key] = false;
          collapsed[String(targetId)] = true;
          return collapsed;
        });
      }
      setShowSavedHint(false);
    } catch (err: any) {
      setDraftCard(prev => prev ? { ...prev, isSaving: false, saveError: err?.message || 'Nepavyko išsaugoti' } : prev);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#007AFF' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>
          <AlertTriangle className="w-4 h-4 inline mr-2" />{error}
        </div>
      )}

      {formError && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>
          {formError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-base-content/10 bg-base-100 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <p className="text-sm text-base-content/60">{filteredSablonai.length} / {sablonai.length} šablonai</p>
          <label className="inline-flex items-center gap-1.5 text-xs text-base-content/55 rounded-lg border border-base-content/10 px-2 py-1 bg-white/70">
            <span className="font-medium">V-</span>
            <input
              value={capacityFilter}
              onChange={e => setCapacityFilter(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="talpa"
              className="w-14 bg-transparent outline-none"
              aria-label="Filtruoti pagal talpą"
            />
          </label>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-base-content/75 border border-base-content/15 bg-white/65 backdrop-blur-sm transition-all duration-200 hover:bg-white/80"
        >
          <Plus className="w-3.5 h-3.5" />Naujas šablonas
        </button>
      </div>

      {/* Templates list */}
      {filteredSablonai.length === 0 && !draftCard ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-10 h-10 mb-3" style={{ color: '#d1cdc7' }} />
          <p className="text-sm font-medium" style={{ color: '#8a857f' }}>{capacityFilter ? 'Nėra šablonų pagal šį V- filtrą' : 'Nėra medžiagų šablonų'}</p>
          <p className="text-xs mt-1" style={{ color: '#b5b0aa' }}>{capacityFilter ? 'Pakeiskite V- filtro reikšmę' : 'Sukurkite pirmą šabloną paspaudę „Naujas šablonas"'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,360px))] justify-center items-start gap-3">
          {draftCard && (
            <div
              key={draftCard.localId}
              className="rounded-xl border p-3.5 transition-all min-h-[160px] flex flex-col"
              style={{
                borderColor: '#007AFF',
                background: 'rgba(0,122,255,0.04)',
                boxShadow: '0 0 0 1px rgba(0,122,255,0.12) inset',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={draftCard.name}
                    onChange={e => setDraftCard(prev => prev ? { ...prev, name: e.target.value } : prev)}
                    placeholder="Šablono pavadinimas..."
                    className="text-sm font-semibold bg-transparent border-b outline-none w-full py-0.5 transition-colors focus:border-blue-400"
                    style={{ color: '#3d3935', borderColor: '#e5e2dd' }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {draftCard.id && (
                    <button
                      onClick={handleFinishDraft}
                      disabled={draftCard.isSaving}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-base-content/15 bg-white/70 hover:bg-white disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      Baigti
                    </button>
                  )}
                  <button
                    onClick={() => toggleCard(draftCard.localId)}
                    className="p-1 text-base-content/60 hover:text-base-content"
                    title={expandedCards[draftCard.localId] ? 'Sutraukti' : 'Išskleisti'}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedCards[draftCard.localId] ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {expandedCards[draftCard.localId] && (
                <div className="mt-2 rounded-lg p-2.5 border border-base-content/8 bg-base-content/[0.015] flex-1 overflow-hidden">
                  <textarea
                    ref={draftTextareaRef}
                    value={draftCard.rawText}
                    onChange={e => setDraftCard(prev => prev ? { ...prev, rawText: e.target.value } : prev)}
                    placeholder="Įveskite medžiagų aprašymą..."
                    rows={8}
                    className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono transition-colors focus:border-blue-400 resize-y"
                    style={{ borderColor: '#e5e2dd', color: '#3d3935', lineHeight: '1.6', background: '#fff' }}
                  />
                  <div className="mt-2 min-h-[16px]">
                    {draftCard.isSaving ? (
                      <p className="text-[11px] text-base-content/55">Išsaugoma...</p>
                    ) : showSavedHint ? (
                      <p className="text-[11px]" style={{ color: '#34C759' }}>Išsaugota</p>
                    ) : null}
                    {draftCard.saveError && (
                      <p className="text-xs mt-1" style={{ color: '#FF3B30' }}>{draftCard.saveError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredSablonai.map((s, idx) => {
            // Use a unique UI key per rendered card instance. This prevents
            // accidental state sharing if backend data ever contains repeated ids.
            const cardKey = `${s.id}-${idx}`;
            const isExpanded = !!expandedCards[cardKey];

            return (
              <div
                key={cardKey}
                className={`group rounded-xl border p-3.5 transition-all flex flex-col ${isExpanded ? 'min-h-[180px]' : 'min-h-[60px]'}`}
                style={{
                  borderColor: 'rgba(0,0,0,0.06)',
                  background: '#fff',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <h4 className="text-sm font-semibold truncate" style={{ color: '#3d3935' }}>{s.name}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    {!s.structured_json && isExpanded && (
                      <button
                        onClick={() => handleViewGenerate(s)}
                        disabled={generating}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-base-content/75 border border-base-content/15 bg-white/65 backdrop-blur-sm transition-all duration-200 hover:bg-white/80 disabled:opacity-60"
                      >
                        {generating && generatingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Strūkturizuoti
                      </button>
                    )}
                    <button onClick={() => setConfirmDeleteId(s.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-base-content/10 bg-white/65 backdrop-blur-sm hover:bg-white/80" title="Ištrinti">
                      <Trash2 className="w-3.5 h-3.5 text-base-content/55" />
                    </button>
                    <button
                      onClick={() => toggleCard(cardKey)}
                      className="p-1 text-base-content/60 hover:text-base-content"
                      title={isExpanded ? 'Sutraukti' : 'Išskleisti'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 rounded-lg p-2.5 border border-base-content/8 bg-base-content/[0.015] flex-1 overflow-hidden">
                    {s.structured_json ? (
                      <div>
                        <MaterialSlateView data={s.structured_json} variant="panel" />
                      </div>
                    ) : (
                      <p
                        className="text-[11px] whitespace-pre-wrap break-words leading-relaxed"
                        style={{
                          color: '#5a5550',
                        }}
                      >
                        {s.raw_text || 'Nėra teksto'}
                      </p>
                    )}
                  </div>
                )}

                {/* Delete confirmation */}
                {confirmDeleteId === s.id && (
                  <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid #f0ede8' }}>
                    <span className="text-xs" style={{ color: '#FF3B30' }}>Ištrinti šį šabloną?</span>
                    <button onClick={() => handleDelete(s.id)} disabled={deleting}
                      className="text-xs px-3 py-1 rounded-lg text-white disabled:opacity-50" style={{ background: '#FF3B30' }}>
                      {deleting ? 'Trinama...' : 'Taip'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-3 py-1 rounded-lg" style={{ color: '#8a857f' }}>Ne</button>
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}
