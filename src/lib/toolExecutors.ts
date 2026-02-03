import { N8N_MCP_SERVER_URL } from './toolDefinitions';

/**
 * Execute tools via n8n MCP Server
 *
 * The n8n workflow receives tool calls and executes them against MySQL database tables.
 * It returns results in a structured format that we pass back to Claude.
 */

/**
 * Call n8n MCP Server to execute a tool
 */
async function callN8nMCPServer(toolName: string, toolInput: any): Promise<string> {
  try {
    console.log(`[n8n MCP] Calling tool: ${toolName}`, toolInput);

    const response = await fetch(N8N_MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: toolName,
        input: toolInput
      })
    });

    console.log(`[n8n MCP] Response status:`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[n8n MCP] Error response:`, errorText);

      return JSON.stringify({
        success: false,
        error: `n8n MCP Server returned ${response.status}: ${response.statusText}`,
        details: errorText
      });
    }

    const result = await response.json();
    console.log(`[n8n MCP] Tool ${toolName} result:`, result);

    // Return the result as JSON string
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

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: get_products, get_prices, get_multiplier`
      });
  }
}
