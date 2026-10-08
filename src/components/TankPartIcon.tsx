import React, { useId } from 'react';

// One small tank drawing, four ways: each summary tile highlights the part of the tank it talks about.
//   talpa  – the space inside (volume)
//   terpe  – the liquid in it
//   derva  – the wall (what the resin is chosen for)
//   kaina  – the whole tank, with a euro mark
export type TankPart = 'talpa' | 'terpe' | 'derva' | 'kaina';

const LINE = '#b8b2aa';
const BLUE = '#007AFF';
const AMBER = '#d97706';

export function TankPartIcon({ part, vertical = false }: { part: TankPart; vertical?: boolean }) {
  const clipId = useId();
  // the tank body: lying down, or standing when the card describes a vertical tank
  const body = vertical
    ? { x: 14.5, y: 6, width: 15, height: 24, rx: 6, ry: 4.5 }
    : { x: 5.5, y: 11, width: 33, height: 15, rx: 7.5, ry: 7.5 };
  // the manhole on top: a short neck with its lid, part of the tank itself
  const neck = { x: body.x + body.width / 2 - (vertical ? 2.5 : 3.5), width: vertical ? 5 : 7, top: body.y - 3.2 };
  const bottom = body.y + body.height;
  const level = body.y + body.height * 0.45;
  const wave = `M ${body.x} ${level} q ${body.width / 8} -2.2 ${body.width / 4} 0 t ${body.width / 4} 0 t ${body.width / 4} 0 t ${body.width / 4} 0 V ${bottom} H ${body.x} Z`;

  return (
    <svg viewBox="0 0 44 32" width="44" height="32" className="shrink-0" aria-hidden>
      <defs>
        <clipPath id={clipId}><rect {...body} /></clipPath>
      </defs>

      {part === 'talpa' && (
        <rect x={body.x + 2.5} y={body.y + 2.5} width={body.width - 5} height={body.height - 5}
          rx={Math.max(body.rx - 2.5, 1)} ry={Math.max(body.ry - 2.5, 1)} fill={BLUE} fillOpacity={0.2} />
      )}
      {part === 'terpe' && (
        <g clipPath={`url(#${clipId})`}>
          <path d={wave} fill={BLUE} fillOpacity={0.3} />
          <path d={wave.split(' V ')[0]} fill="none" stroke={BLUE} strokeWidth={1.2} strokeOpacity={0.8} />
        </g>
      )}
      {part === 'derva' && (
        <rect {...body} fill="none" stroke={AMBER} strokeOpacity={0.35} strokeWidth={5} />
      )}

      <rect {...body} fill="none" stroke={part === 'derva' ? AMBER : part === 'kaina' ? '#8a857f' : LINE} strokeWidth={1.5} />

      <g stroke={part === 'derva' ? AMBER : part === 'kaina' ? '#8a857f' : LINE} strokeWidth={1.5} strokeLinecap="round" fill="none">
        <path d={`M ${neck.x} ${body.y + 0.4} V ${neck.top} M ${neck.x + neck.width} ${body.y + 0.4} V ${neck.top}`} />
        <line x1={neck.x - 1.3} y1={neck.top} x2={neck.x + neck.width + 1.3} y2={neck.top} />
      </g>

      {part === 'kaina' && (
        <text x={body.x + body.width / 2} y={body.y + body.height / 2 + 4.2} textAnchor="middle" fontSize="11" fontWeight={700} fill={BLUE}>€</text>
      )}
    </svg>
  );
}
