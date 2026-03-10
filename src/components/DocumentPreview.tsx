import React, { useMemo, useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ZoomIn, ZoomOut, ImagePlus, Maximize2, RotateCcw, Crop, MoveHorizontal, X } from 'lucide-react';
import { renderTemplate, getDefaultTemplate, getUnfilledVariables, sanitizeHtmlForIframe } from '../lib/documentTemplateService';
import type { VariableCitation } from '../lib/sdkConversationService';

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

export interface CitationClickInfo {
  key: string;
  citation: VariableCitation;
  x: number;
  y: number;
}

interface SelectedImageInfo {
  /** The actual <img> element inside the iframe */
  imgEl: HTMLImageElement;
  /** Position relative to the DocumentPreview container */
  x: number;
  y: number;
  /** Current rendered dimensions */
  width: number;
  height: number;
  /** Natural (intrinsic) dimensions of the image */
  naturalWidth: number;
  naturalHeight: number;
  /** Current src */
  src: string;
  /** Original width style (for reset) */
  originalWidth: string;
  /** Original height style (for reset) */
  originalHeight: string;
}

interface DocumentPreviewProps {
  variables: Record<string, string>;
  template?: string;
  /** Bump to force re-reading the global template from localStorage. */
  templateVersion?: number;
  onVariableClick?: (info: VariableClickInfo | null) => void;
  onCitationClick?: (info: CitationClickInfo | null) => void;
  onScroll?: () => void;
  /** Whether the document body is contentEditable. Default false. */
  editable?: boolean;
  /** Conversation ID — used for localStorage persistence of manual edits. */
  conversationId?: string;
  /** Variable citations map from artifact */
  citations?: Record<string, VariableCitation>;
}

// The "native" zoom where the document fits the panel well.
// Displayed as 100% in the UI; other zoom levels are relative to this.
const BASE_ZOOM = 0.95;

const DOC_EDIT_PREFIX = 'doc_edit_';

// Maximum width for images to prevent template breakage (A4 content area ~523px at 36pt padding)
const MAX_IMG_WIDTH = 523;

const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(
  function DocumentPreview({ variables, template, templateVersion, onVariableClick, onCitationClick, onScroll, editable = false, conversationId, citations }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [zoom, setZoom] = useState(BASE_ZOOM);
    const [iframeHeight, setIframeHeight] = useState(1200);

    // Image editing state
    const [selectedImage, setSelectedImage] = useState<SelectedImageInfo | null>(null);
    const [imgWidth, setImgWidth] = useState(100); // percentage of original
    const [cropMode, setCropMode] = useState(false);
    const [cropValues, setCropValues] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

    // Refs to avoid stale closures in iframe event handlers
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const onVariableClickRef = useRef(onVariableClick);
    onVariableClickRef.current = onVariableClick;
    const onCitationClickRef = useRef(onCitationClick);
    onCitationClickRef.current = onCitationClick;
    const citationsRef = useRef(citations);
    citationsRef.current = citations;
    const editableRef = useRef(editable);
    editableRef.current = editable;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build the set of cited variable keys for renderTemplate
    const citedKeys = useMemo(
      () => citations ? new Set(Object.keys(citations)) : undefined,
      [citations]
    );

    // Re-read global template whenever templateVersion changes
    const templateHtml = useMemo(() => template || getDefaultTemplate(), [template, templateVersion]);

    const renderedHtml = useMemo(
      () => renderTemplate(templateHtml, variables, citedKeys),
      [templateHtml, variables, citedKeys]
    );

    const unfilled = useMemo(
      () => getUnfilledVariables(templateHtml, variables),
      [templateHtml, variables]
    );

    // Trigger auto-save after any image edit
    const triggerAutoSave = useCallback(() => {
      if (!editableRef.current || !conversationId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const body = iframeRef.current?.contentDocument?.body;
        if (body) {
          localStorage.setItem(DOC_EDIT_PREFIX + conversationId, JSON.stringify({
            html: body.innerHTML,
            fingerprint: 'img-edit', // different fingerprint so it persists across template changes
          }));
        }
      }, 500);
    }, [conversationId]);

    const srcdoc = useMemo(() => {
      const sanitized = sanitizeHtmlForIframe(renderedHtml);
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

      /* Image constraints to prevent layout breakage */
      img {
        max-width: 100%;
        height: auto;
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

      /* Citation badge */
      .citation-badge {
        display: inline-block;
        font-size: 8px;
        font-weight: 600;
        font-family: Arial, sans-serif;
        color: #c7a88a;
        background: rgba(199,168,138,0.10);
        border: 1px solid rgba(199,168,138,0.25);
        border-radius: 3px;
        padding: 0 3px;
        margin-left: 2px;
        cursor: pointer;
        vertical-align: super;
        line-height: 1;
        letter-spacing: 0.3px;
        transition: background 0.15s, border-color 0.15s;
        user-select: none;
      }
      .citation-badge:hover {
        background: rgba(199,168,138,0.22);
        border-color: rgba(199,168,138,0.5);
        color: #a0845e;
      }

      /* Edit mode image styles */
      body.img-edit-mode img {
        cursor: pointer;
        transition: outline 0.15s, box-shadow 0.15s;
      }
      body.img-edit-mode img:hover {
        outline: 2px solid rgba(59,130,246,0.4);
        outline-offset: 2px;
      }
      body.img-edit-mode img.img-selected {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
        box-shadow: 0 0 0 4px rgba(59,130,246,0.12);
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
        .citation-badge { display: none !important; }
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

    // Select an image in the iframe and show the toolbar
    const selectImage = useCallback((img: HTMLImageElement) => {
      const iframeEl = iframeRef.current;
      const container = containerRef.current;
      if (!iframeEl || !container) return;

      const doc = iframeEl.contentDocument;
      if (!doc) return;

      // Clear previous selection
      doc.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
      img.classList.add('img-selected');

      const rect = img.getBoundingClientRect();
      const iframeRect = iframeEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const z = zoomRef.current;

      const x = iframeRect.left - containerRect.left + (rect.left + rect.width / 2) * z;
      const y = iframeRect.top - containerRect.top + rect.top * z;

      // Parse current width from style
      const currentStyleWidth = img.style.width;
      const originalW = currentStyleWidth || `${img.naturalWidth}px`;
      const originalH = img.style.height || `${img.naturalHeight}px`;

      // Calculate current width as percentage of original
      const currentPx = img.getBoundingClientRect().width;
      const pct = img.naturalWidth > 0 ? Math.round((currentPx / img.naturalWidth) * 100) : 100;

      // Parse existing clip-path for crop values
      const clipPath = img.style.clipPath || img.style.getPropertyValue('clip-path') || '';
      const insetMatch = clipPath.match(/inset\((\d+)%\s+(\d+)%\s+(\d+)%\s+(\d+)%\)/);
      if (insetMatch) {
        setCropValues({ top: +insetMatch[1], right: +insetMatch[2], bottom: +insetMatch[3], left: +insetMatch[4] });
      } else {
        setCropValues({ top: 0, right: 0, bottom: 0, left: 0 });
      }

      setSelectedImage({
        imgEl: img,
        x,
        y,
        width: currentPx,
        height: rect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.src,
        originalWidth: originalW,
        originalHeight: originalH,
      });
      setImgWidth(pct);
      setCropMode(false);
    }, []);

    // Close image toolbar
    const deselectImage = useCallback(() => {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        doc.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
      }
      setSelectedImage(null);
      setCropMode(false);
    }, []);

    // After iframe loads: measure height + attach click handlers
    const handleIframeLoad = useCallback(() => {
      measureIframe();

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      // Set contentEditable based on prop (default: locked)
      doc.body.contentEditable = editableRef.current ? 'true' : 'false';
      doc.body.style.outline = 'none';

      // Toggle img-edit-mode class
      if (editableRef.current) {
        doc.body.classList.add('img-edit-mode');
      } else {
        doc.body.classList.remove('img-edit-mode');
      }

      // Restore saved manual edits if they exist for this conversation
      if (conversationId) {
        try {
          const saved = localStorage.getItem(DOC_EDIT_PREFIX + conversationId);
          if (saved) {
            const { html, fingerprint } = JSON.parse(saved);
            // Only restore if the underlying template hasn't changed
            if (fingerprint === srcdoc.length.toString() || fingerprint === 'img-edit') {
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
      doc.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't close image toolbar if clicking an image in edit mode
        if (editableRef.current && target.tagName === 'IMG') return;

        doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
        doc.querySelectorAll('.img-selected').forEach((el) => el.classList.remove('img-selected'));
        onVariableClickRef.current?.(null);
        onCitationClickRef.current?.(null);
        setSelectedImage(null);
        setCropMode(false);
      });

      // Helper to calculate position relative to container
      const calcPosition = (el: HTMLElement) => {
        const iframeEl = iframeRef.current;
        const container = containerRef.current;
        if (!iframeEl || !container) return null;

        const rect = el.getBoundingClientRect();
        const iframeRect = iframeEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const z = zoomRef.current;

        return {
          x: iframeRect.left - containerRect.left + rect.left * z + (rect.width * z) / 2,
          y: iframeRect.top - containerRect.top + rect.top * z + rect.height * z,
        };
      };

      // Variable click handlers
      const varSpans = doc.querySelectorAll<HTMLSpanElement>('[data-var]');
      varSpans.forEach((span) => {
        span.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const varKey = span.getAttribute('data-var');
          if (!varKey) return;

          doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
          span.classList.add('active');

          const pos = calcPosition(span);
          if (!pos) return;

          const isFilled = span.classList.contains('filled');

          setSelectedImage(null); // close image toolbar
          onCitationClickRef.current?.(null);
          onVariableClickRef.current?.({
            key: varKey,
            filled: isFilled,
            x: pos.x,
            y: pos.y,
          });
        });
      });

      // Citation badge click handlers
      const citationBadges = doc.querySelectorAll<HTMLElement>('[data-citation]');
      citationBadges.forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const varKey = badge.getAttribute('data-citation');
          if (!varKey) return;

          const cits = citationsRef.current;
          const citation = cits?.[varKey];
          if (!citation) return;

          const pos = calcPosition(badge);
          if (!pos) return;

          setSelectedImage(null);
          onVariableClickRef.current?.(null);
          onCitationClickRef.current?.({
            key: varKey,
            citation,
            x: pos.x,
            y: pos.y,
          });
        });
      });

      // Image click handlers (only in edit mode)
      const images = doc.querySelectorAll<HTMLImageElement>('img');
      images.forEach((img) => {
        img.addEventListener('click', (e) => {
          if (!editableRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          // Close other popups
          onVariableClickRef.current?.(null);
          onCitationClickRef.current?.(null);
          doc.querySelectorAll('.template-var.active').forEach((el) => el.classList.remove('active'));
          // Select this image
          selectImage(img);
        });
      });
    }, [measureIframe, selectImage]);

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
        if (conversationId) {
          localStorage.removeItem(DOC_EDIT_PREFIX + conversationId);
        }
      }
    }, [srcdoc, conversationId]);

    // Toggle contentEditable and img-edit-mode when editable prop changes
    useEffect(() => {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        doc.body.contentEditable = editable ? 'true' : 'false';
        if (editable) {
          doc.body.classList.add('img-edit-mode');
        } else {
          doc.body.classList.remove('img-edit-mode');
          // Deselect image when leaving edit mode
          deselectImage();
        }
      }
    }, [editable, deselectImage]);

    // ── Image editing actions ──

    const handleReplaceImage = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedImage) return;

      // Validate file type
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl || !selectedImage) return;

        const img = selectedImage.imgEl;
        img.src = dataUrl;

        // Wait for image to load to get natural dimensions
        img.onload = () => {
          // Constrain to max width while preserving aspect ratio
          const newW = Math.min(img.naturalWidth, MAX_IMG_WIDTH);
          const ratio = newW / img.naturalWidth;
          const newH = img.naturalHeight * ratio;

          img.style.width = `${newW}px`;
          img.style.height = `${newH}px`;

          // Clear any crop
          img.style.clipPath = '';
          img.style.objectFit = '';
          img.style.objectPosition = '';

          // Remove absolute positioning if it had any (prevents layout issues)
          if (img.style.position === 'absolute') {
            img.style.position = '';
            img.style.left = '';
            img.style.top = '';
          }

          triggerAutoSave();
          measureIframe();

          // Re-select to update toolbar state
          selectImage(img);
        };
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      e.target.value = '';
    }, [selectedImage, triggerAutoSave, measureIframe, selectImage]);

    const handleResizeImage = useCallback((widthPct: number) => {
      if (!selectedImage) return;
      const img = selectedImage.imgEl;
      const newW = Math.min(Math.round((img.naturalWidth * widthPct) / 100), MAX_IMG_WIDTH);
      const ratio = newW / img.naturalWidth;
      const newH = Math.round(img.naturalHeight * ratio);

      img.style.width = `${newW}px`;
      img.style.height = `${newH}px`;
      setImgWidth(widthPct);

      triggerAutoSave();
      setTimeout(measureIframe, 50);
    }, [selectedImage, triggerAutoSave, measureIframe]);

    const handleFitToColumn = useCallback(() => {
      if (!selectedImage) return;
      const img = selectedImage.imgEl;
      img.style.width = '100%';
      img.style.height = 'auto';
      setImgWidth(Math.round((MAX_IMG_WIDTH / img.naturalWidth) * 100));

      triggerAutoSave();
      setTimeout(measureIframe, 50);
    }, [selectedImage, triggerAutoSave, measureIframe]);

    const handleResetImage = useCallback(() => {
      if (!selectedImage) return;
      const img = selectedImage.imgEl;
      img.style.width = selectedImage.originalWidth;
      img.style.height = selectedImage.originalHeight;
      img.style.clipPath = '';
      img.style.objectFit = '';
      img.style.objectPosition = '';
      setImgWidth(100);
      setCropValues({ top: 0, right: 0, bottom: 0, left: 0 });

      triggerAutoSave();
      setTimeout(measureIframe, 50);
    }, [selectedImage, triggerAutoSave, measureIframe]);

    const handleCropChange = useCallback((side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
      if (!selectedImage) return;
      const newCrop = { ...cropValues, [side]: value };
      setCropValues(newCrop);

      const img = selectedImage.imgEl;
      img.style.clipPath = `inset(${newCrop.top}% ${newCrop.right}% ${newCrop.bottom}% ${newCrop.left}%)`;

      triggerAutoSave();
    }, [selectedImage, cropValues, triggerAutoSave]);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.05, 1.3));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.05, 0.3));

    const displayZoom = Math.round((zoom / BASE_ZOOM) * 100);

    const scaledWidth = 595 * zoom;
    const scaledHeight = iframeHeight * zoom;

    return (
      <div ref={containerRef} className="flex flex-col h-full min-h-0 relative">
        {/* Hidden file input for image replacement */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

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

        {/* ── Image Editing Toolbar (docked at top of preview panel) ── */}
        {selectedImage && editable && (
          <div
            className="flex-shrink-0"
            style={{
              background: '#fafaf9',
              borderBottom: '1px solid #e5e2dd',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Main row: actions + resize slider */}
            <div className="px-3 py-2 flex items-center gap-3">
              {/* Label + dimensions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-semibold" style={{ color: '#1a1a1a' }}>
                  Paveikslėlis
                </span>
                <span className="text-[10px]" style={{ color: '#9ca3af' }}>
                  {selectedImage.naturalWidth}×{selectedImage.naturalHeight}
                </span>
              </div>

              {/* Separator */}
              <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleReplaceImage}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{ background: '#3d3935', color: 'white' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d2925'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3d3935'}
                  title="Pakeisti paveikslėlį"
                >
                  <ImagePlus className="w-3 h-3" />
                  Pakeisti
                </button>
                <button
                  onClick={handleFitToColumn}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{ background: '#f3f2f0', color: '#3d3935' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e8e6e3'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f3f2f0'}
                  title="Pritaikyti prie stulpelio"
                >
                  <Maximize2 className="w-3 h-3" />
                  Užpildyti
                </button>
                <button
                  onClick={handleResetImage}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{ background: '#f3f2f0', color: '#3d3935' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e8e6e3'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f3f2f0'}
                  title="Atkurti originalų dydį"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Separator */}
              <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />

              {/* Resize slider inline */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MoveHorizontal className="w-3 h-3 flex-shrink-0" style={{ color: '#6b7280' }} />
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={imgWidth}
                  onChange={e => handleResizeImage(+e.target.value)}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer min-w-[60px]"
                  style={{
                    background: `linear-gradient(to right, #3d3935 0%, #3d3935 ${((imgWidth - 10) / 190) * 100}%, #e5e2dd ${((imgWidth - 10) / 190) * 100}%, #e5e2dd 100%)`,
                    accentColor: '#3d3935',
                  }}
                />
                <span className="text-[10px] tabular-nums font-medium flex-shrink-0" style={{ color: '#3d3935' }}>
                  {imgWidth}%
                </span>
              </div>

              {/* Separator */}
              <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />

              {/* Crop toggle */}
              <button
                onClick={() => setCropMode(prev => !prev)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0"
                style={{
                  background: cropMode ? '#eff6ff' : '#f3f2f0',
                  color: cropMode ? '#3b82f6' : '#6b7280',
                }}
              >
                <Crop className="w-3 h-3" />
                Apkarpyti
              </button>

              {/* Close button */}
              <button
                onClick={deselectImage}
                className="p-1 rounded transition-colors flex-shrink-0"
                style={{ color: '#9ca3af' }}
                onMouseEnter={e => e.currentTarget.style.color = '#3d3935'}
                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                title="Uždaryti"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Crop sliders row (expanded when crop mode is on) */}
            {cropMode && (
              <div className="px-3 pb-2 flex items-center gap-3" style={{ borderTop: '1px solid #f0eeeb' }}>
                {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                  <div key={side} className="flex items-center gap-1.5 flex-1">
                    <span className="text-[10px] flex-shrink-0" style={{ color: '#9ca3af' }}>
                      {side === 'top' ? 'Viršus' : side === 'right' ? 'Dešinė' : side === 'bottom' ? 'Apačia' : 'Kairė'}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      value={cropValues[side]}
                      onChange={e => handleCropChange(side, +e.target.value)}
                      className="flex-1 h-1 rounded-full appearance-none cursor-pointer min-w-[30px]"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(cropValues[side] / 45) * 100}%, #e5e2dd ${(cropValues[side] / 45) * 100}%, #e5e2dd 100%)`,
                        accentColor: '#3b82f6',
                      }}
                    />
                    <span className="text-[10px] w-5 tabular-nums flex-shrink-0" style={{ color: '#9ca3af' }}>
                      {cropValues[side]}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview area — single scroll layer, white background */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ background: '#ffffff' }}
          onScroll={() => {
            onScroll?.();
          }}
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
