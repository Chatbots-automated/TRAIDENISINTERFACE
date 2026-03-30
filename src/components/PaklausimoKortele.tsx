import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  X, ExternalLink, Link2, ChevronDown, ChevronLeft, ChevronRight, Plus,
  LayoutList, MessageSquare, CheckSquare, Beaker, Paperclip,
  Upload, FileText, Trash2, Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, Eye, Pencil, Save, Euro, Sparkles, ArrowUp,
} from 'lucide-react';
import {
  fetchNestandartiniaiKainaByIds,
  fetchNestandartiniaiById,
  updateNestandartiniaiAtsakymas,
  updateNestandartiniaiTasks,
  updateNestandartiniaiAiConversation,
  updateNestandartiniaiField,
  deleteNestandartiniaiRecord,
  fetchTalposByIds,
  updateTalposField,
} from '../lib/dokumentaiService';
import type {
  NestandartiniaiRecord, AtsakymasMessage, TaskItem, AiConversationMessage,
} from '../lib/dokumentaiService';
import { getWebhookUrl } from '../lib/webhooksService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadata(raw: string | Record<string, string> | any[] | null | undefined): Record<string, string> {
  if (!raw) return {};
  // If it's an array (multi-product), return the first item as flat metadata
  if (Array.isArray(raw)) {
    const first = raw[0];
    return (first && typeof first === 'object') ? first : {};
  }
  if (typeof raw === 'object') return raw as Record<string, string>;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      return (first && typeof first === 'object') ? first : {};
    }
    return parsed || {};
  } catch { return {}; }
}

/** Parse kaina field into a per-tank price map. Backward-compatible with single numbers. */
function parseKainaMapStatic(v: any): Record<string, number> {
  if (v === null || v === undefined || v === '') return {};
  if (typeof v === 'number') return { '0': v };
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          const result: Record<string, number> = {};
          for (const [k, val] of Object.entries(parsed)) { const n = Number(val); if (!isNaN(n)) result[k] = n; }
          return result;
        }
      } catch { /* fall through */ }
    }
    const n = parseFloat(trimmed);
    if (!isNaN(n)) return { '0': n };
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const result: Record<string, number> = {};
    for (const [k, val] of Object.entries(v)) { const n = Number(val); if (!isNaN(n)) result[k] = n; }
    return result;
  }
  return {};
}

/**
 * Extract an array of product specs from metadata.
 * Supports multiple formats:
 *   1. Old flat format: Record<string, string> → returns [meta] (single product)
 *   2. New multi-product format: { products: [...] } → returns products array
 *   3. JSON array directly: [{...}, {...}] → returns array as-is
 *   4. Lithuanian keyed arrays: { talpos: [...] } or { gaminiai: [...] }
 * Also handles stringified JSON and nested objects within each product.
 */
function parseProducts(raw: string | Record<string, any> | any[] | null | undefined): Record<string, any>[] {
  if (!raw) return [{}];
  let obj: any = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    try { obj = JSON.parse(trimmed); } catch { return [{}]; }
  }
  // If it's an array of product objects directly
  if (Array.isArray(obj)) {
    const filtered = obj.filter((item: any) => item && typeof item === 'object' && !Array.isArray(item));
    return filtered.length > 0 ? filtered : [{}];
  }
  if (obj && typeof obj === 'object') {
    // Check common wrapper keys: products, talpos, gaminiai
    for (const wrapperKey of ['products', 'talpos', 'gaminiai', 'items']) {
      if (Array.isArray(obj[wrapperKey]) && obj[wrapperKey].length > 0) {
        return obj[wrapperKey];
      }
    }
  }
  // Flat single-product format
  return [obj as Record<string, any>];
}

/**
 * Try to coerce any value into a plain (non-array) object for KV display.
 *   1. Already a plain object            → return as-is
 *   2. Array                             → return first plain-object element
 *   3. JSON string starting with '{'     → JSON.parse once
 *   4. JSON string starting with '['     → JSON.parse, then take first object
 *   5. Double-encoded string (starts '"') → decode once, then retry 3/4
 *   6. Anything else                     → return null (render as scalar)
 */
function tryParseJsonObject(v: any): Record<string, any> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (!Array.isArray(v)) return v as Record<string, any>;
    const first = (v as any[]).find(item => item && typeof item === 'object' && !Array.isArray(item));
    return first ?? null;
  }
  if (typeof v !== 'string') return null;
  let s = v.trim();
  // Double-encoded: outer quotes wrapping a JSON string
  if (s.startsWith('"')) {
    try {
      const decoded = JSON.parse(s);
      if (typeof decoded === 'string') s = decoded.trim();
      else return tryParseJsonObject(decoded); // decoded is already object/array
    } catch { /* try as-is */ }
  }
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object') {
        if (!Array.isArray(parsed)) return parsed;
        const first = (parsed as any[]).find(item => item && typeof item === 'object' && !Array.isArray(item));
        return first ?? null;
      }
    } catch { /* malformed */ }
  }
  return null;
}

function parseJSON<T>(raw: T | string | null): T | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
    return [{ text: raw }];
  }
  return [];
}

// Metadata field definitions
const INFO_ROW_1 = [
  { key: 'orientacija', label: 'Orientacija' },
  { key: 'talpa_tipas', label: 'Talpos tipas' },
  { key: 'DN', label: 'Diametras (DN)' },
];
const INFO_ROW_2 = [
  { key: 'chemija', label: 'Chemija' },
  { key: 'derva_org', label: 'Derva (org)', computed: true },
  { key: 'koncentracija', label: 'Koncentracija' },
];
const ALL_MAIN_KEYS = new Set([
  ...INFO_ROW_1.map(r => r.key),
  'chemija', 'derva', 'koncentracija', 'derva_cheminis_sluoksnis_mm',
  'pritaikymas', 'talpa', 'derva_musu',
]);

/** Format original derva with cheminis sluoksnis mm appended when present */
function formatDervaOrg(meta: Record<string, string>): string {
  const derva = meta.derva;
  if (!derva) return '';
  const sluoksnis = meta.derva_cheminis_sluoksnis_mm;
  if (sluoksnis && sluoksnis.trim() !== '-' && sluoksnis.trim() !== '') {
    return `${derva} (+ ${sluoksnis.trim()})`;
  }
  return derva;
}

// ---------------------------------------------------------------------------
// Global processing tracker – survives tab switches & card open/close
// ---------------------------------------------------------------------------

type ProcessKey = 'derva' | 'similar';
const _processingMap = new Map<number, Set<ProcessKey>>();
const _listeners = new Set<() => void>();

function setProcessing(recordId: number, key: ProcessKey, on: boolean) {
  let s = _processingMap.get(recordId);
  if (on) {
    if (!s) { s = new Set(); _processingMap.set(recordId, s); }
    s.add(key);
  } else {
    s?.delete(key);
    if (s?.size === 0) _processingMap.delete(recordId);
  }
  _listeners.forEach(fn => fn());
}

function isProcessing(recordId: number, key: ProcessKey) {
  return _processingMap.get(recordId)?.has(key) ?? false;
}

/** Hook that re-renders when global processing state changes. */
function useProcessing(recordId: number, key: ProcessKey) {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(v => v + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return isProcessing(recordId, key);
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type ModalTab = 'talpos' | 'susirasinejimas' | 'uzduotys' | 'failai';

const TABS: { id: ModalTab; label: string; icon: React.ElementType }[] = [
  { id: 'talpos', label: 'Talpos', icon: LayoutList },
  { id: 'susirasinejimas', label: 'Susirašinėjimas', icon: MessageSquare },
  { id: 'uzduotys', label: 'Užduotys', icon: CheckSquare },
  { id: 'failai', label: 'Failai', icon: Paperclip },
];

// ---------------------------------------------------------------------------
// Markdown renderer for recommendation / AI text
// ---------------------------------------------------------------------------

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.substring(currentIndex, match.index));
    }
    if (match[1]) {
      parts.push(<code key={match.index} className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: '#f0ede8', color: '#5a5550' }}>{match[1].slice(1, -1)}</code>);
    } else if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[2].slice(2, -2)}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3].slice(1, -1)}</em>);
    }
    currentIndex = match.index + match[0].length;
  }
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  return parts.length > 0 ? parts : text;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="text-sm leading-[1.7]" style={{ color: '#3d3935' }}>
      {lines.map((line, idx) => {
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-base font-semibold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(4))}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-lg font-bold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(3))}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-xl font-bold mt-3 mb-1.5" style={{ color: '#3d3935' }}>{formatInline(line.substring(2))}</h1>;
        }
        if (line.startsWith('---') || line.startsWith('***')) {
          return <hr key={idx} className="my-3" style={{ borderColor: '#f0ede8' }} />;
        }
        if (line.match(/^[-*]\s/)) {
          return <li key={idx} className="ml-4 list-disc" style={{ color: '#3d3935' }}>{formatInline(line.substring(2))}</li>;
        }
        if (line.match(/^\d+\.\s/)) {
          return <li key={idx} className="ml-4 list-decimal" style={{ color: '#3d3935' }}>{formatInline(line.substring(line.indexOf('.') + 2))}</li>;
        }
        if (line.trim() === '') {
          return <div key={idx} className="h-2" />;
        }
        return <p key={idx}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left py-2.5 text-sm font-medium transition-colors text-base-content/60 hover:text-base-content/80">
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        {title}
      </button>
      {open && children}
    </div>
  );
}

/** Keys to skip in the flexible metadata display (internal/navigation keys) */
const SKIP_DISPLAY_KEYS = new Set(['products', 'talpos', 'gaminiai', 'items', 'procurement_package', 'position']);

/** Keys excluded from the talpos key-value panel (shown elsewhere or internal) */
const SKIP_TALPOS_KV_KEYS = new Set(['id', 'embedding', 'description', 'similar_talpos', 'kaina', 'quantity', 'created_at', 'project', 'json']);

/** Keys that are shown as the product title — not in the grid */
const TITLE_KEYS = new Set(['pavadinimas', 'eilės_nr', 'pozicija']);

// ---------------------------------------------------------------------------
// Tank deduplication helpers
// ---------------------------------------------------------------------------

/** Keys excluded from metadata fingerprint when comparing tanks for deduplication */
const DEDUP_EXCLUDE_KEYS = new Set([
  ...SKIP_DISPLAY_KEYS,
  ...TITLE_KEYS,
  'Pastabos', 'pastabos',
  // Price fields must not affect grouping — entering a price for one tank
  // should not split it away from its identical siblings
  'kaina', 'Kaina', 'kaina_ai', 'kaina_ai_reasoning',
]);

/** Recursively sort object keys so JSON.stringify produces a stable result */
function sortedJson(value: any): any {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortedJson(v)])
    );
  }
  return value;
}

/** Create a canonical string fingerprint of a tank's spec fields (ignoring title/internal fields) */
function getTankFingerprint(tank: Record<string, any>): string {
  const comparable: Record<string, any> = {};
  for (const [k, v] of Object.entries(tank)) {
    if (k.startsWith('_')) continue;
    if (k.startsWith('projekto_kontekstas_')) continue;
    if (DEDUP_EXCLUDE_KEYS.has(k)) continue;
    comparable[k] = v;
  }
  return JSON.stringify(sortedJson(comparable));
}

interface TankGroup {
  /** Representative tank object (first occurrence) */
  tank: Record<string, any>;
  /** How many tanks share the same spec fingerprint */
  quantity: number;
  /** Original indices in the products array */
  originalIndices: number[];
}

/** Group identical tanks (same spec fingerprint) into TankGroups for display */
function deduplicateProducts(products: Record<string, any>[]): TankGroup[] {
  const groups: TankGroup[] = [];
  const fpToGroupIdx = new Map<string, number>();
  for (let i = 0; i < products.length; i++) {
    const fp = getTankFingerprint(products[i]);
    const existing = fpToGroupIdx.get(fp);
    if (existing !== undefined) {
      groups[existing].quantity++;
      groups[existing].originalIndices.push(i);
    } else {
      fpToGroupIdx.set(fp, groups.length);
      groups.push({ tank: products[i], quantity: 1, originalIndices: [i] });
    }
  }
  return groups;
}

/** Format a metadata key into a human-readable label */
function formatMetaLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Check if a value is "nenurodyta" or empty — hide such fields to keep the display clean */
function isEmptyValue(v: any): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'nenurodyta') return true;
  return false;
}

/** Check if an object has only "nenurodyta" or empty values */
function isAllEmpty(obj: Record<string, any>): boolean {
  return Object.values(obj).every(v => {
    if (typeof v === 'object' && v !== null) return isAllEmpty(v);
    return isEmptyValue(v);
  });
}

function InfoField({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return <div />;
  return (
    <div>
      <dt className="text-xs text-base-content/40">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 text-base-content">{value}</dd>
    </div>
  );
}

/** Render a nested object as a mini key-value list */
function NestedObjectField({ label, obj }: { label: string; obj: Record<string, any> }) {
  const entries = Object.entries(obj).filter(([, v]) => !isEmptyValue(v));
  if (entries.length === 0) return null;
  return (
    <div className="col-span-3">
      <dt className="text-xs text-base-content/40 mb-1">{label}</dt>
      <dd className="text-sm mt-0.5 rounded-lg p-3 bg-base-content/[0.02] border border-base-content/5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-xs text-base-content/40 shrink-0">{formatMetaLabel(k)}:</span>
              <span className="text-xs text-base-content font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

function ChatBubble({ message, side, readOnly, onEdit, onDelete }: {
  message: AtsakymasMessage;
  side: 'left' | 'right';
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5 group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Action buttons — shown to the left/right of the bubble on hover */}
      {!readOnly && hovered && side === 'right' && (
        <div className="flex items-center gap-1 mr-1.5 shrink-0">
          <button onClick={onEdit} className="p-1 rounded-lg hover:bg-base-content/5 transition-colors" title="Redaguoti">
            <Pencil className="w-3 h-3 text-base-content/30" />
          </button>
          <button onClick={onDelete} className="p-1 rounded-lg hover:bg-red-50 transition-colors" title="Ištrinti">
            <Trash2 className="w-3 h-3 text-red-400/60" />
          </button>
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-base-content'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/60' : 'text-base-content/40'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}{message.date}
          </p>
        )}
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap overflow-y-auto" style={{ maxHeight: 'calc(1.625rem * 4)' }}>
          {message.text}
        </div>
      </div>
      {/* Action buttons for left-side bubbles */}
      {!readOnly && hovered && side === 'left' && (
        <div className="flex items-center gap-1 ml-1.5 shrink-0">
          <button onClick={onEdit} className="p-1 rounded-lg hover:bg-base-content/5 transition-colors" title="Redaguoti">
            <Pencil className="w-3 h-3 text-base-content/30" />
          </button>
          <button onClick={onDelete} className="p-1 rounded-lg hover:bg-red-50 transition-colors" title="Ištrinti">
            <Trash2 className="w-3 h-3 text-red-400/60" />
          </button>
        </div>
      )}
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const adjust = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    const max = 22 * 4;
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, []);
  useEffect(() => { adjust(); }, [value, adjust]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={className} style={{ resize: 'none', minHeight: '22px' }} rows={1} />;
}

function NewMessageBubble({ side, onSave, onCancel }: { side: 'left' | 'right'; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div className={`max-w-[80%] w-72 rounded-3xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-base-content'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        <AutoTextarea value={text} onChange={setText} placeholder={side === 'right' ? 'Komandos žinutė...' : 'Gavėjo žinutė...'} className={`w-full bg-transparent border-none outline-none text-[15px] leading-relaxed placeholder:opacity-50 ${side === 'right' ? 'text-white placeholder:text-white/40' : 'text-base-content placeholder:text-base-content/30'}`} />
        <div className={`flex gap-2 justify-end mt-1.5 pt-1.5 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-base-content/10'}`}>
          <button onClick={onCancel} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${side === 'right' ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5'}`}>Atšaukti</button>
          <button onClick={() => { const t = text.trim(); if (t) onSave(t); }} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${side === 'right' ? 'text-white bg-white/20 hover:bg-white/30' : 'text-primary bg-primary/10 hover:bg-primary/20'}`}>Išsaugoti</button>
        </div>
      </div>
    </div>
  );
}

function EditMessageBubble({ message, side, onSave, onCancel }: { message: AtsakymasMessage; side: 'left' | 'right'; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(message.text);
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-2.5`}>
      <div className={`max-w-[80%] w-72 rounded-3xl px-4 py-2.5 ${side === 'right' ? 'text-white' : 'text-base-content'}`}
        style={side === 'right'
          ? { background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
          : { background: '#f8f8f9', border: '1px solid #e5e5e6' }
        }
      >
        {(message.from || message.date) && (
          <p className={`text-xs mb-1 ${side === 'right' ? 'text-white/60' : 'text-base-content/40'}`}>
            {message.from && <span className="font-medium">{message.from}</span>}
            {message.from && message.date && ' · '}{message.date}
          </p>
        )}
        <AutoTextarea value={text} onChange={setText} placeholder="Žinutė..." className={`w-full bg-transparent border-none outline-none text-[15px] leading-relaxed placeholder:opacity-50 ${side === 'right' ? 'text-white placeholder:text-white/40' : 'text-base-content placeholder:text-base-content/30'}`} />
        <div className={`flex gap-2 justify-end mt-1.5 pt-1.5 ${side === 'right' ? 'border-t border-white/20' : 'border-t border-base-content/10'}`}>
          <button onClick={onCancel} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${side === 'right' ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5'}`}>Atšaukti</button>
          <button onClick={() => { const t = text.trim(); if (t) onSave(t); }} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${side === 'right' ? 'text-white bg-white/20 hover:bg-white/30' : 'text-primary bg-primary/10 hover:bg-primary/20'}`}>Išsaugoti</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Bendra helpers (kept for TabDerva and TabTalpos)
// ---------------------------------------------------------------------------

/** Get a display title for a product from its metadata */
function getProductTitle(meta: Record<string, any>): string {
  return meta.pavadinimas || meta.procurement_package || '';
}

/** Detect whether a product uses the old flat key format (orientacija, DN, etc.) */
function isOldFormat(meta: Record<string, any>): boolean {
  return ALL_MAIN_KEYS.has('orientacija') && ('orientacija' in meta || 'DN' in meta || 'talpa_tipas' in meta || 'chemija' in meta || 'derva' in meta);
}

// ---------------------------------------------------------------------------
// Tab: Talpos (replaces Bendra) — data from the 'talpos' Directus table
// ---------------------------------------------------------------------------

type TalposSubTab = 'parametrai' | 'derva';

function TabTalpos({
  record, products, readOnly, onRecordUpdated, initialTalposId,
}: {
  record: NestandartiniaiRecord;
  products: Record<string, any>[];
  readOnly?: boolean;
  onRecordUpdated?: (r: NestandartiniaiRecord) => void;
  initialTalposId?: string;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [subTab, setSubTab] = useState<TalposSubTab>('parametrai');

  // Parse talpos UUIDs from the record
  const talposIds = useMemo(() => {
    const raw = (record as any).talpos;
    if (!raw || typeof raw !== 'string') return [] as string[];
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }, [(record as any).talpos]);

  // Fetch talpos rows, ordered to match talposIds
  const [talposRows, setTalposRows] = useState<any[]>([]);
  const [loadingTalpos, setLoadingTalpos] = useState(false);
  const talposIdsKey = talposIds.join(',');
  useEffect(() => {
    if (talposIds.length === 0) { setTalposRows([]); return; }
    setLoadingTalpos(true);
    fetchTalposByIds(talposIds)
      .then(rows => {
        const sorted = talposIds
          .map(id => rows.find((r: any) => String(r.id) === String(id)) ?? null)
          .filter(Boolean);
        setTalposRows(sorted);
        if (initialTalposId) {
          const i = talposIds.findIndex(id => id === initialTalposId);
          if (i >= 0) setCurrentIdx(i);
        }
      })
      .finally(() => setLoadingTalpos(false));
  }, [talposIdsKey]);

  const navCount = talposIds.length > 0 ? talposIds.length : products.length;
  const idx = Math.min(currentIdx, Math.max(0, navCount - 1));
  const currentTalposRow = talposRows[idx] ?? null;
  const currentTalposId = talposIds[idx] ?? null;

  // Kaina editing (writes to talpos table)
  const [kainaEditing, setKainaEditing] = useState(false);
  const [kainaInput, setKainaInput] = useState('');
  const [kainaSaving, setKainaSaving] = useState(false);
  // localKainaOverrides stores per-idx overrides after a successful save
  const [localKainaOverrides, setLocalKainaOverrides] = useState<Record<number, number | null>>({});

  const currentKaina: number | null = localKainaOverrides[idx] !== undefined
    ? localKainaOverrides[idx]
    : (currentTalposRow?.kaina != null ? Number(currentTalposRow.kaina) : null);

  const saveKaina = async () => {
    if (!currentTalposId) return;
    const parsed = kainaInput.trim() === '' ? null : parseFloat(kainaInput.replace(',', '.'));
    if (kainaInput.trim() !== '' && (parsed === null || isNaN(parsed))) return;
    setKainaSaving(true);
    try {
      await updateTalposField(currentTalposId, 'kaina', parsed);
      setLocalKainaOverrides(prev => ({ ...prev, [idx]: parsed }));
      setKainaEditing(false);
    } catch (e) {
      console.error('Error saving talpos kaina:', e);
    } finally {
      setKainaSaving(false);
    }
  };

  // Similar tanks state (per-idx)
  const [similarSearching, setSimilarSearching] = useState<Record<number, boolean>>({});
  const [localSimilarResults, setLocalSimilarResults] = useState<Record<number, any[] | null>>({});
  const [similarError, setSimilarError] = useState<Record<number, string | null>>({});

  // Price estimation state (per-idx)
  const [priceEstimating, setPriceEstimating] = useState<Record<number, boolean>>({});
  const [priceEstimateError, setPriceEstimateError] = useState<Record<number, string | null>>({});
  const [localKainaAi, setLocalKainaAi] = useState<Record<number, number | null>>({});

  // KV panel editing state
  const [editingKvKey, setEditingKvKey] = useState<string | null>(null);
  const [editingKvValue, setEditingKvValue] = useState('');
  const [savingKvKey, setSavingKvKey] = useState<string | null>(null);
  const [showAddKv, setShowAddKv] = useState(false);
  const [newKvKey, setNewKvKey] = useState('');
  const [newKvValue, setNewKvValue] = useState('');
  const [addingKv, setAddingKv] = useState(false);

  // Persisted results from DB (recomputed when current row changes)
  const persistedSimilar: any[] | null = useMemo(() => {
    if (!currentTalposRow?.similar_talpos) return null;
    try {
      const parsed = typeof currentTalposRow.similar_talpos === 'string'
        ? JSON.parse(currentTalposRow.similar_talpos)
        : currentTalposRow.similar_talpos;
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }, [currentTalposRow?.similar_talpos, idx]);

  const displayedSimilar: any[] | null = localSimilarResults[idx] !== undefined
    ? localSimilarResults[idx]
    : persistedSimilar;

  // Structured entries for the parametrai panel — scalar values stay flat,
  // object values (or strings that parse to objects) are expanded as nested groups.
  // fromJson=true means the entry lives inside the `json` column object, not a direct column.
  type KvEntry =
    | { type: 'scalar'; key: string; value: string; fromJson?: boolean }
    | { type: 'nested'; key: string; obj: Record<string, any>; fromJson?: boolean };

  const kvEntries = useMemo((): KvEntry[] => {
    if (!currentTalposRow) return [];
    const result: KvEntry[] = [];

    // First: flatten the contents of the `json` column directly into the list
    const jsonColObj = tryParseJsonObject(currentTalposRow.json);
    if (jsonColObj) {
      for (const [k, v] of Object.entries(jsonColObj)) {
        const nested = tryParseJsonObject(v);
        if (nested) {
          result.push({ type: 'nested', key: k, obj: nested, fromJson: true });
        } else {
          result.push({ type: 'scalar', key: k, value: v === null || v === undefined ? '' : String(v), fromJson: true });
        }
      }
    }

    // Then: add other non-skipped direct columns
    for (const [k, v] of Object.entries(currentTalposRow)) {
      if (SKIP_TALPOS_KV_KEYS.has(k)) continue;
      const obj = tryParseJsonObject(v);
      if (obj) {
        result.push({ type: 'nested', key: k, obj });
      } else {
        result.push({ type: 'scalar', key: k, value: v === null || v === undefined ? '' : String(v) });
      }
    }
    return result;
  }, [currentTalposRow, idx]);

  // Reset KV edit state when the active tank changes
  useEffect(() => {
    setEditingKvKey(null);
    setShowAddKv(false);
  }, [idx]);

  const saveKvField = async (key: string, value: string, fromJson?: boolean) => {
    if (!currentTalposId) return;
    setSavingKvKey(key);
    try {
      if (fromJson) {
        const currentJsonObj = tryParseJsonObject(currentTalposRow?.json) || {};
        const newJsonObj = { ...currentJsonObj, [key]: value };
        await updateTalposField(currentTalposId, 'json', newJsonObj);
        setTalposRows(prev => prev.map(r =>
          String(r.id) === String(currentTalposId) ? { ...r, json: newJsonObj } : r
        ));
      } else {
        await updateTalposField(currentTalposId, key, value);
        setTalposRows(prev => prev.map(r =>
          String(r.id) === String(currentTalposId) ? { ...r, [key]: value } : r
        ));
      }
      setEditingKvKey(null);
    } catch (e) {
      console.error('Error saving talpos field:', e);
    } finally {
      setSavingKvKey(null);
    }
  };

  const saveNestedKvField = async (parentKey: string, childKey: string, childValue: string, currentObj: Record<string, any>, fromJson?: boolean) => {
    if (!currentTalposId) return;
    const editKey = `${parentKey}::${childKey}`;
    setSavingKvKey(editKey);
    try {
      const newObj = { ...currentObj, [childKey]: childValue };
      if (fromJson) {
        const currentJsonObj = tryParseJsonObject(currentTalposRow?.json) || {};
        const newJsonObj = { ...currentJsonObj, [parentKey]: newObj };
        await updateTalposField(currentTalposId, 'json', newJsonObj);
        setTalposRows(prev => prev.map(r =>
          String(r.id) === String(currentTalposId) ? { ...r, json: newJsonObj } : r
        ));
      } else {
        await updateTalposField(currentTalposId, parentKey, newObj);
        setTalposRows(prev => prev.map(r =>
          String(r.id) === String(currentTalposId) ? { ...r, [parentKey]: newObj } : r
        ));
      }
      setEditingKvKey(null);
    } catch (e) {
      console.error('Error saving nested talpos field:', e);
    } finally {
      setSavingKvKey(null);
    }
  };

  const addKvPair = async () => {
    const k = newKvKey.trim();
    if (!currentTalposId || !k) return;
    setAddingKv(true);
    try {
      // New pairs always go into the `json` column object
      const currentJsonObj = tryParseJsonObject(currentTalposRow?.json) || {};
      const newJsonObj = { ...currentJsonObj, [k]: newKvValue };
      await updateTalposField(currentTalposId, 'json', newJsonObj);
      setTalposRows(prev => prev.map(r =>
        String(r.id) === String(currentTalposId) ? { ...r, json: newJsonObj } : r
      ));
      setNewKvKey('');
      setNewKvValue('');
      setShowAddKv(false);
    } catch (e) {
      console.error('Error adding talpos field:', e);
    } finally {
      setAddingKv(false);
    }
  };

  const findSimilar = async () => {
    if (!currentTalposId || !currentTalposRow) return;
    setSimilarSearching(prev => ({ ...prev, [idx]: true }));
    setSimilarError(prev => ({ ...prev, [idx]: null }));
    try {
      const webhookUrl = await getWebhookUrl('n8n_similar_tanks');
      const payload = Object.fromEntries(
        Object.entries(currentTalposRow).filter(([k]) => k !== 'embedding')
      );
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Webhook returns 200 OK — results are written by n8n to talpos.similar_talpos.
      // Re-fetch the row from Directus to get the updated column.
      const updated = await fetchTalposByIds([currentTalposId]);
      const updatedRow = updated[0] ?? null;
      let results: any[] = [];
      if (updatedRow?.similar_talpos) {
        try {
          const parsed = typeof updatedRow.similar_talpos === 'string'
            ? JSON.parse(updatedRow.similar_talpos)
            : updatedRow.similar_talpos;
          results = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
        } catch { /* ignore parse errors */ }
      }
      // Patch local talposRows so persisted display updates without a full reload
      setTalposRows(prev => prev.map(r => (String(r.id) === String(currentTalposId) ? { ...r, similar_talpos: updatedRow?.similar_talpos } : r)));
      setLocalSimilarResults(prev => ({ ...prev, [idx]: results }));
    } catch (e: any) {
      setSimilarError(prev => ({ ...prev, [idx]: e?.message || 'Klaida' }));
    } finally {
      setSimilarSearching(prev => ({ ...prev, [idx]: false }));
    }
  };

  const estimatePrice = async () => {
    if (!currentTalposId || !currentTalposRow) return;
    setPriceEstimating(prev => ({ ...prev, [idx]: true }));
    setPriceEstimateError(prev => ({ ...prev, [idx]: null }));
    try {
      const webhookUrl = await getWebhookUrl('n8n_price_estimation');
      if (!webhookUrl) throw new Error('Webhook "n8n_price_estimation" nesukonfigūruotas');
      const payload = Object.fromEntries(
        Object.entries(currentTalposRow).filter(([k]) => k !== 'embedding')
      );
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.id,
          project_name: record.project_name,
          description: record.description,
          klientas: record.klientas,
          talpos_id: currentTalposId,
          product_metadata: payload,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const respData = await resp.json().catch(() => null);
      const rawPrice = respData?.estimated_price ?? respData?.price ?? respData?.kaina ?? respData?.kaina_ai ?? respData?.output ?? respData?.result ?? respData?.text ?? null;
      const estimatedPrice = rawPrice != null ? (typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^\d.,]/g, '').replace(',', '.')) : Number(rawPrice)) : null;
      if (estimatedPrice != null && !isNaN(estimatedPrice)) {
        const currentJsonObj = tryParseJsonObject(currentTalposRow?.json) || {};
        const newJsonObj = { ...currentJsonObj, kaina_ai: estimatedPrice };
        await updateTalposField(currentTalposId, 'json', newJsonObj);
        setTalposRows(prev => prev.map(r =>
          String(r.id) === String(currentTalposId) ? { ...r, json: newJsonObj } : r
        ));
        setLocalKainaAi(prev => ({ ...prev, [idx]: estimatedPrice }));
      } else {
        throw new Error('Negauta kaina iš atsakymo');
      }
    } catch (e: any) {
      setPriceEstimateError(prev => ({ ...prev, [idx]: e?.message || 'Klaida' }));
    } finally {
      setPriceEstimating(prev => ({ ...prev, [idx]: false }));
    }
  };

  const goPrev = () => setCurrentIdx(i => (i - 1 + navCount) % navCount);
  const goNext = () => setCurrentIdx(i => (i + 1) % navCount);

  const getNavLabel = (i: number): string => {
    if (talposIds.length > 0) {
      const row = talposRows[i];
      const name = row?.pavadinimas || row?.name || row?.title || `Talpa ${i + 1}`;
      const qty = row?.quantity && Number(row.quantity) > 1 ? ` ×${row.quantity}` : '';
      return name + qty;
    }
    return getProductTitle(products[i]) || `Talpa ${i + 1}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Talpos selection bar */}
      {navCount > 1 && (
        <div className="flex items-center gap-1 mb-4 shrink-0">
          <button onClick={goPrev} className="p-1 rounded-md hover:bg-base-content/8" title="Ankstesnė talpa">
            <ChevronLeft className="w-4 h-4 text-base-content/40" />
          </button>
          <select
            value={idx}
            onChange={e => { setCurrentIdx(Number(e.target.value)); }}
            className="flex-1 min-w-0 text-xs font-medium bg-base-content/[0.03] text-base-content/80 border border-base-content/8 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/30 cursor-pointer truncate"
          >
            {Array.from({ length: navCount }, (_, i) => (
              <option key={i} value={i}>{i + 1}. {getNavLabel(i)}</option>
            ))}
          </select>
          <button onClick={goNext} className="p-1 rounded-md hover:bg-base-content/8" title="Kita talpa">
            <ChevronRight className="w-4 h-4 text-base-content/40" />
          </button>
        </div>
      )}

      {/* Parametrai / Derva toggle */}
      <div className="flex justify-center mb-2 shrink-0">
        <div className="inline-flex rounded-[10px] p-0.5" style={{ background: 'rgba(0,0,0,0.06)' }}>
          {(['parametrai', 'derva'] as TalposSubTab[]).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all ${subTab === t ? 'text-base-content' : 'text-base-content/40 hover:text-base-content/60'}`}
              style={subTab === t ? { background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' } : undefined}
            >
              {t === 'parametrai' ? 'Parametrai' : 'Derva'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Parametrai sub-tab ── */}
      {subTab === 'parametrai' && (
        <div className="flex-1 flex flex-col min-h-0">
          {loadingTalpos && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}

          {!loadingTalpos && talposIds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
              <p className="text-sm font-medium text-base-content/60">Nėra susietų talpų</p>
              <p className="text-xs text-base-content/30 mt-1">Pridėkite UUID reikšmes į laukelį „talpos"</p>
            </div>
          )}

          {!loadingTalpos && talposIds.length > 0 && !currentTalposRow && (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
              <p className="text-sm font-medium text-base-content/60">Talpa nerasta</p>
              <p className="text-xs text-base-content/30 mt-1">UUID: {currentTalposId}</p>
            </div>
          )}

          {!loadingTalpos && currentTalposRow && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Two-column: left = KV fields, right = description */}
              <div className="flex gap-4 flex-1 min-h-0">
                {/* Left column: fixed width, editable key-value list */}
                <div className="w-[260px] shrink-0 flex flex-col min-h-0">
                  {/* Parametrai label + quantity badge + kaina on the same row */}
                  <div className="flex items-center justify-between mb-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">Parametrai</p>
                      {currentTalposRow?.quantity != null && Number(currentTalposRow.quantity) >= 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {currentTalposRow.quantity}vnt.
                        </span>
                      )}
                    </div>
                    {kainaEditing ? (
                      <div className="flex items-center gap-1 bg-base-200/60 rounded-full border border-base-content/10 pl-2 pr-1 py-0.5">
                        <Euro className="w-3 h-3 text-base-content/40 shrink-0" />
                        <input
                          type="text"
                          value={kainaInput}
                          onChange={e => setKainaInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveKaina();
                            if (e.key === 'Escape') setKainaEditing(false);
                          }}
                          className="w-16 text-xs bg-transparent outline-none text-base-content placeholder:text-base-content/30"
                          placeholder="0.00"
                          autoFocus
                        />
                        <button onClick={saveKaina} disabled={kainaSaving} className="p-1 rounded-full hover:bg-base-content/10 transition-colors">
                          {kainaSaving ? <Loader2 className="w-3 h-3 animate-spin text-base-content/40" /> : <CheckCircle2 className="w-3 h-3 text-success" />}
                        </button>
                        <button onClick={() => setKainaEditing(false)} className="p-1 rounded-full hover:bg-base-content/10 transition-colors">
                          <X className="w-3 h-3 text-base-content/40" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (!readOnly) {
                            setKainaInput(currentKaina != null ? String(currentKaina) : '');
                            setKainaEditing(true);
                          }
                        }}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                          currentKaina != null
                            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15'
                            : 'bg-base-content/5 text-base-content/35 hover:bg-base-content/10 border border-dashed border-base-content/15'
                        } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                        title={readOnly ? 'Kaina' : 'Redaguoti kainą'}
                      >
                        <Euro className="w-3 h-3" />
                        {currentKaina != null ? `${Number(currentKaina).toLocaleString('lt-LT')} €` : 'Kaina'}
                      </button>
                    )}
                  </div>
                  {/* Scrollable KV list */}
                  <div className="flex-1 overflow-y-auto rounded-xl min-h-0">
                    <div className="py-0.5 flex flex-col gap-0.5">
                      {kvEntries.map(entry => {
                        if (entry.type === 'nested') {
                          return (
                            <div key={entry.key}>
                              <div className="px-2 pt-2 pb-0.5">
                                <span className="text-[11px] font-semibold text-base-content/40 uppercase tracking-wide">
                                  {formatMetaLabel(entry.key)}
                                </span>
                              </div>
                              {Object.entries(entry.obj).map(([ck, cv]) => {
                                const editKey = `${entry.key}::${ck}`;
                                const childObj = tryParseJsonObject(cv);
                                const displayVal = cv === null || cv === undefined ? '' : childObj ? JSON.stringify(childObj) : String(cv);
                                return (
                                  <div key={editKey} className="group flex items-center gap-2 pl-4 pr-2 py-1 rounded-lg hover:bg-black/[0.04] transition-colors">
                                    <span className="text-[11px] text-base-content/40 shrink-0 font-medium truncate" style={{ width: '84px' }} title={formatMetaLabel(ck)}>
                                      {formatMetaLabel(ck)}
                                    </span>
                                    {editingKvKey === editKey ? (
                                      <div className="flex items-center gap-1 flex-1 min-w-0">
                                        <input
                                          autoFocus
                                          type="text"
                                          value={editingKvValue}
                                          onChange={e => setEditingKvValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') saveNestedKvField(entry.key, ck, editingKvValue, entry.obj, entry.fromJson);
                                            if (e.key === 'Escape') setEditingKvKey(null);
                                          }}
                                          className="flex-1 min-w-0 text-[12px] bg-white rounded px-1.5 py-0.5 border border-primary/30 outline-none text-base-content"
                                        />
                                        <button onClick={() => saveNestedKvField(entry.key, ck, editingKvValue, entry.obj, entry.fromJson)} disabled={savingKvKey === editKey} className="p-0.5 rounded hover:bg-base-content/10 shrink-0">
                                          {savingKvKey === editKey ? <Loader2 className="w-3 h-3 animate-spin text-base-content/40" /> : <CheckCircle2 className="w-3 h-3 text-success" />}
                                        </button>
                                        <button onClick={() => setEditingKvKey(null)} className="p-0.5 rounded hover:bg-base-content/10 shrink-0">
                                          <X className="w-3 h-3 text-base-content/40" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span
                                        onClick={() => { if (!readOnly) { setEditingKvKey(editKey); setEditingKvValue(displayVal); } }}
                                        className={`text-[12px] text-base-content font-medium flex-1 min-w-0 truncate text-right ${!readOnly ? 'cursor-pointer hover:text-primary' : ''}`}
                                        title={displayVal || undefined}
                                      >
                                        {displayVal || <span className="text-base-content/25">—</span>}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        // scalar entry
                        const { key: k, value: v } = entry;
                        return (
                          <div key={k} className="group flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-black/[0.04] transition-colors">
                            <span className="text-[11px] text-base-content/40 shrink-0 font-medium truncate" style={{ width: '88px' }} title={formatMetaLabel(k)}>
                              {formatMetaLabel(k)}
                            </span>
                            {editingKvKey === k ? (
                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingKvValue}
                                  onChange={e => setEditingKvValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveKvField(k, editingKvValue, entry.fromJson);
                                    if (e.key === 'Escape') setEditingKvKey(null);
                                  }}
                                  className="flex-1 min-w-0 text-[12px] bg-white rounded px-1.5 py-0.5 border border-primary/30 outline-none text-base-content"
                                />
                                <button onClick={() => saveKvField(k, editingKvValue, entry.fromJson)} disabled={savingKvKey === k} className="p-0.5 rounded hover:bg-base-content/10 shrink-0">
                                  {savingKvKey === k ? <Loader2 className="w-3 h-3 animate-spin text-base-content/40" /> : <CheckCircle2 className="w-3 h-3 text-success" />}
                                </button>
                                <button onClick={() => setEditingKvKey(null)} className="p-0.5 rounded hover:bg-base-content/10 shrink-0">
                                  <X className="w-3 h-3 text-base-content/40" />
                                </button>
                              </div>
                            ) : (
                              <span
                                onClick={() => { if (!readOnly) { setEditingKvKey(k); setEditingKvValue(v); } }}
                                className={`text-[12px] text-base-content font-medium flex-1 min-w-0 truncate text-right ${!readOnly ? 'cursor-pointer hover:text-primary' : ''}`}
                                title={v || undefined}
                              >
                                {v || <span className="text-base-content/25">—</span>}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Add new key-value pair */}
                      {!readOnly && (
                        showAddKv ? (
                          <div className="flex flex-col gap-1 mt-1 px-2 py-1.5 rounded-lg border border-base-content/8" style={{ background: 'rgba(255,255,255,0.6)' }}>
                            <input
                              autoFocus
                              type="text"
                              placeholder="Lauko pavadinimas"
                              value={newKvKey}
                              onChange={e => setNewKvKey(e.target.value)}
                              className="w-full text-[12px] bg-white rounded px-1.5 py-0.5 border border-base-content/10 outline-none focus:border-primary/30 text-base-content placeholder:text-base-content/30"
                            />
                            <input
                              type="text"
                              placeholder="Reikšmė"
                              value={newKvValue}
                              onChange={e => setNewKvValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') addKvPair();
                                if (e.key === 'Escape') setShowAddKv(false);
                              }}
                              className="w-full text-[12px] bg-white rounded px-1.5 py-0.5 border border-base-content/10 outline-none focus:border-primary/30 text-base-content placeholder:text-base-content/30"
                            />
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => { setShowAddKv(false); setNewKvKey(''); setNewKvValue(''); }}
                                className="text-[10px] px-2 py-0.5 rounded text-base-content/40 hover:bg-base-content/5"
                              >
                                Atšaukti
                              </button>
                              <button
                                onClick={addKvPair}
                                disabled={!newKvKey.trim() || addingKv}
                                className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-40 font-medium"
                              >
                                {addingKv ? 'Saugoma...' : 'Pridėti'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowAddKv(true)}
                            className="flex items-center gap-1 mt-0.5 px-2 py-1 rounded-lg text-[11px] text-base-content/35 hover:text-primary hover:bg-primary/5 transition-colors w-full"
                          >
                            <Plus className="w-3 h-3" />
                            Pridėti lauką
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Right column: description + similar tanks */}
                <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
                  <div className="shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40 mb-1.5">Aprašymas</p>
                    {currentTalposRow?.description ? (
                      <div
                        className="overflow-auto rounded-xl p-3 border border-base-content/8 bg-base-content/[0.02]"
                        style={{ maxHeight: '220px' }}
                      >
                        <MarkdownText text={String(currentTalposRow.description)} />
                      </div>
                    ) : (
                      <div className="rounded-xl p-3 border border-dashed border-base-content/10 bg-base-content/[0.02]">
                        <p className="text-xs text-base-content/30 text-center">Nėra aprašymo</p>
                      </div>
                    )}
                  </div>

                  {/* Similar tanks */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">Panašios talpos</p>
                        {(() => {
                          const kainaAi = localKainaAi[idx] !== undefined
                            ? localKainaAi[idx]
                            : (() => { const v = tryParseJsonObject(currentTalposRow?.json)?.kaina_ai; return v != null ? Number(v) : null; })();
                          return kainaAi != null && !isNaN(kainaAi) ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                              style={{ background: 'rgba(175,82,222,0.08)', color: '#AF52DE', border: '0.5px solid rgba(175,82,222,0.18)' }}
                              title="AI preliminari kaina"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              {kainaAi.toLocaleString('lt-LT')} €
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={estimatePrice}
                          disabled={!!priceEstimating[idx]}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: 'rgba(175,82,222,0.08)', color: '#AF52DE', border: '0.5px solid rgba(175,82,222,0.18)' }}
                          title="AI kainos įvertinimas"
                        >
                          {priceEstimating[idx] ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Skaičiuojama...</>
                          ) : (
                            <><Sparkles className="w-3 h-3" /> Kainos parinkimas</>
                          )}
                        </button>
                        <button
                          onClick={findSimilar}
                          disabled={!!similarSearching[idx]}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {similarSearching[idx] ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Ieškoma...</>
                          ) : (
                            <><RefreshCw className="w-3.5 h-3.5" /> Rasti Panašias</>
                          )}
                        </button>
                      </div>
                    </div>

                    {priceEstimateError[idx] && (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-error/10 text-error text-xs mb-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{priceEstimateError[idx]}</span>
                      </div>
                    )}

                    {similarError[idx] && (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-error/10 text-error text-xs mb-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{similarError[idx]}</span>
                      </div>
                    )}

                    {displayedSimilar && displayedSimilar.length > 0 ? (
                      <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                        {displayedSimilar.map((item: any, i: number) => {
                          const score = item.similarity_score ?? item.similarity ?? null;
                          const displayName = item.pavadinimas || item.project_name || null;
                          const projectId = item.project || item.project_id || null;
                          const talposUuid = item.id || null;
                          const kaina = item.kaina != null ? Number(item.kaina) : null;
                          const href = projectId && talposUuid
                            ? `/paklausimas/${projectId}?talpa=${talposUuid}`
                            : projectId ? `/paklausimas/${projectId}` : null;
                          const inner = (
                            <div className="flex items-center gap-2 px-2 py-1.5">
                              {score !== null && (
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary tabular-nums">
                                  {Math.round(Number(score) * 100)}%
                                </span>
                              )}
                              <p className="flex-1 text-[11px] font-medium text-base-content/80 truncate min-w-0">
                                {displayName || `Talpa ${i + 1}`}
                              </p>
                              {kaina !== null && !isNaN(kaina) && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                                  <Euro className="w-2.5 h-2.5" />{kaina.toLocaleString('lt-LT')}
                                </span>
                              )}
                              {href && <ExternalLink className="w-3 h-3 shrink-0 text-base-content/25" />}
                            </div>
                          );
                          return href ? (
                            <a
                              key={i}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg border border-base-content/8 bg-base-content/[0.02] hover:bg-primary/5 hover:border-primary/20 transition-colors"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div key={i} className="rounded-lg border border-base-content/8 bg-base-content/[0.02]">
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    ) : !similarSearching[idx] && (
                      <div className="rounded-xl p-3 border border-dashed border-base-content/10 bg-base-content/[0.02]">
                        <p className="text-xs text-base-content/30 text-center">Nėra rezultatų</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Derva sub-tab ── */}
      {subTab === 'derva' && (
        <TabDerva
          record={record}
          products={products}
          readOnly={readOnly}
          onRecordUpdated={onRecordUpdated}
          externalIdx={idx}
          hideNavigator
          aiFirst
          currentTalposId={currentTalposId}
          currentTalposJson={currentTalposRow?.json}
          onTalposJsonSaved={(id, newJson) => {
            setTalposRows(prev => prev.map(r => String(r.id) === id ? { ...r, json: newJson } : r));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Old TabBendra stub (now replaced by TabTalpos above)
// ---------------------------------------------------------------------------

function TabBendra({ record, products, readOnly, onRecordUpdated, kainaMap, onKainaChange, aiEstimatesMap, aiReasoningMap }: { record: NestandartiniaiRecord; products: Record<string, any>[]; readOnly?: boolean; onRecordUpdated?: (r: NestandartiniaiRecord) => void; kainaMap: Record<string, number>; onKainaChange: (tankIdx: number, value: number | null) => void; aiEstimatesMap?: Record<number, number>; aiReasoningMap?: Record<number, string> }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  // confirmDeleteIdx stores group index (not product index)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldVal, setNewFieldVal] = useState('');

  // Per-tank price editing state
  const [tankKainaEditing, setTankKainaEditing] = useState(false);
  const [tankKainaInput, setTankKainaInput] = useState('');
  const [tankKainaSaving, setTankKainaSaving] = useState(false);

  // Deduplicate identical tanks for display
  const groups = useMemo(() => deduplicateProducts(products), [products]);
  const hasMultiple = groups.length > 1;

  // Clamp group index if groups change
  const groupIdx = Math.min(currentIdx, groups.length - 1);
  const currentGroup = groups[groupIdx] ?? { tank: {}, quantity: 1, originalIndices: [0] };
  const meta = currentGroup.tank;
  // Legacy `idx` alias used in price map lookups (first original index of the group)
  const idx = currentGroup.originalIndices[0] ?? 0;

  // Detect format: old flat keys vs new LLM-generated keys
  const oldFormat = isOldFormat(meta);

  // Old format fields
  const extraMeta = Object.entries(meta).filter(([k]) => !ALL_MAIN_KEYS.has(k) && k !== 'products' && k !== 'procurement_package' && k !== 'position');
  const hasRow1 = INFO_ROW_1.some(f => f.key === 'derva_org' ? !!meta.derva : !!meta[f.key]);
  const hasRow2 = INFO_ROW_2.some(f => f.key === 'derva_org' ? !!meta.derva : !!meta[f.key]);
  const dervaOrgDisplay = formatDervaOrg(meta);

  // New format: separate scalar fields from nested objects
  const scalarFields: [string, string][] = [];
  const objectFields: [string, Record<string, any>][] = [];
  const pastabos: string | null = typeof meta['Pastabos'] === 'string' ? meta['Pastabos'] : (typeof meta['pastabos'] === 'string' ? meta['pastabos'] : null);
  if (!oldFormat) {
    for (const [k, v] of Object.entries(meta)) {
      if (SKIP_DISPLAY_KEYS.has(k) || TITLE_KEYS.has(k)) continue;
      if (k === 'Pastabos' || k === 'pastabos') continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!isAllEmpty(v)) objectFields.push([k, v]);
      } else if (!isEmptyValue(v)) {
        scalarFields.push([k, String(v)]);
      }
    }
  }

  const goPrev = () => { setEditing(false); setCurrentIdx(i => (i - 1 + groups.length) % groups.length); };
  const goNext = () => { setEditing(false); setCurrentIdx(i => (i + 1) % groups.length); };

  /** Persist an updated products array back to the metadata field */
  const persistProducts = async (newProducts: Record<string, any>[]) => {
    setSaving(true);
    try {
      let rawMeta: any = record.metadata;
      if (typeof rawMeta === 'string') {
        try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = {}; }
      }
      let updatedMeta: any;
      if (Array.isArray(rawMeta) && rawMeta.length > 0 && rawMeta[0] && typeof rawMeta[0] === 'object') {
        const root = { ...rawMeta[0] };
        let wrapperKey: string | null = null;
        for (const k of ['products', 'talpos', 'gaminiai', 'items']) {
          if (Array.isArray(root[k])) { wrapperKey = k; break; }
        }
        if (wrapperKey) {
          root[wrapperKey] = newProducts;
          if (root.santrauka && typeof root.santrauka === 'object') {
            root.santrauka = { ...root.santrauka, Bendras_rastų_talpų_skaicius: newProducts.length };
          }
        } else {
          updatedMeta = newProducts;
          await updateNestandartiniaiField(record.id, 'metadata', updatedMeta);
          const updated = await fetchNestandartiniaiById(record.id);
          if (updated) onRecordUpdated?.(updated);
          return;
        }
        updatedMeta = [root, ...rawMeta.slice(1)];
      } else if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
        let wrapperKey: string | null = null;
        for (const k of ['products', 'talpos', 'gaminiai', 'items']) {
          if (Array.isArray(rawMeta[k])) { wrapperKey = k; break; }
        }
        if (wrapperKey) {
          updatedMeta = { ...rawMeta, [wrapperKey]: newProducts };
        } else {
          updatedMeta = newProducts.length === 1 ? newProducts[0] : newProducts;
        }
      } else {
        updatedMeta = newProducts.length === 1 ? newProducts[0] : newProducts;
      }
      await updateNestandartiniaiField(record.id, 'metadata', updatedMeta);
      const updated = await fetchNestandartiniaiById(record.id);
      if (updated) onRecordUpdated?.(updated);
    } catch (e: any) {
      console.error('Error updating tanks:', e);
    } finally {
      setSaving(false);
    }
  };

  const addTank = async () => {
    const newTank: Record<string, any> = { pavadinimas: `Nauja talpa ${products.length + 1}` };
    const first = products[0];
    if (first) {
      for (const [k, v] of Object.entries(first)) {
        if (k.startsWith('projekto_kontekstas_') && v) newTank[k] = v;
      }
    }
    const newProducts = [...products, newTank];
    await persistProducts(newProducts);
    setCurrentIdx(newProducts.length - 1);
    // Enter edit mode for the new tank
    setEditing(true);
    setEditDraft({});
  };

  /** Delete all tanks belonging to the group at the given group index */
  const deleteTankGroup = async (deleteGroupIdx: number) => {
    const group = groups[deleteGroupIdx];
    if (!group || products.length <= group.quantity) return;
    const toRemove = new Set(group.originalIndices);
    const newProducts = products.filter((_, i) => !toRemove.has(i));
    // Recompute new groups to find correct currentIdx
    const newGroups = deduplicateProducts(newProducts);
    if (currentIdx >= newGroups.length) setCurrentIdx(Math.max(0, newGroups.length - 1));
    setConfirmDeleteIdx(null);
    setEditing(false);
    await persistProducts(newProducts);
  };

  const startEditing = () => {
    // Build a draft from all scalar fields of the current tank
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (SKIP_DISPLAY_KEYS.has(k)) continue;
      if (k.startsWith('_')) continue;
      if (v && typeof v === 'object') continue;
      draft[k] = v != null ? String(v) : '';
    }
    setEditDraft(draft);
    setNewFieldKey('');
    setNewFieldVal('');
    setEditing(true);
  };

  const saveEditing = async () => {
    const updated: Record<string, any> = {};
    // Preserve nested objects from original
    for (const [k, v] of Object.entries(meta)) {
      if (v && typeof v === 'object') updated[k] = v;
    }
    // Apply scalar edits
    for (const [k, v] of Object.entries(editDraft)) {
      if (v.trim() === '') continue; // skip blanks — effectively deletes the field
      updated[k] = v.trim();
    }
    const newProducts = [...products];
    // Apply to ALL tanks in this group (they are identical, so edit all together)
    for (const origIdx of currentGroup.originalIndices) {
      newProducts[origIdx] = { ...updated };
    }
    setEditing(false);
    await persistProducts(newProducts);
  };

  const addNewField = () => {
    const key = newFieldKey.trim();
    const val = newFieldVal.trim();
    if (!key) return;
    setEditDraft(d => ({ ...d, [key]: val }));
    setNewFieldKey('');
    setNewFieldVal('');
  };

  const removeField = (key: string) => {
    setEditDraft(d => {
      const copy = { ...d };
      delete copy[key];
      return copy;
    });
  };

  return (
    <div className="space-y-0">
      {/* Delete confirmation */}
      {confirmDeleteIdx !== null && (() => {
        const grp = groups[confirmDeleteIdx];
        const title = grp ? (getProductTitle(grp.tank) || `Talpa ${confirmDeleteIdx + 1}`) : `Talpa ${confirmDeleteIdx + 1}`;
        const qty = grp?.quantity ?? 1;
        return (
          <div className="mb-3 p-3 rounded-lg border border-error/20 bg-error/5">
            <p className="text-xs text-base-content/70 mb-2">
              Ištrinti <strong>{title}</strong>
              {qty > 1 && <span> (visi <strong>{qty}</strong> vienodi)</span>}?
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => deleteTankGroup(confirmDeleteIdx)} disabled={saving} className="text-xs px-3 py-1 rounded-lg bg-error text-white hover:bg-error/90 disabled:opacity-40">
                {saving ? 'Trinama...' : 'Taip, ištrinti'}
              </button>
              <button onClick={() => setConfirmDeleteIdx(null)} className="text-xs px-3 py-1 rounded-lg border border-base-content/10 text-base-content/60 hover:bg-base-content/5">
                Atšaukti
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tank nav: single row — ◂ [dropdown] ▸  +  🗑 */}
      {(hasMultiple || !readOnly) && (
        <div className="flex items-center gap-1 mb-2">
          {hasMultiple && (
            <button onClick={goPrev} className="p-1 rounded-md hover:bg-base-content/8" title="Ankstesnė talpa">
              <ChevronLeft className="w-4 h-4 text-base-content/40" />
            </button>
          )}
          <select
            value={groupIdx}
            onChange={e => { setEditing(false); setCurrentIdx(Number(e.target.value)); }}
            className="flex-1 min-w-0 text-xs font-medium bg-base-content/[0.03] text-base-content/80 border border-base-content/8 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/30 cursor-pointer truncate"
          >
            {groups.map((g, i) => (
              <option key={i} value={i}>
                {i + 1}. {getProductTitle(g.tank) || `Talpa ${i + 1}`}
                {g.quantity > 1 ? ` (×${g.quantity})` : ''}
              </option>
            ))}
          </select>
          {hasMultiple && (
            <button onClick={goNext} className="p-1 rounded-md hover:bg-base-content/8" title="Kita talpa">
              <ChevronRight className="w-4 h-4 text-base-content/40" />
            </button>
          )}
          {!readOnly && (
            <>
              <button onClick={addTank} disabled={saving} className="p-1.5 rounded-md hover:bg-primary/8 text-base-content/30 hover:text-primary disabled:opacity-30" title="Pridėti talpą">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
              {hasMultiple && (
                <button onClick={() => setConfirmDeleteIdx(groupIdx)} disabled={saving} className="p-1.5 rounded-md hover:bg-error/8 text-base-content/30 hover:text-error disabled:opacity-30" title="Ištrinti talpą">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Kiekis badge — shown when current group has more than one identical tank */}
      {currentGroup.quantity > 1 && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">
            Kiekis: {currentGroup.quantity}
          </span>
          <span className="text-[11px] text-base-content/35">vienodų talpų</span>
        </div>
      )}

      {/* Per-tank price input */}
      {(() => {
        // For a group, show per-tank price (representative) and total when qty > 1
        const perTankKaina = kainaMap[String(idx)];
        const groupTotalKaina = currentGroup.quantity > 1
          ? currentGroup.originalIndices.reduce((sum, oi) => sum + (kainaMap[String(oi)] ?? 0), 0)
          : perTankKaina;
        const hasGroupPrice = currentGroup.quantity > 1
          ? currentGroup.originalIndices.some(oi => kainaMap[String(oi)] != null)
          : perTankKaina != null;
        // AI estimate: prefer live in-session map, fall back to persisted value in metadata
        const aiEstimate: number | null = (() => {
          const fromMap = aiEstimatesMap?.[idx];
          if (fromMap != null) return fromMap;
          const v = currentGroup.tank.kaina_ai ?? currentGroup.tank.Kaina_ai;
          if (v == null) return null;
          const n = Number(v);
          return isNaN(n) ? null : n;
        })();
        const aiReasoning: string | null =
          aiReasoningMap?.[idx] ??
          currentGroup.tank.kaina_ai_reasoning ??
          null;
        const applyKainaToGroup = (value: number | null) => {
          currentGroup.originalIndices.forEach(oi => onKainaChange(oi, value));
        };
        return (
          <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] text-base-content/40 shrink-0">
              {currentGroup.quantity > 1 ? 'Kaina / vnt.:' : 'Kaina:'}
            </span>
            {tankKainaEditing ? (
              <div className="flex items-center gap-1 bg-base-200/60 rounded-full border border-base-content/10 pl-2 pr-1 py-0.5">
                <Euro className="w-3 h-3 text-base-content/40 shrink-0" />
                <input
                  type="text"
                  value={tankKainaInput}
                  onChange={e => setTankKainaInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const parsed = tankKainaInput.trim() === '' ? null : parseFloat(tankKainaInput.replace(',', '.'));
                      if (tankKainaInput.trim() !== '' && (parsed === null || isNaN(parsed))) return;
                      setTankKainaSaving(true);
                      applyKainaToGroup(parsed);
                      setTankKainaSaving(false);
                      setTankKainaEditing(false);
                    }
                    if (e.key === 'Escape') setTankKainaEditing(false);
                  }}
                  className="w-20 text-xs bg-transparent outline-none text-base-content placeholder:text-base-content/30"
                  placeholder="0.00"
                  autoFocus
                />
                <button
                  onClick={() => {
                    const parsed = tankKainaInput.trim() === '' ? null : parseFloat(tankKainaInput.replace(',', '.'));
                    if (tankKainaInput.trim() !== '' && (parsed === null || isNaN(parsed))) return;
                    setTankKainaSaving(true);
                    applyKainaToGroup(parsed);
                    setTankKainaSaving(false);
                    setTankKainaEditing(false);
                  }}
                  disabled={tankKainaSaving}
                  className="p-1 rounded-full hover:bg-base-content/10 transition-colors"
                >
                  {tankKainaSaving ? <Loader2 className="w-3 h-3 animate-spin text-base-content/40" /> : <CheckCircle2 className="w-3 h-3 text-success" />}
                </button>
                <button onClick={() => setTankKainaEditing(false)} className="p-1 rounded-full hover:bg-base-content/10 transition-colors">
                  <X className="w-3 h-3 text-base-content/40" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!readOnly) {
                    setTankKainaInput(perTankKaina != null ? String(perTankKaina) : '');
                    setTankKainaEditing(true);
                  }
                }}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                  hasGroupPrice
                    ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15'
                    : 'bg-base-content/5 text-base-content/35 hover:bg-base-content/10 border border-dashed border-base-content/15'
                } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                title={readOnly ? 'Kaina' : 'Redaguoti kainą'}
              >
                <Euro className="w-3 h-3" />
                {hasGroupPrice
                  ? (perTankKaina != null ? `${perTankKaina.toLocaleString('lt-LT')} €` : 'Nustatyti kainą')
                  : 'Nustatyti kainą'}
              </button>
            )}
            {/* Group total price shown alongside per-unit price */}
            {currentGroup.quantity > 1 && hasGroupPrice && !tankKainaEditing && (
              <span className="text-[11px] text-base-content/40">
                = <strong className="text-base-content/60">{(groupTotalKaina ?? 0).toLocaleString('lt-LT')} €</strong> iš viso
              </span>
            )}
            {/* AI price estimate badge — read-only, separate from user-editable price */}
            {aiEstimate != null && !tankKainaEditing && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: 'rgba(175,82,222,0.08)', color: '#AF52DE', border: '0.5px solid rgba(175,82,222,0.18)' }}
                title={aiReasoning ?? 'AI preliminari kaina'}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {aiEstimate.toLocaleString('lt-LT')} €
              </span>
            )}
          </div>
          {/* AI reasoning shown below the price row */}
          {aiEstimate != null && aiReasoning && !tankKainaEditing && (
            <p className="text-[11px] leading-relaxed mb-3 -mt-2" style={{ color: 'rgba(175,82,222,0.7)' }}>
              {aiReasoning}
            </p>
          )}
          </>
        );
      })()}

      {/* Edit mode toggle */}
      {!readOnly && !editing && (
        <div className="flex justify-end mb-2">
          <button onClick={startEditing} className="flex items-center gap-1 text-xs text-base-content/40 hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/5">
            <Pencil className="w-3 h-3" />
            <span>Redaguoti</span>
          </button>
        </div>
      )}

      {/* EDIT MODE: inline field editor */}
      {editing && !readOnly ? (
        <div className="space-y-3 mb-4">
          {Object.entries(editDraft).map(([k, v]) => (
            <div key={k} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-[11px] text-base-content/40 block mb-0.5">{formatMetaLabel(k)}</label>
                <input
                  type="text"
                  value={v}
                  onChange={e => setEditDraft(d => ({ ...d, [k]: e.target.value }))}
                  className="w-full text-sm border border-base-content/10 rounded-md px-2.5 py-1.5 bg-transparent text-base-content focus:outline-none focus:border-primary/40"
                />
              </div>
              <button onClick={() => removeField(k)} className="mt-5 p-1 rounded-md text-base-content/20 hover:text-error hover:bg-error/5" title="Pašalinti lauką">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Add new field row */}
          <div className="flex items-end gap-2 pt-2 border-t border-base-content/5">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-base-content/40 block mb-0.5">Naujas laukas</label>
              <input
                type="text"
                value={newFieldKey}
                onChange={e => setNewFieldKey(e.target.value)}
                placeholder="Pavadinimas"
                className="w-full text-xs border border-base-content/10 rounded-md px-2.5 py-1.5 bg-transparent text-base-content placeholder:text-base-content/25 focus:outline-none focus:border-primary/40"
              />
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={newFieldVal}
                onChange={e => setNewFieldVal(e.target.value)}
                placeholder="Reikšmė"
                onKeyDown={e => { if (e.key === 'Enter') addNewField(); }}
                className="w-full text-xs border border-base-content/10 rounded-md px-2.5 py-1.5 bg-transparent text-base-content placeholder:text-base-content/25 focus:outline-none focus:border-primary/40"
              />
            </div>
            <button onClick={addNewField} disabled={!newFieldKey.trim()} className="p-1.5 rounded-md text-base-content/30 hover:text-primary hover:bg-primary/5 disabled:opacity-20">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center gap-2 pt-2">
            <button onClick={saveEditing} disabled={saving} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span>Išsaugoti</span>
            </button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-lg border border-base-content/10 text-base-content/60 hover:bg-base-content/5">
              Atšaukti
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* READ MODE: display fields */}
          {/* OLD FORMAT */}
          {oldFormat && (hasRow1 || hasRow2 || meta.derva_musu) && (
            <div className="pb-4">
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {INFO_ROW_1.map(f => <InfoField key={f.key} label={f.label} value={meta[f.key]} />)}
                {INFO_ROW_2.map(f => {
                  if (f.key === 'derva_org') {
                    return <InfoField key={f.key} label={f.label} value={dervaOrgDisplay || undefined} />;
                  }
                  return <InfoField key={f.key} label={f.label} value={meta[f.key]} />;
                })}
                {meta.derva_musu && <InfoField label="Derva (mūsų)" value={meta.derva_musu} />}
              </div>
            </div>
          )}

          {/* NEW FORMAT: scalar fields */}
          {!oldFormat && scalarFields.length > 0 && (
            <div className="pb-4">
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {scalarFields.map(([k, v]) => (
                  <InfoField key={k} label={formatMetaLabel(k)} value={v} />
                ))}
              </div>
            </div>
          )}

          {/* NEW FORMAT: nested objects */}
          {!oldFormat && objectFields.length > 0 && (
            <div className="border-t border-base-content/10 pt-2">
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {objectFields.map(([k, v]) => (
                  <NestedObjectField key={k} label={formatMetaLabel(k)} obj={v} />
                ))}
              </div>
            </div>
          )}

          {/* Pastabos */}
          {!oldFormat && pastabos && (
            <div className="border-t border-base-content/10">
              <CollapsibleSection title="Pastabos">
                <div className="text-sm leading-[1.7] whitespace-pre-wrap overflow-y-auto rounded-lg p-4 mb-3 text-base-content bg-base-content/[0.02] border border-base-content/5" style={{ maxHeight: '220px' }}>
                  {pastabos}
                </div>
              </CollapsibleSection>
            </div>
          )}

          {/* Description */}
          {record.description && (
            <div className="border-t border-base-content/10">
              <CollapsibleSection title="Aprašymas">
                <div className="text-sm leading-[1.7] whitespace-pre-wrap overflow-y-auto rounded-lg p-4 mb-3 text-base-content bg-base-content/[0.02] border border-base-content/5" style={{ maxHeight: '220px' }}>
                  {record.description}
                </div>
              </CollapsibleSection>
            </div>
          )}

          {/* OLD FORMAT: extra metadata */}
          {oldFormat && (extraMeta.length > 0 || record.derva || meta.talpa) && (
            <div className="border-t border-base-content/10">
              <CollapsibleSection title="Papildomi duomenys">
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 pb-3">
                  {meta.talpa && <InfoField label="Talpa" value={meta.talpa} />}
                  {meta.position && <InfoField label="Pozicija" value={meta.position} />}
                  {record.pateikimo_data && <InfoField label="Pateikimo data" value={record.pateikimo_data} />}
                  {extraMeta.map(([k, v]) => <InfoField key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />)}
                </div>
              </CollapsibleSection>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Susirašinėjimas
// ---------------------------------------------------------------------------

function TabSusirasinejimas({ record, readOnly, pendingMessages, onMessagesChange }: {
  record: NestandartiniaiRecord;
  readOnly?: boolean;
  pendingMessages?: AtsakymasMessage[];
  onMessagesChange?: (messages: AtsakymasMessage[]) => void;
}) {
  const originalMessages = parseAtsakymas(record.atsakymas);
  const messages = pendingMessages ?? originalMessages;
  const [addingSide, setAddingSide] = useState<'left' | 'right' | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const update = (updated: AtsakymasMessage[]) => {
    onMessagesChange?.(updated);
  };

  const handleAdd = (text: string, side: 'left' | 'right') => {
    const msg: AtsakymasMessage = { text, role: side === 'left' ? 'recipient' : 'team', date: new Date().toISOString().slice(0, 10) };
    update([...messages, msg]);
    setAddingSide(null);
  };

  const handleEdit = (idx: number, newText: string) => {
    update(messages.map((m, i) => i === idx ? { ...m, text: newText } : m));
    setEditingIdx(null);
  };

  const handleDelete = (idx: number) => {
    update(messages.filter((_, i) => i !== idx));
    setConfirmDeleteIdx(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {messages.length > 0 ? `${messages.length} žinutės` : 'Nėra žinučių'}
        </p>
      </div>

      {messages.map((msg, i) => {
        const side = msg.role === 'team' ? 'right' as const : 'left' as const;
        if (editingIdx === i) {
          return <EditMessageBubble key={i} message={msg} side={side} onSave={t => handleEdit(i, t)} onCancel={() => setEditingIdx(null)} />;
        }
        return (
          <ChatBubble
            key={i}
            message={msg}
            side={side}
            readOnly={readOnly}
            onEdit={() => setEditingIdx(i)}
            onDelete={() => setConfirmDeleteIdx(i)}
          />
        );
      })}

      {!readOnly && addingSide && (
        <NewMessageBubble side={addingSide} onSave={t => handleAdd(t, addingSide)} onCancel={() => setAddingSide(null)} />
      )}

      {!readOnly && !addingSide && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-base-content/10">
          <button onClick={() => setAddingSide('left')} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-3xl transition-all text-base-content" style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}>
            <Plus className="w-3.5 h-3.5" /> Gavėjas
          </button>
          <button onClick={() => setAddingSide('right')} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-3xl text-white transition-all hover:brightness-95" style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
            <Plus className="w-3.5 h-3.5" /> Komanda
          </button>
        </div>
      )}

      {/* Delete message confirmation modal */}
      {confirmDeleteIdx !== null && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => setConfirmDeleteIdx(null)}
        >
          <div
            className="bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-[15px] font-semibold text-base-content" style={{ letterSpacing: '-0.02em' }}>Ištrinti žinutę?</p>
              </div>
              <p className="text-sm text-base-content/50 mb-1 ml-12 line-clamp-2">
                {messages[confirmDeleteIdx]?.text}
              </p>
              <p className="text-xs text-base-content/35 mb-6 ml-12">
                Žinutė bus ištrinta visam laikui.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteIdx(null)}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-base-content/60 transition-all hover:bg-base-content/5"
                  style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                >
                  Atšaukti
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteIdx)}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Ištrinti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Užduotys
// ---------------------------------------------------------------------------

function TabUzduotys({ record, readOnly }: { record: NestandartiniaiRecord; readOnly?: boolean }) {
  const [tasks, setTasks] = useState<TaskItem[]>(() => (parseJSON<TaskItem[]>(record.tasks) || []));
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (updated: TaskItem[]) => {
    setTasks(updated);
    try { setSaving(true); await updateNestandartiniaiTasks(record.id, updated); } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    save([...tasks, { id: crypto.randomUUID(), title, completed: false, created_at: new Date().toISOString().slice(0, 10), priority: 'medium' }]);
    setNewTitle('');
  };

  const toggle = (id: string) => save(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const remove = (id: string) => save(tasks.filter(t => t.id !== id));

  const priorityColor = (p?: string) => {
    if (p === 'high') return '#FF3B30';
    if (p === 'low') return '#34C759';
    return '#FF9500';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {tasks.length > 0 ? `${tasks.filter(t => t.completed).length}/${tasks.length} atlikta` : 'Nėra užduočių'}
        </p>
        {saving && <span className="text-xs text-base-content/40">Saugoma...</span>}
      </div>

      <div className="space-y-1.5">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-macos transition-colors group"
            style={{ background: task.completed ? 'rgba(0,0,0,0.02)' : 'transparent' }}
          >
            {!readOnly ? (
              <button onClick={() => toggle(task.id)} className="mt-0.5 shrink-0">
                <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all"
                  style={task.completed
                    ? { background: '#007AFF', border: 'none' }
                    : { background: '#fff', border: '1.5px solid #d4cfc8' }
                  }
                >
                  {task.completed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </button>
            ) : (
              <div className="w-[18px] h-[18px] rounded-md flex items-center justify-center mt-0.5 shrink-0"
                style={task.completed ? { background: '#007AFF' } : { background: '#fff', border: '1.5px solid #d4cfc8' }}
              >
                {task.completed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${task.completed ? 'line-through text-base-content/40' : 'text-base-content'}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor(task.priority) }} />
                <span className="text-xs text-base-content/40">{task.created_at}</span>
                {task.due_date && <span className="text-xs text-base-content/40">→ {task.due_date}</span>}
              </div>
            </div>
            {!readOnly && (
              <button onClick={() => remove(task.id)} className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded transition-all" style={{ color: '#FF3B30' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add task */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-base-content/10">
          <div className="flex-1 flex items-center rounded-3xl border border-base-content/8 px-4 py-2 transition-all focus-within:border-base-content/15 focus-within:shadow-sm" style={{ background: '#f8f8f9' }}>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Nauja užduotis..."
              className="flex-1 bg-transparent text-[15px] text-base-content placeholder:text-base-content/30 outline-none border-none"
            />
          </div>
          <button onClick={addTask} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all bg-base-content text-base-100 hover:opacity-80">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Failai
// ---------------------------------------------------------------------------

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

interface AttachedFile {
  directus_file_id: string;
  file_name: string;
  filename_disk: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

/** A file selected locally but not yet uploaded to Directus */
interface PendingFile {
  localId: string;
  file: File;
}

/**
 * The `files` column (now text type) stores comma-separated Directus file UUIDs.
 * e.g. "uuid1,uuid2,uuid3" or a single "uuid1".
 */
function getFileIds(record: NestandartiniaiRecord): string[] {
  if (!record.files || typeof record.files !== 'string') return [];
  return record.files.split(',').map(s => s.trim()).filter(s => s.length >= 32);
}

function formatFileSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function TabFailai({ record, readOnly, pendingFiles, onAddFiles, onRemovePendingFile, onDeleteFile }: {
  record: NestandartiniaiRecord;
  readOnly?: boolean;
  pendingFiles?: PendingFile[];
  onAddFiles?: (files: File[]) => void;
  onRemovePendingFile?: (localId: string) => void;
  onDeleteFile?: (newFilesValue: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCount = pendingFiles?.length || 0;
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch metadata for ALL existing file UUIDs from Directus
  const [existingFiles, setExistingFiles] = useState<AttachedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const fileIds = getFileIds(record);
  const fileIdsKey = fileIds.join(',');
  useEffect(() => {
    if (fileIds.length === 0) { setExistingFiles([]); return; }
    setLoadingFiles(true);
    const ids = fileIds;
    Promise.all(
      ids.map(fileId =>
        fetch(`${DIRECTUS_URL}/files/${fileId}`, {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
        })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(json => {
            const f = json.data;
            return {
              directus_file_id: f.id,
              file_name: f.filename_download || 'Failas',
              filename_disk: f.filename_disk || '',
              file_size: f.filesize || 0,
              mime_type: f.type || '',
              uploaded_at: f.uploaded_on || '',
            } as AttachedFile;
          })
          .catch(() => null)
      )
    ).then(results => {
      setExistingFiles(results.filter(Boolean) as AttachedFile[]);
      setLoadingFiles(false);
    });
  }, [fileIdsKey]);

  const [confirmDeleteFile, setConfirmDeleteFile] = useState<AttachedFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const executeDelete = async (file: AttachedFile) => {
    try {
      setDeletingId(file.directus_file_id);
      setConfirmDeleteFile(null);

      // 1. Delete binary from Directus storage
      const resp = await fetch(`${DIRECTUS_URL}/files/${file.directus_file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
      });
      if (!resp.ok && resp.status !== 404) {
        throw new Error(`Nepavyko ištrinti failo iš saugyklos (${resp.status})`);
      }

      // 2. Remove this UUID from the comma-separated `files` column
      const currentIds = getFileIds(record);
      const remaining = currentIds.filter(id => id !== file.directus_file_id);
      const newFilesValue = remaining.join(',');
      await updateNestandartiniaiField(record.id, 'files', newFilesValue || null);

      // 3. Update local UI state
      setExistingFiles(prev => prev.filter(f => f.directus_file_id !== file.directus_file_id));
      if (previewFile?.directus_file_id === file.directus_file_id) setPreviewFile(null);
      onDeleteFile?.(newFilesValue);
    } catch (err: any) {
      console.error('File delete error:', err);
      setDeleteError(err.message || 'Nepavyko ištrinti');
      setTimeout(() => setDeleteError(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = existingFiles.length + pendingCount;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    const fileArray = Array.from(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onAddFiles?.(fileArray);
  };

  const getViewUrl = (id: string) => `${DIRECTUS_URL}/assets/${id}?access_token=${DIRECTUS_TOKEN}`;
  const getDownloadUrl = (id: string) => `${DIRECTUS_URL}/assets/${id}?access_token=${DIRECTUS_TOKEN}&download`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-base-content/40">
          {loadingFiles ? 'Kraunama...' : totalCount > 0 ? `${totalCount} ${totalCount === 1 ? 'failas' : 'failai'}` : 'Nėra failų'}
          {pendingCount > 0 && <span className="text-amber-500 ml-1.5">({pendingCount} nauji)</span>}
        </p>
        {!readOnly && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-3xl text-white transition-all hover:opacity-80"
            style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
          >
            <Upload className="w-3.5 h-3.5" /> Įkelti
          </button>
        )}
      </div>

      {/* Existing files table */}
      {existingFiles.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-base-content/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-content/10 bg-base-content/[0.02]">
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40">Pavadinimas</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40 w-20">Dydis</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-base-content/40 w-24">Data</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-base-content/40 w-24">Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {existingFiles.map((file, idx) => (
                <tr key={file.directus_file_id} className="border-b border-base-content/5 last:border-b-0 hover:bg-base-content/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs text-base-content/40">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      className="flex items-center gap-2 text-left hover:underline"
                      onClick={() => setPreviewFile(file)}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className="text-sm text-base-content truncate max-w-[200px]" title={file.file_name}>{file.file_name}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-base-content/40">{formatFileSize(file.file_size)}</td>
                  <td className="px-3 py-2 text-xs text-base-content/40">
                    {file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString('lt-LT') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="p-1 rounded-lg transition-colors hover:bg-base-content/5"
                        title="Peržiūrėti"
                      >
                        <Eye className="w-3.5 h-3.5 text-base-content/40" />
                      </button>
                      <a
                        href={getDownloadUrl(file.directus_file_id)}
                        className="p-1 rounded-lg transition-colors hover:bg-base-content/5"
                        title="Atsisiųsti"
                      >
                        <Download className="w-3.5 h-3.5 text-base-content/40" />
                      </a>
                      {!readOnly && (
                        <button
                          onClick={() => setConfirmDeleteFile(file)}
                          disabled={deletingId === file.directus_file_id}
                          className="p-1 rounded-lg transition-colors hover:bg-red-50"
                          title="Ištrinti"
                        >
                          {deletingId === file.directus_file_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#b91c1c' }} />
                            : <Trash2 className="w-3.5 h-3.5" style={{ color: '#b91c1c' }} />
                          }
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending files - separate section for visibility */}
      {pendingCount > 0 && (
        <div className={`rounded-xl border-2 border-dashed overflow-hidden ${existingFiles.length > 0 ? 'mt-3' : ''}`} style={{ borderColor: '#d97706' }}>
          <div className="px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5" style={{ background: 'rgba(217,119,6,0.12)', color: '#d97706' }}>
            <Upload className="w-3 h-3" />
            Paruošti įkėlimui ({pendingCount})
          </div>
          {pendingFiles!.map((pf) => (
            <div
              key={`pending-${pf.localId}`}
              className="flex items-center gap-3 px-3 py-2 border-t"
              style={{ borderColor: 'rgba(217,119,6,0.2)' }}
            >
              <FileText className="w-4 h-4 shrink-0" style={{ color: '#d97706' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-base-content truncate" title={pf.file.name}>{pf.file.name}</p>
                <p className="text-[11px] text-base-content/40">{formatFileSize(pf.file.size)}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706' }}>Laukia</span>
              {!readOnly && (
                <button
                  onClick={() => onRemovePendingFile?.(pf.localId)}
                  className="p-1 rounded-lg transition-colors hover:bg-error/10 shrink-0"
                  title="Pašalinti"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && !loadingFiles && (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
          <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center bg-base-content/[0.06]">
            <Paperclip className="w-5 h-5 text-base-content/30" />
          </div>
          <p className="text-sm font-semibold text-base-content">Nėra failų</p>
        </div>
      )}

      {!readOnly && (
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteFile && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => setConfirmDeleteFile(null)}
        >
          <div
            className="bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-[15px] font-semibold text-base-content" style={{ letterSpacing: '-0.02em' }}>Ištrinti failą?</p>
              </div>
              <p className="text-sm text-base-content/50 mb-1 ml-12">
                {confirmDeleteFile.file_name}
              </p>
              <p className="text-xs text-base-content/35 mb-6 ml-12">
                Failas bus ištrintas visam laikui. Šio veiksmo negalima atšaukti.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteFile(null)}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-base-content/60 transition-all hover:bg-base-content/5"
                  style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                >
                  Atšaukti
                </button>
                <button
                  onClick={() => executeDelete(confirmDeleteFile)}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Ištrinti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete error toast */}
      {deleteError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10002] px-4 py-2.5 rounded-xl bg-red-500 text-white text-xs font-medium shadow-lg">
          {deleteError}
        </div>
      )}

      {/* File preview modal (like Derva failai) */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '80vw', maxWidth: 900, height: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-base-content/10">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{previewFile.file_name}</span>
                <span className="text-xs text-base-content/40 shrink-0">{formatFileSize(previewFile.file_size)}</span>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={getDownloadUrl(previewFile.directus_file_id)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5"
                  title="Atsisiųsti"
                >
                  <Download className="w-4 h-4 text-base-content/60" />
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5"
                >
                  <X className="w-4 h-4 text-base-content/60" />
                </button>
              </div>
            </div>
            {/* Preview body */}
            <div className="flex-1 overflow-hidden">
              {previewFile.mime_type === 'application/pdf' ? (
                <iframe
                  src={`${getViewUrl(previewFile.directus_file_id)}#toolbar=1`}
                  className="w-full h-full border-0"
                  title={previewFile.file_name}
                />
              ) : previewFile.mime_type?.startsWith('image/') ? (
                <div className="flex items-center justify-center h-full p-6 bg-base-content/[0.02]">
                  <img
                    src={getViewUrl(previewFile.directus_file_id)}
                    alt={previewFile.file_name}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <FileText className="w-12 h-12 text-base-content/20" />
                  <p className="text-sm text-base-content/50">Peržiūra negalima šiam failų tipui</p>
                  <a
                    href={getDownloadUrl(previewFile.directus_file_id)}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-3xl text-white transition-all hover:opacity-80"
                    style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
                  >
                    <Download className="w-4 h-4" /> Atsisiųsti
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Derva (per-tank)
// ---------------------------------------------------------------------------

/** Parse per-tank derva results from the record.
 *  - New format: JSON object like {"0": "...", "1": "..."}
 *  - Legacy format: plain string → treated as result for tank 0
 */
function parseDervaPerTank(raw: string | null): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { /* fall through — treat as legacy plain string */ }
    }
    // Legacy: single plain-text result → assign to tank 0
    if (trimmed) return { '0': trimmed };
  }
  return {};
}

/** Parse metadata into a raw JS object, unwrapping strings and array-wrapped roots */
function unwrapMetaRoot(metadata: any): Record<string, any> {
  let meta = metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return {}; }
  }
  if (Array.isArray(meta)) {
    const first = meta[0];
    return (first && typeof first === 'object' && !Array.isArray(first)) ? first : {};
  }
  return (meta && typeof meta === 'object') ? meta : {};
}

/**
 * Write a field into every tank object at the specified indices inside the metadata,
 * preserving all other top-level metadata fields (klientas, projektas, etc.).
 * Works with all wrapper shapes: { talpos: [...] }, { products: [...] }, plain array, single object.
 * Pass value=null/undefined to delete the field.
 */
function buildUpdatedMeta(
  rawMetadata: any,
  fieldName: string,
  value: any,
  indicesToUpdate: number[],
): any {
  let rawMeta: any = rawMetadata;
  if (typeof rawMeta === 'string') { try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = {}; } }

  const currentProducts = parseProducts(rawMeta);
  const newProducts = currentProducts.map((p, i) => {
    if (!indicesToUpdate.includes(i)) return p;
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      const { [fieldName]: _removed, ...rest } = p as any;
      return rest;
    }
    return { ...p, [fieldName]: value };
  });

  if (Array.isArray(rawMeta) && rawMeta.length > 0 && typeof rawMeta[0] === 'object') {
    const root = { ...rawMeta[0] };
    const wrapperKey = ['products', 'talpos', 'gaminiai', 'items'].find(k => Array.isArray(root[k])) ?? null;
    return wrapperKey
      ? [{ ...root, [wrapperKey]: newProducts }, ...rawMeta.slice(1)]
      : newProducts;
  } else if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    const wrapperKey = ['products', 'talpos', 'gaminiai', 'items'].find(k => Array.isArray(rawMeta[k])) ?? null;
    return wrapperKey
      ? { ...rawMeta, [wrapperKey]: newProducts }
      : (newProducts.length === 1 ? newProducts[0] : newProducts);
  } else {
    return newProducts.length === 1 ? newProducts[0] : newProducts;
  }
}

/** Parse per-tank derva_musu — reads from each tank object's derva_musu field.
 *  Falls back to legacy root-level _derva_musu_per_tank for old records. */
function parseDervaMusuPerTank(metadata: any): Record<string, string> {
  const prods = parseProducts(metadata);
  const result: Record<string, string> = {};
  for (let i = 0; i < prods.length; i++) {
    const v = prods[i]?.derva_musu;
    if (v && typeof v === 'string' && v.trim()) result[String(i)] = v.trim();
  }
  if (Object.keys(result).length > 0) return result;
  // Legacy fallback: root _derva_musu_per_tank
  const root = unwrapMetaRoot(metadata);
  const perTank = root?._derva_musu_per_tank;
  if (perTank && typeof perTank === 'object' && !Array.isArray(perTank)) return perTank;
  const legacy = root?.derva_musu;
  if (legacy && typeof legacy === 'string') return { '0': legacy };
  return {};
}


/** Resolve kainaMap: read kaina from each product object, fall back to kaina field */
function resolveKainaMap(rec: { kaina?: any; metadata?: any }): Record<string, number> {
  const prods = parseProducts(rec.metadata);
  const fromProds: Record<string, number> = {};
  for (let i = 0; i < prods.length; i++) {
    const k = prods[i].kaina ?? prods[i].Kaina;
    if (k !== undefined && k !== null && k !== '') {
      const n = Number(k);
      if (!isNaN(n)) fromProds[String(i)] = n;
    }
  }
  if (Object.keys(fromProds).length > 0) return fromProds;
  return parseKainaMapStatic(rec.kaina);
}

/** Get a short summary of tank specs for display in the derva tab */
function getTankSpecsSummary(tankMeta: Record<string, any>): [string, string][] {
  const summaryKeys = ['Orientacija', 'orientacija', 'Vieta', 'Talpa M3', 'talpa_tipas', 'AukšTis Mm', 'Skersmuo Mm', 'DN', 'Medžiaga', 'chemija'];
  const result: [string, string][] = [];
  for (const key of summaryKeys) {
    if (tankMeta[key] && !isEmptyValue(tankMeta[key]) && typeof tankMeta[key] !== 'object') {
      result.push([formatMetaLabel(key), String(tankMeta[key])]);
    }
  }
  // Also pick up any remaining scalar fields not in summaryKeys (max 4 more)
  if (result.length < 3) {
    for (const [k, v] of Object.entries(tankMeta)) {
      if (result.length >= 6) break;
      if (summaryKeys.includes(k) || SKIP_DISPLAY_KEYS.has(k) || TITLE_KEYS.has(k)) continue;
      if (k.startsWith('_')) continue;
      if (!isEmptyValue(v) && typeof v !== 'object') {
        result.push([formatMetaLabel(k), String(v)]);
      }
    }
  }
  return result;
}

function TabDerva({ record, products, readOnly, onRecordUpdated, externalIdx, hideNavigator, aiFirst, currentTalposId, currentTalposJson, onTalposJsonSaved }: { record: NestandartiniaiRecord; products: Record<string, any>[]; readOnly?: boolean; onRecordUpdated?: (r: NestandartiniaiRecord) => void; externalIdx?: number; hideNavigator?: boolean; aiFirst?: boolean; currentTalposId?: string | null; currentTalposJson?: any; onTalposJsonSaved?: (id: string, newJson: any) => void }) {
  const [currentIdx, setCurrentIdx] = useState(externalIdx ?? 0);
  const hasMultiple = products.length > 1;
  const idx = externalIdx !== undefined ? Math.min(externalIdx, products.length - 1) : Math.min(currentIdx, products.length - 1);
  const tankMeta = products[idx] || {};
  const tankKey = String(idx);

  // Per-tank derva results
  const [dervaPerTank, setDervaPerTank] = useState<Record<string, string>>(() => parseDervaPerTank(record.derva));
  const dervaResult = dervaPerTank[tankKey] || null;

  const selecting = useProcessing(record.id, 'derva');
  const [selectingTankIdx, setSelectingTankIdx] = useState<number | null>(null);
  const [dervaError, setDervaError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Per-tank derva_musu
  // When currentTalposId is provided, read/write from talpos.json per-row.
  // Otherwise fall back to legacy record.metadata storage.
  const getTalposMusu = (json: any): string => {
    const parsed = json && typeof json === 'object' ? json : tryParseJsonObject(json);
    return parsed?.derva_musu || '';
  };
  const [dervaMusuPerTank, setDervaMusuPerTank] = useState<Record<string, string>>(() => parseDervaMusuPerTank(record.metadata));
  const [dervaMusu, setDervaMusu] = useState<string>(() =>
    currentTalposId ? getTalposMusu(currentTalposJson) : (dervaMusuPerTank[tankKey] || '')
  );
  const [dervaMusuSaving, setDervaMusuSaving] = useState(false);
  const [dervaMusuSaved, setDervaMusuSaved] = useState(false);
  const [dervaMusuEditing, setDervaMusuEditing] = useState(false);

  // Sync dervaMusu input when switching tanks (idx reflects externalIdx or internal currentIdx)
  useEffect(() => {
    if (currentTalposId) {
      setDervaMusu(getTalposMusu(currentTalposJson));
    } else {
      setDervaMusu(dervaMusuPerTank[String(idx)] || '');
    }
    setDervaMusuEditing(false);
    setDervaError(null);
    setSuccess(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, currentTalposId, currentTalposJson]);

  // Sync with record prop changes (legacy path)
  useEffect(() => {
    setDervaPerTank(parseDervaPerTank(record.derva));
  }, [record.derva]);
  useEffect(() => {
    if (!currentTalposId) {
      setDervaMusuPerTank(parseDervaMusuPerTank(record.metadata));
    }
  }, [record.metadata, currentTalposId]);

  const saveDervaMusu = async (overrideValue?: string) => {
    const valueToSave = overrideValue !== undefined ? overrideValue : dervaMusu;
    setDervaMusuSaving(true);
    try {
      if (currentTalposId) {
        // New path: write derva_musu to this talpos row's json column
        const currentJsonObj = getTalposMusu(currentTalposJson) !== undefined
          ? (currentTalposJson && typeof currentTalposJson === 'object' ? currentTalposJson : (tryParseJsonObject(currentTalposJson) || {}))
          : {};
        const newJsonObj = valueToSave.trim()
          ? { ...currentJsonObj, derva_musu: valueToSave.trim() }
          : (() => { const { derva_musu: _r, ...rest } = currentJsonObj as any; return rest; })();
        await updateTalposField(currentTalposId, 'json', newJsonObj);
        onTalposJsonSaved?.(currentTalposId, newJsonObj);
        if (overrideValue !== undefined) setDervaMusu(valueToSave);
      } else {
        // Legacy path: write to record.metadata per-product index
        const updatedMeta = buildUpdatedMeta(record.metadata, 'derva_musu', valueToSave.trim() || null, [idx]);
        await updateNestandartiniaiField(record.id, 'metadata', updatedMeta);
        const updatedMusuPerTank = { ...dervaMusuPerTank };
        if (valueToSave.trim()) updatedMusuPerTank[tankKey] = valueToSave.trim();
        else delete updatedMusuPerTank[tankKey];
        setDervaMusuPerTank(updatedMusuPerTank);
        if (overrideValue !== undefined) setDervaMusu(valueToSave);
        const updated = await fetchNestandartiniaiById(record.id);
        if (updated) onRecordUpdated?.(updated);
      }
      setDervaMusuSaved(true);
      setDervaMusuEditing(false);
      setTimeout(() => setDervaMusuSaved(false), 3000);
    } catch (e: any) {
      console.error('Error saving derva_musu:', e);
    } finally {
      setDervaMusuSaving(false);
    }
  };

  const triggerDervaSelect = async () => {
    setDervaError(null);
    setSuccess(false);
    setSelectingTankIdx(idx);
    setProcessing(record.id, 'derva', true);

    try {
      const webhookUrl = await getWebhookUrl('n8n_derva_select');
      if (!webhookUrl) {
        setDervaError('Webhook "n8n_derva_select" nesukonfigūruotas. Nustatykite jį Webhooks nustatymuose.');
        return;
      }

      // Build clean tank metadata — only scalar fields relevant to this specific tank
      const cleanTankMeta: Record<string, any> = {};
      for (const [k, v] of Object.entries(tankMeta)) {
        if (k.startsWith('_')) continue; // skip internal fields
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object' && !Array.isArray(v)) continue; // skip nested objects
        cleanTankMeta[k] = v;
      }

      const currentDervaMusuValue = dervaMusu || 'neparinkta';

      // Send only this tank's metadata + product_index
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.id,
          product_index: idx,
          product_count: products.length,
          product_name: getProductTitle(tankMeta) || `Talpa ${idx + 1}`,
          product_metadata: cleanTankMeta,
          derva_org: formatDervaOrg(tankMeta),
          derva_musu: currentDervaMusuValue,
          project_name: record.project_name,
          description: record.description,
          klientas: record.klientas,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Serverio klaida (${resp.status})${errText ? `: ${errText}` : ''}`);
      }

      // Fetch updated record — webhook may have written to derva column
      const updated = await fetchNestandartiniaiById(record.id);
      if (updated) {
        const freshDerva = updated.derva || '';
        // Check if webhook wrote a per-tank JSON or a plain string
        const parsed = parseDervaPerTank(freshDerva);
        if (Object.keys(parsed).length > 0 && parsed[tankKey]) {
          // Webhook already wrote per-tank format — use as-is
          setDervaPerTank(parsed);
        } else {
          // Webhook wrote a plain string — merge it into our per-tank structure
          const plainResult = freshDerva || '';
          if (plainResult) {
            const merged = { ...dervaPerTank, [tankKey]: plainResult };
            setDervaPerTank(merged);
            // Save merged per-tank structure back to the derva column
            await updateNestandartiniaiField(record.id, 'derva', JSON.stringify(merged));
          }
        }
        onRecordUpdated?.(await fetchNestandartiniaiById(record.id) || updated);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e: any) {
      console.error('Derva select error:', e);
      setDervaError(e.message || 'Nepavyko gauti dervos rekomendacijos');
      try {
        const updated = await fetchNestandartiniaiById(record.id);
        if (updated) {
          const parsed = parseDervaPerTank(updated.derva);
          if (Object.keys(parsed).length > 0) setDervaPerTank(parsed);
          onRecordUpdated?.(updated);
        }
      } catch { /* ignore */ }
    } finally {
      setProcessing(record.id, 'derva', false);
      setSelectingTankIdx(null);
    }
  };

  const tankTitle = getProductTitle(tankMeta) || `Talpa ${idx + 1}`;
  const tankSpecs = getTankSpecsSummary(tankMeta);
  const isCurrentTankSelecting = selecting && selectingTankIdx === idx;

  // Count how many tanks have derva results
  const tanksWithDerva = products.filter((_, i) => !!dervaPerTank[String(i)]).length;

  const goPrev = () => setCurrentIdx(i => (i - 1 + products.length) % products.length);
  const goNext = () => setCurrentIdx(i => (i + 1) % products.length);

  // Inline JSX sections for reuse
  const dervaMusuSection = (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Beaker className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
          <p className="text-xs font-medium" style={{ color: '#007AFF' }}>Derva (mūsų)</p>
        </div>
        {!readOnly && !dervaMusuEditing && (
          <button
            onClick={() => setDervaMusuEditing(true)}
            className="text-xs px-2.5 py-1 rounded-full transition-colors text-base-content/50 hover:text-base-content/70 hover:bg-base-content/5"
          >
            <Pencil className="w-3 h-3 inline mr-1" />
            Redaguoti
          </button>
        )}
      </div>
      {dervaMusuEditing ? (
        <div className="rounded-xl p-3 border border-primary/20 bg-primary/[0.02]">
          <textarea
            value={dervaMusu}
            onChange={e => setDervaMusu(e.target.value)}
            placeholder="Įveskite dervos reikšmę šiai talpai..."
            className="w-full text-sm bg-transparent outline-none text-base-content placeholder:text-base-content/30 mb-2 resize-y min-h-[60px]"
            rows={Math.max(3, dervaMusu.split('\n').length)}
            onKeyDown={e => { if (e.key === 'Escape') { setDervaMusuEditing(false); setDervaMusu(currentDervaMusu); } }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setDervaMusuEditing(false); setDervaMusu(currentDervaMusu); }}
              className="text-xs px-3 py-1.5 rounded-full text-base-content/50 hover:bg-base-content/5 transition-colors"
            >
              Atšaukti
            </button>
            <button
              onClick={() => saveDervaMusu()}
              disabled={dervaMusuSaving}
              className="text-xs px-3 py-1.5 rounded-full text-white transition-all hover:opacity-80 disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
            >
              {dervaMusuSaving ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Saugoma...</> : 'Išsaugoti'}
            </button>
          </div>
        </div>
      ) : dervaMusu ? (
        <div className="rounded-xl px-4 py-3 border border-primary/15" style={{ background: 'rgba(0,122,255,0.04)' }}>
          <MarkdownText text={dervaMusu} />
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 border border-dashed border-base-content/10 bg-base-content/[0.02] text-center">
          <p className="text-xs text-base-content/40">Nenustatyta</p>
        </div>
      )}
      {dervaMusuSaved && (
        <div className="flex items-center gap-1.5 text-xs mt-2 text-success">
          <CheckCircle2 className="w-3 h-3" />
          Išsaugota
        </div>
      )}
    </div>
  );

  const aiSection = (
    <div className="mb-6">
      {/* ── AI Derva selection section (per tank) ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Beaker className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-medium text-primary">AI rekomendacija</p>
          {dervaResult && dervaMusu.trim() === dervaResult.trim() && (
            <div className="flex items-center gap-1 ml-1.5 text-[11px] text-success/70" title="Rekomendacija naudojama aukščiau">
              <ArrowUp className="w-3 h-3" />
              <span>Naudojama</span>
            </div>
          )}
        </div>
        {!readOnly && (() => {
          const isApplied = !!(dervaResult && dervaMusu.trim() === dervaResult.trim());
          return (
          <div className="flex items-center gap-2">
            {isApplied ? (
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full"
                style={{ background: 'rgba(52, 199, 89, 0.1)', border: '0.5px solid rgba(52, 199, 89, 0.3)' }}
                title="Rekomendacija jau naudojama"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              </div>
            ) : (
              <button
                onClick={() => dervaResult && saveDervaMusu(dervaResult)}
                disabled={!dervaResult || selecting || dervaMusuSaving}
                className="flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-3xl transition-all"
                style={{
                  background: dervaResult && !selecting && !dervaMusuSaving ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0,0,0,0.03)',
                  color: dervaResult && !selecting && !dervaMusuSaving ? '#34C759' : '#8a857f',
                  border: `0.5px solid ${dervaResult && !selecting && !dervaMusuSaving ? 'rgba(52, 199, 89, 0.3)' : 'rgba(0,0,0,0.08)'}`,
                  cursor: !dervaResult || selecting || dervaMusuSaving ? 'not-allowed' : 'pointer',
                  opacity: !dervaResult || selecting ? 0.5 : 1,
                }}
              >
                {dervaMusuSaving
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Išsaugoma...</>
                  : <><CheckCircle2 className="w-3.5 h-3.5" /> Naudoti</>
                }
              </button>
            )}
            <button
              onClick={triggerDervaSelect}
              disabled={selecting}
              className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-3xl text-white transition-all hover:opacity-80 disabled:opacity-60"
              style={{ background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)' }}
            >
              {isCurrentTankSelecting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizuojama...</>
                : selecting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Laukiama...</>
                  : dervaResult
                    ? <><RefreshCw className="w-3.5 h-3.5" /> Parinkti iš naujo</>
                    : <><Beaker className="w-3.5 h-3.5" /> Parinkti dervą</>
              }
            </button>
          </div>
          );
        })()}
      </div>

      {/* Loading state */}
      {isCurrentTankSelecting && (
        <div className="rounded-xl p-6 mb-4 text-center border border-primary/15 bg-primary/[0.03]">
          <div className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center bg-primary/10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-base-content">Vyksta dervos parinkimas...</p>
          <p className="text-xs text-base-content/50 mt-1">{tankTitle}</p>
        </div>
      )}

      {/* Success toast */}
      {success && !selecting && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-success/10 text-success border border-success/15">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Dervos rekomendacija sėkmingai atnaujinta
        </div>
      )}

      {/* Error */}
      {dervaError && (
        <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg mb-3 bg-error/5 text-error border border-error/10">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{dervaError}</span>
        </div>
      )}

      {/* Recommendation display — hide content when already applied to derva_musu */}
      {dervaResult && !isCurrentTankSelecting && dervaMusu.trim() !== dervaResult.trim() ? (
        <div className="rounded-xl p-4 border border-blue-200/60" style={{ background: 'rgba(219, 234, 254, 0.25)' }}>
          <MarkdownText text={dervaResult} />
        </div>
      ) : !isCurrentTankSelecting && !dervaResult && (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-base-content/10 bg-base-content/[0.02]">
          <div className="w-11 h-11 rounded-full mb-3 flex items-center justify-center bg-primary/10">
            <Beaker className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-base-content">Derva dar neparinkta</p>
          <p className="text-xs text-base-content/40 mt-1">{tankTitle}</p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* ── Tank navigator ── */}
      {!hideNavigator && hasMultiple && (
        <div className="flex items-center gap-1 mb-5">
          <button onClick={goPrev} className="p-1 rounded-md hover:bg-base-content/8" title="Ankstesnė talpa">
            <ChevronLeft className="w-4 h-4 text-base-content/40" />
          </button>
          <select
            value={idx}
            onChange={e => setCurrentIdx(Number(e.target.value))}
            className="flex-1 min-w-0 text-xs font-medium bg-base-content/[0.03] text-base-content/80 border border-base-content/8 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/30 cursor-pointer truncate"
          >
            {products.map((p, i) => {
              const hasDerva = !!dervaPerTank[String(i)];
              return (
                <option key={i} value={i}>
                  {i + 1}. {getProductTitle(p) || `Talpa ${i + 1}`}{hasDerva ? ' \u2713' : ''}
                </option>
              );
            })}
          </select>
          <button onClick={goNext} className="p-1 rounded-md hover:bg-base-content/8" title="Kita talpa">
            <ChevronRight className="w-4 h-4 text-base-content/40" />
          </button>
          {tanksWithDerva > 0 && (
            <span className="text-[11px] text-success shrink-0">{tanksWithDerva}/{products.length}</span>
          )}
        </div>
      )}

      {/* ── Tank specs summary ── */}
      {!hideNavigator && tankSpecs.length > 0 && (
        <div className="mb-5 rounded-xl border border-base-content/8 bg-base-content/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40 mb-2">Talpos parametrai</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {tankSpecs.map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-[11px] text-base-content/50 shrink-0">{label}:</span>
                <span className="text-[11px] font-medium text-base-content truncate">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiFirst ? (
        <>
          {aiSection}
          {dervaMusuSection}
        </>
      ) : (
        <>
          {dervaMusuSection}
          <div className="border-t border-base-content/10 pt-5">
            {aiSection}
          </div>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (editable, used from within the app)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function PaklausimoModal({ record, onClose, onDeleted, onRefresh }: { record: NestandartiniaiRecord; onClose: () => void; onDeleted?: () => void; onRefresh?: (updated: NestandartiniaiRecord) => void }) {
  const [activeTab, setActiveTab] = useState<ModalTab>('talpos');
  const [updating, setUpdating] = useState(false);
  const [updatingMode, setUpdatingMode] = useState<'save' | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [dirtyTabs, setDirtyTabs] = useState<Set<ModalTab>>(new Set());
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const meta = parseMetadata(record.metadata);
  const products = parseProducts(record.metadata);
  const cardUrl = `${window.location.origin}/paklausimas/${record.id}`;
  const [copied, setCopied] = useState(false);
  const hasContextChanges = dirtyTabs.size > 0;
  const isLocked = !!record.status;

  // Local override for the `files` field — updated after successful upload so
  // TabFailai can display newly-uploaded files without a full record refresh.
  const [localFiles, setLocalFiles] = useState<string | null>(null);
  const effectiveRecord = localFiles !== null ? { ...record, files: localFiles } : record;

  // Pending data: stored locally until Atnaujinti is pressed
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingMessages, setPendingMessages] = useState<AtsakymasMessage[] | null>(null);


  // Price (kaina) state — per-tank pricing stored in metadata._kaina_per_tank
  const [kainaMap, setKainaMap] = useState<Record<string, number>>(() => resolveKainaMap(record));
  // Re-sync when record changes
  useEffect(() => {
    setKainaMap(resolveKainaMap(record));
  }, [record.kaina, record.metadata]);

  const handleTankKainaChange = async (tankIdx: number, value: number | null) => {
    // Find all tanks that belong to the same dedup group as tankIdx so the
    // price is applied uniformly to every identical tank, not just the one
    // the user happened to edit.
    const currentProducts = parseProducts(record.metadata);
    const groups = deduplicateProducts(currentProducts);
    const group = groups.find(g => g.originalIndices.includes(tankIdx));
    const groupIndices = new Set(group?.originalIndices ?? [tankIdx]);

    const newMap = { ...kainaMap };
    for (const idx of groupIndices) {
      if (value === null) {
        delete newMap[String(idx)];
      } else {
        newMap[String(idx)] = value;
      }
    }
    setKainaMap(newMap);
    try {
      // Embed kaina inside every tank in the group (same pattern as persistProducts)
      const newProducts = currentProducts.map((p, i) => {
        if (!groupIndices.has(i)) return p;
        if (value === null) {
          const { kaina: _removed, ...rest } = p;
          return rest;
        }
        return { ...p, kaina: value };
      });

      let rawMeta: any = record.metadata;
      if (typeof rawMeta === 'string') { try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = {}; } }
      let updatedMeta: any;
      if (Array.isArray(rawMeta) && rawMeta.length > 0 && rawMeta[0] && typeof rawMeta[0] === 'object') {
        const root = { ...rawMeta[0] };
        let wrapperKey: string | null = null;
        for (const k of ['products', 'talpos', 'gaminiai', 'items']) {
          if (Array.isArray(root[k])) { wrapperKey = k; break; }
        }
        if (wrapperKey) {
          root[wrapperKey] = newProducts;
          updatedMeta = [root, ...rawMeta.slice(1)];
        } else {
          updatedMeta = newProducts;
        }
      } else if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
        let wrapperKey: string | null = null;
        for (const k of ['products', 'talpos', 'gaminiai', 'items']) {
          if (Array.isArray(rawMeta[k])) { wrapperKey = k; break; }
        }
        updatedMeta = wrapperKey
          ? { ...rawMeta, [wrapperKey]: newProducts }
          : (newProducts.length === 1 ? newProducts[0] : newProducts);
      } else {
        updatedMeta = newProducts.length === 1 ? newProducts[0] : newProducts;
      }

      // kaina column is `real` — store the total sum
      const total = Object.values(newMap).reduce((sum, p) => sum + p, 0);
      const kainaValue = Object.keys(newMap).length > 0 ? total : null;

      await updateNestandartiniaiField(record.id, 'metadata', updatedMeta);
      await updateNestandartiniaiField(record.id, 'kaina', kainaValue);
      const updated = await fetchNestandartiniaiById(record.id);
      if (updated) onRefresh?.(updated);
    } catch (e) {
      console.error('Error saving kaina:', e);
    }
  };

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteRecord = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteNestandartiniaiRecord(record);
      setShowDeleteConfirm(false);
      onDeleted?.();
      onClose();
    } catch (err: any) {
      console.error('Delete record error:', err);
      setDeleteError(err?.message || 'Nepavyko ištrinti įrašo');
    } finally {
      setDeleting(false);
    }
  };

  const handleMessagesChange = useCallback((msgs: AtsakymasMessage[]) => {
    setPendingMessages(msgs);
    setDirtyTabs(prev => new Set(prev).add('susirasinejimas'));
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(cardUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };


  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  const addPendingFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const tooLarge = files.filter(f => f.size > MAX_FILE_SIZE);
    if (tooLarge.length > 0) {
      const names = tooLarge.map(f => f.name).join(', ');
      setFileSizeError(`Per dideli failai (maks. 5 MB): ${names}`);
      setTimeout(() => setFileSizeError(null), 5000);
      // Only add files that are within the limit
      const valid = files.filter(f => f.size <= MAX_FILE_SIZE);
      if (valid.length === 0) return;
      files = valid;
    } else {
      setFileSizeError(null);
    }
    const newPending = files.map(f => ({ localId: crypto.randomUUID(), file: f }));
    setPendingFiles(prev => [...prev, ...newPending]);
    setDirtyTabs(prev => new Set(prev).add('failai'));
  }, []);

  const removePendingFile = useCallback((localId: string) => {
    setPendingFiles(prev => {
      const next = prev.filter(pf => pf.localId !== localId);
      // If no pending files left, clear the dirty flag for failai
      if (next.length === 0) {
        setDirtyTabs(prev2 => {
          const s = new Set(prev2);
          s.delete('failai');
          return s;
        });
      }
      return next;
    });
  }, []);

  const executeSaveAndProcess = async () => {
    setUpdating(true);
    setUpdatingMode('save');
    setUpdateStatus('idle');
    try {
      // 1. Save pending messages to DB
      if (pendingMessages !== null) {
        await updateNestandartiniaiAtsakymas(record.id, pendingMessages);
      }

      // 2. Upload pending files to Directus and store last UUID in `files` field
      const uploadedFileIds: string[] = [];
      if (pendingFiles.length > 0) {
        for (const pf of pendingFiles) {
          const form = new FormData();
          form.append('file', pf.file);
          const resp = await fetch(`${DIRECTUS_URL}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
            body: form,
          });
          if (!resp.ok) throw new Error(`Failo įkėlimas nepavyko: ${resp.status}`);
          const json = await resp.json();
          uploadedFileIds.push(json.data.id);
        }

        // Append new UUIDs to existing ones, store comma-separated in `files`
        const existingIds = getFileIds(effectiveRecord);
        const allIds = [...new Set([...existingIds, ...uploadedFileIds])];
        const newFilesValue = allIds.join(',');
        await updateNestandartiniaiField(record.id, 'files', newFilesValue);
        // Update local override so TabFailai re-renders with new files
        setLocalFiles(newFilesValue);
      }

      // 3. Clear pending state
      setUpdateStatus('saved');
      setPendingFiles([]);
      setPendingMessages(null);
      setDirtyTabs(new Set());
      setShowCloseConfirm(false);
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } catch (err: any) {
      console.error('Update error:', err);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } finally {
      setUpdating(false);
      setUpdatingMode(null);
    }
  };

  const handleSaveOnly = () => {
    executeSaveAndProcess();
  };

  const handleClose = () => {
    if (hasContextChanges) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const [refreshing, setRefreshing] = useState(false);
  const refreshRecord = async () => {
    setRefreshing(true);
    try {
      const updated = await fetchNestandartiniaiById(record.id);
      if (updated) onRefresh?.(updated);
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-6"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={handleClose}
    >
      <div
        className="w-full flex flex-col bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl"
        style={{ maxWidth: '960px', height: 'min(90vh, 860px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Accent strip */}
        <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-base-content/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold truncate text-base-content" style={{ letterSpacing: '-0.02em' }}>
                {record.project_name || (meta as any)?.projektas || products[0]?.projekto_kontekstas_Projekto_pavadinimas || 'Paklausimas'}
              </h2>
              {(meta.pritaikymas || products[0]?.pritaikymas) ? (
                <p className="text-sm mt-0.5 truncate text-base-content/50">
                  {meta.pritaikymas || products[0]?.pritaikymas}
                  {products.length > 1 && <span className="text-base-content/30"> · {products.length} gaminiai</span>}
                </p>
              ) : (
                <p className="text-sm mt-0.5 text-base-content/40">
                  Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}
                  {products.length > 1 && <span> · {products.length} gaminiai</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {record.klientas && (
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">
                  {record.klientas}
                </span>
              )}
              <button onClick={refreshRecord} disabled={refreshing} className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5" title="Atnaujinti duomenis">
                <RefreshCw className={`w-4 h-4 text-base-content/40 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={copy} className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5" title="Kopijuoti nuorodą">
                <Link2 className={`w-4 h-4 ${copied ? '' : 'text-base-content/40'}`} style={copied ? { color: '#34C759' } : undefined} />
              </button>
              <a href={cardUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5" title="Atidaryti naujame lange">
                <ExternalLink className="w-4 h-4 text-base-content/40" />
              </a>
              <button onClick={handleClose} className="p-1.5 rounded-lg transition-colors hover:bg-base-content/5">
                <X className="w-4 h-4 text-base-content/40" />
              </button>
            </div>
          </div>
        </div>

        {/* Body: sidebar tabs + content */}
        <div className="flex flex-1 min-h-0">
          {/* Side tabs */}
          <div className="w-[160px] shrink-0 py-3 px-2 border-r border-base-content/10 bg-base-200/40 flex flex-col">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 mb-0.5 ${active ? 'font-medium bg-base-100 border border-base-content/15 shadow-sm text-primary' : 'text-base-content/60 hover:bg-base-content/5'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{tab.label}</span>
                  {dirtyTabs.has(tab.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                </button>
              );
            })}
            {/* Save */}
            {!isLocked && (
              <button
                onClick={handleSaveOnly}
                disabled={updating || !hasContextChanges}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-3xl text-xs font-medium transition-all mt-3 ${
                  updateStatus === 'saved'
                    ? 'text-success bg-success/10 border border-success/20'
                    : hasContextChanges
                      ? 'text-base-content/70 hover:bg-base-content/5'
                      : 'text-base-content/30'
                } disabled:opacity-50`}
                style={updateStatus !== 'saved' ? { background: '#f8f8f9', border: '1px solid #e5e5e6' } : undefined}
              >
                {updatingMode === 'save'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saugoma...</>
                  : updateStatus === 'saved'
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Išsaugota</>
                    : <><Save className="w-3.5 h-3.5" /> Išsaugoti</>
                }
              </button>
            )}
            {/* Delete record – pushed to bottom */}
            <div className="mt-auto pt-3">
              {!isLocked && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-base-content/30 transition-all hover:text-error hover:bg-error/5"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Ištrinti</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden p-6 min-h-0 bg-base-100 flex flex-col">
            {activeTab === 'talpos' && <TabTalpos record={record} products={products} readOnly={isLocked} onRecordUpdated={onRefresh} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={effectiveRecord} readOnly={isLocked} pendingMessages={pendingMessages ?? undefined} onMessagesChange={handleMessagesChange} />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} readOnly={isLocked} />}
            {activeTab === 'failai' && (
              <>
                {fileSizeError && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium bg-error/10 text-error">
                    {fileSizeError}
                  </div>
                )}
                <TabFailai record={effectiveRecord} readOnly={isLocked} pendingFiles={pendingFiles} onAddFiles={addPendingFiles} onRemovePendingFile={removePendingFile} onDeleteFile={setLocalFiles} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Partial-changes warning modal */}
      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-[15px] font-semibold text-base-content" style={{ letterSpacing: '-0.02em' }}>Neišsaugoti pakeitimai</p>
              </div>
              <p className="text-sm text-base-content/50 mb-6 ml-12" style={{ lineHeight: '1.6' }}>
                Turite neišsaugotų pakeitimų. Galite išsaugoti duomenis arba išsaugoti ir apdoroti kontekstą.
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-base-content/60 transition-all hover:bg-base-content/5"
                    style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                  >
                    Uždaryti
                  </button>
                  <button
                    onClick={() => { executeSaveAndProcess(); }}
                    disabled={updating}
                    className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-base-content/70 transition-all hover:bg-base-content/5 disabled:opacity-60"
                    style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                  >
                    {updatingMode === 'save' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saugoma...</> : <><Save className="w-3.5 h-3.5" /> Išsaugoti</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 className="w-4 h-4 text-error" />
                </div>
                <p className="text-[15px] font-semibold text-base-content" style={{ letterSpacing: '-0.02em' }}>Ištrinti įrašą</p>
              </div>
              <p className="text-sm text-base-content/50 mb-6 ml-12" style={{ lineHeight: '1.6' }}>
                Įrašas <strong className="text-base-content/70">{record.project_name || (meta as any)?.projektas || products[0]?.projekto_kontekstas_Projekto_pavadinimas || `#${record.id}`}</strong> ir visi susiję failai bus ištrinti negrįžtamai.
              </p>
              {deleteError && (
                <p className="text-xs text-error mb-4 ml-12">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-base-content/60 transition-all hover:bg-base-content/5 disabled:opacity-60"
                  style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleDeleteRecord}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium px-3 py-2.5 rounded-3xl text-white transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                >
                  {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Trinama...</> : <><Trash2 className="w-3.5 h-3.5" /> Ištrinti</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone page – /paklausimas/:id (read-only, shareable)
// ---------------------------------------------------------------------------

export default function PaklausimoKortelePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialTalposId = searchParams.get('talpa') ?? undefined;
  const [record, setRecord] = useState<NestandartiniaiRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('talpos');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try { setLoading(true); const d = await fetchNestandartiniaiById(Number(id)); if (!d) { setError('Įrašas nerastas'); return; } setRecord(d); }
      catch (err: any) { setError(err?.message || 'Nepavyko gauti duomenų'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-base-100"><span className="loading loading-spinner loading-md text-primary"></span></div>;
  if (error || !record) return <div className="h-screen flex items-center justify-center bg-base-100"><div className="text-center"><p className="text-lg font-medium mb-1 text-base-content">{error || 'Nerastas'}</p><p className="text-sm text-base-content/40">Patikrinkite nuorodą.</p></div></div>;

  const meta = parseMetadata(record.metadata);
  const products = parseProducts(record.metadata);
  const kainaMap = resolveKainaMap(record);
  const handleTankKainaChange = () => {}; // read-only page

  const readOnlyTabs = TABS;

  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-hidden bg-base-100">
      <div className="w-full flex flex-col bg-base-100 rounded-xl overflow-hidden border border-base-content/10 shadow-xl" style={{ maxWidth: '960px', height: 'min(90vh, 860px)' }}>
        {/* Accent strip */}
        <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0 border-b border-base-content/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold truncate text-base-content" style={{ letterSpacing: '-0.02em' }}>{record.project_name || (meta as any)?.projektas || products[0]?.projekto_kontekstas_Projekto_pavadinimas || 'Paklausimas'}</h2>
              {(meta.pritaikymas || products[0]?.pritaikymas) ? (
                <p className="text-sm mt-0.5 truncate text-base-content/50">
                  {meta.pritaikymas || products[0]?.pritaikymas}
                  {products.length > 1 && <span className="text-base-content/30"> · {products.length} gaminiai</span>}
                </p>
              ) : (
                <p className="text-sm mt-0.5 text-base-content/40">
                  Nr. {record.id}{record.pateikimo_data && ` · ${record.pateikimo_data}`}
                  {products.length > 1 && <span> · {products.length} gaminiai</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {record.klientas && (
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">{record.klientas}</span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="w-[160px] shrink-0 py-3 px-2 border-r border-base-content/10 bg-base-200/40">
            {readOnlyTabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 mb-0.5 ${active ? 'font-medium bg-base-100 border border-base-content/15 shadow-sm text-primary' : 'text-base-content/60 hover:bg-base-content/5'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-hidden p-6 min-h-0 bg-base-100 flex flex-col">
            {activeTab === 'talpos' && <TabTalpos record={record} products={products} readOnly initialTalposId={initialTalposId} />}
            {activeTab === 'susirasinejimas' && <TabSusirasinejimas record={record} readOnly />}
            {activeTab === 'uzduotys' && <TabUzduotys record={record} readOnly />}
            {activeTab === 'failai' && <TabFailai record={record} readOnly />}
          </div>
        </div>
      </div>
    </div>
  );
}
