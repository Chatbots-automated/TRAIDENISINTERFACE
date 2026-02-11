import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables } from '../lib/documentTemplateService';

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
}

export default function DocumentPreview({ variables, template }: DocumentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(0.65);
  const [iframeHeight, setIframeHeight] = useState(1200);

  const templateHtml = template || getDefaultTemplate();

  const renderedHtml = useMemo(
    () => renderTemplate(templateHtml, variables),
    [templateHtml, variables]
  );

  const unfilled = useMemo(
    () => getUnfilledVariables(templateHtml, variables),
    [templateHtml, variables]
  );

  const srcdoc = useMemo(() => {
    return renderedHtml.replace(
      '</style>',
      `
      /* Preview host overrides */
      html, body { margin: 0; padding: 0; background: #ffffff; }
      body.c47.doc-content {
        max-width: 595px;
        margin: 0 auto;
        background: #ffffff;
        padding: 36pt 36pt 36pt 36pt;
      }
      </style>`
    );
  }, [renderedHtml]);

  const measureIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentDocument?.body) {
      const h = iframe.contentDocument.body.scrollHeight;
      setIframeHeight(h);
    }
  }, []);

  // Re-measure when variables change (srcdoc updates trigger onLoad)
  useEffect(() => {
    // Small delay for srcdoc to re-render
    const t = setTimeout(measureIframe, 150);
    return () => clearTimeout(t);
  }, [srcdoc, measureIframe]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.1, 1.2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.3));

  // The scaled wrapper gets explicit dimensions so the parent scroll area
  // matches the visual size exactly — no extra dead space.
  const scaledWidth = 595 * zoom;
  const scaledHeight = iframeHeight * zoom;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #f0ede8' }}
      >
        <span className="text-[10px]" style={{ color: '#9ca3af' }}>
          {unfilled.length === 0
            ? 'Visi kintamieji užpildyti'
            : `Liko užpildyti: ${unfilled.length}`}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded transition-colors"
            style={{ color: '#8a857f' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0ede8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-[10px] w-7 text-center tabular-nums" style={{ color: '#9ca3af' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded transition-colors"
            style={{ color: '#8a857f' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0ede8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ZoomIn className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Preview area — white background, vertical scroll only */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: '#ffffff' }}
      >
        {/* Scaled wrapper — explicit size so scroll area matches visual content */}
        <div
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            margin: '0 auto',
            overflow: 'hidden',
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            title="Dokumento peržiūra"
            sandbox="allow-same-origin"
            style={{
              width: '595px',
              height: `${iframeHeight}px`,
              border: 'none',
              display: 'block',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            onLoad={measureIframe}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <div
        className="px-3 py-1 text-center flex-shrink-0"
        style={{ borderTop: '1px solid #f0ede8' }}
      >
        <span className="text-[9px]" style={{ color: '#bbb' }}>
          Peržiūra yra apytikslė. Galutinis dokumentas gali šiek tiek skirtis.
        </span>
      </div>
    </div>
  );
}
