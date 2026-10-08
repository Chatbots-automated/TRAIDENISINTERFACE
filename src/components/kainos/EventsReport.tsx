import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, HelpCircle, ShieldAlert } from 'lucide-react';

// For a buyer an event that pushes prices up is the bad news: up is red, down is green.
const UP = '#b91c1c';
const DOWN = '#15803d';
const FLAT = '#6b7280';
const RISK_COLORS: Record<string, string> = { 'didelė': '#b91c1c', 'vidutinė': '#b45309', 'maža': '#15803d' };

type Direction = 'brangina' | 'pigina' | 'neaišku';

interface MarketEvent {
  title: string;
  date: string | null;
  what: string;
  impact: string;
  direction: Direction | null;
  affects: string[];
  source: string;
}

interface EventsData {
  summary: string;
  supplyRisk: string | null;
  events: MarketEvent[];
  missing: string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const flatten = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const isoDate = (value: string): string | null => value.match(/\d{4}-\d{2}(-\d{2})?/)?.[0] ?? null;

function fromJson(text: string): EventsData | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: any;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) return null;
  const risk = str(raw.supply_risk).toLowerCase();
  return {
    summary: str(raw.summary),
    supplyRisk: risk in RISK_COLORS ? risk : null,
    events: raw.events.filter((e: unknown) => e && typeof e === 'object').map((e: any): MarketEvent => {
      const direction = str(e.direction).toLowerCase();
      return {
        title: str(e.title), date: isoDate(str(e.date)), what: str(e.what), impact: str(e.impact),
        direction: direction === 'brangina' || direction === 'pigina' || direction === 'neaišku' ? direction : null,
        affects: Array.isArray(e.affects) ? e.affects.map(str).filter(Boolean) : [],
        source: str(e.source),
      };
    }).filter((e: MarketEvent) => e.title || e.what),
    missing: str(raw.missing),
  };
}

/** Reports generated before the prompt returned JSON: "**- [Title] (date)**" blocks with "**Label:** value" lines. */
function fromLegacyMarkdown(text: string): EventsData | null {
  const pieces = text.split(/\*\*\s*-\s*\[([^\]]+)\]\s*\(([^)]*)\)\s*\*\*/);
  if (pieces.length < 4) return null;
  const events: MarketEvent[] = [];
  let missing = '';
  for (let i = 1; i + 2 < pieces.length + 1; i += 3) {
    const body = (pieces[i + 2] || '').split(/\n---/)[0];
    const labels: Record<string, string> = {};
    for (const match of flatten(body).matchAll(/\*\*([^*:]+):\*\*\s*([^*]*)/g)) {
      labels[match[1].trim().toLowerCase()] = match[2].replace(/[\s-]+$/, '').trim();
    }
    // the source is one line; anything after it in the last block is the closing remark
    const sourceLine = body.match(/\*\*Šaltinis:\*\*\s*([^\n]*)/);
    const after = sourceLine ? flatten(body.slice((sourceLine.index ?? 0) + sourceLine[0].length)) : '';
    if (after && !after.includes('**')) missing = after;
    events.push({
      title: pieces[i].trim(), date: isoDate(pieces[i + 1] || ''), what: labels['kas įvyko'] || '',
      impact: labels['galimas poveikis'] || '', direction: null, affects: [],
      source: sourceLine ? sourceLine[1].trim() : labels['šaltinis'] || '',
    });
  }
  return { summary: '', supplyRisk: null, events, missing };
}

const DIRECTION_VIEW: Record<Direction, { label: string; color: string; Icon: typeof ArrowUpRight }> = {
  brangina: { label: 'Brangina', color: UP, Icon: ArrowUpRight },
  pigina: { label: 'Pigina', color: DOWN, Icon: ArrowDownRight },
  'neaišku': { label: 'Poveikis neaiškus', color: FLAT, Icon: HelpCircle },
};

/** Market-events report; returns null when the text has no recognisable structure, so the caller can show it as text. */
export function EventsReport({ content }: { content: string }) {
  const data = useMemo(() => fromJson(content || '') ?? fromLegacyMarkdown(content || ''), [content]);
  if (!data || data.events.length === 0) return null;

  const events = [...data.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const count = (direction: Direction) => events.filter(e => e.direction === direction).length;
  const rated = events.some(e => e.direction);
  const heading = 'text-[10px] uppercase tracking-wide';

  return (
    <div className="space-y-4">
      {(data.summary || data.supplyRisk) && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: '#faf9f7', border: '1px solid #f0ede8' }}>
          {data.supplyRisk && (
            <span className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ color: RISK_COLORS[data.supplyRisk], background: 'white', border: `1px solid ${RISK_COLORS[data.supplyRisk]}33` }}>
              <ShieldAlert className="w-3.5 h-3.5" />Tiekimo rizika {data.supplyRisk}
            </span>
          )}
          {data.summary && <p className="text-[13px] leading-6" style={{ color: '#3d3935' }}>{data.summary}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <p className={heading} style={{ color: '#8a857f' }}>Įvykiai ({events.length})</p>
        {rated && (
          <p className="text-[11px]" style={{ color: '#8a857f' }}>
            <span style={{ color: UP }}>{count('brangina')} brangina</span>
            {' · '}<span style={{ color: DOWN }}>{count('pigina')} pigina</span>
            {count('neaišku') > 0 && <>{' · '}{count('neaišku')} neaišku</>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {events.map((event, index) => {
          const view = event.direction ? DIRECTION_VIEW[event.direction] : null;
          const accent = view?.color ?? '#d4cfc8';
          return (
            <div key={index} className="rounded-xl bg-white overflow-hidden flex" style={{ border: '1px solid #f0ede8' }}>
              <div className="w-1 shrink-0" style={{ background: accent, opacity: 0.7 }} />
              <div className="px-4 py-3 min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {event.date && <p className="text-[10px] font-mono" style={{ color: '#8a857f' }}>{event.date}</p>}
                    <p className="text-[13px] font-semibold leading-snug" style={{ color: '#3d3935' }}>{event.title}</p>
                  </div>
                  {view && (
                    <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ color: view.color, background: `${view.color}14` }}>
                      <view.Icon className="w-3 h-3" />{view.label}
                    </span>
                  )}
                </div>
                {event.what && <p className="mt-2 text-[12px] leading-5" style={{ color: '#5a5550' }}>{event.what}</p>}
                {event.impact && (
                  <div className="mt-2 rounded-lg px-3 py-2" style={{ background: '#faf9f7' }}>
                    <p className={heading} style={{ color: '#8a857f' }}>Poveikis kainoms</p>
                    <p className="text-[12px] leading-5 mt-0.5" style={{ color: '#3d3935' }}>{event.impact}</p>
                  </div>
                )}
                {(event.affects.length > 0 || event.source) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {event.affects.map(item => (
                      <span key={item} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.07)', color: '#0a5fc2' }}>{item}</span>
                    ))}
                    {event.source && <span className="text-[10px] ml-auto truncate" style={{ color: '#b0aba4' }} title={event.source}>Šaltinis: {event.source}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.missing && <p className="text-[11px] leading-5" style={{ color: '#8a857f' }}>Ko nepavyko rasti: {data.missing}</p>}
    </div>
  );
}
