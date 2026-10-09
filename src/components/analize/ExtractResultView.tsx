
type Meta = Record<string, any> | null | undefined;

function label(key: string): string {
  return key.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, char => char.toUpperCase());
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.every(isEmpty);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(isEmpty);
  return false;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function show(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Taip' : 'Ne';
  if (typeof value === 'number') return value.toLocaleString('lt-LT', { maximumFractionDigits: 4 });
  return String(value ?? '');
}

/** Where in the document a value came from and how sure the extraction is, when LlamaExtract returned it. */
function Source({ meta }: { meta: Meta }) {
  if (!meta || typeof meta !== 'object') return null;
  const citations = Array.isArray(meta.citation) ? meta.citation : [];
  const pages = [...new Set(citations.map((c: any) => c?.page).filter((p: unknown) => typeof p === 'number'))] as number[];
  const quote = citations.map((c: any) => c?.matching_text).filter(Boolean).join(' … ');
  const confidence = typeof meta.confidence === 'number' ? meta.confidence : null;
  if (pages.length === 0 && confidence === null) return null;
  const color = confidence === null ? '#b0aba4' : confidence >= 0.8 ? '#16a34a' : confidence >= 0.5 ? '#d97706' : '#dc2626';
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 align-middle whitespace-nowrap">
      {confidence !== null && (
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }}
          title={`Patikimumas ${Math.round(confidence * 100)} %`} />
      )}
      {pages.length > 0 && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(0,122,255,0.08)', color: '#0a5fc2' }}
          title={quote ? `Dokumente: „${quote.slice(0, 300)}“` : undefined}>
          psl. {pages.slice(0, 3).join(', ')}{pages.length > 3 ? '…' : ''}
        </span>
      )}
    </span>
  );
}

function Table({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(col => rows.some(row => !isEmpty(row[col])));
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid #f0ede8' }}>
      <table className="w-full text-[13px]">
        <thead>
          <tr style={{ background: '#faf9f7', color: '#8a857f' }}>
            {columns.map(col => <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">{label(col)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} style={{ borderTop: '1px solid #f0ede8' }}>
              {columns.map(col => (
                <td key={col} className="px-3 py-2 align-top" style={{ color: '#3d3935' }}>
                  {isScalar(row[col]) ? show(row[col]) : isEmpty(row[col]) ? '—' : <Value value={row[col]} meta={null} nested />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Value({ value, meta, nested = false }: { value: unknown; meta: Meta; nested?: boolean }) {
  if (isScalar(value)) {
    return <span className="whitespace-pre-line">{show(value)}<Source meta={meta} /></span>;
  }
  if (Array.isArray(value)) {
    const items = value.filter(item => !isEmpty(item));
    if (items.every(isScalar)) {
      return (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#d4cfc8' }} />
              <span>{show(item)}<Source meta={Array.isArray(meta) ? meta[index] : null} /></span>
            </li>
          ))}
        </ul>
      );
    }
    if (items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
      return <Table rows={items as Record<string, unknown>[]} />;
    }
    return <ul className="space-y-2">{items.map((item, index) => <li key={index}><Value value={item} meta={null} nested /></li>)}</ul>;
  }
  if (value && typeof value === 'object') {
    return <Fields value={value as Record<string, unknown>} meta={meta} nested={nested} />;
  }
  return null;
}

function Fields({ value, meta, nested = false }: { value: Record<string, unknown>; meta: Meta; nested?: boolean }) {
  const entries = Object.entries(value).filter(([, item]) => !isEmpty(item));
  return (
    <div className={nested ? 'space-y-2' : 'space-y-4'}>
      {entries.map(([key, item]) => {
        const fieldMeta = meta && typeof meta === 'object' ? (meta as Record<string, any>)[key] : null;
        const inline = isScalar(item) && String(item).length <= 60;
        return inline ? (
          <div key={key} className="flex items-baseline gap-3">
            <span className="w-2/5 shrink-0 text-[12px]" style={{ color: '#8a857f' }}>{label(key)}</span>
            <span className="min-w-0 text-[14px] font-medium" style={{ color: '#3d3935' }}><Value value={item} meta={fieldMeta} /></span>
          </div>
        ) : (
          <div key={key}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#8a857f' }}>{label(key)}</p>
            <div className="text-[14px] leading-6" style={{ color: '#3d3935' }}><Value value={item} meta={fieldMeta} nested /></div>
          </div>
        );
      })}
    </div>
  );
}

/** The extraction result laid out for reading: short values in rows, lists as bullets, repeated records as a table. */
export function ExtractResultView({ value, metadata }: { value: unknown; metadata?: unknown }) {
  if (isEmpty(value)) {
    return <p className="text-[13px]" style={{ color: '#8a857f' }}>Dokumente nerasta to, ko prašėte. Pabandykite klausimą suformuluoti kitaip.</p>;
  }
  const root = (metadata as any)?.field_metadata;
  const meta: Meta = root?.document_metadata ?? root ?? null;
  return <div><Value value={value} meta={meta} /></div>;
}
