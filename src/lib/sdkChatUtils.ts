import type Anthropic from '@anthropic-ai/sdk';

export const MAX_SDK_TOOL_ROUNDS = 6;

export interface AnthropicToolUseSummary {
  index: number;
  id: string;
  name?: string;
}

export interface AnthropicMessageValidationResult {
  valid: boolean;
  errors: string[];
  toolUses: AnthropicToolUseSummary[];
  toolResultIds: string[];
}

export function validateAnthropicToolAdjacency(messages: Anthropic.MessageParam[]): AnthropicMessageValidationResult {
  const errors: string[] = [];
  const toolUses: AnthropicToolUseSummary[] = [];
  const toolResultIds: string[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!Array.isArray(msg.content)) continue;

    const toolUseIdsInMsg: string[] = [];
    for (const block of msg.content as any[]) {
      if (block?.type === 'tool_use') {
        toolUseIdsInMsg.push(block.id);
        toolUses.push({ index: i, id: block.id, name: block.name });
      }
      if (block?.type === 'tool_result') toolResultIds.push(block.tool_use_id);
    }

    if (msg.role !== 'assistant' || toolUseIdsInMsg.length === 0) continue;

    const nextMsg = messages[i + 1];
    if (!nextMsg) {
      errors.push(`Message ${i} has tool_use but no following user tool_result message.`);
      continue;
    }
    if (nextMsg.role !== 'user') {
      errors.push(`Message ${i} has tool_use but message ${i + 1} role is ${nextMsg.role}.`);
      continue;
    }
    if (!Array.isArray(nextMsg.content)) {
      errors.push(`Message ${i} has tool_use but message ${i + 1} content is not a tool_result array.`);
      continue;
    }

    const nextToolResultIds = (nextMsg.content as any[])
      .filter((block) => block?.type === 'tool_result')
      .map((block) => block.tool_use_id);
    const missing = toolUseIdsInMsg.filter((id) => !nextToolResultIds.includes(id));
    if (missing.length > 0) {
      errors.push(`Message ${i} is missing adjacent tool_result blocks for ${missing.length} tool call(s).`);
    }
  }

  return { valid: errors.length === 0, errors, toolUses, toolResultIds };
}

export function summarizeAnthropicMessages(messages: Anthropic.MessageParam[]): Array<{
  index: number;
  role: Anthropic.MessageParam['role'];
  contentKind: 'string' | 'blocks' | 'unknown';
  textLength?: number;
  blockCount?: number;
  toolUseCount?: number;
  toolResultCount?: number;
}> {
  return messages.map((msg, index) => {
    if (typeof msg.content === 'string') {
      return { index, role: msg.role, contentKind: 'string', textLength: msg.content.length };
    }
    if (Array.isArray(msg.content)) {
      return {
        index,
        role: msg.role,
        contentKind: 'blocks',
        blockCount: msg.content.length,
        toolUseCount: msg.content.filter((block: any) => block?.type === 'tool_use').length,
        toolResultCount: msg.content.filter((block: any) => block?.type === 'tool_result').length,
      };
    }
    return { index, role: msg.role, contentKind: 'unknown' };
  });
}

export function getNonEmptyAnthropicContent(content: Anthropic.Message['content']): Anthropic.Message['content'] {
  return content.filter((block: any) => {
    if (block?.type !== 'thinking') return true;
    return typeof block.thinking === 'string' && block.thinking.trim().length > 0;
  });
}

export function buildToolTraceXml(
  tools: Array<{ id: string; name: string; input: unknown }>,
  results?: Array<{ tool_use_id: string; content: string }>
): string {
  const filtered = tools.filter((tool) => tool.name !== 'display_buttons');
  if (filtered.length === 0) return '';
  const invokeBlocks = filtered.map((tool) => {
    const paramStr = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input);
    const safeParam = escapeXml(paramStr || '');
    let block = `  <invoke name="${escapeXml(tool.name)}">\n    <parameter name="input">${safeParam}</parameter>`;
    if (results) {
      const toolResult = results.find((result) => result.tool_use_id === tool.id);
      if (toolResult) block += `\n    <result>${escapeXml(toolResult.content)}</result>`;
    }
    block += '\n  </invoke>';
    return block;
  });
  return `\n\n<function_calls>\n${invokeBlocks.join('\n')}\n</function_calls>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
