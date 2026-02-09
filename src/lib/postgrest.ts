/**
 * PostgREST Client Wrapper
 * Provides a Supabase-like API interface for PostgREST
 */

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3000';
const POSTGREST_ANON_KEY = import.meta.env.VITE_POSTGREST_ANON_KEY || 'anon';

// Types
type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'is' | 'in' | 'cs' | 'cd';

interface PostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface PostgrestResponse<T> {
  data: T | null;
  error: PostgrestError | null;
}

class PostgrestQueryBuilder<T = any> {
  private url: string;
  private headers: HeadersInit;
  private filters: string[] = [];
  private selectFields: string = '*';
  private orderField?: string;
  private orderAscending: boolean = true;
  private limitValue?: number;
  private rangeStart?: number;
  private rangeEnd?: number;
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, table: string, headers: HeadersInit) {
    this.url = `${baseUrl}/${table}`;
    this.headers = { ...headers };
  }

  /**
   * Select specific columns
   */
  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  /**
   * Filter by equality
   */
  eq(column: string, value: any): this {
    this.filters.push(`${column}=eq.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by inequality
   */
  neq(column: string, value: any): this {
    this.filters.push(`${column}=neq.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by greater than
   */
  gt(column: string, value: any): this {
    this.filters.push(`${column}=gt.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by greater than or equal
   */
  gte(column: string, value: any): this {
    this.filters.push(`${column}=gte.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by less than
   */
  lt(column: string, value: any): this {
    this.filters.push(`${column}=lt.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by less than or equal
   */
  lte(column: string, value: any): this {
    this.filters.push(`${column}=lte.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * Filter by LIKE pattern
   */
  like(column: string, pattern: string): this {
    this.filters.push(`${column}=like.${this.encodeValue(pattern)}`);
    return this;
  }

  /**
   * Filter by case-insensitive LIKE pattern
   */
  ilike(column: string, pattern: string): this {
    this.filters.push(`${column}=ilike.${this.encodeValue(pattern)}`);
    return this;
  }

  /**
   * Filter by IS NULL or IS NOT NULL
   */
  is(column: string, value: null | boolean): this {
    this.filters.push(`${column}=is.${value === null ? 'null' : value}`);
    return this;
  }

  /**
   * Filter by IN list
   */
  in(column: string, values: any[]): this {
    const encoded = values.map(v => this.encodeValue(v)).join(',');
    this.filters.push(`${column}=in.(${encoded})`);
    return this;
  }

  /**
   * Order results
   */
  order(column: string, options?: { ascending?: boolean }): this {
    this.orderField = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  /**
   * Limit number of results
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Range pagination
   */
  range(from: number, to: number): this {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  /**
   * Expect single result
   */
  single(): this {
    this.isSingleResult = true;
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  /**
   * Execute SELECT query (makes the builder "thenable")
   */
  then<TResult1 = PostgrestResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestResponse<T[] | T>> {
    try {
      const params = new URLSearchParams();

      // Add select fields (always include select parameter)
      params.append('select', this.selectFields);

      // Add filters
      this.filters.forEach(filter => {
        const [key, value] = filter.split('=');
        params.append(key, value);
      });

      // Add order
      if (this.orderField) {
        params.append('order', `${this.orderField}.${this.orderAscending ? 'asc' : 'desc'}`);
      }

      // Add limit
      if (this.limitValue !== undefined) {
        params.append('limit', String(this.limitValue));
      }

      // Add range
      const headers = { ...this.headers };
      if (this.rangeStart !== undefined && this.rangeEnd !== undefined) {
        headers['Range'] = `${this.rangeStart}-${this.rangeEnd}`;
      }

      const url = `${this.url}?${params.toString()}`;
      console.log('[PostgREST] GET', url);
      console.log('[PostgREST] Headers:', headers);

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      console.log('[PostgREST] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await this.parseError(response);
        console.error('[PostgREST] Error:', error);
        return { data: null, error };
      }

      const data = await response.json();
      console.log('[PostgREST] Success:', data);
      return { data, error: null };
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
   * Helper to encode values for URL
   */
  private encodeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    return String(value);
  }

  /**
   * Parse error response
   */
  private async parseError(response: Response): Promise<PostgrestError> {
    try {
      const error = await response.json();
      return {
        message: error.message || `HTTP ${response.status}`,
        details: error.details,
        hint: error.hint,
        code: error.code
      };
    } catch {
      return {
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  }
}

class PostgrestInsertBuilder<T = any> {
  private url: string;
  private headers: HeadersInit;
  private selectFields: string = '';
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, table: string, headers: HeadersInit, private payload: any) {
    this.url = `${baseUrl}/${table}`;
    this.headers = {
      ...headers,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  then<TResult1 = PostgrestResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestResponse<T[] | T>> {
    try {
      const url = this.selectFields
        ? `${this.url}?select=${this.selectFields}`
        : this.url;

      console.log('[PostgREST] POST', url);
      console.log('[PostgREST] Body:', this.payload);

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(this.payload)
      });

      console.log('[PostgREST] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await this.parseError(response);
        console.error('[PostgREST] Error:', error);
        return { data: null, error };
      }

      const data = await response.json();
      console.log('[PostgREST] Success:', data);
      return { data, error: null };
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

  private async parseError(response: Response): Promise<PostgrestError> {
    try {
      const error = await response.json();
      return {
        message: error.message || `HTTP ${response.status}`,
        details: error.details,
        hint: error.hint,
        code: error.code
      };
    } catch {
      return {
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  }
}

class PostgrestUpdateBuilder<T = any> {
  private url: string;
  private headers: HeadersInit;
  private filters: string[] = [];
  private selectFields: string = '';
  private isSingleResult: boolean = false;

  constructor(baseUrl: string, table: string, headers: HeadersInit, private payload: any) {
    this.url = `${baseUrl}/${table}`;
    this.headers = {
      ...headers,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  eq(column: string, value: any): this {
    this.filters.push(`${column}=eq.${this.encodeValue(value)}`);
    return this;
  }

  select(columns: string = '*'): this {
    this.selectFields = columns;
    return this;
  }

  single(): this {
    this.isSingleResult = true;
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  then<TResult1 = PostgrestResponse<T[] | T>, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse<T[] | T>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestResponse<T[] | T>> {
    try {
      const params = new URLSearchParams();

      // Add filters
      this.filters.forEach(filter => {
        const [key, value] = filter.split('=');
        params.append(key, value);
      });

      // Add select
      if (this.selectFields) {
        params.append('select', this.selectFields);
      }

      const url = `${this.url}?${params.toString()}`;
      console.log('[PostgREST] PATCH', url);
      console.log('[PostgREST] Body:', this.payload);

      const response = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(this.payload)
      });

      console.log('[PostgREST] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await this.parseError(response);
        console.error('[PostgREST] Error:', error);
        return { data: null, error };
      }

      const data = await response.json();
      console.log('[PostgREST] Success:', data);
      return { data, error: null };
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

  private encodeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    return String(value);
  }

  private async parseError(response: Response): Promise<PostgrestError> {
    try {
      const error = await response.json();
      return {
        message: error.message || `HTTP ${response.status}`,
        details: error.details,
        hint: error.hint,
        code: error.code
      };
    } catch {
      return {
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  }
}

class PostgrestDeleteBuilder<T = any> {
  private url: string;
  private headers: HeadersInit;
  private filters: string[] = [];

  constructor(baseUrl: string, table: string, headers: HeadersInit) {
    this.url = `${baseUrl}/${table}`;
    this.headers = { ...headers };
  }

  eq(column: string, value: any): this {
    this.filters.push(`${column}=eq.${this.encodeValue(value)}`);
    return this;
  }

  then<TResult1 = PostgrestResponse<null>, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse<null>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PostgrestResponse<null>> {
    try {
      const params = new URLSearchParams();

      // Add filters
      this.filters.forEach(filter => {
        const [key, value] = filter.split('=');
        params.append(key, value);
      });

      const url = `${this.url}?${params.toString()}`;
      console.log('[PostgREST] DELETE', url);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.headers
      });

      console.log('[PostgREST] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await this.parseError(response);
        console.error('[PostgREST] Error:', error);
        return { data: null, error };
      }

      console.log('[PostgREST] Delete successful');
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

  private encodeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    return String(value);
  }

  private async parseError(response: Response): Promise<PostgrestError> {
    try {
      const error = await response.json();
      return {
        message: error.message || `HTTP ${response.status}`,
        details: error.details,
        hint: error.hint,
        code: error.code
      };
    } catch {
      return {
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  }
}

class PostgrestClient {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(url: string, anonKey: string) {
    this.baseUrl = url;
    this.headers = {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    };
  }

  from(table: string) {
    return {
      select: (columns?: string) => {
        const builder = new PostgrestQueryBuilder(this.baseUrl, table, this.headers);
        if (columns) builder.select(columns);
        return builder;
      },
      insert: (data: any) => {
        return new PostgrestInsertBuilder(this.baseUrl, table, this.headers, data);
      },
      update: (data: any) => {
        return new PostgrestUpdateBuilder(this.baseUrl, table, this.headers, data);
      },
      delete: () => {
        return new PostgrestDeleteBuilder(this.baseUrl, table, this.headers);
      }
    };
  }
}

// Create and export the client instance
export const postgrest = new PostgrestClient(POSTGREST_URL, POSTGREST_ANON_KEY);

// Export for convenience - allows code to work with minimal changes
export const createClient = (url: string, key: string) => {
  return new PostgrestClient(url, key);
};

export default postgrest;
