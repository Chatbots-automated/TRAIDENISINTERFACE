import type { AtsakymasMessage } from '../../lib/dokumentaiService';

export function getSantraukaFromMetadata(raw: any): string {
  if (!raw) return '';
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return ''; } }
  if (Array.isArray(obj) && obj.length > 0) obj = obj[0];
  return obj?.santrauka || obj?.Santrauka || '';
}

export function parseMetadata(raw: string | Record<string, string> | any[] | null | undefined): Record<string, string> {
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
export function parseKainaMapStatic(v: any): Record<string, number> {
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
export function parseProducts(raw: string | Record<string, any> | any[] | null | undefined): Record<string, any>[] {
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
export function tryParseJsonObject(v: any): Record<string, any> | null {
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

export function parseJSON<T>(raw: T | string | null): T | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export function parseAtsakymas(raw: string | AtsakymasMessage[] | null): AtsakymasMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch { /* fall back to plain text */ }
    return [{ text: raw }];
  }
  return [];
}
