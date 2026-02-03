import Anthropic from '@anthropic-ai/sdk';

// n8n MCP Server endpoint for tool execution
export const N8N_MCP_SERVER_URL = 'https://n8n.traidenis.org/mcp/9396f434-1906-495e-abdb-b853736682b1';

// Google Sheets URL will be stored in instruction_variables table as {google_sheets_url}
// and injected into system prompt dynamically (user-configurable)
export const GOOGLE_SHEETS_URL_PLACEHOLDER = '{google_sheets_url}';

/**
 * Tool definitions for Claude to use via n8n MCP Server
 *
 * These tools connect to MySQL database tables via n8n workflow:
 * - get_products: Searches products table by product code
 * - get_prices: Retrieves pricing by product ID
 * - get_multiplier: Gets latest price multiplier
 *
 * The n8n workflow acts as an MCP server, executing these tools and returning results.
 */
export const tools: Anthropic.Tool[] = [
  {
    name: 'get_products',
    description: 'Searches the products table to retrieve product information using a product code as the search filter. Returns product details including the product ID which is needed for price lookups. Use this when you need to convert a product code to a product ID or get product specifications.',
    input_schema: {
      type: 'object',
      properties: {
        product_code: {
          type: 'string',
          description: 'The product code to search for (e.g., "HNVN13.18.0", "HNVN15.20.0"). This is the unique identifier for products in the catalog.'
        }
      },
      required: ['product_code']
    }
  },
  {
    name: 'get_prices',
    description: 'Retrieves pricing information for a specific product from the pricing table. Requires the product ID (not the product code). Use get_products first to get the product ID, then use this tool to get the price.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The product ID (numeric) obtained from get_products tool. This is NOT the product code.'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'get_multiplier',
    description: 'Gets the latest price multiplier coefficient from the price_multiplier table. This multiplier is applied to base prices to calculate final prices. The tool automatically retrieves the most recent multiplier (ordered by creation date DESC, limit 1). No input parameters needed.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
