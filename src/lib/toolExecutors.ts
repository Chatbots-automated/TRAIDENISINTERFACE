import { supabaseAdmin } from './supabase';
import { SPREADSHEET_ID } from './toolDefinitions';

/**
 * Fetch Google Sheets data as CSV and parse to JSON
 */
export async function executeGoogleSheetTool(input: { description: string }): Promise<string> {
  try {
    console.log('[Tool: get_google_sheet] Fetching sheet data:', input.description);

    // Use Google Sheets public CSV export API
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0`;

    console.log('[Tool: get_google_sheet] Fetching from:', csvUrl);

    const response = await fetch(csvUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'text/csv'
      }
    });

    console.log('[Tool: get_google_sheet] Response status:', response.status, response.statusText);

    if (!response.ok) {
      // Provide more helpful error message
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: csvUrl
      };
      console.error('[Tool: get_google_sheet] Fetch failed:', errorDetails);

      if (response.status === 400) {
        throw new Error(`Google Sheets returned 400. The sheet might not be publicly accessible or there's a CORS issue. Please verify the sheet is set to "Anyone with the link can view" and try again.`);
      } else if (response.status === 403) {
        throw new Error(`Google Sheets returned 403 Forbidden. The sheet is not publicly accessible. Please set sharing to "Anyone with the link can view".`);
      } else {
        throw new Error(`Failed to fetch Google Sheet: ${response.status} ${response.statusText}`);
      }
    }

    const csvText = await response.text();

    // Parse CSV to JSON
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return JSON.stringify({ error: 'Sheet is empty' });
    }

    // First line is headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    console.log(`[Tool: get_google_sheet] Successfully fetched ${data.length} rows with columns:`, headers);

    return JSON.stringify({
      success: true,
      columns: headers,
      row_count: data.length,
      data: data
    }, null, 2);
  } catch (error: any) {
    console.error('[Tool: get_google_sheet] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error fetching Google Sheet'
    });
  }
}

/**
 * Query Supabase tables with flexible filtering
 */
export async function executeSupabaseQueryTool(input: {
  table: 'products' | 'pricing' | 'price_multiplier';
  select?: string;
  filter?: string;
  order?: string;
  limit?: number;
}): Promise<string> {
  try {
    const { table, select = '*', filter, order, limit = 100 } = input;

    console.log('[Tool: query_supabase] Querying table:', table, 'with params:', { select, filter, order, limit });

    // Start building query
    let query = supabaseAdmin.from(table).select(select);

    // Apply filter if provided (PostgREST format: "column=eq.value")
    if (filter) {
      const filterParts = filter.split('=');
      if (filterParts.length >= 2) {
        const column = filterParts[0];
        const operatorAndValue = filterParts.slice(1).join('='); // In case value contains '='
        const [operator, ...valueParts] = operatorAndValue.split('.');
        const value = valueParts.join('.'); // In case value contains '.'

        // Map PostgREST operators to Supabase query methods
        switch (operator) {
          case 'eq':
            query = query.eq(column, value);
            break;
          case 'neq':
            query = query.neq(column, value);
            break;
          case 'gt':
            query = query.gt(column, value);
            break;
          case 'gte':
            query = query.gte(column, value);
            break;
          case 'lt':
            query = query.lt(column, value);
            break;
          case 'lte':
            query = query.lte(column, value);
            break;
          case 'like':
            query = query.like(column, value);
            break;
          case 'ilike':
            query = query.ilike(column, value);
            break;
          default:
            console.warn('[Tool: query_supabase] Unknown operator:', operator);
        }
      }
    }

    // Apply ordering if provided (format: "column.direction")
    if (order) {
      const [column, direction] = order.split('.');
      const ascending = direction !== 'desc';
      query = query.order(column, { ascending });
    }

    // Apply limit
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[Tool: query_supabase] Error:', error);
      return JSON.stringify({
        success: false,
        error: error.message,
        hint: error.hint || 'Check table name, column names, and filter syntax'
      });
    }

    console.log(`[Tool: query_supabase] Successfully queried ${table}, returned ${data?.length || 0} rows`);

    // Return results with metadata
    return JSON.stringify({
      success: true,
      table: table,
      row_count: data?.length || 0,
      data: data || []
    }, null, 2);
  } catch (error: any) {
    console.error('[Tool: query_supabase] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error querying Supabase'
    });
  }
}

/**
 * Execute any tool by name
 */
export async function executeTool(toolName: string, toolInput: any): Promise<string> {
  console.log(`[executeTool] Executing: ${toolName}`);

  switch (toolName) {
    case 'get_google_sheet':
      return await executeGoogleSheetTool(toolInput);

    case 'query_supabase':
      return await executeSupabaseQueryTool(toolInput);

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}`
      });
  }
}
