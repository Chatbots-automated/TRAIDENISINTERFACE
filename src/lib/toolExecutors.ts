/**
 * Execute tools via n8n webhooks + UI interactions
 *
 * Webhook URLs are fetched from the database `webhooks` table.
 * Keys: n8n_get_products, n8n_get_prices, n8n_get_multiplier
 *
 * - get_products: Query products table by product_code
 * - get_prices: Query pricing table by product id
 * - get_multiplier: Get latest price multiplier
 * - display_buttons: Display interactive buttons in UI (special handling)
 */

import { getWebhookUrl } from './webhooksService';

// Map tool names to webhook keys in the database
const TOOL_WEBHOOK_KEYS: Record<string, string> = {
  get_products: 'n8n_get_products',
  get_prices: 'n8n_get_prices',
  get_multiplier: 'n8n_get_multiplier'
};

/**
 * Execute get_products tool (via n8n webhook)
 */
export async function executeGetProductsTool(input: { product_code: string }): Promise<string> {
  try {
    const webhookUrl = await getWebhookUrl(TOOL_WEBHOOK_KEYS.get_products);
    if (!webhookUrl) {
      return JSON.stringify({ success: false, error: 'Webhook "n8n_get_products" not found or inactive' });
    }

    console.log('[Tool: get_products] Searching for product code:', input.product_code);
    console.log('[Tool: get_products] Calling webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_code: input.product_code
      })
    });

    console.log('[Tool: get_products] Response status:', response.status);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`
      });
    }

    const data = await response.json();
    console.log('[Tool: get_products] Response data:', data);

    // Return the webhook response as-is wrapped in success
    return JSON.stringify({
      success: true,
      data: data
    }, null, 2);
  } catch (error: any) {
    console.error('[Tool: get_products] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Execute get_prices tool (via n8n webhook)
 */
export async function executeGetPricesTool(input: { id: number }): Promise<string> {
  try {
    const webhookUrl = await getWebhookUrl(TOOL_WEBHOOK_KEYS.get_prices);
    if (!webhookUrl) {
      return JSON.stringify({ success: false, error: 'Webhook "n8n_get_prices" not found or inactive' });
    }

    console.log('[Tool: get_prices] Fetching price for product ID:', input.id);
    console.log('[Tool: get_prices] Calling webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: input.id
      })
    });

    console.log('[Tool: get_prices] Response status:', response.status);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`
      });
    }

    const data = await response.json();
    console.log('[Tool: get_prices] Response data:', data);

    // Return the webhook response as-is wrapped in success
    return JSON.stringify({
      success: true,
      data: data
    }, null, 2);
  } catch (error: any) {
    console.error('[Tool: get_prices] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Execute get_multiplier tool (via n8n webhook)
 */
export async function executeGetMultiplierTool(): Promise<string> {
  try {
    const webhookUrl = await getWebhookUrl(TOOL_WEBHOOK_KEYS.get_multiplier);
    if (!webhookUrl) {
      return JSON.stringify({ success: false, error: 'Webhook "n8n_get_multiplier" not found or inactive' });
    }

    console.log('[Tool: get_multiplier] Fetching latest price multiplier');
    console.log('[Tool: get_multiplier] Calling webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    console.log('[Tool: get_multiplier] Response status:', response.status);

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`
      });
    }

    const data = await response.json();
    console.log('[Tool: get_multiplier] Response data:', data);

    // Return the webhook response as-is wrapped in success
    return JSON.stringify({
      success: true,
      data: data
    }, null, 2);
  } catch (error: any) {
    console.error('[Tool: get_multiplier] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
}

/**
 * Execute display_buttons tool (UI interaction - no webhook)
 * Returns special marker that UI will detect to pause conversation and display buttons
 */
export async function executeDisplayButtonsTool(input: { message?: string; buttons: Array<{id: string, label: string, value: string}> }): Promise<string> {
  console.log('[Tool: display_buttons] Displaying buttons in UI');
  console.log('[Tool: display_buttons] Buttons:', input.buttons);

  // Return special JSON marker that indicates buttons should be displayed
  // The UI will detect this and handle it specially
  return JSON.stringify({
    success: true,
    display_buttons: true,  // Special marker for UI detection
    message: input.message || null,
    buttons: input.buttons,
    // This tells the system to PAUSE the conversation and wait for user interaction
    pause_conversation: true
  }, null, 2);
}

/**
 * Main tool executor - routes tool calls to appropriate executor
 */
export async function executeTool(toolName: string, toolInput: any): Promise<string> {
  console.log(`[executeTool] Executing: ${toolName}`);

  switch (toolName) {
    case 'get_products':
      return await executeGetProductsTool(toolInput);

    case 'get_prices':
      return await executeGetPricesTool(toolInput);

    case 'get_multiplier':
      return await executeGetMultiplierTool();

    case 'display_buttons':
      return await executeDisplayButtonsTool(toolInput);

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: get_products, get_prices, get_multiplier, display_buttons`
      });
  }
}
