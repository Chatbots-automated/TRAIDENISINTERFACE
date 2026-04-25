import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LineChart as LineChartIcon, Loader2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computePrediction } from '../../lib/kainosService';
import type { KainuIrašas, Medžiaga } from '../../lib/kainosService';
import type { ExtractedCitation } from '../../lib/kainosAnalyticsFramework';
import { addDaysISO, addMonthsISO, extractJsonPayload, normalizeAnalysisForecasts, parseForecastsFromMarkdownTable, parseForecastsFromNarrativeText } from './forecastParsing';
import type { AiPrediction, ChartPoint } from './forecastParsing';

export function GrafaTab({ medziagas, istorija, analysisContent, onError }: { medziagas: Medžiaga[]; istorija: KainuIrašas[]; analysisContent: string; onError?: (msg: string) => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const [aiToggle, setAiToggle] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [projectionsVisible, setProjectionsVisible] = useState(false);
  const [aiPredictions, setAiPredictions] = useState<AiPrediction[]>([]);
  const [aiResponseCitations, setAiResponseCitations] = useState<ExtractedCitation[]>([]);
  // Close on outside click
  useEffect(() => {
    if (!showInfo) return;
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showInfo]);

  // Fetch AI predictions when toggle is enabled
  const fetchAiPredictions = useCallback(async () => {
    if (aiLoading || medziagas.length === 0) return;
    setAiLoading(true);
    try {
      // Primary source of truth: third-step analysis content from medziagos_analize_internetas (id = "kainos").
      const fallbackDate = addMonthsISO(new Date().toISOString().slice(0, 10), 3);
      const rawContent = analysisContent || '';
      let loaded: AiPrediction[] = [];
      if (rawContent.trim()) {
        try {
          const payload = extractJsonPayload(rawContent);
          loaded = normalizeAnalysisForecasts(payload, medziagas, fallbackDate);
        } catch (parseError) {
          console.warn('[GrafaTab] Nepavyko išparsinti medziagos_prognoze_internetas.content JSON:', parseError);
        }
      }

      if (loaded.length === 0 && rawContent.trim()) {
        const fromMarkdown = parseForecastsFromMarkdownTable(rawContent, medziagas, fallbackDate);
        const fromNarrative = parseForecastsFromNarrativeText(rawContent, medziagas, fallbackDate);
        const deduped = new Map<string, AiPrediction>();
        for (const pred of [...fromMarkdown, ...fromNarrative]) {
          deduped.set(`${pred.artikulas}|${pred.data}`, pred);
        }
        loaded = Array.from(deduped.values());
      }

      if (loaded.length === 0) {
        onError?.('Nerasta validžių AI prognozių tarp 3-ios analizės JSON/teksto duomenų.');
        setAiToggle(false);
        return;
      }

      setAiPredictions(loaded);
      setAiResponseCitations([]);
    } catch (err: any) {
      console.error('AI prediction error:', err);
      onError?.(err.message || 'Nepavyko gauti DI prognozės');
      setAiToggle(false);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, medziagas, onError, analysisContent]);

  useEffect(() => {
    if (aiToggle && aiPredictions.length === 0 && !aiLoading) {
      fetchAiPredictions();
    }
  }, [aiToggle, aiPredictions.length, aiLoading, fetchAiPredictions]);

  // Keep chart behavior stable while container is resizing.
  useEffect(() => {
    let resizeTimer: number | null = null;
    const onResize = () => {
      setIsResizing(true);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setIsResizing(false);
      }, 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Controlled reveal: draw historical line first, then projections.
  useEffect(() => {
    setProjectionsVisible(false);
    const timer = window.setTimeout(() => setProjectionsVisible(true), 240);
    return () => window.clearTimeout(timer);
  }, [istorija, medziagas, aiToggle, aiPredictions]);

  // Group history by artikulas
  const byArt = useMemo(() => {
    const map = new Map<string, KainuIrašas[]>();
    for (const e of istorija) {
      const arr = map.get(e.artikulas) || [];
      arr.push(e);
      map.set(e.artikulas, arr);
    }
    return map;
  }, [istorija]);

  // Build chart data per material
  const charts = useMemo(() => {
    return medziagas.map(m => {
      const entries = (byArt.get(m.artikulas) || [])
        .map((e) => ({
          ...e,
          kaina_min: e.kaina_min ?? e.kaina_max ?? null,
        }))
        .filter((e) => e.kaina_min !== null)
        .sort((a, b) => a.data.localeCompare(b.data));

      if (entries.length === 0) return null;

      const prediction = computePrediction(entries);
      const aiPredSeries = aiToggle
        ? aiPredictions
          .filter(p => p.artikulas === m.artikulas && p.kaina > 0)
          .sort((a, b) => a.data.localeCompare(b.data))
        : [];

      // Build chart points from actual data
      const points: ChartPoint[] = entries.map(e => ({
        date: e.data,
        label: e.data, // full YYYY-MM-DD for axis
        kaina: e.kaina_min,
        predicted: undefined,
      }));

      const lastActualPoint = points[points.length - 1];

      // Add mathematical prediction points
      if (prediction) {
        const mathTargetValue = (prediction.kaina_min + prediction.kaina_max) / 2;
        points.push({
          date: lastActualPoint.date,
          label: lastActualPoint.date,
          kaina: lastActualPoint.kaina,
          predicted: lastActualPoint.kaina!,
        });

        if (aiToggle && aiPredSeries.length > 0) {
          let lastProjectionDate = lastActualPoint.date;
          aiPredSeries.forEach((aiPoint, idx) => {
            const ratio = (idx + 1) / aiPredSeries.length;
            const interpolated = lastActualPoint.kaina! + (mathTargetValue - lastActualPoint.kaina!) * ratio;
            const projectedDate = aiPoint.data > lastProjectionDate ? aiPoint.data : addDaysISO(lastProjectionDate, 1);
            lastProjectionDate = projectedDate;
            points.push({
              date: projectedDate,
              label: projectedDate,
              kaina: null,
              predicted: interpolated,
            });
          });
        } else {
          points.push({
            date: prediction.data,
            label: prediction.data,
            kaina: null,
            predicted: mathTargetValue,
          });
        }
      }

      // Add AI prediction points directly from AI data:
      // - first point is the last actual price (anchor)
      // - each next point is AI forecast value on a strictly increasing date
      if (aiPredSeries.length > 0) {
        points.push({
          date: lastActualPoint.date,
          label: lastActualPoint.date,
          kaina: lastActualPoint.kaina,
          aiPredicted: lastActualPoint.kaina!,
        });
        let lastAiDate = lastActualPoint.date;
        for (const aiPred of aiPredSeries) {
          const targetDate = aiPred.data > lastAiDate ? aiPred.data : addDaysISO(lastAiDate, 1);
          lastAiDate = targetDate;
          points.push({
            date: targetDate,
            label: targetDate,
            kaina: null,
            aiPredicted: aiPred.kaina,
          });
        }
      }

      // Merge duplicate dates and enforce chronological ordering so overlays
      // are layered on the same timeline.
      const byDate = new Map<string, ChartPoint>();
      for (const p of points) {
        const existing = byDate.get(p.date);
        if (!existing) {
          byDate.set(p.date, { ...p });
          continue;
        }
        byDate.set(p.date, {
          ...existing,
          kaina: p.kaina !== null && p.kaina !== undefined ? p.kaina : existing.kaina,
          predicted: p.predicted !== undefined ? p.predicted : existing.predicted,
          aiPredicted: p.aiPredicted !== undefined ? p.aiPredicted : existing.aiPredicted,
        });
      }
      const mergedPoints = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      // Hard guarantee for visible AI line with a single forecast point:
      // if after merge we only have one AI point, append one synthetic day ahead.
      const aiVisiblePoints = mergedPoints.filter((p) => p.aiPredicted !== undefined);
      if (aiPredSeries.length > 0 && aiVisiblePoints.length === 1) {
        const only = aiVisiblePoints[0];
        mergedPoints.push({
          date: addDaysISO(only.date, 1),
          label: addDaysISO(only.date, 1),
          kaina: null,
          aiPredicted: aiPredSeries[aiPredSeries.length - 1].kaina,
        });
      }

      const finalPoints = mergedPoints.sort((a, b) => a.date.localeCompare(b.date));

      // Compute Y-axis domain
      const allValues = [
        ...entries.map(e => e.kaina_min!),
        ...entries.filter(e => e.kaina_max != null).map(e => e.kaina_max!),
        ...(prediction ? [(prediction.kaina_min + prediction.kaina_max) / 2] : []),
        ...aiPredSeries.map((p) => p.kaina),
      ];
      const minY = Math.floor(Math.min(...allValues) * 0.95 * 100) / 100;
      const maxY = Math.ceil(Math.max(...allValues) * 1.05 * 100) / 100;

      const mathMid = prediction ? (prediction.kaina_min + prediction.kaina_max) / 2 : null;
      const aiFinal = aiPredSeries.length > 0 ? aiPredSeries[aiPredSeries.length - 1].kaina : null;
      const diffAbs = (mathMid !== null && aiFinal !== null) ? aiFinal - mathMid : null;
      const diffPct = (diffAbs !== null && mathMid !== 0) ? (diffAbs / mathMid) * 100 : null;

      return {
        material: m,
        entries,
        prediction,
        points: finalPoints,
        minY,
        maxY,
        aiPredSeries,
        diffAbs,
        diffPct,
      };
    }).filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];
  }, [medziagas, byArt, aiToggle, aiPredictions]);

  if (charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <LineChartIcon className="w-10 h-10" style={{ color: '#d4cfc8' }} />
        <p className="text-sm" style={{ color: '#8a857f' }}>Nėra kainų duomenų grafams.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Prediction animations */}
      <style>{`
        @keyframes predPulse {
          0%, 100% { r: 5; opacity: 1; filter: url(#predGlow); }
          50% { r: 7; opacity: 0.85; }
        }
        @keyframes predBadgeIn {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .prediction-dot {
          animation: predPulse 2.5s ease-in-out infinite;
          animation-delay: 2s;
        }
        .prediction-badge {
          animation: predBadgeIn 0.5s ease-out 1.8s both;
        }
      `}</style>

      {/* Controls row — centered toggle + info */}
      <div className="flex items-center justify-center gap-2 relative" ref={infoRef}>
        <button
          onClick={() => { if (!aiLoading) setAiToggle(!aiToggle); }}
          disabled={aiLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
          style={{
            background: aiToggle ? 'linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)' : 'rgba(0,0,0,0.04)',
            color: aiToggle ? 'white' : '#5a5550',
            border: `0.5px solid ${aiToggle ? 'transparent' : 'rgba(0,0,0,0.08)'}`,
          }}>
          {aiLoading ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Generuojama...</>
          ) : aiToggle ? 'Su DI' : 'Be DI'}
        </button>
        <div
          className="relative cursor-help"
          onMouseEnter={() => setShowInfo(true)}
          onMouseLeave={() => setShowInfo(false)}
        >
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#b0aba4' }} />
          {showInfo && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 w-80 bg-white rounded-xl overflow-hidden"
              style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #f0ede8' }}>
              <div className="px-4 py-3 space-y-2 text-xs leading-relaxed" style={{ color: '#5a5550' }}>
                <p><strong style={{ color: '#3d3935' }}>Be DI</strong> — grafikai rodo tik matematinę prognozę (svertinė tiesinė regresija pagal istorinius duomenis).</p>
                <p><strong style={{ color: '#7c3aed' }}>Su DI</strong> — papildomai rodoma DI prognozė (violetinė linija), kuri atsižvelgia į naftos kainas, geopolitinius įvykius, styreno rinką ir dabartines tiekimo sąlygas iš interneto.</p>
                <p style={{ color: '#b0aba4', fontSize: 10 }}>DI prognozei reikia sugeneruotos analizės (Analizė tab).</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {aiToggle && aiResponseCitations.length > 0 && (
        <div className="flex justify-center">
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'rgba(37,99,235,0.08)', color: '#1d4ed8' }}>
            Šaltiniai: {aiResponseCitations.length}
          </span>
        </div>
      )}

      {charts.map(({ material, entries, prediction, points, minY, maxY, aiPredSeries, diffAbs, diffPct }) => (
        <div key={material.artikulas} className="rounded-xl bg-white overflow-hidden"
          style={{ border: '0.5px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid #f0ede8' }}>
            <div>
              <span className="text-xs font-semibold" style={{ color: '#3d3935' }}>{material.pavadinimas}</span>
              <span className="text-[10px] ml-1.5" style={{ color: '#b0aba4' }}>{material.artikulas} · {material.vienetas}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: '#8a857f' }}>
                {entries.length} įraš{entries.length === 1 ? 'as' : 'ai'}
              </span>
              {prediction && projectionsVisible && (
                <span className="prediction-badge text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                  Prognozė {prediction.data}: {prediction.kaina_min.toFixed(2)}–{prediction.kaina_max.toFixed(2)}
                  <span className="ml-1 opacity-60">({Math.round(prediction.confidence * 100)}%)</span>
                </span>
              )}
              {aiPredSeries.length > 0 && projectionsVisible && (
                <span className="prediction-badge text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}
                  title={aiPredSeries[0].reasoning}>
                  AI taškai: {aiPredSeries.length} ({aiPredSeries[0].data} → {aiPredSeries[aiPredSeries.length - 1].data})
                  {' · '}
                  {aiPredSeries[aiPredSeries.length - 1].kaina.toFixed(2)} {material.vienetas}
                </span>
              )}
              {diffAbs !== null && diffPct !== null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: Math.abs(diffPct) < 2 ? 'rgba(107,114,128,0.12)' : diffPct > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                    color: Math.abs(diffPct) < 2 ? '#4b5563' : diffPct > 0 ? '#15803d' : '#b91c1c',
                  }}>
                  Δ AI vs matem.: {diffAbs >= 0 ? '+' : ''}{diffAbs.toFixed(3)} ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          {/* Chart */}
          <div className="px-2 py-3" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
              <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                <XAxis
                  dataKey="label"
                  tick={({ x, y, payload }: any) => {
                    const [yr, md] = (payload.value || '').split(/-(.+)/);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={10} textAnchor="middle" fontSize={8} fill="#b0aba4">{yr}</text>
                        <text x={0} y={0} dy={21} textAnchor="middle" fontSize={10} fill="#8a857f">{md}</text>
                      </g>
                    );
                  }}
                  height={35}
                  tickLine={false}
                  axisLine={{ stroke: '#f0ede8' }}
                />
                <YAxis
                  domain={[minY, maxY]}
                  tick={{ fontSize: 10, fill: '#8a857f' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v.toFixed(2)}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0ede8', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(value: number, name: string) => [
                    value?.toFixed(2),
                    name === 'aiPredicted' ? 'AI prognozė' : name === 'predicted' ? 'Prognozė' : 'Kaina',
                  ]}
                  labelFormatter={(label: string) => label}
                />
                {/* Actual price line */}
                <Line
                  type="monotone"
                  dataKey="kaina"
                  stroke="#3d3935"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3d3935', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#007AFF' }}
                  connectNulls={false}
                />
                {/* Prediction dashed line — delayed draw animation */}
                {projectionsVisible && (
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="url(#predGradient)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={!isResizing}
                    animationBegin={120}
                    animationDuration={620}
                    animationEasing="ease-out"
                  />
                )}
                {/* AI prediction dashed line — purple */}
                {aiPredSeries.length > 0 && projectionsVisible && (
                  <Line
                    type="monotone"
                    dataKey="aiPredicted"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2.5, fill: '#7c3aed', strokeWidth: 0 }}
                    connectNulls={true}
                    isAnimationActive={!isResizing}
                    animationBegin={220}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                )}
                {/* Gradient + glow defs */}
                <defs>
                  <linearGradient id="predGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#007AFF" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#007AFF" stopOpacity={1} />
                  </linearGradient>
                  <filter id="predGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* Prediction endpoint — pulsing glow dot */}
                {prediction && projectionsVisible && points.length > 0 && (() => {
                  const predPoint = [...points].reverse().find(p => p.predicted !== undefined);
                  return predPoint ? (
                    <ReferenceDot x={predPoint.label} y={predPoint.predicted!} r={0} fill="transparent" stroke="transparent">
                      <circle r={5} fill="#007AFF" stroke="white" strokeWidth={2} filter="url(#predGlow)" className="prediction-dot" />
                    </ReferenceDot>
                  ) : null;
                })()}
                {/* AI prediction endpoint — purple dot */}
                {aiPredSeries.length > 0 && projectionsVisible && (() => {
                  const aiPoint = [...points].reverse().find(p => p.aiPredicted !== undefined && p.kaina === null);
                  return aiPoint ? (
                    <ReferenceDot x={aiPoint.label} y={aiPoint.aiPredicted!} r={0} fill="transparent" stroke="transparent">
                      <circle r={5} fill="#7c3aed" stroke="white" strokeWidth={2} filter="url(#predGlow)" className="prediction-dot" />
                    </ReferenceDot>
                  ) : null;
                })()}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
