import Anthropic from '@anthropic-ai/sdk';

export const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1O0bZoZH09LXuxwOczFlpOvsFeiYd12YTCdRNzOVrwpY/edit?usp=sharing';
export const SPREADSHEET_ID = '1O0bZoZH09LXuxwOczFlpOvsFeiYd12YTCdRNzOVrwpY';

/**
 * Tool definitions for Claude to use
 */
export const tools: Anthropic.Tool[] = [
  {
    name: 'get_google_sheet',
    description: `Fetches data from the product catalog Google Sheet. This sheet contains component codes mapped to specifications like capacity (nasumas) and depth (gylis/igilinimas). Use this to look up available products, check component specifications, verify blower box matches, and find available capacities and depths.`,
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Brief description of what you are looking for in the sheet (for logging purposes)'
        }
      },
      required: ['description']
    }
  },
  {
    name: 'query_supabase',
    description: `Query Supabase database tables. Available tables: 'products' (product codes and IDs), 'pricing' (product prices with creation dates), 'price_multiplier' (price multiplication coefficients with dates). Use this to convert product codes to IDs, get pricing information, or fetch the current price multiplier. The tool returns the actual data so you can see the table structure and columns.`,
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: ['products', 'pricing', 'price_multiplier'],
          description: 'Which table to query'
        },
        select: {
          type: 'string',
          description: 'Columns to select (e.g., "*" for all, "id,productCode" for specific columns)',
          default: '*'
        },
        filter: {
          type: 'string',
          description: 'Filter condition in PostgREST format (e.g., "productCode=eq.HNVN13.18.0" or "productid=eq.123"). Leave empty for no filter.'
        },
        order: {
          type: 'string',
          description: 'Column to order by with direction (e.g., "created.desc" or "id.asc"). Leave empty for no ordering.'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return (default: 100)',
          default: 100
        }
      },
      required: ['table']
    }
  }
];
