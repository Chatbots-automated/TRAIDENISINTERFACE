import React, { useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables } from '../lib/documentTemplateService';

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
}

export default function DocumentPreview({ variables, template }: DocumentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(0.6);

  const templateHtml = template || getDefaultTemplate();

  const renderedHtml = useMemo(
    () => renderTemplate(templateHtml, variables),
    [templateHtml, variables]
  );

  const unfilled = useMemo(
    () => getUnfilledVariables(templateHtml, variables),
    [templateHtml, variables]
  );

  // Build the srcdoc — we wrap the rendered template in a host page that
  // constrains the width to roughly A4 proportions and adds a white background.
  const srcdoc = useMemo(() => {
    // Extract everything between <style> and </style> plus the body from the rendered template
    // The rendered template is a full <html> document, we inject it as-is but
    // add a wrapper style to constrain the page width.
    return renderedHtml.replace(
      '</style>',
      `
      /* Preview host overrides */
      html, body { margin: 0; padding: 0; background: #f5f5f5; }
      body.c47.doc-content {
        max-width: 595px; /* A4 width at 72dpi */
        margin: 0 auto;
        background: #ffffff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.08);
        padding: 36pt 36pt 36pt 36pt;
        min-height: 842px; /* A4 height */
      }
      /* Override images that can't load — show alt text inside placeholder */
      img {
        display: inline-block;
        background: #f3f4f6;
        border: 1px dashed #d1d5db;
        min-width: 40px;
        min-height: 40px;
        font-size: 9px;
        color: #9ca3af;
        text-align: center;
        line-height: 1.3;
        padding: 4px;
        object-fit: contain;
      }
      </style>`
    );
  }, [renderedHtml]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.1, 1.2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.3));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid #f0ede8' }}
      >
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: '#6b7280' }}>
            {unfilled.length === 0
              ? 'Visi kintamieji užpildyti'
              : `Liko užpildyti: ${unfilled.length}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded transition-colors"
            style={{ color: '#8a857f' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0ede8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] w-8 text-center" style={{ color: '#6b7280' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded transition-colors"
            style={{ color: '#8a857f' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0ede8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div
        className="flex-1 overflow-auto"
        style={{ background: '#eae8e4' }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            padding: '16px 0',
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            title="Dokumento peržiūra"
            sandbox="allow-same-origin"
            style={{
              width: '595px',
              minHeight: '842px',
              height: 'auto',
              border: 'none',
              display: 'block',
              margin: '0 auto',
              background: '#ffffff',
              boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
            }}
            onLoad={() => {
              // Auto-resize iframe to match content height
              const iframe = iframeRef.current;
              if (iframe?.contentDocument?.body) {
                const h = iframe.contentDocument.body.scrollHeight;
                iframe.style.height = `${h + 40}px`;
              }
            }}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <div
        className="px-3 py-1.5 text-center flex-shrink-0"
        style={{ borderTop: '1px solid #f0ede8', background: '#fafaf8' }}
      >
        <span className="text-[9px]" style={{ color: '#9ca3af' }}>
          Peržiūra yra apytikslė. Galutinis dokumentas gali šiek tiek skirtis.
        </span>
      </div>
    </div>
  );
}
