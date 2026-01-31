import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Calculator } from 'lucide-react';

interface MessageContentProps {
  content: string;
}

interface ToolCall {
  name: string;
  parameters: string;
  fullXml: string;
}

interface CalculationBlock {
  type: string;
  content: string;
}

export default function MessageContent({ content }: MessageContentProps) {
  // Parse content into parts: text, tool calls, calculations
  const parseContent = (text: string): { type: 'text' | 'tools' | 'calculation', content: string, toolCalls?: ToolCall[], calculation?: CalculationBlock }[] => {
    const parts: { type: 'text' | 'tools' | 'calculation', content: string, toolCalls?: ToolCall[], calculation?: CalculationBlock }[] = [];

    // First, extract and group function calls
    const functionCallsRegex = /<function_calls>([\s\S]*?)<\/function_calls>/g;
    const calculationRegex = /<calculation(?:\s+type="([^"]*)")?>([\s\S]*?)<\/calculation>/g;

    let lastIndex = 0;
    const matches: { type: 'tools' | 'calculation', index: number, length: number, data: any }[] = [];

    // Find all function_calls blocks
    let match;
    while ((match = functionCallsRegex.exec(text)) !== null) {
      const invokeRegex = /<invoke name="([^"]+)">\s*<parameter name="[^"]+">([^<]*)<\/parameter>\s*<\/invoke>/g;
      const toolCalls: ToolCall[] = [];
      let invokeMatch;

      while ((invokeMatch = invokeRegex.exec(match[1])) !== null) {
        toolCalls.push({
          name: invokeMatch[1],
          parameters: invokeMatch[2],
          fullXml: invokeMatch[0]
        });
      }

      if (toolCalls.length > 0) {
        matches.push({
          type: 'tools',
          index: match.index,
          length: match[0].length,
          data: toolCalls
        });
      }
    }

    // Find all calculation blocks
    while ((match = calculationRegex.exec(text)) !== null) {
      matches.push({
        type: 'calculation',
        index: match.index,
        length: match[0].length,
        data: {
          type: match[1] || 'general',
          content: match[2].trim()
        }
      });
    }

    // Sort matches by position
    matches.sort((a, b) => a.index - b.index);

    // Build parts array
    matches.forEach((match) => {
      // Add text before this match
      if (match.index > lastIndex) {
        const textBefore = text.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore });
        }
      }

      // Add the match
      if (match.type === 'tools') {
        parts.push({
          type: 'tools',
          content: '',
          toolCalls: match.data
        });
      } else if (match.type === 'calculation') {
        parts.push({
          type: 'calculation',
          content: '',
          calculation: match.data
        });
      }

      lastIndex = match.index + match.length;
    });

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
        } else if (part.type === 'tools' && part.toolCalls) {
          return <GroupedToolCalls key={index} toolCalls={part.toolCalls} />;
        } else if (part.type === 'calculation' && part.calculation) {
          return <CalculationBadge key={index} calculation={part.calculation} />;
        }
        return null;
      })}
    </div>
  );
}

function GroupedToolCalls({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);

  // Group by tool name
  const groupedTools = toolCalls.reduce((acc, call) => {
    if (!acc[call.name]) {
      acc[call.name] = [];
    }
    acc[call.name].push(call);
    return acc;
  }, {} as Record<string, ToolCall[]>);

  const toolCount = toolCalls.length;
  const uniqueToolCount = Object.keys(groupedTools).length;

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
          {uniqueToolCount === 1
            ? `Naudotas įrankis: ${formatToolName(Object.keys(groupedTools)[0])} (${toolCount}×)`
            : `Naudoti įrankiai (${toolCount})`
          }
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-6 space-y-2">
          {Object.entries(groupedTools).map(([toolName, calls], idx) => (
            <div key={idx} className="px-3 py-2 rounded text-xs" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
              <div className="font-semibold mb-2" style={{ color: '#3d3935' }}>
                {formatToolName(toolName)} ({calls.length}×)
              </div>
              {calls.map((call, callIdx) => (
                <div key={callIdx} className="mb-2 last:mb-0">
                  <div className="font-mono text-[11px]" style={{ color: '#5a5550' }}>
                    <pre className="whitespace-pre-wrap break-words">{call.parameters}</pre>
                  </div>
                  {callIdx < calls.length - 1 && (
                    <div className="border-t my-2" style={{ borderColor: '#e8e5e0' }} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalculationBadge({ calculation }: { calculation: CalculationBlock }) {
  const [expanded, setExpanded] = useState(false);

  const formatType = (type: string): string => {
    const typeMap: Record<string, string> = {
      'pricing': 'Kainų skaičiavimas',
      'component': 'Komponentų skaičiavimas',
      'general': 'Skaičiavimas'
    };
    return typeMap[type] || 'Skaičiavimas';
  };

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors w-full text-left"
        style={{ background: '#f0f9ff', color: '#0c4a6e', border: '1px solid #bae6fd' }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#e0f2fe'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#f0f9ff'}
      >
        <Calculator className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-medium flex-1">
          {formatType(calculation.type)}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-6 px-3 py-2 rounded text-sm" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <div className="whitespace-pre-wrap" style={{ color: '#0c4a6e' }}>
            {calculation.content}
          </div>
        </div>
      )}
    </div>
  );
}
