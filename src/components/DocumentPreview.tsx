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
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
    const [iframeHeight, setIframeHeight] = useState(1200);
    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Auto-measure available width so we can fit the document
    useEffect(() => {
      const el = scrollAreaRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Refs to avoid stale closures in iframe event handlers
    // Note: zoomRef tracks the effectiveZoom (auto-fit * user zoom) — updated below after computation
    const zoomRef = useRef(BASE_ZOOM);
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

    // The document's native width (A4 at 72dpi = 595px)
    const docWidth = 595;
    // Auto-fit: compute a base zoom that fills the container width (minus 24px margin)
    const autoFitZoom = containerWidth > 0 ? Math.min((containerWidth - 24) / docWidth, 1.1) : BASE_ZOOM;
    // Effective zoom = autoFit base * user adjustment
    const effectiveZoom = autoFitZoom * (zoom / BASE_ZOOM);

    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);

    // Keep zoomRef up-to-date for iframe click position calculations
    zoomRef.current = effectiveZoom;

    const scaledWidth = docWidth * effectiveZoom;
    const scaledHeight = iframeHeight * effectiveZoom;

    const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
    const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));

    // Shared button style helper
    const toolbarBtnStyle = (disabled?: boolean): React.CSSProperties => ({
      width: '28px',
      height: '28px',
      color: disabled ? '#d1d5db' : '#6b7280',
      cursor: disabled ? 'default' : 'pointer',
      border: 'none',
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '4px',
      transition: 'background 0.15s, color 0.15s',
      flexShrink: 0,
    });

    const hoverIn = (e: React.MouseEvent, disabled?: boolean) => {
      if (!disabled) e.currentTarget.style.background = '#e8e5e0';
    };
    const hoverOut = (e: React.MouseEvent) => {
      e.currentTarget.style.background = 'transparent';
    };

    return (
      <div ref={fullscreenRef} className={`flex flex-col h-full min-h-0 relative ${isFullscreen ? 'bg-base-200' : ''}`}>
        <div ref={containerRef} className="flex flex-col h-full min-h-0 relative">

          {/* ── Top toolbar ─────────────────────────────────────────────
              Layout: [page nav]  |  [zoom]  |  [download · fullscreen]
              Mirrors the reference screenshot toolbar.
          ──────────────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-2 flex-shrink-0 select-none"
            style={{
              height: '38px',
              background: isFullscreen ? '#f0ede8' : '#faf9f7',
              borderBottom: '1px solid #e8e5e0',
            }}
          >
            {/* Left: page navigation */}
            <div className="flex items-center gap-0.5" style={{ minWidth: '100px' }}>
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 0 || totalPages <= 1}
                style={toolbarBtnStyle(currentPage === 0 || totalPages <= 1)}
                onMouseEnter={(e) => hoverIn(e, currentPage === 0 || totalPages <= 1)}
                onMouseLeave={hoverOut}
                title="Ankstesnis puslapis"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span
                className="text-[12px] tabular-nums px-1"
                style={{ color: '#6b7280', minWidth: '40px', textAlign: 'center', letterSpacing: '0.01em' }}
              >
                {currentPage + 1} <span style={{ color: '#b0ada8' }}>iš</span> {totalPages}
              </span>

              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages - 1 || totalPages <= 1}
                style={toolbarBtnStyle(currentPage === totalPages - 1 || totalPages <= 1)}
                onMouseEnter={(e) => hoverIn(e, currentPage === totalPages - 1 || totalPages <= 1)}
                onMouseLeave={hoverOut}
                title="Kitas puslapis"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Center: zoom controls */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleZoomOut}
                style={toolbarBtnStyle(zoom <= 0.3)}
                onMouseEnter={(e) => hoverIn(e, zoom <= 0.3)}
                onMouseLeave={hoverOut}
                title="Sumažinti"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: '#6b7280', minWidth: '36px', textAlign: 'center' }}
              >
                {displayZoom}%
              </span>
              <button
                onClick={handleZoomIn}
                style={toolbarBtnStyle(zoom >= 1.3)}
                onMouseEnter={(e) => hoverIn(e, zoom >= 1.3)}
                onMouseLeave={hoverOut}
                title="Padidinti"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right: download + fullscreen */}
            <div className="flex items-center gap-0.5" style={{ minWidth: '100px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  if (onPrint) {
                    onPrint();
                  } else {
                    printIframeRef.current?.contentWindow?.print();
                  }
                }}
                style={toolbarBtnStyle()}
                onMouseEnter={(e) => hoverIn(e)}
                onMouseLeave={hoverOut}
                title="Atsisiųsti PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                style={toolbarBtnStyle()}
                onMouseEnter={(e) => hoverIn(e)}
                onMouseLeave={hoverOut}
                title={isFullscreen ? 'Išeiti iš viso ekrano' : 'Visas ekranas'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Unfilled variable hint — only when relevant */}
          {unfilled.length > 0 && (
            <div className="px-3 py-0.5 flex-shrink-0" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
              <span className="text-[10px]" style={{ color: '#92400e' }}>
                Liko užpildyti: {unfilled.length}
              </span>
            </div>
          )}

          {/* Preview area — single page at a time */}
          <div
            ref={scrollAreaRef}
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
                  transform: `scale(${effectiveZoom})`,
                  transformOrigin: 'top left',
                }}
                onLoad={handleIframeLoad}
              />
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
