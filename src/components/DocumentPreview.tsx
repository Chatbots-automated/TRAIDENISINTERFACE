import React, { useMemo, useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ChevronLeft, ChevronRight, Download, Lock, Maximize2, Minimize2, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, renderTemplateForPrint, getDefaultTemplate, getUnfilledVariables, sanitizeHtmlForIframe, PAGE_SPLIT_MARKER } from '../lib/documentTemplateService';

export interface DocumentPreviewHandle {
  print: () => void;
  clearActiveVariable: () => void;
  getEditedHtml: () => string | null;
}

export interface VariableClickInfo {
  key: string;
  filled: boolean;
  x: number;
  y: number;
}

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
  templateVersion?: number;
  onVariableClick?: (info: VariableClickInfo | null) => void;
  onScroll?: () => void;
  editable?: boolean;
  conversationId?: string;
  onPrint?: () => void;
  onToggleEdit?: () => void;
  showEditToggle?: boolean;
}

const BASE_ZOOM = 0.95;
const DOC_EDIT_PREFIX = 'doc_edit_';

// ---------------------------------------------------------------------------
// Split rendered HTML into per-page srcdoc strings at PAGE_SPLIT markers
// ---------------------------------------------------------------------------
function splitIntoPages(fullHtml: string): string[] {
  if (!fullHtml.includes(PAGE_SPLIT_MARKER)) return [fullHtml];

  const headMatch = fullHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : '<head></head>';
  const bodyTagMatch = fullHtml.match(/<body([^>]*)>/i);
  const bodyAttrs = bodyTagMatch ? bodyTagMatch[1] : '';
  const bodyInnerMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyInner = bodyInnerMatch ? bodyInnerMatch[1] : fullHtml;

  return bodyInner.split(PAGE_SPLIT_MARKER).map((part) =>
    `<!DOCTYPE html><html>${head}<body${bodyAttrs}>${part}</body></html>`
  );
}

const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ variables, template, templateVersion, onVariableClick, onScroll, editable = false, conversationId, onPrint, onToggleEdit, showEditToggle = false }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
    const [iframeHeight, setIframeHeight] = useState(1200);
    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
      const el = scrollAreaRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const zoomRef = useRef(BASE_ZOOM);
    const onVariableClickRef = useRef(onVariableClick);
    onVariableClickRef.current = onVariableClick;
    const editableRef = useRef(editable);
    editableRef.current = editable;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const templateHtml = useMemo(() => template || getDefaultTemplate(), [template, templateVersion]);
    const renderedHtml = useMemo(() => renderTemplate(templateHtml, variables), [templateHtml, variables]);
    const unfilled = useMemo(() => getUnfilledVariables(templateHtml, variables), [templateHtml, variables]);

    // ── Preview CSS (injected into each page iframe) ──
    const previewCss = `
      html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
      body.c47.doc-content {
        max-width: none; margin: 0; background: #fff;
        padding: 24pt 28pt;
      }
      .template-var { cursor: pointer; }
      .template-var.filled { }
      .template-var.unfilled {
        color: inherit; background: none !important;
        border: none !important; padding: 0 !important;
        font-size: inherit !important; white-space: normal !important;
      }
      .template-var.active {
        background: rgba(59,130,246,0.08) !important; border-radius: 2px;
      }
      .page-number {
        text-align: right; padding: 16px 0 4px;
        font-size: 9px; color: #9ca3af;
        font-family: Arial, sans-serif; letter-spacing: 0.5px;
      }
    </style>`;

    // ── Print CSS (for the hidden print iframe) ──
    const printCss = `
      html, body {
        margin: 0; padding: 0; background: #fff;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body.c47.doc-content {
        max-width: none; margin: 0; background: #fff;
        padding: 36pt;
      }
      img {
        max-width: 100% !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page { size: A4; margin: 0; }
    </style>`;

    // Preview: split at markers
    const pageSrcdocs = useMemo(() => {
      return splitIntoPages(sanitizeHtmlForIframe(renderedHtml).replace('</style>', previewCss));
    }, [renderedHtml]);

    // Print: separate render that keeps original <hr page-break> tags
    const printSrcdoc = useMemo(() => {
      const printHtml = renderTemplateForPrint(templateHtml, variables);
      return sanitizeHtmlForIframe(printHtml).replace('</style>', printCss);
    }, [templateHtml, variables]);

    const totalPages = pageSrcdocs.length;

    useEffect(() => {
      if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1));
    }, [totalPages, currentPage]);

    const currentSrcdoc = pageSrcdocs[currentPage] || pageSrcdocs[0] || '';
    const printIframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      print: () => { printIframeRef.current?.contentWindow?.print(); },
      clearActiveVariable: () => {
        iframeRef.current?.contentDocument?.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
      },
      getEditedHtml: () => iframeRef.current?.contentDocument?.documentElement?.outerHTML || null,
    }));

    const measureIframe = useCallback(() => {
      const h = iframeRef.current?.contentDocument?.body?.scrollHeight;
      if (h) setIframeHeight(h);
    }, []);

    const handleIframeLoad = useCallback(() => {
      measureIframe();
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;

      doc.body.contentEditable = editableRef.current ? 'true' : 'false';
      doc.body.style.outline = 'none';

      if (conversationId) {
        try {
          const saved = localStorage.getItem(DOC_EDIT_PREFIX + conversationId);
          if (saved) {
            const { html, fingerprint } = JSON.parse(saved);
            if (fingerprint === currentSrcdoc.length.toString()) {
              doc.body.innerHTML = html;
              setTimeout(measureIframe, 50);
            } else {
              localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
            }
          }
        } catch { /* ignore */ }
      }

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

      doc.body.addEventListener('click', () => {
        doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
        onVariableClickRef.current?.(null);
      });

      doc.querySelectorAll<HTMLSpanElement>('[data-var]').forEach((span) => {
        span.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const varKey = span.getAttribute('data-var');
          if (!varKey) return;

          doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
          span.classList.add('active');

          const iframeEl = iframeRef.current;
          const container = containerRef.current;
          if (!iframeEl || !container) return;

          const spanRect = span.getBoundingClientRect();
          const iframeRect = iframeEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const z = zoomRef.current;

          onVariableClickRef.current?.({
            key: varKey,
            filled: span.classList.contains('filled'),
            x: iframeRect.left - containerRect.left + spanRect.left * z + (spanRect.width * z) / 2,
            y: iframeRect.top - containerRect.top + spanRect.top * z + spanRect.height * z,
          });
        });
      });
    }, [measureIframe, currentSrcdoc]);

    useEffect(() => {
      const t = setTimeout(measureIframe, 150);
      return () => clearTimeout(t);
    }, [currentSrcdoc, measureIframe]);

    const prevRenderedRef = useRef(renderedHtml);
    useEffect(() => {
      if (prevRenderedRef.current !== renderedHtml) {
        prevRenderedRef.current = renderedHtml;
        if (conversationId) localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
      }
    }, [renderedHtml, conversationId]);

    useEffect(() => {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) doc.body.contentEditable = editable ? 'true' : 'false';
    }, [editable]);

    const toggleFullscreen = useCallback(() => {
      if (!isFullscreen) {
        fullscreenRef.current?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }, [isFullscreen]);

    useEffect(() => {
      const h = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', h);
      return () => document.removeEventListener('fullscreenchange', h);
    }, []);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.05, 1.3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.05, 0.3));

    const docWidth = 595;
    const autoFitZoom = containerWidth > 0 ? Math.min((containerWidth - 24) / docWidth, 1.1) : BASE_ZOOM;
    const effectiveZoom = autoFitZoom * (zoom / BASE_ZOOM);
    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);
    zoomRef.current = effectiveZoom;

    const scaledWidth = docWidth * effectiveZoom;
    const scaledHeight = iframeHeight * effectiveZoom;

    const goToPrevPage = () => setCurrentPage((p) => Math.max(0, p - 1));
    const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));

    // ── Toolbar button helpers ──
    const btnBase: React.CSSProperties = {
      width: '30px', height: '30px',
      border: 'none', background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '6px', transition: 'background 0.15s, color 0.15s',
      flexShrink: 0, cursor: 'pointer',
    };
    const btn = (disabled?: boolean): React.CSSProperties => ({
      ...btnBase,
      color: disabled ? '#d1d5db' : '#555',
      cursor: disabled ? 'default' : 'pointer',
    });
    const onEnter = (e: React.MouseEvent, disabled?: boolean) => { if (!disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; };
    const onLeave = (e: React.MouseEvent) => { e.currentTarget.style.background = 'transparent'; };

    return (
      <div
        ref={fullscreenRef}
        className="flex flex-col h-full min-h-0 relative"
        style={{ background: isFullscreen ? '#fff' : undefined }}
      >
        <div ref={containerRef} className="flex flex-col h-full min-h-0 relative">

          {/* ── Top toolbar ── */}
          <div
            className="flex items-center justify-between px-2 flex-shrink-0 select-none"
            style={{
              height: '40px',
              background: '#fafafa',
              borderBottom: '1px solid #eee',
            }}
          >
            {/* Left: page navigation */}
            <div className="flex items-center gap-0.5" style={{ minWidth: '110px' }}>
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 0 || totalPages <= 1}
                style={btn(currentPage === 0 || totalPages <= 1)}
                onMouseEnter={(e) => onEnter(e, currentPage === 0 || totalPages <= 1)}
                onMouseLeave={onLeave}
                title="Ankstesnis puslapis"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span
                className="text-[12px] tabular-nums px-1"
                style={{ color: '#666', minWidth: '44px', textAlign: 'center' }}
              >
                {currentPage + 1} <span style={{ opacity: 0.5 }}>/ {totalPages}</span>
              </span>
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages - 1 || totalPages <= 1}
                style={btn(currentPage === totalPages - 1 || totalPages <= 1)}
                onMouseEnter={(e) => onEnter(e, currentPage === totalPages - 1 || totalPages <= 1)}
                onMouseLeave={onLeave}
                title="Kitas puslapis"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Center: zoom */}
            <div className="flex items-center gap-0.5">
              <button onClick={handleZoomOut} style={btn(zoom <= 0.3)} onMouseEnter={(e) => onEnter(e, zoom <= 0.3)} onMouseLeave={onLeave} title="Sumažinti">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] tabular-nums" style={{ color: '#888', minWidth: '36px', textAlign: 'center' }}>
                {displayZoom}%
              </span>
              <button onClick={handleZoomIn} style={btn(zoom >= 1.3)} onMouseEnter={(e) => onEnter(e, zoom >= 1.3)} onMouseLeave={onLeave} title="Padidinti">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right: edit · download · fullscreen */}
            <div className="flex items-center gap-0.5" style={{ minWidth: '110px', justifyContent: 'flex-end' }}>
              {unfilled.length > 0 && (
                <span className="text-[10px] mr-1" style={{ color: '#b0a090' }}>
                  {unfilled.length} liko
                </span>
              )}

              {showEditToggle && (
                <button
                  onClick={onToggleEdit}
                  style={{
                    ...btnBase,
                    color: editable ? '#3b82f6' : '#555',
                    background: editable ? 'rgba(59,130,246,0.1)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!editable) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { if (!editable) e.currentTarget.style.background = 'transparent'; }}
                  title={editable ? 'Užrakinti redagavimą' : 'Redaguoti dokumentą'}
                >
                  {editable ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
              )}

              <button
                onClick={() => { onPrint ? onPrint() : printIframeRef.current?.contentWindow?.print(); }}
                style={btn()}
                onMouseEnter={(e) => onEnter(e)}
                onMouseLeave={onLeave}
                title="Atsisiųsti PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                style={btn()}
                onMouseEnter={(e) => onEnter(e)}
                onMouseLeave={onLeave}
                title={isFullscreen ? 'Išeiti iš viso ekrano' : 'Visas ekranas'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Document area ── */}
          <div
            ref={scrollAreaRef}
            className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex"
            style={{
              background: isFullscreen ? '#f7f7f7' : '#f0f0f0',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
            onScroll={onScroll}
          >
            <div
              style={{
                width: `${scaledWidth}px`,
                minHeight: `${scaledHeight}px`,
                margin: '12px auto',
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                borderRadius: '2px',
                flexShrink: 0,
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

        {/* Hidden iframe for printing — uses renderTemplateForPrint which
            keeps original <hr page-break> tags for correct page breaks */}
        <iframe
          ref={printIframeRef}
          srcDoc={printSrcdoc}
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
