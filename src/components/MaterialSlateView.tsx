import React from 'react';

// ---------------------------------------------------------------------------
// MaterialSlateView — domain-aware renderer for structured material slate JSON
// Supports: new domain format (product/body/sections), legacy items format, and generic fallback
// ---------------------------------------------------------------------------

interface MaterialSlateViewProps {
  data: Record<string, any>;
  compact?: boolean;
  variant?: 'default' | 'panel';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtKg = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  return n >= 1000 ? n.toLocaleString('lt-LT') : String(n);
};

const cleanStr = (v: any): string => {
  if (typeof v !== 'string') return String(v ?? '');
  return v.replace(/\\n/g, '\n').replace(/\\t/g, ' ').trim();
};

const formatLabel = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());

const hasUsableValue = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return cleanStr(value).length > 0;
  if (Array.isArray(value)) return value.some(hasUsableValue);
  if (typeof value === 'object') return Object.entries(value).some(([k, v]) => !k.startsWith('_') && hasUsableValue(v));
  return true;
};

const tryParseStructuredString = (value: unknown): Record<string, any> | any[] | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    !(trimmed.startsWith('{') && trimmed.endsWith('}')) &&
    !(trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/** Spec pill for body parameters */
function SpecPill({ label, value }: { label?: string; value: string | number }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md"
      style={{ background: '#f0ede8', color: '#5a5550' }}
    >
      {label && <span className="font-semibold" style={{ color: '#3d3935' }}>{label}</span>}
      <span>{value}</span>
    </span>
  );
}

/** Section header with optional count/badge */
function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a857f' }}>{label}</span>
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

/** A single material row */
function MaterialRow({ name, amountKg, extraKg, scope, priceNote, compact }: {
  name: string;
  amountKg: number;
  extraKg?: number | null;
  scope?: string | null;
  priceNote?: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 py-1 px-2"
      style={{ borderBottom: '1px solid rgba(0,0,0,0.03)' }}
    >
      <span className={`${compact ? 'text-[11px]' : 'text-xs'} flex-1 min-w-0 truncate`} style={{ color: '#3d3935' }}>
        {name}
        {scope && !compact && (
          <span className="text-[10px] ml-1" style={{ color: '#b5b0aa' }}>({scope})</span>
        )}
      </span>
      <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-mono shrink-0 tabular-nums`} style={{ color: '#5a5550' }}>
        {fmtKg(amountKg)}
        {extraKg ? <span style={{ color: '#007AFF' }}>+{fmtKg(extraKg)}</span> : null}
        <span className="text-[10px] ml-0.5" style={{ color: '#b5b0aa' }}>kg</span>
      </span>
      {priceNote && !compact && (
        <span className="text-[10px] shrink-0" style={{ color: '#8a857f' }}>{priceNote}</span>
      )}
    </div>
  );
}

/** Materials table container */
function MaterialsTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#fafaf8', border: '1px solid #f0ede8' }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain-specific sections
// ---------------------------------------------------------------------------

function WrappedSectionView({ section, compact }: { section: any; compact?: boolean }) {
  if (!section) return null;
  const mats = section.materials || [];
  return (
    <div>
      <SectionHeader
        label="Vyniota dalis"
        badge={section.winding_count ? `${section.winding_count} vyn.` : undefined}
      />
      {!compact && section.description && (
        <p className="text-[11px] mb-1.5" style={{ color: '#8a857f' }}>{cleanStr(section.description)}</p>
      )}
      {mats.length > 0 && (
        <MaterialsTable>
          {mats.map((m: any, i: number) => (
            <MaterialRow
              key={i}
              name={m.name}
              amountKg={m.amount_kg}
              extraKg={m.extra_kg}
              scope={m.scope}
              priceNote={m.price_note}
              compact={compact}
            />
          ))}
        </MaterialsTable>
      )}
    </div>
  );
}

function RibsSectionView({ ribs, compact }: { ribs: any; compact?: boolean }) {
  if (!ribs) return null;
  const mats = ribs.materials || [];
  return (
    <div>
      <SectionHeader label="Briaunos" badge={ribs.count ? `${ribs.count} vnt.` : undefined} />
      {mats.length > 0 && (
        <MaterialsTable>
          {mats.map((m: any, i: number) => (
            <MaterialRow key={i} name={m.name} amountKg={m.amount_kg} scope={m.scope} compact={compact} />
          ))}
        </MaterialsTable>
      )}
    </div>
  );
}

function EndsSectionView({ ends, compact }: { ends: any; compact?: boolean }) {
  if (!ends) return null;
  const mats = ends.materials || [];
  const hasDetail = mats.length > 0;

  return (
    <div>
      <SectionHeader label="Galai" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs" style={{ color: '#3d3935' }}>
          po <span className="font-semibold">{fmtKg(ends.weight_per_end_kg)}</span>
          {ends.extra_per_end_kg ? <span style={{ color: '#007AFF' }}>+{fmtKg(ends.extra_per_end_kg)}</span> : null}
          <span className="text-[10px] ml-0.5" style={{ color: '#b5b0aa' }}>kg kiekvienas</span>
        </span>
        {ends.from_cutout && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,159,10,0.1)', color: '#FF9F0A' }}>
            iš išpjovos
          </span>
        )}
      </div>
      {hasDetail && !compact && (
        <MaterialsTable>
          {mats.map((m: any, i: number) => (
            <MaterialRow key={i} name={m.name} amountKg={m.amount_kg} compact={compact} />
          ))}
        </MaterialsTable>
      )}
    </div>
  );
}

function SeamLaminationView({ section, compact }: { section: any; compact?: boolean }) {
  if (!section) return null;
  const mats = section.materials || [];
  const hasSpecs = section.outer || section.inner;

  return (
    <div>
      <SectionHeader label="Siulės laminavimo" badge={section.scope || undefined} />
      {!compact && hasSpecs && (
        <div className="flex gap-3 mb-1.5">
          {section.outer && (
            <span className="text-[10px]" style={{ color: '#8a857f' }}>
              Išorė: {section.outer.width_mm}mm, {section.outer.layers}sl
            </span>
          )}
          {section.inner && (
            <span className="text-[10px]" style={{ color: '#8a857f' }}>
              Vidus: {section.inner.width_mm}mm, {section.inner.layers}sl
            </span>
          )}
        </div>
      )}
      {mats.length > 0 && (
        <MaterialsTable>
          {mats.map((m: any, i: number) => (
            <MaterialRow key={i} name={m.name} amountKg={m.amount_kg} compact={compact} />
          ))}
        </MaterialsTable>
      )}
    </div>
  );
}

function TotalEstimateView({ estimate }: { estimate: any }) {
  if (!estimate) return null;
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: 'rgba(52,199,89,0.06)', border: '1px solid rgba(52,199,89,0.15)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#34C759' }}>Viso</span>
      <div className="text-right">
        <span className="text-sm font-bold" style={{ color: '#2d8a4e' }}>
          {estimate.approximate && '~ '}{fmtKg(estimate.weight_kg)} kg
        </span>
        {estimate.note && estimate.note !== `${estimate.weight_kg}kg` && (
          <p className="text-[10px]" style={{ color: '#8a857f' }}>{cleanStr(estimate.note)}</p>
        )}
      </div>
    </div>
  );
}

function NotesView({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div>
      <SectionHeader label="Pastabos" />
      <div className="space-y-1">
        {notes.map((note, i) => (
          <p key={i} className="text-[11px] flex gap-1.5" style={{ color: '#8a857f' }}>
            <span className="shrink-0" style={{ color: '#b5b0aa' }}>&bull;</span>
            <span>{cleanStr(note)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full domain view
// ---------------------------------------------------------------------------

function FullDomainView({ data }: { data: Record<string, any> }) {
  const { product, body, wrapped_section, ribs, ends, seam_lamination, total_estimate, notes, delivery_date } = data;

  return (
    <div className="space-y-3">
      {/* Product header */}
      {product && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: '#3d3935' }}>
            {product.full_name || `${product.type || ''} V-${product.volume_m3 || '?'} m3`}
          </span>
          {product.volume_m3 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
              {product.volume_m3} m³
            </span>
          )}
        </div>
      )}

      {/* Body specs */}
      {body && (
        <div className="flex flex-wrap gap-1.5">
          {body.diameter_dn_mm && <SpecPill label="DN" value={body.diameter_dn_mm} />}
          {body.length_mm && <SpecPill label="L" value={`${fmtKg(body.length_mm)} mm`} />}
          {body.installation_depth_m != null && <SpecPill label="Įg." value={`${body.installation_depth_m} m`} />}
          {body.terrain && <SpecPill value={body.terrain} />}
        </div>
      )}

      {/* Delivery date */}
      {delivery_date && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: '#8a857f' }}>Pristatymas:</span>
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(175,82,222,0.08)', color: '#AF52DE' }}>
            {delivery_date}
          </span>
        </div>
      )}

      {/* Sections */}
      <WrappedSectionView section={wrapped_section} />
      <RibsSectionView ribs={ribs} />
      <EndsSectionView ends={ends} />
      <SeamLaminationView section={seam_lamination} />
      <TotalEstimateView estimate={total_estimate} />
      <NotesView notes={notes} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact domain view (for template picker cards)
// ---------------------------------------------------------------------------

function CompactDomainView({ data }: { data: Record<string, any> }) {
  const { body, wrapped_section, ribs, ends, seam_lamination, total_estimate } = data;

  // Collect all materials from all sections for a flat list
  const allMaterials: Array<{ name: string; amount_kg: number; extra_kg?: number; section: string }> = [];

  if (wrapped_section?.materials) {
    for (const m of wrapped_section.materials) {
      allMaterials.push({ name: m.name, amount_kg: m.amount_kg, extra_kg: m.extra_kg, section: 'vyniota' });
    }
  }
  if (ribs?.materials) {
    for (const m of ribs.materials) {
      allMaterials.push({ name: m.name, amount_kg: m.amount_kg, section: 'briaunos' });
    }
  }
  if (seam_lamination?.materials) {
    for (const m of seam_lamination.materials) {
      allMaterials.push({ name: m.name, amount_kg: m.amount_kg, section: 'siūlės' });
    }
  }

  const MAX_SHOW = 5;

  return (
    <div className="space-y-1.5">
      {/* Body specs inline */}
      {body && (
        <div className="flex flex-wrap gap-1">
          {body.diameter_dn_mm && <SpecPill label="DN" value={body.diameter_dn_mm} />}
          {body.length_mm && <SpecPill label="L" value={body.length_mm} />}
          {body.installation_depth_m != null && <SpecPill label="Įg." value={`${body.installation_depth_m}m`} />}
          {body.terrain && <SpecPill value={body.terrain} />}
        </div>
      )}

      {/* Compact materials list */}
      {allMaterials.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: '#fafaf8', border: '1px solid #f0ede8' }}>
          {allMaterials.slice(0, MAX_SHOW).map((m, i) => (
            <MaterialRow key={i} name={m.name} amountKg={m.amount_kg} extraKg={m.extra_kg} compact />
          ))}
          {allMaterials.length > MAX_SHOW && (
            <div className="py-0.5 text-center">
              <span className="text-[10px]" style={{ color: '#b5b0aa' }}>+{allMaterials.length - MAX_SHOW} daugiau</span>
            </div>
          )}
        </div>
      )}

      {/* Ends summary */}
      {ends && (
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px]" style={{ color: '#8a857f' }}>Galai:</span>
          <span className="text-[11px] font-mono" style={{ color: '#5a5550' }}>
            po {fmtKg(ends.weight_per_end_kg)}
            {ends.extra_per_end_kg ? <span style={{ color: '#007AFF' }}>+{fmtKg(ends.extra_per_end_kg)}</span> : null} kg
          </span>
        </div>
      )}

      {/* Total */}
      {total_estimate && (
        <div className="flex items-center justify-between px-2 py-1 rounded-md" style={{ background: 'rgba(52,199,89,0.05)' }}>
          <span className="text-[10px] font-semibold uppercase" style={{ color: '#34C759' }}>Viso</span>
          <span className="text-[11px] font-bold font-mono" style={{ color: '#2d8a4e' }}>
            {total_estimate.approximate ? '~' : ''}{fmtKg(total_estimate.weight_kg)} kg
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy items format (for backward compat with old templates)
// ---------------------------------------------------------------------------

function LegacyItemsView({ data, compact }: { data: Record<string, any>; compact?: boolean }) {
  const items: any[] = data.items || [];
  const extraEntries = Object.entries(data).filter(([k]) => k !== 'items' && !k.startsWith('_'));
  const maxItems = compact ? 6 : items.length;

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <MaterialsTable>
          {items.slice(0, maxItems).map((item: any, i: number) => {
            const name = item.name || item.pavadinimas || item.material || `#${i + 1}`;
            const amount = parseFloat(item.amount || item.kiekis || item.quantity || '0');
            return (
              <MaterialRow key={i} name={cleanStr(name)} amountKg={isNaN(amount) ? 0 : amount} compact={compact} />
            );
          })}
          {items.length > maxItems && (
            <div className="py-0.5 text-center">
              <span className="text-[10px]" style={{ color: '#b5b0aa' }}>+{items.length - maxItems} daugiau</span>
            </div>
          )}
        </MaterialsTable>
      )}
      {!compact && extraEntries.length > 0 && (
        <div className="space-y-1 pt-1" style={{ borderTop: '1px solid #f0ede8' }}>
          {extraEntries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 px-2">
              <span className="text-[10px]" style={{ color: '#8a857f' }}>{k.replace(/_/g, ' ')}</span>
              <span className="text-[10px] font-medium truncate max-w-[200px]" style={{ color: '#5a5550' }}>
                {typeof v === 'object'
                  ? 'Struktūrizuota reikšmė'
                  : cleanStr(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback for unknown structures
// ---------------------------------------------------------------------------

function GenericView({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));

  const formatLabel = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const renderValue = (value: any, depth: number = 0): React.ReactNode => {
    if (value === null || value === undefined) return <span style={{ color: '#b5b0aa', fontStyle: 'italic' }}>—</span>;
    if (typeof value === 'boolean') return (
      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: value ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.08)', color: value ? '#34C759' : '#FF3B30' }}>
        {value ? 'Taip' : 'Ne'}
      </span>
    );
    if (typeof value === 'number') return <span className="text-xs font-semibold font-mono" style={{ color: '#3d3935' }}>{fmtKg(value)}</span>;
    if (typeof value === 'string') {
      const cleaned = cleanStr(value);
      if (cleaned.includes('\n')) return <div className="text-xs whitespace-pre-wrap" style={{ color: '#3d3935', lineHeight: '1.5' }}>{cleaned}</div>;
      return <span className="text-xs" style={{ color: '#3d3935' }}>{cleaned}</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-[11px] italic" style={{ color: '#b5b0aa' }}>Tuščias</span>;
      if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((item, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f0ede8', color: '#3d3935' }}>
                {cleanStr(item)}
              </span>
            ))}
          </div>
        );
      }
      return (
        <div className="space-y-1.5">
          {value.map((item, i) => (
            <div key={i} className="rounded-lg p-2" style={{ background: depth === 0 ? '#fafaf8' : '#f5f3f0', border: '1px solid #f0ede8' }}>
              {typeof item === 'object' && item !== null ? renderObject(item, depth + 1) : <span className="text-xs" style={{ color: '#3d3935' }}>{cleanStr(item)}</span>}
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') {
      return (
        <div className="rounded-lg p-2" style={{ background: depth === 0 ? '#fafaf8' : '#f5f3f0', border: '1px solid #f0ede8' }}>
          {renderObject(value, depth + 1)}
        </div>
      );
    }
    return <span className="text-xs" style={{ color: '#3d3935' }}>{String(value)}</span>;
  };

  const renderObject = (obj: Record<string, any>, depth: number = 0): React.ReactNode => (
    <div className="space-y-2">
      {Object.entries(obj).filter(([k]) => !k.startsWith('_')).map(([key, val]) => (
        <div key={key}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#8a857f' }}>{formatLabel(key)}</div>
          {renderValue(val, depth)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#8a857f' }}>{formatLabel(key)}</div>
          {renderValue(val)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium panel variant for template cards
// ---------------------------------------------------------------------------

function PanelValue({ value, depth = 0 }: { value: any; depth?: number }) {
  if (!hasUsableValue(value)) return null;

  if (typeof value === 'boolean') {
    return <p className="text-sm font-medium text-base-content/80">{value ? 'Taip' : 'Ne'}</p>;
  }

  if (typeof value === 'number') {
    return <p className="text-sm font-medium text-base-content/80">{value.toLocaleString('lt-LT')}</p>;
  }

  if (typeof value === 'string') {
    const parsed = tryParseStructuredString(value);
    if (parsed) {
      if (Array.isArray(parsed)) {
        return <PanelValue value={parsed} depth={depth + 1} />;
      }
      return <PanelObject obj={parsed} depth={depth + 1} />;
    }
    return <p className="text-sm font-medium text-base-content/80 whitespace-pre-wrap break-words">{cleanStr(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.every(item => typeof item !== 'object' || item === null)) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.filter(hasUsableValue).map((item, idx) => (
            <span key={idx} className="px-2 py-1 rounded-lg border border-base-content/10 bg-base-100 text-xs font-medium text-base-content/75">
              {typeof item === 'boolean' ? (item ? 'Taip' : 'Ne') : cleanStr(item)}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {value.filter(hasUsableValue).map((item, idx) => (
          <div key={idx} className="rounded-xl border border-base-content/10 bg-base-content/[0.015] p-2.5">
            <PanelObject obj={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className={`rounded-xl border border-base-content/10 ${depth === 0 ? 'bg-base-content/[0.015]' : 'bg-base-100'} p-2.5`}>
        <PanelObject obj={value} depth={depth + 1} />
      </div>
    );
  }

  return <p className="text-sm font-medium text-base-content/80">{String(value)}</p>;
}

function PanelField({ label, value, depth = 0 }: { label: string; value: any; depth?: number }) {
  if (!hasUsableValue(value)) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.08em] text-base-content/45">{formatLabel(label)}</p>
      <PanelValue value={value} depth={depth} />
    </div>
  );
}

function PanelObject({ obj, depth = 0 }: { obj: Record<string, any>; depth?: number }) {
  const entries = Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && hasUsableValue(v));
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map(([key, val]) => (
        <PanelField key={key} label={key} value={val} depth={depth} />
      ))}
    </div>
  );
}

function PanelSection({ label, value }: { label: string; value: any }) {
  if (!hasUsableValue(value)) return null;

  const primitive = typeof value !== 'object' || value === null;
  return (
    <section className="rounded-2xl border border-base-content/10 bg-base-100 p-3">
      <p className="text-[10px] uppercase tracking-[0.1em] text-base-content/45 mb-2">{formatLabel(label)}</p>
      {primitive ? (
        <PanelValue value={value} />
      ) : Array.isArray(value) ? (
        <PanelValue value={value} />
      ) : (
        <PanelObject obj={value} />
      )}
    </section>
  );
}

function PremiumPanelView({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).flatMap(([k, v]) => {
    if (k.startsWith('_') || !hasUsableValue(v)) return [];

    const parsedText = (k.toLowerCase() === 'text' || k.toLowerCase() === 'raw_text')
      ? tryParseStructuredString(v)
      : null;

    if (parsedText && !Array.isArray(parsedText)) {
      return Object.entries(parsedText).filter(([pk, pv]) => !pk.startsWith('_') && hasUsableValue(pv));
    }

    if (parsedText && Array.isArray(parsedText)) {
      return [['items', parsedText] as [string, any]];
    }

    return [[k, v] as [string, any]];
  });
  if (entries.length === 0) {
    return <p className="text-xs italic text-base-content/40">Nėra struktūrizuotų duomenų</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <PanelSection key={key} label={key} value={value} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function MaterialSlateView({ data, compact, variant = 'default' }: MaterialSlateViewProps) {
  if (variant === 'panel') {
    return <PremiumPanelView data={data} />;
  }

  // Detect new domain format
  const isDomainFormat = data.product || data.body || data.wrapped_section || data.seam_lamination;
  // Detect legacy items format
  const isLegacyItems = data.items && Array.isArray(data.items);

  if (isDomainFormat) {
    if (compact) return <CompactDomainView data={data} />;
    return <FullDomainView data={data} />;
  }

  if (isLegacyItems) {
    return <LegacyItemsView data={data} compact={compact} />;
  }

  // Generic fallback
  return <GenericView data={data} />;
}
