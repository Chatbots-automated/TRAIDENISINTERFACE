import React, { useMemo, useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables, sanitizeHtmlForIframe, PAGE_SPLIT_MARKER } from '../lib/documentTemplateService';

export interface DocumentPreviewHandle {
  print: () => void;
  clearActiveVariable: () => void;
  /** Get the full innerHTML of the iframe body (includes user text edits). */
  getEditedHtml: () => string | null;
}

export interface VariableClickInfo {
  key: string;
  filled: boolean;
  /** Position relative to the DocumentPreview container */
  x: number;
  y: number;
}

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
  /** Bump to force re-reading the global template from localStorage. */
  templateVersion?: number;
  onVariableClick?: (info: VariableClickInfo | null) => void;
  onScroll?: () => void;
  /** Whether the document body is contentEditable. Default false. */
  editable?: boolean;
  /** Conversation ID — used for localStorage persistence of manual edits. */
  conversationId?: string;
  /** Callback to trigger print/download from parent. */
  onPrint?: () => void;
}

// The "native" zoom where the document fits the panel well.
// Displayed as 100% in the UI; other zoom levels are relative to this.
const BASE_ZOOM = 0.95;

const DOC_EDIT_PREFIX = 'doc_edit_';

// ---------------------------------------------------------------------------
// Helper: split rendered HTML into per-page srcdoc strings
// ---------------------------------------------------------------------------
function splitIntoPages(fullHtml: string): string[] {
  if (!fullHtml.includes(PAGE_SPLIT_MARKER)) return [fullHtml];

  // Extract <head>…</head> (includes <style>)
  const headMatch = fullHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '<head></head>';

  // Extract body attributes (class, style, etc.)
  const bodyTagMatch = fullHtml.match(/<body([^>]*)>/i);
  const bodyAttrs = bodyTagMatch ? bodyTagMatch[1] : '';

  // Get inner body content
  const bodyInnerMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyInner = bodyInnerMatch ? bodyInnerMatch[1] : fullHtml;

  // Split on the marker
  const parts = bodyInner.split(PAGE_SPLIT_MARKER);

  return parts.map((part) => {
    return `<!DOCTYPE html><html>${head}<body${bodyAttrs}>${part}</body></html>`;
  });
}

const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ variables, template, templateVersion, onVariableClick, onScroll, editable = false, conversationId, onPrint }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
    const [iframeHeight, setIframeHeight] = useState(1200);
    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const fullscreenRef = useRef<HTMLDivElement>(null);

    // Refs to avoid stale closures in iframe event handlers
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const onVariableClickRef = useRef(onVariableClick);
    onVariableClickRef.current = onVariableClick;
    const editableRef = useRef(editable);
    editableRef.current = editable;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Re-read global template whenever templateVersion changes
    const templateHtml = useMemo(() => template || getDefaultTemplate(), [template, templateVersion]);

    const renderedHtml = useMemo(
      () => renderTemplate(templateHtml, variables),
      [templateHtml, variables]
    );

    const unfilled = useMemo(
      () => getUnfilledVariables(templateHtml, variables),
      [templateHtml, variables]
    );

    // CSS overrides injected into each page's srcdoc
    const previewCss = `
      /* Preview host overrides */
      html, body { margin: 0; padding: 0; background: #ffffff; overflow: hidden; }
      body.c47.doc-content {
        max-width: none;
        margin: 0;
        background: #ffffff;
        padding: 24pt 28pt;
      }

      /* Interactive variable styles — always visible */
      .template-var {
        cursor: pointer;
        border-radius: 3px;
        transition: background 0.15s, box-shadow 0.15s;
      }
      .template-var.filled {
        background: rgba(59,130,246,0.04);
        box-shadow: 0 0 0 1px rgba(59,130,246,0.12);
        padding: 0 2px;
        border-radius: 3px;
      }
      .template-var.filled:hover {
        background: rgba(59,130,246,0.08);
        box-shadow: 0 0 0 1.5px rgba(59,130,246,0.3);
      }
      .template-var.unfilled:hover {
        box-shadow: 0 0 0 2px #f59e0b;
      }
      .template-var.active {
        background: rgba(59,130,246,0.12) !important;
        box-shadow: 0 0 0 1.5px #3b82f6 !important;
      }

      /* Page number footer */
      .page-number {
        text-align: right;
        padding: 16px 0 4px;
        font-size: 9px;
        color: #9ca3af;
        font-family: Arial, sans-serif;
        letter-spacing: 0.5px;
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
        .template-var { cursor: default; }
        .template-var.filled { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
        span[style*="background:#fff3cd"] {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .page-number {
          text-align: right;
          font-size: 8px;
          color: #9ca3af;
          padding: 8px 0 0;
        }
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
    </style>`;

    // Build the full srcdoc (for printing — all pages continuous)
    const fullSrcdoc = useMemo(() => {
      const sanitized = sanitizeHtmlForIframe(renderedHtml);
      return sanitized.replace('</style>', previewCss);
    }, [renderedHtml]);

    // Split into separate page srcdocs
    const pageSrcdocs = useMemo(() => {
      const sanitized = sanitizeHtmlForIframe(renderedHtml);
      const withCss = sanitized.replace('</style>', previewCss);
      return splitIntoPages(withCss);
    }, [renderedHtml]);

    const totalPages = pageSrcdocs.length;

    // Clamp currentPage when pages change
    useEffect(() => {
      if (currentPage >= totalPages) {
        setCurrentPage(Math.max(0, totalPages - 1));
      }
    }, [totalPages, currentPage]);

    const currentSrcdoc = pageSrcdocs[currentPage] || pageSrcdocs[0] || '';

    // For printing, we use a hidden iframe with the full (non-split) document
    const printIframeRef = useRef<HTMLIFrameElement>(null);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      print: () => {
        const iframe = printIframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.print();
        }
      },
      clearActiveVariable: () => {
        const doc = iframeRef.current?.contentDocument;
        if (doc) {
          doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
        }
      },
      getEditedHtml: () => {
        const doc = iframeRef.current?.contentDocument;
        return doc?.documentElement?.outerHTML || null;
      },
    }));

    const measureIframe = useCallback(() => {
      const iframe = iframeRef.current;
      if (iframe?.contentDocument?.body) {
        const h = iframe.contentDocument.body.scrollHeight;
        setIframeHeight(h);
      }
    }, []);

    // After iframe loads: measure height + attach click handlers to [data-var] spans
    const handleIframeLoad = useCallback(() => {
      measureIframe();

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      // Set contentEditable based on prop (default: locked)
      doc.body.contentEditable = editableRef.current ? 'true' : 'false';
      doc.body.style.outline = 'none';

      // Restore saved manual edits if they exist for this conversation
      if (conversationId) {
        try {
          const saved = localStorage.getItem(DOC_EDIT_PREFIX + conversationId);
          if (saved) {
            const { html, fingerprint } = JSON.parse(saved);
            // Only restore if the underlying template hasn't changed
            if (fingerprint === currentSrcdoc.length.toString()) {
              doc.body.innerHTML = html;
              setTimeout(measureIframe, 50);
            } else {
              localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
            }
          }
        } catch { /* ignore corrupt data */ }
      }

      // Auto-save on input (debounced 500ms)
      doc.body.addEventListener('input', () => {
        if (!editableRef.current || !conversationId) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          const body = iframeRef.current?.contentDocument?.body;
          if (body) {
            localStorage.setItem(DOC_EDIT_PREFIX + conversationId, JSON.stringify({
              html: body.innerHTML,
              fingerprint: currentSrcdoc.length.toString(),
            }));
          }
        }, 500);
      });

      // Click on body (non-variable area) clears active state and closes popup
      doc.body.addEventListener('click', () => {
        doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
        onVariableClickRef.current?.(null);
      });

      const varSpans = doc.querySelectorAll<HTMLSpanElement>('[data-var]');
      varSpans.forEach((span) => {
        span.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const varKey = span.getAttribute('data-var');
          if (!varKey) return;

          // Remove active class from all, add to clicked
          doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
          span.classList.add('active');

          // Calculate position relative to the DocumentPreview container
          const iframeEl = iframeRef.current;
          const container = containerRef.current;
          if (!iframeEl || !container) return;

          const spanRect = span.getBoundingClientRect();
          const iframeRect = iframeEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Use refs to get current zoom (avoids stale closure)
          const z = zoomRef.current;
          const x = iframeRect.left - containerRect.left + spanRect.left * z + (spanRect.width * z) / 2;
          const y = iframeRect.top - containerRect.top + spanRect.top * z + spanRect.height * z;

          const isFilled = span.classList.contains('filled');

          onVariableClickRef.current?.({
            key: varKey,
            filled: isFilled,
            x,
            y,
          });
        });
      });
    }, [measureIframe, currentSrcdoc]);

    // Re-measure when page changes
    useEffect(() => {
      const t = setTimeout(measureIframe, 150);
      return () => clearTimeout(t);
    }, [currentSrcdoc, measureIframe]);

    // Clear active state inside iframe when variables change (re-render)
    const prevRenderedRef = useRef(renderedHtml);
    useEffect(() => {
      if (prevRenderedRef.current !== renderedHtml) {
        prevRenderedRef.current = renderedHtml;
        // srcdoc changed → iframe will reload, active states reset automatically
        // Clear saved edit since underlying data changed
        if (conversationId) {
          localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
        }
      }
    }, [renderedHtml, conversationId]);

    // Toggle contentEditable when editable prop changes (without iframe reload)
    useEffect(() => {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        doc.body.contentEditable = editable ? 'true' : 'false';
      }
    }, [editable]);

    // Fullscreen API handling
    const toggleFullscreen = useCallback(() => {
      if (!isFullscreen) {
        const el = fullscreenRef.current;
        if (el?.requestFullscreen) {
          el.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }, [isFullscreen]);

    useEffect(() => {
      const handleChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleChange);
      return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.05, 1.3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.05, 0.3));

    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);

    // In fullscreen mode, scale to fill available width
    const docWidth = 595;
    const scaledWidth = docWidth * zoom;
    const scaledHeight = iframeHeight * zoom;

    const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
    const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));

    return (
      <div ref={fullscreenRef} className={`flex flex-col h-full min-h-0 relative ${isFullscreen ? 'bg-base-200' : ''}`}>
        <div ref={containerRef} className="flex flex-col h-full min-h-0 relative">
          {/* Top info bar — minimal */}
          <div className="flex items-center justify-between px-3 py-1 flex-shrink-0">
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
          <div className="flex-shrink-0" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 20%, #e5e2dd 80%, transparent)' }} />

          {/* Preview area — single page at a time */}
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
            style={{ background: isFullscreen ? '#e8e5e0' : '#f5f3f0' }}
            onScroll={onScroll}
          >
            {/* Page container with subtle shadow */}
            <div
              style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
                margin: '16px auto',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.05)',
                borderRadius: '2px',
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={currentSrcdoc}
                title="Dokumento peržiūra"
                scrolling="no"
                style={{
                  width: `${docWidth}px`,
                  height: `${iframeHeight}px`,
                  border: 'none',
                  display: 'block',
                  overflow: 'hidden',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
                onLoad={handleIframeLoad}
              />
            </div>
          </div>

          {/* Bottom toolbar — page nav + actions (matches reference screenshot) */}
          <div className="flex-shrink-0" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 20%, #e5e2dd 80%, transparent)' }} />
          <div
            className="flex items-center justify-between px-3 flex-shrink-0"
            style={{ height: '40px' }}
          >
            {/* Page navigation — left side */}
            <div className="flex items-center gap-1">
              {totalPages > 1 ? (
                <>
                  <button
                    onClick={goToPrevPage}
                    disabled={currentPage === 0}
                    className="flex items-center justify-center rounded transition-colors"
                    style={{
                      width: '28px',
                      height: '28px',
                      color: currentPage === 0 ? '#d1d5db' : '#6b7280',
                      cursor: currentPage === 0 ? 'default' : 'pointer',
                    }}
                    onMouseEnter={(e) => { if (currentPage > 0) e.currentTarget.style.background = '#f0ede8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[12px] tabular-nums px-1 select-none" style={{ color: '#6b7280', minWidth: '36px', textAlign: 'center' }}>
                    {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages - 1}
                    className="flex items-center justify-center rounded transition-colors"
                    style={{
                      width: '28px',
                      height: '28px',
                      color: currentPage === totalPages - 1 ? '#d1d5db' : '#6b7280',
                      cursor: currentPage === totalPages - 1 ? 'default' : 'pointer',
                    }}
                    onMouseEnter={(e) => { if (currentPage < totalPages - 1) e.currentTarget.style.background = '#f0ede8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <span className="text-[10px]" style={{ color: '#bbb' }}>
                  1 puslapis
                </span>
              )}
            </div>

            {/* Actions — right side */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  if (onPrint) {
                    onPrint();
                  } else {
                    printIframeRef.current?.contentWindow?.print();
                  }
                }}
                className="flex items-center justify-center rounded transition-colors"
                style={{ width: '28px', height: '28px', color: '#6b7280' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title="Atsisiųsti PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex items-center justify-center rounded transition-colors"
                style={{ width: '28px', height: '28px', color: '#6b7280' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0ede8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title={isFullscreen ? 'Išeiti iš viso ekrano' : 'Visas ekranas'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Hidden iframe for printing full document (all pages) */}
        <iframe
          ref={printIframeRef}
          srcDoc={fullSrcdoc}
          title="Spausdinimo peržiūra"
          style={{ position: 'absolute', width: 0, height: 0, border: 'none', overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    );
  }
);

export default DocumentPreview;
