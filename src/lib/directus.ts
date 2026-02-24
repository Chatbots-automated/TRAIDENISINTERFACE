/**
 * ============================================================================
 * DIRECTUS REST API CLIENT
 * ============================================================================
 *
 * THIS APPLICATION USES DIRECTUS AS ITS DATABASE API LAYER.
 * >>> NOT Supabase. NOT PostgREST. NOT Firebase. DIRECTUS ONLY. <<<
 *
 * Directus instance: https://sql.traidenis.org
 * Docs: https://docs.directus.io/reference/introduction.html
 *
 * This is a custom query-builder client that wraps the Directus REST API
 * with a fluent interface: db.from('collection').select().eq().order()
 *
 * All database operations in the entire application flow through this client.
 * The query-builder syntax may look similar to Supabase/PostgREST, but
 * under the hood every request hits the Directus REST API.
 *
 * Directus API pattern:
 *   GET    /items/<collection>          → list items
 *   GET    /items/<collection>/<id>     → get single item
 *   POST   /items/<collection>          → create item(s)
 *   PATCH  /items/<collection>/<id>     → update single item
 *   PATCH  /items/<collection>          → update multiple items (with filter)
 *   DELETE /items/<collection>/<id>     → delete single item
 *   DELETE /items/<collection>          → delete multiple items (with filter)
 *
 * Authentication: Authorization: Bearer <static_token>
 *
 * Query params (Directus-specific):
 *   fields=field1,field2              → select fields
 *   filter[field][_operator]=value    → filtering (_eq, _neq, _gt, _contains, _in, etc.)
 *   sort=field,-field2                → sorting (- prefix = DESC)
 *   limit=N                           → limit results
 *   offset=N                          → skip results
 *   search=term                       → full-text search
 *
 * Environment variables:
 *   VITE_DIRECTUS_URL   → Directus instance URL
 *   VITE_DIRECTUS_TOKEN → Static Bearer token for authentication
 * ============================================================================
 */

const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org';
const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

// Response types - keep the same interface for backward compatibility
interface DirectusError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface DirectusResponse<T> {
  data: T | null;
  error: DirectusError | null;
}

// Internal: raw Directus API response envelope
interface DirectusAPIResponse<T> {
  data: T;
  meta?: {
    total_count?: number;
    filter_count?: number;
  };
}

/**
 * Filter entry for Directus-style filters.
 * Stored as { field, operator, value } and serialized to
 * filter[field][_operator]=value in the URL.
 */
interface FilterEntry {
  field: string;
  operator: string;
  value: any;
}

// ============================================================================
// Query Builder (SELECT)
// ============================================================================

class DirectusQueryBuilder<T = any> {
  private baseUrl: string;
  private collection: string;
  private token: string;
  private filters: FilterEntry[] = [];
  private selectFields: string = '*';
  private sortSpec?: string;
  private limitValue?: number;
  private offsetValue?: number;
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, collection: string, token: string) {
    this.baseUrl = baseUrl;
    this.collection = collection;
    this.token = token;
  }

  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_eq', value });
    return this;
  }

  neq(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_neq', value });
    return this;
  }

  gt(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_gt', value });
    return this;
  }

  gte(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_gte', value });
    return this;
  }

  lt(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_lt', value });
    return this;
  }

  lte(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_lte', value });
    return this;
  }

  like(column: string, pattern: string): this {
    this.filters.push({ field: column, operator: '_contains', value: pattern.replace(/%/g, '') });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.filters.push({ field: column, operator: '_icontains', value: pattern.replace(/%/g, '') });
    return this;
  }

  is(column: string, value: null | boolean): this {
    if (value === null) {
      this.filters.push({ field: column, operator: '_null', value: true });
    } else {
      this.filters.push({ field: column, operator: '_eq', value });
    }
    return this;
  }

  not(column: string, operator: string, value: any): this {
    if (operator === 'is' && value === null) {
      this.filters.push({ field: column, operator: '_nnull', value: true });
    } else if (operator === 'eq') {
      this.filters.push({ field: column, operator: '_neq', value });
    } else if (operator === 'in') {
      this.filters.push({ field: column, operator: '_nin', value });
    } else {
      this.filters.push({ field: column, operator: '_neq', value });
    }
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters.push({ field: column, operator: '_in', value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const ascending = options?.ascending ?? true;
    this.sortSpec = ascending ? column : `-${column}`;
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    this.limitValue = 1;
    return this;
  }

  then<TResult1 = DirectusResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: DirectusResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildFilterParams(): string {
    const parts: string[] = [];

    for (const f of this.filters) {
      if (Array.isArray(f.value)) {
        // _in operator: filter[field][_in]=val1,val2
        parts.push(`filter[${f.field}][${f.operator}]=${f.value.map(v => encodeURIComponent(v)).join(',')}`);
      } else if (f.operator === '_null' || f.operator === '_nnull') {
        parts.push(`filter[${f.field}][${f.operator}]=true`);
      } else {
        parts.push(`filter[${f.field}][${f.operator}]=${encodeURIComponent(f.value)}`);
      }
    }

    return parts.join('&');
  }

  private async execute(): Promise<DirectusResponse<T[] | T>> {
    try {
      const params: string[] = [];

      // Fields
      if (this.selectFields && this.selectFields !== '*') {
        params.push(`fields=${encodeURIComponent(this.selectFields)}`);
      }

      // Filters
      const filterStr = this.buildFilterParams();
      if (filterStr) params.push(filterStr);

      // Sort
      if (this.sortSpec) {
        params.push(`sort=${encodeURIComponent(this.sortSpec)}`);
      }

      // Limit
      if (this.limitValue !== undefined) {
        params.push(`limit=${this.limitValue}`);
      }

      // Offset
      if (this.offsetValue !== undefined) {
        params.push(`offset=${this.offsetValue}`);
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const url = `${this.baseUrl}/items/${this.collection}${queryString}`;

      console.log('[Directus] GET', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.token)
      });

      console.log('[Directus] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await parseDirectusError(response);
        console.error('[Directus] Error:', error);
        return { data: null, error };
      }

      const json: DirectusAPIResponse<T[]> = await response.json();
      console.log('[Directus] Success, items:', json.data?.length ?? 0);

      if (this.isSingleResult) {
        const item = json.data?.[0] ?? null;
        if (!item) {
          return {
            data: null,
            error: { message: 'Item not found', code: 'NOT_FOUND' }
          };
        }
        return { data: item as unknown as T, error: null };
      }

      return { data: json.data as unknown as T[] | T, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Network error',
          details: error.toString()
        }
      };
    }
  }
}

// ============================================================================
// Insert Builder (POST)
// ============================================================================

class DirectusInsertBuilder<T = any> {
  private baseUrl: string;
  private collection: string;
  private token: string;
  private payload: any;
  private selectFields: string = '';
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, collection: string, token: string, payload: any) {
    this.baseUrl = baseUrl;
    this.collection = collection;
    this.token = token;
    // Directus expects a single object or array of objects; normalize accordingly
    this.payload = Array.isArray(payload) ? (payload.length === 1 ? payload[0] : payload) : payload;
  }

  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    return this;
  }

  then<TResult1 = DirectusResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: DirectusResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DirectusResponse<T[] | T>> {
    try {
      const params: string[] = [];
      if (this.selectFields) {
        params.push(`fields=${encodeURIComponent(this.selectFields)}`);
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const url = `${this.baseUrl}/items/${this.collection}${queryString}`;

      console.log('[Directus] POST', url);
      console.log('[Directus] Body:', this.payload);

      const response = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(this.token),
        body: JSON.stringify(this.payload)
      });

      console.log('[Directus] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await parseDirectusError(response);
        console.error('[Directus] Error:', error);
        return { data: null, error };
      }

      const json: DirectusAPIResponse<T | T[]> = await response.json();
      console.log('[Directus] Success:', json.data);

      // Directus returns { data: <item> } for single insert, { data: [items] } for batch
      const resultData = json.data;

      if (this.isSingleResult) {
        const item = Array.isArray(resultData) ? resultData[0] : resultData;
        return { data: item as T, error: null };
      }

      return { data: resultData as T[] | T, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Network error',
          details: error.toString()
        }
      };
    }
  }
}

// ============================================================================
// Update Builder (PATCH)
// ============================================================================

class DirectusUpdateBuilder<T = any> {
  private baseUrl: string;
  private collection: string;
  private token: string;
  private payload: any;
  private filters: FilterEntry[] = [];
  private selectFields: string = '';
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, collection: string, token: string, payload: any) {
    this.baseUrl = baseUrl;
    this.collection = collection;
    this.token = token;
    this.payload = payload;
  }

  eq(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_eq', value });
    return this;
  }

  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    return this;
  }

  then<TResult1 = DirectusResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: DirectusResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildFilterParams(): string {
    const parts: string[] = [];
    for (const f of this.filters) {
      parts.push(`filter[${f.field}][${f.operator}]=${encodeURIComponent(f.value)}`);
    }
    return parts.join('&');
  }

  private async execute(): Promise<DirectusResponse<T[] | T>> {
    try {
      // If filtering by 'id' with _eq, use direct item endpoint: PATCH /items/collection/id
      const idFilter = this.filters.find(f => f.field === 'id' && f.operator === '_eq');

      let url: string;
      let method = 'PATCH';

      if (idFilter) {
        // Direct item update by ID
        const params: string[] = [];
        if (this.selectFields) {
          params.push(`fields=${encodeURIComponent(this.selectFields)}`);
        }
        const queryString = params.length > 0 ? `?${params.join('&')}` : '';
        url = `${this.baseUrl}/items/${this.collection}/${idFilter.value}${queryString}`;
      } else {
        // Bulk update with filters - need to first find items, then update them
        // Directus doesn't support filter-based bulk PATCH directly
        // Strategy: GET matching items, then PATCH each by ID
        return await this.executeFilteredUpdate();
      }

      console.log('[Directus] PATCH', url);
      console.log('[Directus] Body:', this.payload);

      const response = await fetch(url, {
        method,
        headers: buildHeaders(this.token),
        body: JSON.stringify(this.payload)
      });

      console.log('[Directus] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await parseDirectusError(response);
        console.error('[Directus] Error:', error);
        return { data: null, error };
      }

      const json: DirectusAPIResponse<T> = await response.json();
      console.log('[Directus] Success:', json.data);

      return { data: json.data, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Network error',
          details: error.toString()
        }
      };
    }
  }

  /**
   * For updates with non-ID filters, first query matching items then update each.
   * Directus supports bulk update via PATCH /items/collection with { keys: [...], data: {...} }
   */
  private async executeFilteredUpdate(): Promise<DirectusResponse<T[] | T>> {
    try {
      // Step 1: Find matching item IDs
      const filterParts: string[] = [];
      for (const f of this.filters) {
        filterParts.push(`filter[${f.field}][${f.operator}]=${encodeURIComponent(f.value)}`);
      }
      const findUrl = `${this.baseUrl}/items/${this.collection}?fields=id&${filterParts.join('&')}`;

      console.log('[Directus] Finding items for filtered update:', findUrl);

      const findResponse = await fetch(findUrl, {
        method: 'GET',
        headers: buildHeaders(this.token)
      });

      if (!findResponse.ok) {
        const error = await parseDirectusError(findResponse);
        return { data: null, error };
      }

      const findJson: DirectusAPIResponse<any[]> = await findResponse.json();
      const ids = findJson.data?.map((item: any) => item.id) || [];

      if (ids.length === 0) {
        return { data: null, error: { message: 'No items found matching filter' } };
      }

      // Step 2: Bulk update by IDs
      const params: string[] = [];
      if (this.selectFields) {
        params.push(`fields=${encodeURIComponent(this.selectFields)}`);
      }
      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const updateUrl = `${this.baseUrl}/items/${this.collection}${queryString}`;

      console.log('[Directus] Bulk PATCH', updateUrl, 'IDs:', ids);

      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: buildHeaders(this.token),
        body: JSON.stringify({
          keys: ids,
          data: this.payload
        })
      });

      if (!response.ok) {
        const error = await parseDirectusError(response);
        return { data: null, error };
      }

      const json: DirectusAPIResponse<T[]> = await response.json();

      if (this.isSingleResult && Array.isArray(json.data)) {
        return { data: json.data[0] as T, error: null };
      }

      return { data: json.data as unknown as T[] | T, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Network error',
          details: error.toString()
        }
      };
    }
  }
}

// ============================================================================
// Delete Builder (DELETE)
// ============================================================================

class DirectusDeleteBuilder<T = any> {
  private baseUrl: string;
  private collection: string;
  private token: string;
  private filters: FilterEntry[] = [];

  constructor(baseUrl: string, collection: string, token: string) {
    this.baseUrl = baseUrl;
    this.collection = collection;
    this.token = token;
  }

  eq(column: string, value: any): this {
    this.filters.push({ field: column, operator: '_eq', value });
    return this;
  }

  then<TResult1 = DirectusResponse<null>, TResult2 = never>(
    onfulfilled?: ((value: DirectusResponse<null>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DirectusResponse<null>> {
    try {
      const idFilter = this.filters.find(f => f.field === 'id' && f.operator === '_eq');

      if (idFilter) {
        // Direct delete by ID
        const url = `${this.baseUrl}/items/${this.collection}/${idFilter.value}`;
        console.log('[Directus] DELETE', url);

        const response = await fetch(url, {
          method: 'DELETE',
          headers: buildHeaders(this.token)
        });

        console.log('[Directus] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const error = await parseDirectusError(response);
          console.error('[Directus] Error:', error);
          return { data: null, error };
        }

        console.log('[Directus] Delete successful');
        return { data: null, error: null };
      }

      // Filtered delete: find items first, then delete by IDs
      const filterParts: string[] = [];
      for (const f of this.filters) {
        filterParts.push(`filter[${f.field}][${f.operator}]=${encodeURIComponent(f.value)}`);
      }
      const findUrl = `${this.baseUrl}/items/${this.collection}?fields=id&${filterParts.join('&')}`;

      const findResponse = await fetch(findUrl, {
        method: 'GET',
        headers: buildHeaders(this.token)
      });

      if (!findResponse.ok) {
        const error = await parseDirectusError(findResponse);
        return { data: null, error };
      }

      const findJson: DirectusAPIResponse<any[]> = await findResponse.json();
      const ids = findJson.data?.map((item: any) => item.id) || [];

      if (ids.length === 0) {
        return { data: null, error: null };
      }

      // Directus bulk delete: DELETE /items/collection with array of IDs in body
      const url = `${this.baseUrl}/items/${this.collection}`;
      console.log('[Directus] Bulk DELETE', url, 'IDs:', ids);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: buildHeaders(this.token),
        body: JSON.stringify(ids)
      });

      if (!response.ok) {
        const error = await parseDirectusError(response);
        return { data: null, error };
      }

      console.log('[Directus] Bulk delete successful');
      return { data: null, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'Network error',
          details: error.toString()
        }
      };
    }
  }
}

// ============================================================================
// Main Client
// ============================================================================

class DirectusClient {
  private baseUrl: string;
  private token: string;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, ''); // Remove trailing slashes
    this.token = token;
  }

  from(collection: string) {
    return {
      select: (columns?: string) => {
        const builder = new DirectusQueryBuilder(this.baseUrl, collection, this.token);
        if (columns) builder.select(columns);
        return builder;
      },
      insert: (data: any) => {
        return new DirectusInsertBuilder(this.baseUrl, collection, this.token, data);
      },
      update: (data: any) => {
        return new DirectusUpdateBuilder(this.baseUrl, collection, this.token, data);
      },
      delete: () => {
        return new DirectusDeleteBuilder(this.baseUrl, collection, this.token);
      }
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

async function parseDirectusError(response: Response): Promise<DirectusError> {
  try {
    const body = await response.json();
    // Directus errors come as { errors: [{ message, extensions }] }
    const firstError = body.errors?.[0];
    return {
      message: firstError?.message || body.message || `HTTP ${response.status}`,
      details: firstError?.extensions?.code || undefined,
      code: String(response.status)
    };
  } catch {
    return {
      message: `HTTP ${response.status}: ${response.statusText}`
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export const directus = new DirectusClient(DIRECTUS_URL, DIRECTUS_TOKEN);

export const createClient = (url: string, token: string) => {
  return new DirectusClient(url, token);
};

export default directus;
