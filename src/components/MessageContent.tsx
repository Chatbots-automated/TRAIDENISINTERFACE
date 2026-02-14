import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Calculator, Copy } from 'lucide-react';

interface MessageContentProps {
  content: string;
}

interface ToolCall {
  name: string;
  parameters: string;
  result?: string;
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
      const invokeRegex = /<invoke name="([^"]+)">\s*<parameter name="[^"]+">([^<]*)<\/parameter>(?:\s*<result>([^<]*)<\/result>)?\s*<\/invoke>/g;
      const toolCalls: ToolCall[] = [];
      let invokeMatch;

      while ((invokeMatch = invokeRegex.exec(match[1])) !== null) {
        // Unescape HTML entities in parameters (from tool call XML encoding)
        const rawParam = invokeMatch[2]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        const rawResult = invokeMatch[3]
          ? invokeMatch[3]
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
          : undefined;
        toolCalls.push({
          name: invokeMatch[1],
          parameters: rawParam,
          result: rawResult,
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

  // Filter out display_buttons tool - it's an internal UI mechanism
  const visibleCalls = toolCalls.filter(c => c.name !== 'display_buttons');
  if (visibleCalls.length === 0) return null;

  const allCompleted = visibleCalls.every(c => c.result);
  const completedCount = visibleCalls.filter(c => c.result).length;

  const formatToolName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolDescription = (call: ToolCall): string => {
    try {
      const parsed = JSON.parse(call.parameters);
      if (typeof parsed === 'object' && parsed !== null) {
        // Find the most readable string value
        const readable = Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 2) as string | undefined;
        if (readable && readable.length <= 60) return readable;
        if (readable) return readable.slice(0, 57) + '...';
      }
    } catch {
      // Not JSON
    }
    const cleaned = call.parameters.replace(/\s+/g, ' ').trim();
    if (cleaned === '{}' || !cleaned) return '';
    if (cleaned.length <= 60) return cleaned;
    return cleaned.slice(0, 57) + '...';
  };

  const formatResult = (text: string): string => {
    try {
      const parsed = JSON.parse(text);
      // For objects, show a compact summary
      if (typeof parsed === 'object' && parsed !== null) {
        const str = JSON.stringify(parsed, null, 2);
        if (str.length > 300) return str.slice(0, 297) + '...';
        return str;
      }
      return String(parsed);
    } catch {
      if (text.length > 300) return text.slice(0, 297) + '...';
      return text;
    }
  };

  // Generate task group heading from tool names
  const getGroupHeading = (): string => {
    if (!allCompleted) {
      return visibleCalls.length === 1
        ? `Vykdoma: ${formatToolName(visibleCalls[0].name)}`
        : `Vykdomi ${visibleCalls.length} veiksmai...`;
    }
    return visibleCalls.length === 1
      ? formatToolName(visibleCalls[0].name)
      : `${visibleCalls.length} veiksmai atlikti`;
  };

  return (
    <div className="my-3">
      {/* Breathe animation style */}
      {!allCompleted && (
        <style>{`
          @keyframes tool-breathe {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}</style>
      )}

      {/* Task group container */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid #e8e5e0',
          background: '#faf9f7',
        }}
      >
        {/* Header - clickable */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors cursor-pointer"
          style={{ background: expanded ? '#f5f3f0' : '#faf9f7' }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f5f3f0'}
          onMouseLeave={(e) => e.currentTarget.style.background = expanded ? '#f5f3f0' : '#faf9f7'}
        >
          {/* Status icon with breathe */}
          <span
            className="text-sm flex-shrink-0"
            style={{
              color: allCompleted ? '#8a857f' : '#6366f1',
              animation: allCompleted ? 'none' : 'tool-breathe 2s ease-in-out infinite',
            }}
          >
            ✦
          </span>

          {/* Heading */}
          <span className="text-[13px] font-medium flex-1 text-left" style={{ color: '#3d3935' }}>
            {getGroupHeading()}
          </span>

          {/* Count badge */}
          {visibleCalls.length > 1 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{
                background: allCompleted ? '#e8e5e0' : 'rgba(99, 102, 241, 0.1)',
                color: allCompleted ? '#8a857f' : '#6366f1',
              }}
            >
              {completedCount}/{visibleCalls.length}
            </span>
          )}

          {/* Expand icon */}
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a09b95' }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a09b95' }} />
          )}
        </button>

        {/* Expanded tool tree */}
        {expanded && (
          <div className="px-3.5 pb-3 pt-1">
            <div className="relative pl-5">
              {/* Vertical chain line */}
              {visibleCalls.length > 1 && (
                <div
                  className="absolute"
                  style={{
                    left: '5px',
                    top: '8px',
                    bottom: '8px',
                    width: '1.5px',
                    background: 'linear-gradient(to bottom, #d4d1cc, #e8e5e0)',
                  }}
                />
              )}

              {visibleCalls.map((call, idx) => (
                <div key={idx} className="relative" style={{ padding: '4px 0' }}>
                  {/* Chain dot */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: '-16px',
                      width: '7px',
                      height: '7px',
                      top: '11px',
                      border: call.result ? '1.5px solid #8a857f' : '1.5px solid #6366f1',
                      background: call.result ? '#e8e5e0' : '#eef2ff',
                    }}
                  />

                  {/* Tool row */}
                  <div className="flex items-center gap-1.5">
                    {/* Status */}
                    <span className="text-[11px] flex-shrink-0" style={{ color: call.result ? '#22c55e' : '#6366f1', width: '14px' }}>
                      {call.result ? '✓' : '⟳'}
                    </span>

                    {/* Tool name */}
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: '#5a5550' }}>
                      {formatToolName(call.name)}
                    </span>

                    {/* Parameter description */}
                    {getToolDescription(call) && (
                      <code
                        className="px-1.5 py-0.5 rounded text-[11px] truncate max-w-[280px]"
                        style={{
                          background: '#f0ede8',
                          color: '#8a857f',
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        }}
                      >
                        {getToolDescription(call)}
                      </code>
                    )}
                  </div>

                  {/* Result preview */}
                  {call.result && (
                    <div
                      className="mt-1 ml-5 px-2.5 py-1.5 rounded-md text-[11px] font-mono overflow-hidden"
                      style={{
                        background: '#f0ede8',
                        color: '#5a5550',
                        maxHeight: '80px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {formatResult(call.result)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
