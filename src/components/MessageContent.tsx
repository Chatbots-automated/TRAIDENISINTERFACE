import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';

interface MessageContentProps {
  content: string;
}

interface ToolCall {
  name: string;
  parameters: string;
  fullXml: string;
}

export default function MessageContent({ content }: MessageContentProps) {
  // Parse function calls from content
  const parseContent = (text: string): { type: 'text' | 'tool', content: string, toolCall?: ToolCall }[] => {
    const parts: { type: 'text' | 'tool', content: string, toolCall?: ToolCall }[] = [];
    const functionCallRegex = /<function_calls>\s*<invoke name="([^"]+)">\s*<parameter name="[^"]+">([^<]*)<\/parameter>\s*<\/invoke>\s*<\/function_calls>/gs;

    let lastIndex = 0;
    let match;

    while ((match = functionCallRegex.exec(text)) !== null) {
      // Add text before the function call
      if (match.index > lastIndex) {
        const textBefore = text.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore });
        }
      }

      // Add the function call
      const toolName = match[1];
      const parameters = match[2];
      parts.push({
        type: 'tool',
        content: match[0],
        toolCall: {
          name: toolName,
          parameters: parameters,
          fullXml: match[0]
        }
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex).trim();
      if (remaining) {
        parts.push({ type: 'text', content: remaining });
      }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  const parts = parseContent(content);

  return (
    <div className="space-y-3">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <div key={index} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#3d3935' }}>
              {part.content}
            </div>
          );
        } else if (part.type === 'tool' && part.toolCall) {
          return <ToolCallBadge key={index} toolCall={part.toolCall} />;
        }
        return null;
      })}
    </div>
  );
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  // Format tool name for display
  const formatToolName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors w-full text-left"
        style={{ background: '#f0ede8', color: '#5a5550' }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#e8e5e0'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#f0ede8'}
      >
        <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-medium flex-1">
          Naudotas įrankis: {formatToolName(toolCall.name)}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-6 px-3 py-2 rounded text-xs font-mono overflow-x-auto" style={{ background: '#faf9f7', color: '#5a5550', border: '1px solid #e8e5e0' }}>
          <div className="mb-1 font-semibold" style={{ color: '#3d3935' }}>Parametrai:</div>
          <pre className="whitespace-pre-wrap break-words">{toolCall.parameters}</pre>
        </div>
      )}
    </div>
  );
}
