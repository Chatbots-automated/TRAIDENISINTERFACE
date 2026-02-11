import React, { useMemo, useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables } from '../lib/documentTemplateService';

export interface DocumentPreviewHandle {
  print: () => void;
}

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
}

// The "native" zoom where the document fits the panel well.
// Displayed as 100% in the UI; other zoom levels are relative to this.
const BASE_ZOOM = 0.95;

const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ variables, template }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
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
      html, body { margin: 0; padding: 0; background: #ffffff; overflow: hidden; }
      body.c47.doc-content {
        max-width: 595px;
        margin: 0 auto;
        background: #ffffff;
        padding: 36pt 36pt 36pt 36pt;
      }

      /* Print-optimized styles */
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          overflow: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body.c47.doc-content {
          max-width: none !important;
          margin: 0 !important;
          padding: 36pt 36pt 36pt 36pt !important;
          box-shadow: none !important;
        }
        /* Unfilled placeholder chips — keep visible in print */
        span[style*="background:#fff3cd"] {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Page break markers — convert back to real page breaks */
        div[style*="border-top:2px dashed"] {
          border: none !important;
          margin: 0 !important;
          page-break-before: always !important;
          break-before: page !important;
        }
        div[style*="border-top:2px dashed"] span {
          display: none !important;
        }
        /* Ensure images print */
        img {
          max-width: 100% !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @page {
          size: A4;
          margin: 0;
        }
      }
      </style>`
      );
    }, [renderedHtml]);

    // Expose print() to parent via ref
    useImperativeHandle(ref, () => ({
      print: () => {
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.print();
        }
      },
    }));

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

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.05, 1.3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.05, 0.3));

    // Display zoom relative to BASE_ZOOM (0.95 = 100%)
    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);

    // The scaled wrapper gets explicit dimensions so the parent scroll area
    // matches the visual size exactly — no extra dead space.
    const scaledWidth = 595 * zoom;
    const scaledHeight = iframeHeight * zoom;

    return (
      <div className="flex flex-col h-full min-h-0">
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
            <span className="text-[10px] w-8 text-center tabular-nums" style={{ color: '#9ca3af' }}>
              {displayZoom}%
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

        {/* Preview area — single scroll layer, white background */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
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
              sandbox="allow-same-origin allow-modals"
              scrolling="no"
              style={{
                width: '595px',
                height: `${iframeHeight}px`,
                border: 'none',
                display: 'block',
                overflow: 'hidden',
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
);

export default DocumentPreview;
