/**
 * Execute tools via n8n webhooks + UI interactions
 *
 * - get_products: Query products table by product_code
 * - get_prices: Query pricing table by product id
 * - get_multiplier: Get latest price multiplier
 * - display_buttons: Display interactive buttons in UI (special handling)
 */

const N8N_WEBHOOKS = {
  get_products: 'https://n8n.traidenis.org/webhook/91307d0b-16c6-4de5-b349-ea274dd9259d',
  get_prices: 'https://n8n.traidenis.org/webhook/60d19a37-65b1-492f-ad35-3bbb474f3cd9',
  get_multiplier: 'https://n8n.traidenis.org/webhook/77887f94-dfa2-48fe-8b13-8798b693a55a'
};

/**
 * Execute get_products tool (via n8n webhook)
 */
export async function executeGetProductsTool(input: { product_code: string }): Promise<string> {
  try {
    console.log('[Tool: get_products] Searching for product code:', input.product_code);
    console.log('[Tool: get_products] Calling webhook:', N8N_WEBHOOKS.get_products);

    const response = await fetch(N8N_WEBHOOKS.get_products, {
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
    console.log('[Tool: get_prices] Fetching price for product ID:', input.id);
    console.log('[Tool: get_prices] Calling webhook:', N8N_WEBHOOKS.get_prices);

    const response = await fetch(N8N_WEBHOOKS.get_prices, {
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
    console.log('[Tool: get_multiplier] Fetching latest price multiplier');
    console.log('[Tool: get_multiplier] Calling webhook:', N8N_WEBHOOKS.get_multiplier);

    const response = await fetch(N8N_WEBHOOKS.get_multiplier, {
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
