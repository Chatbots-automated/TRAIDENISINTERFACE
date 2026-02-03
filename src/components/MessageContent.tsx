import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Calculator, Copy } from 'lucide-react';

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

interface CodeBlock {
  language: string;
  code: string;
}

export default function MessageContent({ content }: MessageContentProps) {
  // Parse content into parts: text, tool calls, calculations, code blocks
  const parseContent = (text: string): { type: 'text' | 'tools' | 'calculation' | 'code', content: string, toolCalls?: ToolCall[], calculation?: CalculationBlock, codeBlock?: CodeBlock }[] => {
    const parts: { type: 'text' | 'tools' | 'calculation' | 'code', content: string, toolCalls?: ToolCall[], calculation?: CalculationBlock, codeBlock?: CodeBlock }[] = [];

    // First, extract and group function calls
    const functionCallsRegex = /<function_calls>([\s\S]*?)<\/function_calls>/g;
    const calculationRegex = /<calculation(?:\s+type="([^"]*)")?>([\s\S]*?)<\/calculation>/g;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

    let lastIndex = 0;
    const matches: { type: 'tools' | 'calculation' | 'code', index: number, length: number, data: any }[] = [];

    // Find all code blocks first (to avoid conflicts with other patterns)
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push({
        type: 'code',
        index: match.index,
        length: match[0].length,
        data: {
          language: match[1] || 'text',
          code: match[2].trim()
        }
      });
    }

    // Find all function_calls blocks
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
      } else if (match.type === 'code') {
        parts.push({
          type: 'code',
          content: '',
          codeBlock: match.data
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

  // Simple markdown formatter for inline formatting
  const formatMarkdown = (text: string) => {
    // Split by lines to handle lists and headers
    const lines = text.split('\n');

    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-lg font-semibold mt-4 mb-2" style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{line.substring(4)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-xl font-bold mt-4 mb-2" style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{line.substring(3)}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-2xl font-bold mt-4 mb-2" style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{line.substring(2)}</h1>;
      }

      // Lists
      if (line.match(/^[-*]\s/)) {
        return <li key={idx} className="ml-4" style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{formatInline(line.substring(2))}</li>;
      }
      if (line.match(/^\d+\.\s/)) {
        return <li key={idx} className="ml-4" style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{formatInline(line.substring(line.indexOf('.') + 2))}</li>;
      }

      // Regular paragraph
      return <p key={idx} style={{ color: '#3d3935', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>{formatInline(line)}</p>;
    });
  };

  // Format inline markdown (bold, italic, inline code)
  const formatInline = (text: string) => {
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;

    // Match inline code, bold, italic
    const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > currentIndex) {
        parts.push(text.substring(currentIndex, match.index));
      }

      // Add formatted match
      if (match[1]) {
        // Inline code
        parts.push(<code key={match.index} className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: '#f0ede8', color: '#5a5550' }}>{match[1].slice(1, -1)}</code>);
      } else if (match[2]) {
        // Bold
        parts.push(<strong key={match.index} className="font-semibold">{match[2].slice(2, -2)}</strong>);
      } else if (match[3]) {
        // Italic
        parts.push(<em key={match.index} className="italic">{match[3].slice(1, -1)}</em>);
      }

      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="space-y-3">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <div key={index} className="text-[15px] leading-relaxed" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
              {formatMarkdown(part.content)}
            </div>
          );
        } else if (part.type === 'tools' && part.toolCalls) {
          return <GroupedToolCalls key={index} toolCalls={part.toolCalls} />;
        } else if (part.type === 'calculation' && part.calculation) {
          return <CalculationBadge key={index} calculation={part.calculation} />;
        } else if (part.type === 'code' && part.codeBlock) {
          return <CodeBlock key={index} codeBlock={part.codeBlock} />;
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

function CodeBlock({ codeBlock }: { codeBlock: CodeBlock }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeBlock.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden" style={{ background: '#1e293b', border: '1px solid #334155' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
        <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>{codeBlock.language}</span>
        <button
          onClick={handleCopy}
          className="px-2 py-1 text-xs rounded transition-colors"
          style={{
            background: copied ? '#10b981' : '#334155',
            color: 'white'
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono" style={{ color: '#e2e8f0' }}>
          <code>{codeBlock.code}</code>
        </pre>
      </div>
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
        style={{ background: '#f0ede8', color: '#5a5550', border: '1px solid #e8e5e0' }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#e8e5e0'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#f0ede8'}
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
        <div className="mt-1 ml-6 px-3 py-2 rounded text-sm" style={{ background: '#faf9f7', border: '1px solid #e8e5e0' }}>
          <div className="whitespace-pre-wrap" style={{ color: '#5a5550' }}>
            {calculation.content}
          </div>
        </div>
      )}
    </div>
  );
}
