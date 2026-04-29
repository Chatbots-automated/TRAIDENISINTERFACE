import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, FileText, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
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

  const getCapacity = useCallback((name: string) => {
    const normalized = name.normalize('NFKC').replace(/[–—]/g, '-');
    const match = normalized.match(/v\s*[-]?\s*(\d+(?:[.,]\d+)?)/i);
    if (!match) return null;
    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }, []);

  const sanitizeCapacityFilter = useCallback((value: string) => {
    const cleaned = value.replace(/[^\d.,]/g, '');
    const firstSeparatorIndex = cleaned.search(/[.,]/);
    if (firstSeparatorIndex === -1) return cleaned;

    return cleaned.slice(0, firstSeparatorIndex + 1)
      + cleaned.slice(firstSeparatorIndex + 1).replace(/[.,]/g, '');
  }, []);

  const formatCapacity = useCallback((capacity: number | null) => {
    if (capacity === null) return 'Kiti';
    return `${Number.isInteger(capacity) ? capacity : String(capacity).replace('.', ',')} m3`;
  }, []);

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
    const normalized = sanitizeCapacityFilter(capacityFilter.trim()).replace(',', '.');
    if (!normalized) return sablonai;
    const wantedCapacity = Number(normalized);
    return sablonai.filter(s => {
      const parsedCapacity = getCapacity(s.name);
      if (Number.isFinite(wantedCapacity) && parsedCapacity === wantedCapacity) return true;

      const title = s.name
        .normalize('NFKC')
        .replace(/[–—]/g, '-');

      // Fallback: V + capacity in any spacing/hyphen format (e.g. V-230, V - 230, V- 230, V230)
      const vMatches = Array.from(title.matchAll(/v\s*[-]?\s*(\d+(?:[.,]\d+)?)/gi))
        .map(m => Number(m[1].replace(',', '.')))
        .filter(Number.isFinite);
      if (Number.isFinite(wantedCapacity) && vMatches.includes(wantedCapacity)) return true;

      // Fallback: plain numeric token match, if title was entered without V prefix
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\d.,])${escaped}([^\\d.,]|$)`).test(title.replace(',', '.'));
    });
  }, [sablonai, capacityFilter, getCapacity, sanitizeCapacityFilter]);

  const capacityGroups = useMemo(() => {
    const groups = new Map<string, { capacity: number | null; label: string; items: MedziaguSablonas[] }>();
    for (const sablonas of filteredSablonai) {
      const capacity = getCapacity(sablonas.name);
      const key = capacity === null ? 'other' : String(capacity);
      const label = formatCapacity(capacity);
      const existing = groups.get(key) || { capacity, label, items: [] };
      existing.items.push(sablonas);
      groups.set(key, existing);
    }
    return Array.from(groups.values())
      .map(group => ({
        ...group,
        items: [...group.items].sort((a, b) => a.name.localeCompare(b.name, 'lt')),
      }))
      .sort((a, b) => {
        if (a.capacity === null) return 1;
        if (b.capacity === null) return -1;
        return a.capacity - b.capacity;
      });
  }, [filteredSablonai, formatCapacity, getCapacity]);

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

  const cancelDraft = async () => {
    if (!draftCard) return;
    const targetId = draftCard.id;
    setDraftCard(prev => prev ? { ...prev, isSaving: true, saveError: null } : prev);
    try {
      if (targetId) {
        await deleteSablonas(targetId);
        setSablonai(prev => prev.filter(s => s.id !== targetId));
      }
      setDraftCard(null);
      setShowSavedHint(false);
    } catch (err: any) {
      setDraftCard(prev => prev ? { ...prev, isSaving: false, saveError: err?.message || 'Nepavyko atšaukti naujo šablono' } : prev);
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
      <div className="flex items-center justify-between rounded-xl border border-base-content/10 bg-white/80 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <p className="text-sm text-base-content/60">{filteredSablonai.length} / {sablonai.length} šablonai</p>
          <label className="inline-flex items-center gap-1.5 text-xs text-base-content/55 rounded-lg border border-base-content/10 px-2 py-1 bg-white/70">
            <span className="font-medium">V-</span>
            <input
              value={capacityFilter}
              onChange={e => setCapacityFilter(sanitizeCapacityFilter(e.target.value))}
              inputMode="decimal"
              placeholder="2,5"
              className="w-14 bg-transparent outline-none"
              aria-label="Filtruoti pagal talpą"
            />
          </label>
        </div>
        <button
          onClick={startNew}
          className="app-text-btn"
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
        <div className="space-y-4">
            {draftCard && (
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-5 items-start">
                <div className="relative h-full min-h-[120px] pl-4 pt-3 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-primary/20 after:absolute after:left-1 after:top-5 after:h-px after:w-2 after:bg-primary">
                  <span className="text-xs font-semibold text-primary">Naujas</span>
                </div>
                <div
                  key={draftCard.localId}
                  className="rounded-2xl border border-dashed border-primary/25 bg-white/90 p-4 transition-all shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)]"
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
                      <button
                        onClick={cancelDraft}
                        disabled={draftCard.isSaving}
                        className="app-text-btn h-7 min-h-0 text-[11px] disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        Atšaukti
                      </button>
                      {draftCard.id && (
                        <button
                          onClick={handleFinishDraft}
                          disabled={draftCard.isSaving}
                          className="app-text-btn h-7 min-h-0 text-[11px] disabled:opacity-50"
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
                    <div className="mt-3 rounded-xl p-2.5 border border-base-content/8 bg-base-content/[0.015] overflow-hidden">
                      <textarea
                        ref={draftTextareaRef}
                        value={draftCard.rawText}
                        onChange={e => setDraftCard(prev => prev ? { ...prev, rawText: e.target.value } : prev)}
                        placeholder="Įveskite medžiagų aprašymą..."
                        rows={8}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono transition-colors focus:border-blue-400 resize-y"
                        style={{ borderColor: '#e5e2dd', color: '#3d3935', lineHeight: '1.6', background: '#fff', minHeight: 150 }}
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
              </div>
            )}

            {capacityGroups.map(group => (
              <section key={group.label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-5 items-start">
                <div className="relative h-full min-h-[64px] pl-4 pt-3 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-base-content/10 after:absolute after:left-1 after:top-5 after:h-px after:w-2 after:bg-primary/70">
                  <span className="block text-xs font-semibold leading-tight text-primary/85">
                    {group.capacity === null ? 'Kiti' : `V - ${group.label}`}
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-3">
                  {group.items.map((s) => {
                    const cardKey = String(s.id);
                    const isExpanded = !!expandedCards[cardKey];
                    const capacity = getCapacity(s.name);

                    return (
                      <div
                        key={cardKey}
                        className={`group sdk-data-card p-3.5 transition-all flex flex-col border-l-4 ${isExpanded ? 'min-h-[180px]' : 'min-h-[64px]'}`}
                        style={{ borderLeftColor: capacity === null ? 'rgba(107,114,128,0.35)' : 'rgba(0,122,255,0.45)' }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              <h4 className="text-sm font-semibold truncate" style={{ color: '#3d3935' }}>{s.name}</h4>
                            </div>
                            {!isExpanded && (
                              <p className="mt-1 truncate text-[11px] text-base-content/45">{s.raw_text || 'Nėra teksto'}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {!s.structured_json && isExpanded && (
                              <button
                                onClick={() => handleViewGenerate(s)}
                                disabled={generating}
                                className="app-text-btn disabled:opacity-60"
                              >
                                {generating && generatingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                Struktūrizuoti
                              </button>
                            )}
                            <button onClick={() => setConfirmDeleteId(s.id)} className="app-icon-btn" title="Ištrinti">
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
                                style={{ color: '#5a5550' }}
                              >
                                {s.raw_text || 'Nėra teksto'}
                              </p>
                            )}
                          </div>
                        )}

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
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
