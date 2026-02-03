import Anthropic from '@anthropic-ai/sdk';

export const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1O0bZoZH09LXuxwOczFlpOvsFeiYd12YTCdRNzOVrwpY/edit?usp=sharing';
export const SPREADSHEET_ID = '1O0bZoZH09LXuxwOczFlpOvsFeiYd12YTCdRNzOVrwpY';

// CRITICAL NOTE: For CSV export to work, the Google Sheet MUST be set to:
// "Anyone with the link can view" in sharing settings

/**
 * Tool definitions for Claude to use
 *
 * NOTE: query_supabase tool is temporarily disabled because the required database tables
 * (products, pricing, price_multiplier) do not exist yet. Only Google Sheets tool is active.
 */
export const tools: Anthropic.Tool[] = [
  {
    name: 'get_google_sheet',
    description: `Fetches data from the product catalog Google Sheet. This sheet contains component codes mapped to specifications like capacity (nasumas) and depth (gylis/igilinimas). Use this to look up available products, check component specifications, verify blower box matches, and find available capacities and depths. This sheet should also contain pricing information if available.`,
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
  }
  // TODO: Re-enable query_supabase tool once database tables are created
  // Tables needed: products, pricing, price_multiplier
  // {
  //   name: 'query_supabase',
  //   description: `Query Supabase database tables...`,
  //   input_schema: { ... }
  // }
];
