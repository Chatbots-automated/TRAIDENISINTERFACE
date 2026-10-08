import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import type { MedziaguSablonas } from '../lib/sablonaiService';

// Picking a materials template for a tank. The templates are free text written by the economist, and many share a
// name ("PGR V-15 m3" exists for several diameters and burial depths), so the picker reads the facts out of each one,
// puts the ones closest to this tank first, and shows the whole text before anything is applied.

export interface TankFacts {
  volume: number | null;      // m³
  diameter: number | null;    // mm
  length: number | null;      // mm (length or height)
  depth: number | null;       // burial depth, m
  road: boolean | null;       // under a driven surface
  chemical: boolean | null;   // chemical-resistant build
  label: string;
}

interface TemplateFacts {
  volume: number | null;
  diameter: number | null;
  length: number | null;
  lengthLetter: 'L' | 'H';
  depth: number | null;
  road: boolean | null;
  chemical: boolean;
  drinkingWater: boolean;
  totalKg: string | null;
}

interface Ranked { template: MedziaguSablonas; facts: TemplateFacts; score: number | null; search: string }

const number = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function readTemplate(template: MedziaguSablonas): TemplateFacts {
  const name = template.name || '';
  const text = (template.raw_text || '').replace(/ /g, ' ');
  const both = `${name}\n${text}`;
  const lengthMatch = both.match(/\b([LH])\s?(\d{3,5})\b/);
  const total = text.match(/viso[^\n]*?(\d[\d\s]*(?:\s*[-–]\s*\d[\d\s]*)?)\s*kg/i);
  const road = /važiuojam|važ\.?\s*dal/i.test(both) ? true : /žali[aą] vej/i.test(both) ? false : null;
  return {
    volume: number(name.match(/V\s*[-–]?\s*(\d+(?:[.,]\d+)?)/i)?.[1]) ?? number(both.match(/(\d+(?:[.,]\d+)?)\s*m\s*[3³]/i)?.[1]),
    diameter: number(both.match(/DN\s?(\d{3,4})/i)?.[1]),
    length: number(lengthMatch?.[2]),
    lengthLetter: lengthMatch?.[1] === 'H' ? 'H' : 'L',
    depth: number(both.match(/įg(?:ilinim\w*)?\.?\s*(\d+(?:[.,]\d+)?)\s*m/i)?.[1]),
    road,
    chemical: /chemin|derakane|der\s?4\d\d|vinilester/i.test(both),
    drinkingWater: /geriam/i.test(both),
    totalKg: total ? total[1].replace(/\s+/g, ' ').replace(/\s*[-–]\s*/, '–').trim() : null,
  };
}

/** 0..1: how close the template's tank is to this one; null when the template states no volume to compare. */
function fit(tank: TankFacts, facts: TemplateFacts): number | null {
  if (!tank.volume || !facts.volume) return null;
  // A fact the template does not state counts as "probably not this", so a template that confirms the diameter,
  // depth and surface outranks one that merely says nothing about them.
  const UNSTATED = 0.6;
  const parts: Array<[number, number]> = [[0.5, Math.exp(-Math.abs(Math.log(facts.volume / tank.volume)) / 0.35)]];
  if (tank.diameter) parts.push([0.2, facts.diameter ? Math.exp(-Math.abs(Math.log(facts.diameter / tank.diameter)) / 0.15) : UNSTATED]);
  if (tank.depth !== null) parts.push([0.12, facts.depth !== null ? Math.exp(-Math.abs(facts.depth - tank.depth) / 0.6) : UNSTATED]);
  if (tank.road !== null) parts.push([0.1, facts.road !== null ? (tank.road === facts.road ? 1 : 0) : UNSTATED]);
  if (tank.chemical !== null) parts.push([0.08, tank.chemical === facts.chemical ? 1 : 0]);
  const weight = parts.reduce((sum, [w]) => sum + w, 0);
  return parts.reduce((sum, [w, value]) => sum + w * value, 0) / weight;
}

const fmt = (value: number) => value.toLocaleString('lt-LT', { maximumFractionDigits: 2 });

function Chips({ facts }: { facts: TemplateFacts }) {
  const chips: Array<{ text: string; tone?: 'amber' | 'blue' }> = [];
  if (facts.volume) chips.push({ text: `${fmt(facts.volume)} m³` });
  if (facts.diameter) chips.push({ text: `DN${facts.diameter}` });
  if (facts.length) chips.push({ text: `${facts.lengthLetter}${facts.length}` });
  if (facts.depth !== null) chips.push({ text: `įg. ${fmt(facts.depth)} m` });
  if (facts.road === true) chips.push({ text: 'važiuojama dalis', tone: 'amber' });
  if (facts.road === false) chips.push({ text: 'žalia veja' });
  if (facts.chemical) chips.push({ text: 'cheminė', tone: 'amber' });
  if (facts.drinkingWater) chips.push({ text: 'geriamam vandeniui', tone: 'blue' });
  if (facts.totalKg) chips.push({ text: `≈ ${facts.totalKg} kg` });
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map(chip => (
        <span key={chip.text} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
          style={chip.tone === 'amber'
            ? { background: 'rgba(217,119,6,0.10)', color: '#b45309' }
            : chip.tone === 'blue'
            ? { background: 'rgba(0,122,255,0.08)', color: '#0a5fc2' }
            : { background: 'rgba(0,0,0,0.05)', color: '#5a5550' }}>
          {chip.text}
        </span>
      ))}
    </div>
  );
}

function FitBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? '#15803d' : pct >= 60 ? '#b45309' : '#8a857f';
  return (
    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color, background: `${color}14` }}
      title="Kiek šablono talpa artima šiai talpai">
      {pct} %
    </span>
  );
}

export function MaterialTemplatePicker({ templates, tank, currentTemplateId, onApply, onClose, error }: {
  templates: MedziaguSablonas[];
  tank: TankFacts;
  currentTemplateId: number | null;
  onApply: (templateId: number) => Promise<boolean>;
  onClose: () => void;
  error?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [applying, setApplying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const ranked = useMemo<Ranked[]>(() => (
    templates
      .filter(template => String(template.raw_text || '').trim())
      .map(template => {
        const facts = readTemplate(template);
        return { template, facts, score: fit(tank, facts), search: fold(`${template.name} ${template.raw_text}`) };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.facts.volume ?? 1e9) - (b.facts.volume ?? 1e9) || a.template.name.localeCompare(b.template.name, 'lt'))
  ), [templates, tank]);

  const visible = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return ranked;
    return ranked.filter(item => tokens.every(token => {
      const asNumber = number(token);
      // a bare number means the volume: "15" finds the 15 m³ templates, not every text that contains "15"
      if (asNumber !== null && /^\d+([.,]\d+)?$/.test(token)) return item.facts.volume === asNumber;
      return item.search.includes(token);
    }));
  }, [ranked, query]);

  const [activeId, setActiveId] = useState<number | null>(() => currentTemplateId ?? null);
  useEffect(() => {
    if (visible.length === 0) return;
    if (!visible.some(item => item.template.id === activeId)) setActiveId(visible[0].template.id);
  }, [visible, activeId]);
  const active = visible.find(item => item.template.id === activeId) ?? null;

  const apply = async (templateId: number) => {
    if (applying) return;
    setApplying(true);
    try {
      if (await onApply(templateId)) onClose();
    } finally {
      setApplying(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (visible.length === 0) return;
    const index = Math.max(0, visible.findIndex(item => item.template.id === activeId));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      setActiveId(next.template.id);
      listRef.current?.querySelector(`[data-template="${next.template.id}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      void apply(active.template.id);
    }
  };

  const suggestedCount = query ? 0 : Math.min(5, ranked.filter(item => (item.score ?? 0) >= 0.6).length);
  const compare: Array<{ label: string; tank: string; template: string; differs: boolean }> = active ? [
    { label: 'Tūris', tank: tank.volume ? `${fmt(tank.volume)} m³` : '—', template: active.facts.volume ? `${fmt(active.facts.volume)} m³` : '—',
      differs: Boolean(tank.volume && active.facts.volume && Math.abs(active.facts.volume / tank.volume - 1) > 0.1) },
    { label: 'Skersmuo', tank: tank.diameter ? `DN${tank.diameter}` : '—', template: active.facts.diameter ? `DN${active.facts.diameter}` : '—',
      differs: Boolean(tank.diameter && active.facts.diameter && tank.diameter !== active.facts.diameter) },
    { label: 'Ilgis / aukštis', tank: tank.length ? `${tank.length} mm` : '—', template: active.facts.length ? `${active.facts.length} mm` : '—',
      differs: Boolean(tank.length && active.facts.length && Math.abs(active.facts.length / tank.length - 1) > 0.1) },
    { label: 'Įgilinimas', tank: tank.depth !== null ? `${fmt(tank.depth)} m` : '—', template: active.facts.depth !== null ? `${fmt(active.facts.depth)} m` : '—',
      differs: tank.depth !== null && active.facts.depth !== null && Math.abs(active.facts.depth - tank.depth) > 0.15 },
    { label: 'Virš talpos', tank: tank.road === null ? '—' : tank.road ? 'važiuojama dalis' : 'žalia veja',
      template: active.facts.road === null ? '—' : active.facts.road ? 'važiuojama dalis' : 'žalia veja',
      differs: tank.road !== null && active.facts.road !== null && tank.road !== active.facts.road },
  ] : [];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
      onClick={onClose} onKeyDown={onKeyDown}>
      <div className="bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '94vw', maxWidth: 1080, height: '86vh', maxHeight: 820 }} onClick={event => event.stopPropagation()}>

        <div className="shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-base-content">Medžiagų šablonas</h3>
              <p className="mt-0.5 text-xs text-base-content/50 truncate">
                Šiai talpai: <span className="font-medium text-base-content/75">{tank.label || 'duomenų nėra'}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-base-content/5 transition-colors" title="Uždaryti">
              <X className="w-4 h-4 text-base-content/40" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-base-content/10 bg-white px-3 h-10">
            <Search className="w-4 h-4 shrink-0 text-base-content/35" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ieškoti: tūris (pvz. 15), DN2100, važiuojama, cheminė…"
              className="flex-1 min-w-0 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/30"
            />
            {query && (
              <button onClick={() => setQuery('')} className="rounded-md p-0.5 text-base-content/35 hover:bg-base-content/5" title="Išvalyti">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="shrink-0 text-[11px] text-base-content/40">{visible.length} iš {ranked.length}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div ref={listRef} className="w-[42%] min-w-[300px] shrink-0 overflow-y-auto p-2" style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
            {visible.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-base-content/40">Tokių šablonų nėra. Pabandykite kitą žodį ar tūrį.</p>
            ) : visible.map((item, index) => {
              const selected = item.template.id === activeId;
              const applied = item.template.id === currentTemplateId;
              return (
                <React.Fragment key={item.template.id}>
                  {index === 0 && suggestedCount > 0 && (
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40">Tinkamiausi šiai talpai</p>
                  )}
                  {index === suggestedCount && suggestedCount > 0 && (
                    <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-base-content/40">Kiti šablonai</p>
                  )}
                  <button
                    data-template={item.template.id}
                    onClick={() => setActiveId(item.template.id)}
                    onDoubleClick={() => void apply(item.template.id)}
                    className="block w-full rounded-xl px-2.5 py-2 text-left transition-colors"
                    style={{
                      background: selected ? 'rgba(0,122,255,0.07)' : 'transparent',
                      border: `1px solid ${selected ? 'rgba(0,122,255,0.28)' : 'transparent'}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-semibold text-base-content">{item.template.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {applied && (
                          <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(22,163,74,0.10)', color: '#15803d' }}>
                            <Check className="h-2.5 w-2.5" />pritaikytas
                          </span>
                        )}
                        <FitBadge score={item.score} />
                      </span>
                    </div>
                    <Chips facts={item.facts} />
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {!active ? (
              <div className="flex flex-1 items-center justify-center text-sm text-base-content/35">Pasirinkite šabloną kairėje</div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="min-w-0 truncate text-[15px] font-semibold text-base-content">{active.template.name}</h4>
                    <FitBadge score={active.score} />
                  </div>

                  <table className="mt-3 w-full text-xs">
                    <thead>
                      <tr className="text-base-content/40">
                        <th className="py-1 text-left font-medium" />
                        <th className="py-1 text-left font-medium">Ši talpa</th>
                        <th className="py-1 text-left font-medium">Šablonas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compare.map(row => (
                        <tr key={row.label} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                          <td className="py-1.5 pr-3 text-base-content/50">{row.label}</td>
                          <td className="py-1.5 pr-3 font-medium text-base-content/80">{row.tank}</td>
                          <td className="py-1.5 font-medium" style={{ color: row.differs ? '#b45309' : undefined }}>
                            {row.template}{row.differs && <span className="ml-1.5 font-normal">skiriasi</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40">Šablono tekstas</p>
                  <pre className="rounded-xl p-3.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words"
                    style={{ background: '#fafaf8', border: '1px solid #f0ede8', color: '#3d3935', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', tabSize: 8 }}>
                    {active.template.raw_text}
                  </pre>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <p className="min-w-0 text-[11px] text-base-content/40">
                    {error ? <span style={{ color: '#FF3B30' }}>{error}</span> : '↑ ↓ – rinktis, Enter – pritaikyti'}
                  </p>
                  <button
                    onClick={() => void apply(active.template.id)}
                    disabled={applying || active.template.id === currentTemplateId}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition-all disabled:opacity-50"
                    style={{ background: '#007AFF', boxShadow: '0 2px 8px rgba(0,122,255,0.3)' }}
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {active.template.id === currentTemplateId ? 'Jau pritaikytas' : 'Pritaikyti šį šabloną'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
