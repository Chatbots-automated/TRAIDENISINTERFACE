import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { KainuIrašas, Medžiaga } from '../../lib/kainosService';
import { extractJsonPayload, normalizeAnalysisForecasts } from './forecastParsing';

const STALE_DAYS = 30;
const FLAT_PCT = 1; // a change smaller than this is shown as "no change"

// For a buyer a rising price is the bad news, so up is red and down is green.
const UP = '#b91c1c';
const DOWN = '#15803d';
const FLAT = '#6b7280';

interface Row {
  material: Medžiaga;
  last: number | null;
  lastDate: string | null;
  forecast: number | null;
  forecastDate: string | null;
  changePct: number | null;
}

const fmt = (v: number) => v.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('lt-LT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const tone = (pct: number | null) => (pct === null || Math.abs(pct) < FLAT_PCT ? FLAT : pct > 0 ? UP : DOWN);

/** The analysis text without the machine-readable forecast block (that part is shown as the table). */
export function analysisNarrative(content: string): string {
  const raw = (content || '').trim();
  if (!raw) return '';
  if (raw.startsWith('{')) {
    try {
      const payload = JSON.parse(raw) as { analysis_markdown?: unknown };
      return typeof payload.analysis_markdown === 'string' ? payload.analysis_markdown.trim() : '';
    } catch { /* not pure JSON: treat as text */ }
  }
  return raw.replace(/```(?:json)?\s*[\s\S]*?"forecasts"[\s\S]*?```/gi, '').trim();
}

export function MarketOverview({ medziagas, istorija, content, dateUpdated }: {
  medziagas: Medžiaga[]; istorija: KainuIrašas[]; content: string; dateUpdated?: string | null;
}) {
  const rows = useMemo<Row[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    let forecasts: ReturnType<typeof normalizeAnalysisForecasts> = [];
    try {
      forecasts = normalizeAnalysisForecasts(extractJsonPayload(content || ''), medziagas, today);
    } catch { /* no forecast block in the text */ }

    return medziagas.map((material) => {
      const entries = istorija
        .filter(e => e.artikulas === material.artikulas && e.kaina_min !== null)
        .sort((a, b) => a.data.localeCompare(b.data));
      const lastEntry = entries[entries.length - 1];
      const last = lastEntry ? (lastEntry.kaina_min! + (lastEntry.kaina_max ?? lastEntry.kaina_min!)) / 2 : null;
      const points = forecasts.filter(f => f.artikulas === material.artikulas && f.kaina > 0).sort((a, b) => a.data.localeCompare(b.data));
      const point = points[points.length - 1];
      return {
        material,
        last,
        lastDate: lastEntry?.data ?? null,
        forecast: point?.kaina ?? null,
        forecastDate: point?.data ?? null,
        changePct: last && point ? ((point.kaina - last) / last) * 100 : null,
      };
    });
  }, [medziagas, istorija, content]);

  const withForecast = rows.filter(r => r.changePct !== null);
  if (withForecast.length === 0) return null;

  const up = withForecast.filter(r => r.changePct! >= FLAT_PCT).length;
  const down = withForecast.filter(r => r.changePct! <= -FLAT_PCT).length;
  const flat = withForecast.length - up - down;
  const average = withForecast.reduce((sum, r) => sum + r.changePct!, 0) / withForecast.length;
  const biggest = [...withForecast].sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))[0];
  const scale = Math.max(5, ...withForecast.map(r => Math.abs(r.changePct!)));
  const forecastDate = withForecast.map(r => r.forecastDate!).sort().pop()!;
  const ageDays = dateUpdated ? Math.floor((Date.now() - new Date(dateUpdated).getTime()) / 86400000) : null;
  const outdated = forecastDate < new Date().toISOString().slice(0, 10);

  const tiles: Array<{ label: string; value: string; sub: string; color: string }> = [
    { label: 'Bendra kryptis', value: fmtPct(average), sub: 'vid. prognozuojamas pokytis', color: tone(average) },
    { label: 'Brangs', value: String(up), sub: `iš ${withForecast.length} medžiagų`, color: up ? UP : FLAT },
    { label: 'Pigs', value: String(down), sub: flat ? `${flat} nesikeis` : 'medžiagų', color: down ? DOWN : FLAT },
    { label: 'Didžiausias pokytis', value: fmtPct(biggest.changePct!), sub: biggest.material.pavadinimas, color: tone(biggest.changePct) },
  ];

  return (
    <div className="min-w-0">
      {(outdated || (ageDays !== null && ageDays > STALE_DAYS)) && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(217,119,6,0.08)', color: '#b45309' }}>
          Analizė sugeneruota {dateUpdated ? dateUpdated.slice(0, 10) : 'seniai'}{ageDays !== null ? ` (prieš ${ageDays} d.)` : ''}
          {outdated ? `, o prognozės data ${forecastDate} jau praėjo` : ''}. Paspauskite „Generuoti“, kad atnaujintumėte.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {tiles.map(tile => (
          <div key={tile.label} className="rounded-xl px-3 py-2.5" style={{ border: '1px solid #f0ede8', background: '#fcfbfa' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8a857f' }}>{tile.label}</p>
            <p className="text-lg font-semibold leading-tight mt-0.5" style={{ color: tile.color }}>{tile.value}</p>
            <p className="text-[10px] truncate" style={{ color: '#8a857f' }} title={tile.sub}>{tile.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f0ede8' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#faf9f7', color: '#8a857f' }}>
              <th className="px-3 py-2 text-left font-medium">Medžiaga</th>
              <th className="px-3 py-2 text-right font-medium">Paskutinė kaina</th>
              <th className="px-3 py-2 text-right font-medium">DI prognozė</th>
              <th className="px-3 py-2 text-right font-medium">Pokytis</th>
              <th className="px-3 py-2 font-medium w-[22%]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const color = tone(row.changePct);
              const Icon = row.changePct === null || Math.abs(row.changePct) < FLAT_PCT ? ArrowRight : row.changePct > 0 ? ArrowUpRight : ArrowDownRight;
              const width = row.changePct === null ? 0 : Math.min(50, (Math.abs(row.changePct) / scale) * 50);
              return (
                <tr key={row.material.artikulas} style={{ borderTop: '1px solid #f0ede8' }}>
                  <td className="px-3 py-2">
                    <span style={{ color: '#3d3935' }}>{row.material.pavadinimas}</span>
                    <span className="ml-1.5 text-[10px]" style={{ color: '#b0aba4' }}>{row.material.artikulas} · {row.material.vienetas}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="font-mono" style={{ color: '#3d3935' }}>{row.last !== null ? fmt(row.last) : '—'}</span>
                    {row.lastDate && <span className="block text-[10px]" style={{ color: '#b0aba4' }}>{row.lastDate}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="font-mono font-semibold" style={{ color: '#3d3935' }}>{row.forecast !== null ? fmt(row.forecast) : '—'}</span>
                    {row.forecastDate && <span className="block text-[10px]" style={{ color: '#b0aba4' }}>{row.forecastDate}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.changePct !== null ? (
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color }}>
                        <Icon className="w-3.5 h-3.5" />{fmtPct(row.changePct)}
                      </span>
                    ) : <span style={{ color: '#b0aba4' }}>—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {/* change bar: left of the centre line = cheaper, right = more expensive */}
                    <div className="relative h-2 rounded-full" style={{ background: '#f5f3f0' }}>
                      <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px" style={{ background: '#d4cfc8' }} />
                      {row.changePct !== null && (
                        <div className="absolute top-0 bottom-0 rounded-full"
                          style={{ background: color, opacity: 0.75, width: `${width}%`, ...(row.changePct >= 0 ? { left: '50%' } : { right: '50%' }) }} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px]" style={{ color: '#b0aba4' }}>
        Pokytis – DI prognozė, palyginta su paskutine įvesta kaina. DI prognozės tikslumas dar nepatikrintas.
      </p>
    </div>
  );
}
