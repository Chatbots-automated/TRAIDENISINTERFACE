import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sanitizeHtml } from '../lib/sanitizeHtml';

// Word and Excel files are opened here, in the browser. The earlier approach handed the file's address to Google's
// online viewer, which cannot fetch anything from this app because every address sits behind the login.

const MAX_ROWS = 1000;
const MAX_COLS = 60;

interface Sheet { name: string; rows: string[][]; totalRows: number }
type State =
  | { status: 'loading' }
  | { status: 'sheets'; sheets: Sheet[] }
  | { status: 'html'; html: string }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

function extensionOf(fileName: string): string {
  return (fileName.split('.').pop() || '').toLowerCase();
}

export function canPreviewOffice(fileName: string): boolean {
  return ['xlsx', 'xls', 'xlsm', 'csv', 'docx'].includes(extensionOf(fileName));
}

async function load(url: string, fileName: string): Promise<State> {
  const ext = extensionOf(fileName);
  if (!canPreviewOffice(fileName)) return { status: 'unsupported' };

  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Failo nepavyko atsisiųsti (${response.status})`);
  const buffer = await response.arrayBuffer();

  if (ext === 'docx') {
    // @ts-ignore the browser build ships without type declarations
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer: buffer });
    return { status: 'html', html: sanitizeHtml(result.value || '') };
  }

  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets = workbook.SheetNames.map((name): Sheet => {
    const all = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    const rows = all.slice(0, MAX_ROWS).map(row => (row as unknown[]).slice(0, MAX_COLS).map(cell => String(cell ?? '')));
    return { name, rows, totalRows: all.length };
  }).filter(sheet => sheet.rows.length > 0);
  return sheets.length > 0 ? { status: 'sheets', sheets } : { status: 'error', message: 'Faile nėra duomenų.' };
}

export function OfficePreview({ url, fileName, downloadUrl }: { url: string; fileName: string; downloadUrl?: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setActive(0);
    load(url, fileName)
      .then(next => { if (!cancelled) setState(next); })
      .catch(error => { if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Failo nepavyko atidaryti.' }); });
    return () => { cancelled = true; };
  }, [url, fileName]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#8a857f' }} />
      </div>
    );
  }

  if (state.status === 'unsupported' || state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileText className="h-12 w-12" style={{ color: '#d4cfc8' }} />
        <p className="text-sm" style={{ color: '#8a857f' }}>
          {state.status === 'error' ? state.message : 'Šio tipo failo peržiūrėti čia negalima.'}
        </p>
        {downloadUrl && (
          <a href={downloadUrl} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white" style={{ background: '#007AFF' }}>
            <Download className="h-3.5 w-3.5" />Atsisiųsti failą
          </a>
        )}
      </div>
    );
  }

  if (state.status === 'html') {
    return (
      <div className="h-full overflow-auto bg-white">
        <div className="office-doc mx-auto max-w-3xl px-8 py-6 text-[14px] leading-6" style={{ color: '#3d3935' }}
          dangerouslySetInnerHTML={{ __html: state.html }} />
        <style>{`
          .office-doc p { margin: 0 0 0.7em; }
          .office-doc h1, .office-doc h2, .office-doc h3 { font-weight: 600; margin: 1.1em 0 0.5em; }
          .office-doc h1 { font-size: 20px; } .office-doc h2 { font-size: 17px; } .office-doc h3 { font-size: 15px; }
          .office-doc ul, .office-doc ol { margin: 0 0 0.7em 1.4em; } .office-doc ul { list-style: disc; } .office-doc ol { list-style: decimal; }
          .office-doc table { border-collapse: collapse; margin: 0.6em 0; width: 100%; }
          .office-doc td, .office-doc th { border: 1px solid #e5e1db; padding: 4px 8px; vertical-align: top; }
        `}</style>
      </div>
    );
  }

  const sheet = state.sheets[Math.min(active, state.sheets.length - 1)];
  const width = Math.max(...sheet.rows.map(row => row.length));
  return (
    <div className="flex h-full flex-col bg-white">
      {state.sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-2" style={{ borderBottom: '1px solid #f0ede8' }}>
          {state.sheets.map((item, index) => (
            <button key={item.name} onClick={() => setActive(index)}
              className="whitespace-nowrap rounded-t-md px-3 py-1.5 text-[12px] font-medium"
              style={{
                color: index === active ? '#007AFF' : '#8a857f',
                borderBottom: `2px solid ${index === active ? '#007AFF' : 'transparent'}`,
              }}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="sticky left-0 select-none px-2 py-1 text-right" style={{ background: '#faf9f7', color: '#b0aba4', border: '1px solid #f0ede8', minWidth: 36 }}>{rowIndex + 1}</td>
                {Array.from({ length: width }, (_, col) => (
                  <td key={col} className="px-2 py-1 align-top" style={{ border: '1px solid #f0ede8', color: '#3d3935', maxWidth: 320, whiteSpace: 'pre-wrap' }}>
                    {row[col] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.totalRows > sheet.rows.length && (
          <p className="px-3 py-2 text-[12px]" style={{ color: '#8a857f' }}>
            Rodoma pirmos {sheet.rows.length} eilučių iš {sheet.totalRows}. Visą failą galite atsisiųsti.
          </p>
        )}
      </div>
    </div>
  );
}
