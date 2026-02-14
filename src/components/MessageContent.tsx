import React, { useState, useRef, useEffect } from 'react';
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
  const [showAll, setShowAll] = useState(false);

  const visibleCalls = toolCalls.filter(c => c.name !== 'display_buttons');
  if (visibleCalls.length === 0) return null;

  const allCompleted = visibleCalls.every(c => c.result);
  const COLLAPSED_LIMIT = 3;
  const displayedCalls = showAll ? visibleCalls : visibleCalls.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = visibleCalls.length - COLLAPSED_LIMIT;

  const formatToolName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolParam = (call: ToolCall): string => {
    try {
      const parsed = JSON.parse(call.parameters);
      if (typeof parsed === 'object' && parsed !== null) {
        const readable = Object.values(parsed).find(v => typeof v === 'string' && (v as string).length > 2) as string | undefined;
        if (readable && readable.length <= 50) return readable;
        if (readable) return readable.slice(0, 47) + '...';
      }
    } catch { /* not JSON */ }
    const cleaned = call.parameters.replace(/\s+/g, ' ').trim();
    if (cleaned === '{}' || !cleaned) return '';
    if (cleaned.length <= 50) return cleaned;
    return cleaned.slice(0, 47) + '...';
  };

  // formatResult removed - ToolResult component handles rendering now

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
    <div className="my-2">
      {!allCompleted && (
        <style>{`
          @keyframes tool-breathe {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}</style>
      )}

      {/* Header row - plain text, clickable */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 cursor-pointer select-none"
        style={{ lineHeight: '1.4' }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8a857f' }} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8a857f' }} />
        )}
        <span
          className="flex-shrink-0"
          style={{
            color: allCompleted ? '#8a857f' : '#6366f1',
            fontSize: '11px',
            animation: allCompleted ? 'none' : 'tool-breathe 2s ease-in-out infinite',
          }}
        >
          ✦
        </span>
        <span className="text-xs" style={{ color: '#5a5550' }}>
          {getGroupHeading()}
        </span>
      </div>

      {/* Tool tree */}
      {expanded && (
        <div className="ml-[7px] mt-0.5">
          {displayedCalls.map((call, idx) => {
            const isLast = idx === displayedCalls.length - 1 && (showAll || visibleCalls.length <= COLLAPSED_LIMIT);
            return (
              <div key={idx} className="flex" style={{ minHeight: '20px' }}>
                {/* Tree gutter: vertical line + branch */}
                <div className="flex-shrink-0 relative" style={{ width: '16px' }}>
                  {/* Vertical line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '3px',
                      top: 0,
                      bottom: isLast ? '50%' : 0,
                      width: '1px',
                      background: '#d4d1cc',
                    }}
                  />
                  {/* Horizontal branch */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '3px',
                      top: '50%',
                      width: '10px',
                      height: '1px',
                      background: '#d4d1cc',
                    }}
                  />
                </div>

                {/* Tool content */}
                <div className="flex-1 py-0.5" style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#3d3935' }}>
                      {formatToolName(call.name)}
                    </span>
                    {getToolParam(call) && (
                      <span className="text-[11px] truncate" style={{ color: '#a09b95' }}>
                        {getToolParam(call)}
                      </span>
                    )}
                  </div>
                  {/* Result */}
                  {call.result && (
                    <ToolResult text={call.result} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Show more / Show less */}
          {hiddenCount > 0 && (
            <div className="flex" style={{ minHeight: '20px' }}>
              <div className="flex-shrink-0 relative" style={{ width: '16px' }}>
                {!showAll && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '3px',
                      top: 0,
                      bottom: '50%',
                      width: '1px',
                      background: '#d4d1cc',
                    }}
                  />
                )}
              </div>
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[11px] py-0.5 cursor-pointer"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#5a5550'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
              >
                {showAll ? 'Show less' : `Show ${hiddenCount} more`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Collapsible JSON tree - objects/arrays auto-collapsed, click to expand
function CollapsibleJson({ data, depth = 0, keyName }: { data: any; depth?: number; keyName?: string }) {
  const [open, setOpen] = useState(depth < 1);

  const keyPrefix = keyName !== undefined ? (
    <span style={{ color: '#8a857f' }}>{`"${keyName}": `}</span>
  ) : null;

  // Primitives render inline
  if (data === null) return <span>{keyPrefix}<span style={{ color: '#a09b95' }}>null</span></span>;
  if (typeof data === 'boolean') return <span>{keyPrefix}<span style={{ color: '#a09b95' }}>{String(data)}</span></span>;
  if (typeof data === 'number') return <span>{keyPrefix}<span style={{ color: '#a09b95' }}>{data}</span></span>;
  if (typeof data === 'string') {
    const display = data.length > 80 ? data.slice(0, 77) + '...' : data;
    return <span>{keyPrefix}<span style={{ color: '#a09b95' }}>"{display}"</span></span>;
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v: any, i: number) => [String(i), v] as [string, any]) : Object.entries(data);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return <span>{keyPrefix}<span style={{ color: '#a09b95' }}>{openBracket}{closeBracket}</span></span>;
  }

  if (!open) {
    return (
      <span>
        {keyPrefix}
        <span
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="cursor-pointer"
          style={{ color: '#8a857f' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#5a5550'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
        >
          {openBracket}<span style={{ color: '#b0aba5' }}>{isArray ? `${entries.length} items` : '...'}</span>{closeBracket}
        </span>
      </span>
    );
  }

  return (
    <span>
      {keyPrefix}
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        className="cursor-pointer"
        style={{ color: '#8a857f' }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#5a5550'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
      >
        {openBracket}
      </span>
      <div style={{ marginLeft: '12px' }}>
        {entries.map(([key, value]: [string, any], i: number) => (
          <div key={key} style={{ lineHeight: '1.5' }}>
            <CollapsibleJson
              data={value}
              depth={depth + 1}
              keyName={isArray ? undefined : key}
            />
            {i < entries.length - 1 && <span style={{ color: '#c4c0bb' }}>,</span>}
          </div>
        ))}
      </div>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        className="cursor-pointer"
        style={{ color: '#8a857f' }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#5a5550'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
      >
        {closeBracket}
      </span>
    </span>
  );
}

// Tool result: gradient fade with "daugiau" expand, collapsible JSON
function ToolResult({ text }: { text: string }) {
  const [resultExpanded, setResultExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const COLLAPSED_HEIGHT = 56; // ~4 lines

  // Try parse as JSON
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) parsed = null;
  } catch { /* not JSON */ }

  useEffect(() => {
    if (contentRef.current && !parsed) {
      setOverflows(contentRef.current.scrollHeight > COLLAPSED_HEIGHT);
    }
  }, [text, parsed]);

  // JSON object/array: render as collapsible tree
  if (parsed) {
    return (
      <div className="text-[11px] mt-0.5 font-mono" style={{ lineHeight: '1.5' }}>
        <CollapsibleJson data={parsed} />
      </div>
    );
  }

  // Plain text: fade + "daugiau"
  return (
    <div className="mt-0.5 relative">
      <div
        ref={contentRef}
        className="text-[11px] whitespace-pre-wrap"
        style={{
          color: '#a09b95',
          maxHeight: resultExpanded ? 'none' : `${COLLAPSED_HEIGHT}px`,
          overflow: 'hidden',
          wordBreak: 'break-word',
          transition: 'max-height 0.2s ease',
        }}
      >
        {text}
      </div>
      {overflows && !resultExpanded && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '28px',
            background: 'linear-gradient(to bottom, transparent, white)',
            pointerEvents: 'none',
          }}
        />
      )}
      {overflows && (
        <button
          onClick={() => setResultExpanded(!resultExpanded)}
          className="text-[11px] cursor-pointer mt-0.5"
          style={{ color: '#8a857f' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#5a5550'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
        >
          {resultExpanded ? 'mažiau' : 'daugiau'}
        </button>
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
