import Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions - ONLY webhooks
 * - get_products: Query products by code
 * - get_prices: Query prices by product ID
 * - get_multiplier: Get latest multiplier
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
  }
];
