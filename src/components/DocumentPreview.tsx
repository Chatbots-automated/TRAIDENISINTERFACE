import React, { useMemo, useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables } from '../lib/documentTemplateService';

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
}

// The "native" zoom where the document fits the panel well.
// Displayed as 100% in the UI; other zoom levels are relative to this.
const BASE_ZOOM = 0.95;

const DOC_EDIT_PREFIX = 'doc_edit_';

const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ variables, template, templateVersion, onVariableClick, onScroll, editable = false, conversationId }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
    const [iframeHeight, setIframeHeight] = useState(1200);

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

    const srcdoc = useMemo(() => {
      // Strip <meta http-equiv> tags — redundant in srcdoc (always UTF-8)
      // and cause "Blocked script execution" console errors in sandboxed iframes
      const sanitized = renderedHtml.replace(/<meta[^>]+http-equiv[^>]*>/gi, '');
      return sanitized.replace(
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
        div[style*="border-top:2px dashed"] {
          border: none !important;
          margin: 0 !important;
          page-break-before: always !important;
          break-before: page !important;
        }
        div[style*="border-top:2px dashed"] span {
          display: none !important;
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
      </style>`
      );
    }, [renderedHtml]);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      print: () => {
        const iframe = iframeRef.current;
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
            if (fingerprint === srcdoc.length.toString()) {
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
              fingerprint: srcdoc.length.toString(),
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
    }, [measureIframe]);

    // Re-measure when variables change (srcdoc updates trigger onLoad)
    useEffect(() => {
      const t = setTimeout(measureIframe, 150);
      return () => clearTimeout(t);
    }, [srcdoc, measureIframe]);

    // Clear active state inside iframe when variables change (re-render)
    const prevSrcdocRef = useRef(srcdoc);
    useEffect(() => {
      if (prevSrcdocRef.current !== srcdoc) {
        prevSrcdocRef.current = srcdoc;
        // srcdoc changed → iframe will reload, active states reset automatically
        // Clear saved edit since underlying data changed
        if (conversationId) {
          localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
        }
      }
    }, [srcdoc, conversationId]);

    // Toggle contentEditable when editable prop changes (without iframe reload)
    useEffect(() => {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        doc.body.contentEditable = editable ? 'true' : 'false';
      }
    }, [editable]);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.05, 1.3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.05, 0.3));

    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);

    const scaledWidth = 595 * zoom;
    const scaledHeight = iframeHeight * zoom;

    return (
      <div ref={containerRef} className="flex flex-col h-full min-h-0 relative">
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
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
        <div className="flex-shrink-0" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 20%, #e5e2dd 80%, transparent)' }} />

        {/* Preview area — single scroll layer, white background */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ background: '#ffffff' }}
          onScroll={onScroll}
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
              onLoad={handleIframeLoad}
            />
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex-shrink-0" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 20%, #e5e2dd 80%, transparent)' }} />
        <div
          className="px-3 py-1 text-center flex-shrink-0"
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
