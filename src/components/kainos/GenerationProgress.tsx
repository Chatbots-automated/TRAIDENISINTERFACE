import { useEffect, useRef, useState } from 'react';
import { Globe, PenLine, Search } from 'lucide-react';
import type { AnalysisLive } from '../../lib/internetAnalysisService';

type Section = 'nafta' | 'geo' | 'analysis';

// Shown only until the first real event arrives (or all the way through where the host cannot stream the answer).
// These lines advance on a timer: they describe the work, they are not a live readout of it.
const STEPS: Record<Section, { seconds: number; lines: string[] }> = {
  nafta: {
    seconds: 14,
    lines: [
      'Ieškoma šios dienos Brent naftos kainos…',
      'Tikrinama, kiek kaina pasikeitė per 7 ir 30 dienų…',
      'Ieškoma stireno kainos Europoje…',
      'Skaitomi ir lyginami šaltiniai…',
      'Vertinama, ką tai reiškia dervų kainoms…',
      'Rašoma ataskaita…',
    ],
  },
  geo: {
    seconds: 14,
    lines: [
      'Ieškoma naujausių sankcijų ir tarifų naujienų…',
      'Tikrinamos energetikos ir tiekimo naujienos…',
      'Ieškoma dervų ir stiklo pluošto tiekėjų pranešimų…',
      'Atrenkami svarbiausi įvykiai…',
      'Vertinama, kurie įvykiai kainas brangina, o kurie pigina…',
      'Rašoma apžvalga…',
    ],
  },
  analysis: {
    seconds: 7,
    lines: [
      'Skaitoma naftos ataskaita…',
      'Skaitomi rinkos įvykiai…',
      'Peržiūrimos paskutinės įvestos kainos…',
      'Skaičiuojama kiekvienos medžiagos prognozė…',
      'Rašomas paaiškinimas…',
    ],
  },
};

const DURATION: Record<Section, string> = { nafta: '1–3 min.', geo: '1–3 min.', analysis: 'iki 1 min.' };

// Text fields of the three report formats, in the order a reader cares about.
const SNIPPET_KEYS = ['summary', 'analysis_markdown', 'title', 'what', 'impact', 'material', 'reasoning', 'resin_link', 'note', 'missing'];
const SNIPPET_PATTERN = new RegExp(`"(${SNIPPET_KEYS.join('|')})"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)("?)`, 'g');

interface Snippet { key: string; text: string; done: boolean }

function unescapeJson(value: string): string {
  const trimmed = value.replace(/\\+$/, match => (match.length % 2 ? match.slice(1) : match)).replace(/\\u[0-9a-fA-F]{0,3}$/, '');
  try { return JSON.parse(`"${trimmed}"`); } catch { return trimmed.replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
}

/** The pieces of text already written in the (still incomplete) JSON answer. */
export function snippetsFromPartialAnswer(text: string): Snippet[] {
  const found: Snippet[] = [];
  for (const match of text.matchAll(SNIPPET_PATTERN)) {
    const value = unescapeJson(match[2]).replace(/^[-\s]+/gm, '').trim();
    if (value) found.push({ key: match[1], text: value, done: match[3] === '"' });
  }
  return found;
}

export function GenerationProgress({ section, live }: { section: Section; live?: AnalysisLive | null }) {
  const [elapsed, setElapsed] = useState(0);
  const feedEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [section]);

  const hasLive = !!live && (live.searches.length > 0 || live.sources.length > 0 || live.text.length > 0);
  const snippets = hasLive ? snippetsFromPartialAnswer(live!.text) : [];
  const writing = hasLive && live!.text.length > 0;

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [snippets.length, live?.searches.length]);

  const { seconds, lines } = STEPS[section];
  const current = Math.min(lines.length - 1, Math.floor(elapsed / seconds));
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const bar = (width: string, height = 10) => <div className="gen-shimmer rounded" style={{ width, height }} />;
  const heading = 'text-[10px] uppercase tracking-wide';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-10 gap-y-6 items-start">
      <style>{`
        @keyframes genShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        .gen-shimmer { background: linear-gradient(90deg, #f3f1ee 25%, #e9e6e1 37%, #f3f1ee 63%); background-size: 800px 100%; animation: genShimmer 1.6s linear infinite; }
        @keyframes genLineIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
        .gen-line { animation: genLineIn 0.45s ease-out both; }
        @keyframes genDot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.45; } }
        .gen-dot { animation: genDot 1.2s ease-in-out infinite; }
        @keyframes genCaret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .gen-caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: text-bottom; background: #007AFF; animation: genCaret 0.9s steps(1) infinite; }
      `}</style>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between">
          <p className={heading} style={{ color: '#8a857f' }}>Analizė ruošiama</p>
          <p className="text-[11px] font-mono" style={{ color: '#8a857f' }}>{clock}</p>
        </div>

        {!hasLive ? (
          <ul className="mt-3 space-y-2">
            {lines.slice(0, current + 1).map((line, index) => {
              const active = index === current;
              return (
                <li key={line} className="gen-line flex items-center gap-2.5 text-[13px]" style={{ color: active ? '#3d3935' : '#b0aba4' }}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'gen-dot' : ''}`} style={{ background: active ? '#007AFF' : '#d4cfc8' }} />
                  {line}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 space-y-3">
            {live!.searches.length > 0 && (
              <ul className="space-y-1.5">
                {live!.searches.map((query, index) => {
                  const active = !writing && index === live!.searches.length - 1;
                  return (
                    <li key={query} className="gen-line flex items-start gap-2 text-[12px] leading-5" style={{ color: active ? '#3d3935' : '#8a857f' }}>
                      <Search className="w-3.5 h-3.5 mt-[3px] shrink-0" style={{ color: active ? '#007AFF' : '#b0aba4' }} />
                      <span><span style={{ color: '#b0aba4' }}>Ieškoma:</span> {query}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {live!.sources.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[11px] mb-1.5" style={{ color: '#8a857f' }}>
                  <Globe className="w-3.5 h-3.5" style={{ color: '#b0aba4' }} />Rasta šaltinių: {live!.sources.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {live!.sources.slice(-14).map(source => (
                    <span key={source} className="gen-line text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.04)', color: '#5a5550' }}>{source}</span>
                  ))}
                </div>
              </div>
            )}
            <p className="flex items-center gap-2 text-[12px]" style={{ color: '#3d3935' }}>
              {writing
                ? <><PenLine className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />Rašoma ataskaita…</>
                : <><span className="w-1.5 h-1.5 rounded-full gen-dot" style={{ background: '#007AFF' }} />Skaitomi rezultatai…</>}
            </p>
          </div>
        )}
        <p className="mt-4 text-[11px]" style={{ color: '#b0aba4' }}>Paprastai trunka {DURATION[section]} Kol analizė ruošiama, puslapio neuždarykite.</p>
      </div>

      {snippets.length > 0 ? (
        <div className="min-w-0">
          <p className={heading} style={{ color: '#8a857f' }}>Rašoma dabar</p>
          <div className="mt-2 space-y-2">
            {snippets.map((snippet, index) => {
              const last = index === snippets.length - 1;
              const title = snippet.key === 'title' || snippet.key === 'material';
              const lead = snippet.key === 'summary' || snippet.key === 'analysis_markdown';
              return (
                <p key={index} className={`${title ? 'font-semibold pt-1' : ''} ${lead ? 'text-[13px] leading-6' : 'text-[12px] leading-5'} whitespace-pre-line`}
                  style={{ color: title || lead ? '#3d3935' : '#5a5550' }}>
                  {snippet.text}{last && !snippet.done && <span className="gen-caret" />}
                </p>
              );
            })}
            <div ref={feedEnd} />
          </div>
        </div>
      ) : (
        // outline of the report that is on its way
        <div className="min-w-0 space-y-4" aria-hidden>
          <div className="rounded-xl px-4 py-3 space-y-2" style={{ border: '1px solid #f0ede8' }}>{bar('92%')}{bar('64%')}</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl px-3 py-3 space-y-2" style={{ border: '1px solid #f0ede8' }}>{bar('50%', 8)}{bar('70%', 18)}</div>
            ))}
          </div>
          <div className="space-y-2.5">{bar('96%')}{bar('88%')}{bar('93%')}{bar('58%')}</div>
        </div>
      )}
    </div>
  );
}
