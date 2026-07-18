/**
 * Execute tools via n8n webhooks + UI interactions
 *
 * Webhook URLs are fetched from the database `webhooks` table (Directus API).
 * Keys: n8n_get_products, n8n_get_prices, n8n_get_multiplier
 *
 * - get_products: Query products table by product_code
 * - get_prices: Query pricing table by product id
 * - get_multiplier: Get latest price multiplier
 * - read_google_sheet: Read public Google Sheet rows via same-origin backend
 * - display_buttons: Display interactive buttons in UI (special handling)
 *
 * NOTE: The database layer uses Directus API, NOT Supabase. See ./directus.ts.
 */

import { callWebhook } from './webhooksService';
import { fetchLatestMaterialPrices, fetchGeneralAnalysis } from './kainosService';

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
    console.log('[Tool: get_products] Searching for product code:', input.product_code);

    const data = await callWebhook(TOOL_WEBHOOK_KEYS.get_products, {
      product_code: input.product_code
    });
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
    console.log('[Tool: get_prices] Fetching price for product ID:', input.id);

    // Fetch latest material prices and analytics summary to enrich the request.
    // n8n can use this data alongside tank specs for more accurate price estimates.
    const [materialPrices, latestAnalysis] = await Promise.allSettled([
      fetchLatestMaterialPrices(),
      fetchGeneralAnalysis(),
    ]);

    const data = await callWebhook(TOOL_WEBHOOK_KEYS.get_prices, {
      id: input.id,
      material_prices: materialPrices.status === 'fulfilled' ? materialPrices.value : [],
      price_analytics_summary: latestAnalysis.status === 'fulfilled' && latestAnalysis.value
        ? latestAnalysis.value.content
        : null,
      geo_events_summary: latestAnalysis.status === 'fulfilled' && latestAnalysis.value
        ? latestAnalysis.value.geoevents
        : null,
    });
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
    console.log('[Tool: get_multiplier] Fetching latest price multiplier');

    const data = await callWebhook(TOOL_WEBHOOK_KEYS.get_multiplier, {});
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
 * Execute read_google_sheet tool.
 *
 * This intentionally goes through a same-origin backend endpoint. Public
 * Google Sheets CSV exports are inconsistent with browser CORS, and private
 * URLs must fail clearly instead of making Claude hallucinate rows.
 */
export async function executeReadGoogleSheetTool(input: {
  url: string;
  gid?: string;
  max_rows?: number;
  include_raw_csv?: boolean;
}): Promise<string> {
  try {
    const url = typeof input?.url === 'string' ? input.url.trim() : '';
    if (!url) {
      return JSON.stringify({ success: false, error: 'Missing Google Sheet URL' });
    }

    const response = await fetch('/api/google-sheet-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gid: input.gid,
        max_rows: input.max_rows,
        include_raw_csv: input.include_raw_csv === true,
      }),
    });

    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = {
        success: false,
        error: responseText || `Google Sheet reader returned ${response.status}`,
      };
    }

    if (!response.ok) {
      return JSON.stringify({
        success: false,
        error: payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: unknown }).error
          : `Google Sheet reader returned ${response.status}`,
        status: response.status,
      }, null, 2);
    }

    return JSON.stringify(payload, null, 2);
  } catch (error: any) {
    console.error('[Tool: read_google_sheet] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error reading Google Sheet'
    });
  }
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

    case 'read_google_sheet':
      return await executeReadGoogleSheetTool(toolInput);

    case 'display_buttons':
      return await executeDisplayButtonsTool(toolInput);

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: get_products, get_prices, get_multiplier, read_google_sheet, display_buttons`
      });
  }
}
