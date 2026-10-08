import React, { useEffect, useState } from 'react';

type Section = 'nafta' | 'geo' | 'analysis';

// What each analysis does, in order. The answer arrives in one piece, so the lines advance on a timer:
// they describe the work, they are not a live readout of it.
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

export function GenerationProgress({ section }: { section: Section }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [section]);

  const { seconds, lines } = STEPS[section];
  const current = Math.min(lines.length - 1, Math.floor(elapsed / seconds));
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const bar = (width: string, height = 10) => <div className="gen-shimmer rounded" style={{ width, height }} />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-10 gap-y-6 items-start">
      <style>{`
        @keyframes genShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        .gen-shimmer { background: linear-gradient(90deg, #f3f1ee 25%, #e9e6e1 37%, #f3f1ee 63%); background-size: 800px 100%; animation: genShimmer 1.6s linear infinite; }
        @keyframes genLineIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
        .gen-line { animation: genLineIn 0.45s ease-out both; }
        @keyframes genDot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.45; } }
        .gen-dot { animation: genDot 1.2s ease-in-out infinite; }
      `}</style>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8a857f' }}>Analizė ruošiama</p>
          <p className="text-[11px] font-mono" style={{ color: '#8a857f' }}>{clock}</p>
        </div>
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
        <p className="mt-4 text-[11px]" style={{ color: '#b0aba4' }}>Paprastai trunka {DURATION[section]} Puslapio uždaryti nereikia – galite pereiti į kitą skiltį.</p>
      </div>

      {/* outline of the report that is on its way */}
      <div className="min-w-0 space-y-4" aria-hidden>
        <div className="rounded-xl px-4 py-3 space-y-2" style={{ border: '1px solid #f0ede8' }}>{bar('92%')}{bar('64%')}</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl px-3 py-3 space-y-2" style={{ border: '1px solid #f0ede8' }}>{bar('50%', 8)}{bar('70%', 18)}</div>
          ))}
        </div>
        <div className="space-y-2.5">{bar('96%')}{bar('88%')}{bar('93%')}{bar('58%')}</div>
      </div>
    </div>
  );
}
