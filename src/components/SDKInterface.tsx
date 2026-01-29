import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, AlertCircle, RotateCcw, Eye, X, Sparkles } from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt } from '../lib/instructionVariablesService';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';

interface SDKInterfaceProps {
  user: AppUser;
  projectId: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function SDKInterface({ user, projectId }: SDKInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize Anthropic client
  const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  useEffect(() => {
    loadSystemPrompt();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSystemPrompt = async () => {
    try {
      setLoadingPrompt(true);
      const prompt = await getSystemPrompt();
      setSystemPrompt(prompt);

      await appLogger.logDocument({
        action: 'sdk_system_prompt_loaded',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          prompt_length: prompt.length
        }
      });
    } catch (err) {
      console.error('Error loading system prompt:', err);
      setError('Nepavyko užkrauti sistemos nurodymus. Patikrinkite instruction_variables lentelę.');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading || !systemPrompt) return;

    const userMessage: Message = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    setError(null);

    try {
      if (!anthropicApiKey) {
        throw new Error('VITE_ANTHROPIC_API_KEY not found in environment variables');
      }

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      await appLogger.logDocument({
        action: 'sdk_message_sent',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          message_length: userMessage.content.length,
          conversation_length: messages.length + 1
        }
      });

      // Build message history for API call
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      anthropicMessages.push({
        role: 'user',
        content: userMessage.content
      });

      // Make API call with prompt caching
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: anthropicMessages
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content[0].type === 'text' ? response.content[0].text : '',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      await appLogger.logDocument({
        action: 'sdk_response_received',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          response_length: assistantMessage.content.length,
          usage: response.usage,
          model: response.model
        }
      });

    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Nepavyko išsiųsti žinutės. Patikrinkite API raktą ir bandykite vėl.');

      await appLogger.logDocument({
        action: 'sdk_error',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          project_id: projectId,
          error: err.message
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setError(null);
    setInputValue('');
  };

  if (loadingPrompt) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: '#2d2d2d' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: '#c7a88a' }} />
          <p className="text-base font-semibold mb-2" style={{ color: '#e5e5e5' }}>
            Kraunamos sistemos instrukcijos
          </p>
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            Gaunami kintamieji iš duomenų bazės...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#2d2d2d' }}>
      {/* Header with controls - only show when there are messages */}
      {messages.length > 0 && (
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: '#3d3d3d' }}>
          <div>
            <h2 className="text-sm font-medium" style={{ color: '#e5e5e5' }}>
              Commercial Offer Assistant
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPromptModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs"
              style={{ background: '#3d3d3d', color: '#c7a88a' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4a4a4a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3d3d3d';
              }}
            >
              <Eye className="w-4 h-4" />
              Peržiūrėti prompt'ą
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs"
              style={{ background: '#3d3d3d', color: '#9ca3af' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4a4a4a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3d3d3d';
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Pradėti iš naujo
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="px-6 pt-4 max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm" style={{ background: '#3d1f1f', color: '#ff6b6b', border: '1px solid #5a2a2a' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6">
        {messages.length === 0 ? (
          /* Initial Centered View */
          <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="mb-6">
                <Sparkles className="w-12 h-12 mx-auto" style={{ color: '#c7a88a' }} />
              </div>
              <h1 className="text-3xl font-light mb-2" style={{ color: '#e5e5e5' }}>
                Labas vakaras, {user.display_name || user.email.split('@')[0]}
              </h1>
            </div>

            {/* Centered Input */}
            <div className="w-full max-w-2xl">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Kaip galiu jums padėti šiandien?"
                  rows={1}
                  className="w-full px-6 py-4 pr-14 text-base rounded-xl resize-none focus:outline-none focus:ring-2"
                  style={{
                    background: '#3d3d3d',
                    color: '#e5e5e5',
                    border: '1px solid #4a4a4a',
                    focusRing: '#c7a88a'
                  }}
                  disabled={loading || !systemPrompt}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || loading || !systemPrompt}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: inputValue.trim() && !loading ? '#c7a88a' : '#4a4a4a',
                    color: inputValue.trim() && !loading ? '#2d2d2d' : '#6b7280'
                  }}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs mt-3 text-center" style={{ color: '#6b7280' }}>
                Claude Sonnet 4 su prompt caching (1 val.)
              </p>
            </div>
          </div>
        ) : (
          /* Messages View */
          <div className="max-w-4xl mx-auto py-6 space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] px-5 py-3.5 rounded-2xl"
                  style={{
                    background: message.role === 'user' ? '#c7a88a' : '#3d3d3d',
                    color: message.role === 'user' ? '#1f1f1f' : '#e5e5e5',
                    border: message.role === 'assistant' ? '1px solid #4a4a4a' : 'none'
                  }}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                  <div
                    className="text-xs mt-2"
                    style={{ color: message.role === 'user' ? 'rgba(31,31,31,0.6)' : '#6b7280' }}
                  >
                    {new Date(message.timestamp).toLocaleTimeString('lt-LT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-5 py-3.5 rounded-2xl" style={{ background: '#3d3d3d', border: '1px solid #4a4a4a' }}>
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#c7a88a' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Input - only show after first message */}
      {messages.length > 0 && (
        <div className="border-t px-6 py-4" style={{ borderColor: '#3d3d3d' }}>
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Atsakyti..."
                rows={1}
                className="w-full px-5 py-3 pr-14 text-sm rounded-xl resize-none focus:outline-none focus:ring-2"
                style={{
                  background: '#3d3d3d',
                  color: '#e5e5e5',
                  border: '1px solid #4a4a4a'
                }}
                disabled={loading || !systemPrompt}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || loading || !systemPrompt}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: inputValue.trim() && !loading ? '#c7a88a' : '#4a4a4a',
                  color: inputValue.trim() && !loading ? '#2d2d2d' : '#6b7280'
                }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Preview Modal */}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] rounded-xl overflow-hidden"
            style={{ background: '#2d2d2d', border: '1px solid #4a4a4a' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#3d3d3d' }}>
              <h3 className="text-lg font-semibold" style={{ color: '#e5e5e5' }}>
                Sistema Prompt'as su Kintamaisiais
              </h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: '#9ca3af' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#3d3d3d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <pre
                className="whitespace-pre-wrap font-mono leading-relaxed"
                style={{
                  color: '#d1d5db',
                  fontSize: '9px'
                }}
              >
                {systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
