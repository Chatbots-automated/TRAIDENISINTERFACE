/**
 * Execute tools via n8n webhooks
 *
 * - get_products: Query products table by product_code
 * - get_prices: Query pricing table by product id
 * - get_multiplier: Get latest price multiplier
 * - edit_commercial_offer: Local artifact editing
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
 * Execute edit_commercial_offer tool (local)
 * This returns edit instructions that will be applied by the component layer
 */
export async function executeEditCommercialOfferTool(input: {
  field_path: string;
  new_value: string;
}): Promise<string> {
  console.log('[Tool: edit_commercial_offer] Editing field:', input.field_path, '→', input.new_value);

  try {
    // Validate field path format
    if (!input.field_path || input.field_path.trim() === '') {
      return JSON.stringify({
        success: false,
        error: 'field_path is required and cannot be empty'
      });
    }

    // Return edit instructions - the actual update will be handled by SDKInterfaceNew.tsx
    // which has access to the conversation state and database
    return JSON.stringify({
      success: true,
      action: 'edit_artifact_field',
      field_path: input.field_path,
      new_value: input.new_value,
      message: `Will update ${input.field_path} to "${input.new_value}"`
    });
  } catch (error: any) {
    console.error('[Tool: edit_commercial_offer] Error:', error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error executing edit_commercial_offer'
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

    case 'edit_commercial_offer':
      return await executeEditCommercialOfferTool(toolInput);

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: get_products, get_prices, get_multiplier, edit_commercial_offer`
      });
  }
}
