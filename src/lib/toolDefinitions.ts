import Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions - webhooks + UI tools
 * - get_products: Query products by code
 * - get_prices: Query prices by product ID
 * - get_multiplier: Get latest multiplier
 * - read_google_sheet: Read public Google Sheet rows
 * - display_buttons: Display interactive buttons in UI
 */
export const tools: Anthropic.Tool[] = [
  {
    name: 'get_products',
    description: 'Search products table by product code. Returns product details including ID.',
    input_schema: {
      type: 'object',
      properties: {
        product_code: {
          type: 'string',
          description: 'Product code (e.g., "HNVN13.18.0")'
        }
      },
      required: ['product_code']
    }
  },
  {
    name: 'get_prices',
    description: 'Get pricing for a product by its ID (from get_products).',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Product ID (numeric)'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'get_multiplier',
    description: 'Get the latest price multiplier. No parameters needed.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'read_google_sheet',
    description: 'Read rows from a publicly accessible Google Sheets URL. Use this when the user provides a Google Sheets link and asks to use, inspect, import, or calculate from its data.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public Google Sheets URL from docs.google.com/spreadsheets.'
        },
        gid: {
          type: 'string',
          description: 'Optional sheet gid. If omitted, use the gid in the URL or the first sheet.'
        },
        max_rows: {
          type: 'number',
          description: 'Maximum rows to return. Defaults to 200, maximum 1000.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'display_buttons',
    description: 'Display interactive buttons in the UI for user confirmation or selection. Use when you need user to choose from predefined options (e.g., "Tinka/Ne", "Ekonominis/MIDI/MAXI"). DO NOT use for open-ended questions - only for multiple choice.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Optional message to display above buttons for context'
        },
        buttons: {
          type: 'array',
          description: 'Array of 1-6 buttons to display',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier (e.g., "confirm_yes", "tier_economy")'
              },
              label: {
                type: 'string',
                description: 'Text displayed on button (e.g., "Tinka", "Ekonominis")'
              },
              value: {
                type: 'string',
                description: 'Value returned when clicked (can include context, e.g., "Taip, komponentai tinka")'
              }
            },
            required: ['id', 'label', 'value']
          },
          minItems: 1,
          maxItems: 6
        }
      },
      required: ['buttons']
    }
  }
];
