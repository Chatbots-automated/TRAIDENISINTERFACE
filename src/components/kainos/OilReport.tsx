import { useMemo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Droplet, FlaskConical } from 'lucide-react';

// Rising oil is the bad news for a resin buyer: up is red, down is green.
const UP = '#b91c1c';
const DOWN = '#15803d';
const FLAT = '#6b7280';

interface OilData {
  summary: string;
  outlook: 'kyla' | 'krenta' | 'stabili' | null;
  brent: { usd_bbl: number | null; eur_bbl: number | null; change_7d_pct: number | null; change_30d_pct: number | null; date: string | null; source: string };
  styrene: { eur_t: number | null; date: string | null; source: string; note: string };
  impact: string[];
  resin_link: string;
  sources: string[];
}

const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, ''));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const flatten = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();

function fromJson(text: string): OilData | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: any;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !raw.brent) return null;
  const outlook = str(raw.outlook).toLowerCase();
  return {
    summary: str(raw.summary),
    outlook: outlook === 'kyla' || outlook === 'krenta' || outlook === 'stabili' ? outlook : null,
    brent: {
      usd_bbl: num(raw.brent?.usd_bbl), eur_bbl: num(raw.brent?.eur_bbl),
      change_7d_pct: num(raw.brent?.change_7d_pct), change_30d_pct: num(raw.brent?.change_30d_pct),
      date: str(raw.brent?.date) || null, source: str(raw.brent?.source),
    },
    styrene: { eur_t: num(raw.styrene?.eur_t), date: str(raw.styrene?.date) || null, source: str(raw.styrene?.source), note: str(raw.styrene?.note) },
    impact: Array.isArray(raw.impact) ? raw.impact.map(str).filter(Boolean) : [],
    resin_link: str(raw.resin_link),
    sources: Array.isArray(raw.sources) ? raw.sources.map(str).filter(Boolean) : [],
  };
}

/** Reports generated before the prompt returned JSON: numbered markdown sections with "**Label:** value" lines. */
function fromLegacyMarkdown(text: string): OilData | null {
  const parts = text.split(/^##\s*\d+\.\s*/m).slice(1);
  if (parts.length < 2) return null;
  const section = (keyword: RegExp) => {
    const hit = parts.find(part => keyword.test(part.split('\n')[0]));
    return hit ? hit.slice(hit.indexOf('\n') + 1).split(/\n---/)[0] : '';
  };
  const labels = (body: string) => {
    const map: Record<string, string> = {};
    const flat = flatten(body);
    for (const match of flat.matchAll(/\*\*([^*:]+):\*\*\s*([^*]*)/g)) map[match[1].trim().toLowerCase()] = match[2].trim();
    return map;
  };
  const brent = labels(section(/BRENT/i));
  const styrene = labels(section(/STYREN|STIREN/i));
  const price = brent['kaina'] || '';
  const styrenePrice = styrene['kaina'] || '';
  const impact = section(/POVEIKIS/i).split(/(?:^|\n)\s*-\s+|(?:^|\n)\s*-\s*\n/).map(flatten).filter(item => item.length > 3);
  const sources = [brent['šaltinis'], styrene['šaltinis']].filter(Boolean) as string[];
  return {
    summary: '',
    outlook: null,
    brent: {
      usd_bbl: num(price.match(/([\d.,]+)\s*USD/)?.[1]), eur_bbl: num(price.match(/([\d.,]+)\s*EUR/)?.[1]),
      change_7d_pct: num((brent['7 d. pokytis'] || '').match(/[-+−]?\s*[\d.,]+\s*%/)?.[0]?.replace('−', '-')),
      change_30d_pct: num((brent['30 d. pokytis'] || '').match(/[-+−]?\s*[\d.,]+\s*%/)?.[0]?.replace('−', '-')),
      date: null, source: brent['šaltinis'] || '',
    },
    styrene: {
      eur_t: num(styrenePrice.match(/([\d.,\s]+)\s*EUR\/t/)?.[1]),
      date: (styrene['data'] || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
      source: styrene['šaltinis'] || '', note: styrene['pastaba'] || '',
    },
    impact,
    resin_link: flatten(section(/RYŠYS/i)),
    sources,
  };
}

const fmt = (value: number, digits = 2) => value.toLocaleString('lt-LT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const tone = (pct: number | null) => (pct === null || Math.abs(pct) < 0.5 ? FLAT : pct > 0 ? UP : DOWN);

function Tile({ label, value, unit, sub, color }: { label: string; value: string; unit?: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 min-w-0" style={{ border: '1px solid #f0ede8', background: '#fcfbfa' }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8a857f' }}>{label}</p>
      <p className="text-lg font-semibold leading-tight mt-0.5" style={{ color: color || '#3d3935' }}>
        {value}{unit && <span className="ml-1 text-[11px] font-normal" style={{ color: '#8a857f' }}>{unit}</span>}
      </p>
      {sub && <p className="text-[10px] truncate" style={{ color: '#8a857f' }} title={sub}>{sub}</p>}
    </div>
  );
}

/** Oil report; returns null when the text has no recognisable structure, so the caller can show it as plain text. */
export function OilReport({ content }: { content: string }) {
  const data = useMemo(() => fromJson(content || '') ?? fromLegacyMarkdown(content || ''), [content]);
  if (!data) return null;

  const change = (pct: number | null) => (pct === null ? 'nerasta' : `${pct > 0 ? '+' : ''}${fmt(pct, 1)} %`);
  const OutlookIcon = data.outlook === 'kyla' ? ArrowUpRight : data.outlook === 'krenta' ? ArrowDownRight : ArrowRight;
  const outlookColor = data.outlook === 'kyla' ? UP : data.outlook === 'krenta' ? DOWN : FLAT;
  const heading = 'text-[10px] uppercase tracking-wide mb-1.5';

  return (
    <div className="space-y-4">
      {(data.summary || data.outlook) && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: '#faf9f7', border: '1px solid #f0ede8' }}>
          {data.outlook && (
            <span className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ color: outlookColor, background: 'white', border: `1px solid ${outlookColor}33` }}>
              <OutlookIcon className="w-3.5 h-3.5" />Nafta {data.outlook}
            </span>
          )}
          {data.summary && <p className="text-[13px] leading-6" style={{ color: '#3d3935' }}>{data.summary}</p>}
        </div>
      )}

      <div>
        <p className={heading} style={{ color: '#8a857f' }}><Droplet className="inline w-3 h-3 mr-1 -mt-0.5" />Brent žalia nafta</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Tile label="Kaina" value={data.brent.usd_bbl !== null ? fmt(data.brent.usd_bbl) : 'nerasta'} unit={data.brent.usd_bbl !== null ? 'USD/bbl' : undefined} sub={data.brent.date || undefined} />
          <Tile label="Kaina eurais" value={data.brent.eur_bbl !== null ? fmt(data.brent.eur_bbl) : 'nerasta'} unit={data.brent.eur_bbl !== null ? 'EUR/bbl' : undefined} />
          <Tile label="Per 7 dienas" value={change(data.brent.change_7d_pct)} color={tone(data.brent.change_7d_pct)} />
          <Tile label="Per 30 dienų" value={change(data.brent.change_30d_pct)} color={tone(data.brent.change_30d_pct)} />
        </div>
        {data.brent.source && <p className="mt-1 text-[10px]" style={{ color: '#b0aba4' }}>Šaltinis: {data.brent.source}</p>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-8 gap-y-4 items-start">
        <div className="min-w-0">
          <p className={heading} style={{ color: '#8a857f' }}><FlaskConical className="inline w-3 h-3 mr-1 -mt-0.5" />Stirenas Europoje</p>
          <Tile label="Kaina" value={data.styrene.eur_t !== null ? fmt(data.styrene.eur_t, 0) : 'nerasta'} unit={data.styrene.eur_t !== null ? 'EUR/t' : undefined} sub={data.styrene.date || undefined} />
          {data.styrene.note && <p className="mt-2 text-[12px] leading-5" style={{ color: '#5a5550' }}>{data.styrene.note}</p>}
          {data.styrene.source && <p className="mt-1 text-[10px]" style={{ color: '#b0aba4' }}>Šaltinis: {data.styrene.source}</p>}

          {data.resin_link && (
            <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.15)' }}>
              <p className={heading} style={{ color: '#007AFF' }}>Ką tai reiškia dervoms</p>
              <p className="text-[13px] leading-6" style={{ color: '#3d3935' }}>{data.resin_link}</p>
            </div>
          )}
        </div>

        {data.impact.length > 0 && (
          <div className="min-w-0">
            <p className={heading} style={{ color: '#8a857f' }}>Poveikis Rytų Europai</p>
            <ul className="space-y-2">
              {data.impact.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13px] leading-6" style={{ color: '#3d3935' }}>
                  <span className="mt-[9px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#d4cfc8' }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {data.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px]" style={{ color: '#8a857f' }}>Šaltiniai:</span>
          {data.sources.map(source => (
            <span key={source} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.04)', color: '#5a5550' }}>{source}</span>
          ))}
        </div>
      )}
    </div>
  );
}
