import { N8N_MCP_SERVER_URL } from './toolDefinitions';

/**
 * Execute tools via n8n MCP Server and local tools
 *
 * - n8n tools: get_products, get_prices, get_multiplier (via MCP server)
 * - Local tools: edit_commercial_offer (direct artifact editing)
 */

// Note: You need to install js-yaml: npm install js-yaml @types/js-yaml
// For now, we'll use a simplified YAML parser for our specific format

/**
 * Call n8n MCP Server to execute a tool
 */
async function callN8nMCPServer(toolName: string, toolInput: any): Promise<string> {
  try {
    console.log(`[n8n MCP] Calling tool: ${toolName}`, toolInput);

    // Use JSON-RPC 2.0 format as expected by MCP servers
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now(), // Use timestamp as unique request ID
      params: {
        name: toolName,
        arguments: toolInput
      }
    };

    console.log(`[n8n MCP] Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(N8N_MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`[n8n MCP] Response status:`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[n8n MCP] Error response (first 500 chars):`, errorText.substring(0, 500));

      // Return concise error (don't include massive error details that break JSON encoding)
      return JSON.stringify({
        success: false,
        error: `n8n MCP Server returned ${response.status}: ${response.statusText}`,
        message: 'Check n8n workflow logs for details'
      });
    }

    const result = await response.json();
    console.log(`[n8n MCP] Tool ${toolName} result:`, result);

    // Extract the actual result from JSON-RPC response
    if (result.result) {
      return JSON.stringify(result.result, null, 2);
    } else if (result.error) {
      return JSON.stringify({
        success: false,
        error: result.error.message || 'n8n MCP error',
        code: result.error.code
      });
    }

    // Fallback: return the entire response
    return JSON.stringify(result, null, 2);
  } catch (error: any) {
    console.error(`[n8n MCP] Exception calling ${toolName}:`, error);
    return JSON.stringify({
      success: false,
      error: error.message || 'Unknown error calling n8n MCP server',
      tool_name: toolName
    });
  }
}

/**
 * Execute get_products tool via n8n MCP Server
 */
export async function executeGetProductsTool(input: { product_code: string }): Promise<string> {
  console.log('[Tool: get_products] Searching for product code:', input.product_code);
  return await callN8nMCPServer('get_products', input);
}

/**
 * Execute get_prices tool via n8n MCP Server
 */
export async function executeGetPricesTool(input: { id: number }): Promise<string> {
  console.log('[Tool: get_prices] Fetching price for product ID:', input.id);
  return await callN8nMCPServer('get_prices', input);
}

/**
 * Execute get_multiplier tool via n8n MCP Server
 */
export async function executeGetMultiplierTool(): Promise<string> {
  console.log('[Tool: get_multiplier] Fetching latest price multiplier');
  return await callN8nMCPServer('get_multiplier', {});
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
