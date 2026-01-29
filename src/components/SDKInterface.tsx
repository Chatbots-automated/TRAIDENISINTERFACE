import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
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
        dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
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
      <div className="h-full flex items-center justify-center" style={{ background: '#fdfcfb' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: '#5a5550' }} />
          <p className="text-base font-semibold mb-2" style={{ color: '#3d3935' }}>
            Kraunamos sistemos instrukcijos
          </p>
          <p className="text-sm" style={{ color: '#8a857f' }}>
            Gaunami kintamieji iš duomenų bazės...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#fdfcfb' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: '#f0ede8', background: 'white' }}>
        <div>
          <h1 className="text-xl font-semibold mb-1" style={{ color: '#3d3935' }}>
            Anthropic SDK Chat
          </h1>
          <p className="text-sm" style={{ color: '#8a857f' }}>
            Commercial offer generation with Claude Sonnet 4 & Prompt Caching
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors"
            style={{ borderColor: '#e8e5e0', color: '#5a5550' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0ede8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-sm font-medium">Pradėti iš naujo</span>
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 pt-5 max-w-4xl mx-auto w-full">
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#f0ede8' }}>
                <Send className="w-8 h-8" style={{ color: '#5a5550' }} />
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: '#3d3935' }}>
                Pradėkite pokalbį
              </h2>
              <p className="text-sm max-w-md mx-auto" style={{ color: '#8a857f' }}>
                Apačioje įrašykite savo užklausą komerciniam pasiūlymui. Sistema automatiškai naudoja paruoštus nurodymus su visais kintamaisiais.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[80%] px-4 py-3 rounded-lg"
                style={{
                  background: message.role === 'user' ? '#3d3935' : 'white',
                  color: message.role === 'user' ? 'white' : '#3d3935',
                  border: message.role === 'assistant' ? '1px solid #e8e5e0' : 'none'
                }}
              >
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div
                  className="text-xs mt-2"
                  style={{ color: message.role === 'user' ? 'rgba(255,255,255,0.7)' : '#8a857f' }}
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
              <div className="px-4 py-3 rounded-lg border" style={{ background: 'white', borderColor: '#e8e5e0' }}>
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#5a5550' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t px-6 py-4" style={{ borderColor: '#f0ede8', background: 'white' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Įrašykite savo žinutę... (Enter - siųsti, Shift+Enter - nauja eilutė)"
              rows={3}
              className="flex-1 px-4 py-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2"
              style={{
                borderColor: '#e8e5e0',
                background: '#fdfcfb',
                color: '#3d3935'
              }}
              disabled={loading || !systemPrompt}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || loading || !systemPrompt}
              className="px-6 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: inputValue.trim() && !loading ? '#3d3935' : '#e8e5e0',
                color: inputValue.trim() && !loading ? 'white' : '#8a857f'
              }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              Siųsti
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: '#8a857f' }}>
            Naudojama: Claude Sonnet 4 su prompt caching (1 val.)
          </p>
        </div>
      </div>
    </div>
  );
}
