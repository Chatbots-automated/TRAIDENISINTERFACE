import type Anthropic from '@anthropic-ai/sdk';
import type { SDKMessage } from '../../lib/sdkConversationService';

interface PreparedAnthropicHistory {
  messages: Anthropic.MessageParam[];
  stats: {
    total: number;
    kept: number;
    skippedNonString: number;
    skippedMalformed: number;
    skippedDuplicateRole: number;
  };
}

const DISPLAY_ONLY_TOOL_CALLS = /<function_calls>[\s\S]*?<\/function_calls>/g;

function isSyntheticMessage(content: string): boolean {
  const trimmed = content.trim();

  return (
    trimmed.length === 0 ||
    trimmed === '{}' ||
    trimmed === '[]' ||
    trimmed.startsWith('[Tool results:') ||
    trimmed.includes('toolu_')
  );
}

export function prepareAnthropicHistory(messages: SDKMessage[]): PreparedAnthropicHistory {
  const prepared: Anthropic.MessageParam[] = [];
  const stats = {
    total: messages.length,
    kept: 0,
    skippedNonString: 0,
    skippedMalformed: 0,
    skippedDuplicateRole: 0,
  };
  let lastRole: 'user' | 'assistant' | null = null;

  for (const message of messages) {
    if (typeof message.content !== 'string') {
      stats.skippedNonString += 1;
      continue;
    }

    if (isSyntheticMessage(message.content)) {
      stats.skippedMalformed += 1;
      continue;
    }

    if (message.role === lastRole) {
      stats.skippedDuplicateRole += 1;
      continue;
    }

    const content = message.content.replace(DISPLAY_ONLY_TOOL_CALLS, '').trim() || message.content;
    prepared.push({ role: message.role, content });
    lastRole = message.role;
    stats.kept += 1;
  }

  return { messages: prepared, stats };
}
