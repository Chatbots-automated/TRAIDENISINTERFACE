import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import {
  buildDirectusAssetUrl,
  buildDirectusDownloadUrl,
  buildGoogleDocsViewerUrl,
} from '../lib/filePreviewUrls';

type PreviewKind = 'pdf' | 'image' | 'text' | 'office' | 'file' | 'none';

interface DirectusFilePreviewProps {
  fileId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  title?: string;
  minWidth?: number;
  minHeight?: number;
  className?: string;
}

interface PreviewSize {
  width: number;
  height: number;
  ready: boolean;
}

function getPreviewKind(fileName = '', mimeType = '', hasFile = false): PreviewKind {
  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (!hasFile) return 'none';
  if (normalizedMime.includes('pdf') || normalizedName.endsWith('.pdf')) return 'pdf';
  if (normalizedMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(normalizedName)) return 'image';
  if (normalizedMime.startsWith('text/') || /\.(txt|csv|html?|xml|md|json|log|rtf)$/i.test(normalizedName)) return 'text';
  if (/\.(docx?|xlsx?|pptx?)$/i.test(normalizedName)) return 'office';

  return 'file';
}

function appendPdfViewerHash(url: string): string {
  const separator = url.includes('#') ? '&' : '#';
  return `${url}${separator}toolbar=0&navpanes=0&scrollbar=1`;
}

export function DirectusFilePreview({
  fileId,
  fileName,
  mimeType,
  title,
  minWidth = 420,
  minHeight = 320,
  className = '',
}: DirectusFilePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PreviewSize>({ width: 0, height: 0, ready: false });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
        ready: true,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  const kind = getPreviewKind(fileName || '', mimeType || '', Boolean(fileId));
  const label = title || fileName || 'Dokumentas';

  const urls = useMemo(() => {
    if (!fileId) {
      return { asset: '', download: '', office: '', pdf: '' };
    }

    const asset = buildDirectusAssetUrl(fileId);
    return {
      asset,
      download: buildDirectusDownloadUrl(fileId),
      office: buildGoogleDocsViewerUrl(asset),
      pdf: appendPdfViewerHash(asset),
    };
  }, [fileId]);

  const canRenderPreview = size.ready && size.width >= minWidth && size.height >= minHeight;

  return (
    <div ref={hostRef} className={`h-full min-h-0 w-full overflow-hidden bg-white ${className}`}>
      {!fileId || kind === 'none' ? (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <div>
            <FileText className="mx-auto mb-2 h-8 w-8" style={{ color: '#d1cdc7' }} />
            <p className="text-sm" style={{ color: '#8a857f' }}>
              Failo peržiūra nepasiekiama
            </p>
          </div>
        </div>
      ) : !canRenderPreview ? (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <div>
            <FileText className="mx-auto mb-2 h-8 w-8" style={{ color: '#d1cdc7' }} />
            <p className="text-sm font-medium" style={{ color: '#5a5550' }}>
              Peržiūrai reikia daugiau vietos
            </p>
          </div>
        </div>
      ) : kind === 'pdf' ? (
        <iframe
          key={`pdf:${fileId}`}
          src={urls.pdf}
          className="block h-full w-full border-0 bg-white"
          title={label}
        />
      ) : kind === 'image' ? (
        <div className="flex h-full items-center justify-center bg-[#f8f7f5] p-4">
          <img src={urls.asset} alt={label} className="max-h-full max-w-full object-contain" />
        </div>
      ) : kind === 'text' ? (
        <iframe
          key={`text:${fileId}`}
          src={urls.asset}
          className="block h-full w-full border-0 bg-white"
          title={label}
        />
      ) : kind === 'office' ? (
        <iframe
          key={`office:${fileId}`}
          src={urls.office}
          className="block h-full w-full border-0 bg-white"
          title={label}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center">
          <div>
            <ImageIcon className="mx-auto mb-2 h-8 w-8" style={{ color: '#d1cdc7' }} />
            <p className="mb-3 text-sm" style={{ color: '#8a857f' }}>
              Šio tipo failo peržiūra nepalaikoma
            </p>
            <a
              href={urls.download}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: '#007AFF' }}
            >
              Atidaryti failą
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
