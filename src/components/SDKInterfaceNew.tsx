import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Loader2,
  AlertCircle,
  Paperclip,
  FileText,
  Eye,
  Plus,
  Trash2,
  X,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt } from '../lib/instructionVariablesService';
import {
  createSDKConversation,
  getSDKConversations,
  getSDKConversation,
  addMessageToConversation,
  updateConversationArtifact,
  deleteSDKConversation,
  calculateDiff,
  type SDKConversation,
  type SDKMessage,
  type CommercialOfferArtifact
} from '../lib/sdkConversationService';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';

interface SDKInterfaceNewProps {
  user: AppUser;
  projectId: string;
  mainSidebarCollapsed: boolean;
}

export default function SDKInterfaceNew({ user, projectId, mainSidebarCollapsed }: SDKInterfaceNewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<SDKConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<SDKConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showArtifact, setShowArtifact] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  useEffect(() => {
    loadSystemPrompt();
    loadConversations();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);

  const loadSystemPrompt = async () => {
    try {
      setLoadingPrompt(true);
      const prompt = await getSystemPrompt();
      setSystemPrompt(prompt);
      console.log('System prompt loaded, length:', prompt.length);
    } catch (err) {
      console.error('Error loading system prompt:', err);
      setError('Nepavyko užkrauti sistemos instrukcijų');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const { data, error: fetchError } = await getSDKConversations(projectId);
      if (fetchError) throw fetchError;
      setConversations(data || []);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleCreateConversation = async () => {
    try {
      setCreatingConversation(true);
      const { data: conversationId, error: createError } = await createSDKConversation(
        projectId,
        user.id,
        user.email,
        'Naujas pokalbis'
      );
      if (createError) throw createError;
      await loadConversations();
      const { data: newConversation } = await getSDKConversation(conversationId!);
      setCurrentConversation(newConversation);
    } catch (err) {
      console.error('Error creating conversation:', err);
      setError('Nepavyko sukurti pokalbio');
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    try {
      const { data, error: fetchError } = await getSDKConversation(conversationId);
      if (fetchError) throw fetchError;
      setCurrentConversation(data);
      setError(null);
    } catch (err) {
      console.error('Error selecting conversation:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSDKConversation(conversationId, user.id, user.email);
      await loadConversations();
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || loading || !systemPrompt) return;

    // If no conversation exists, create one first
    let conversation = currentConversation;
    if (!conversation) {
      try {
        setCreatingConversation(true);
        const { data: conversationId, error: createError } = await createSDKConversation(
          projectId,
          user.id,
          user.email,
          'Naujas pokalbis'
        );
        if (createError) {
          console.error('Error creating conversation:', createError);
          throw createError;
        }
        if (!conversationId) {
          throw new Error('No conversation ID returned');
        }

        const { data: newConversation, error: fetchError } = await getSDKConversation(conversationId);
        if (fetchError) {
          console.error('Error fetching new conversation:', fetchError);
          throw fetchError;
        }
        if (!newConversation) {
          throw new Error('Failed to fetch newly created conversation');
        }

        conversation = newConversation;
        setCurrentConversation(newConversation);
        await loadConversations();
      } catch (err: any) {
        console.error('Error creating conversation:', err);
        setError(err.message || 'Nepavyko sukurti pokalbio');
        return;
      } finally {
        setCreatingConversation(false);
      }
    }

    const userMessage: SDKMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    await addMessageToConversation(conversation.id, userMessage);
    const updatedMessages = [...conversation.messages, userMessage];
    setCurrentConversation({ ...conversation, messages: updatedMessages });
    setInputValue('');
    setLoading(true);
    setError(null);

    try {
      if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY not found');

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      const anthropicMessages = updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: anthropicMessages
      });

      let thinkingContent = '';
      let responseContent = '';

      for (const block of response.content) {
        if (block.type === 'thinking') thinkingContent = block.thinking;
        else if (block.type === 'text') responseContent += block.text;
      }

      const assistantMessage: SDKMessage = {
        role: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString(),
        thinking: thinkingContent
      };

      if (responseContent.includes('<commercial_offer>') || conversation.artifact) {
        await handleArtifactGeneration(responseContent, conversation);
      }

      await addMessageToConversation(conversation.id, assistantMessage);

      // Update local state with the new message
      const updatedConversation = {
        ...conversation,
        messages: [...updatedMessages, assistantMessage],
        message_count: updatedMessages.length + 1,
        last_message_at: assistantMessage.timestamp,
        updated_at: new Date().toISOString()
      };
      setCurrentConversation(updatedConversation);

      // Refresh conversation list in background to update sidebar (without visual jarring)
      loadConversations();
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Įvyko klaida');
    } finally {
      setLoading(false);
    }
  };

  const handleArtifactGeneration = async (content: string, conversation: SDKConversation) => {
    try {
      const match = content.match(/<commercial_offer>([\s\S]*?)<\/commercial_offer>/);
      if (!match) return;

      const offerContent = match[1].trim();
      const currentArtifact = conversation.artifact;
      let newArtifact: CommercialOfferArtifact;

      if (currentArtifact) {
        const diff = calculateDiff(currentArtifact.content, offerContent);
        newArtifact = {
          ...currentArtifact,
          content: offerContent,
          version: currentArtifact.version + 1,
          updated_at: new Date().toISOString(),
          diff_history: [...currentArtifact.diff_history, {
            version: currentArtifact.version + 1,
            timestamp: new Date().toISOString(),
            changes: diff
          }]
        };
      } else {
        newArtifact = {
          id: crypto.randomUUID(),
          type: 'commercial_offer',
          title: 'Komercinis pasiūlymas',
          content: offerContent,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          diff_history: []
        };
      }

      await updateConversationArtifact(conversation.id, newArtifact);
      setCurrentConversation({ ...conversation, artifact: newArtifact });
      setShowArtifact(true);
    } catch (err) {
      console.error('Error handling artifact:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
    <div className="h-full flex" style={{ background: '#fdfcfb' }}>
      {/* Reopen Button (when sidebar collapsed) - positioned next to main sidebar */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-4 z-50 p-2 rounded-r-lg transition-all duration-300"
          style={{
            left: mainSidebarCollapsed ? '64px' : '256px', // Position at edge of main sidebar
            background: 'white',
            border: '1px solid #e8e5e0',
            color: '#5a5550',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Secondary Sidebar - slides from main sidebar edge */}
      <div
        className="flex-shrink-0 border-r transition-all duration-300 flex flex-col"
        style={{
          width: sidebarCollapsed ? '0px' : '260px',
          borderColor: '#f0ede8',
          background: 'white',
          overflow: sidebarCollapsed ? 'hidden' : 'visible',
          opacity: sidebarCollapsed ? 0 : 1
        }}
      >
        {/* Project Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#5a5550' }} />
            <span className="font-semibold truncate" style={{ color: '#3d3935' }}>
              Standartinis
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: '#8a857f' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions Section */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: '#3d3935' }}>
              Instrukcijos
            </span>
            <button
              onClick={() => setShowPromptModal(true)}
              className="p-1 rounded transition-colors"
              style={{ color: '#8a857f' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs" style={{ color: '#8a857f' }}>
            Sistemos instrukcijos komerciniam pasiūlymui
          </p>
        </div>

        {/* Conversations Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b" style={{ borderColor: '#f0ede8' }}>
            <h3 className="text-sm font-medium" style={{ color: '#3d3935' }}>Conversations</h3>
          </div>

          <div className="p-3">
            <button
              onClick={handleCreateConversation}
              disabled={creatingConversation}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: '#f0ede8', color: '#5a5550', border: '1px solid #e8e5e0' }}
              onMouseEnter={(e) => !creatingConversation && (e.currentTarget.style.background = '#e8e5e0')}
              onMouseLeave={(e) => !creatingConversation && (e.currentTarget.style.background = '#f0ede8')}
            >
              <Plus className="w-4 h-4" />
              <span>Naujas pokalbis</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {loadingConversations ? (
              <div className="p-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#8a857f' }} />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm" style={{ color: '#8a857f' }}>Pokalbių nėra</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className="group flex items-start justify-between p-2 rounded-lg cursor-pointer transition-all duration-150"
                    style={{
                      background: currentConversation?.id === conv.id ? '#faf9f7' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (currentConversation?.id !== conv.id) e.currentTarget.style.background = '#f9f8f6';
                    }}
                    onMouseLeave={(e) => {
                      if (currentConversation?.id !== conv.id) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: '#3d3935' }}>{conv.title}</p>
                      <p className="text-xs" style={{ color: '#8a857f' }}>
                        {new Date(conv.last_message_at).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                      style={{ color: '#991b1b' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!currentConversation ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Parašykite žinutę, kad pradėtumėte pokalbį
              </p>
            </div>
          ) : currentConversation.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Parašykite žinutę, kad pradėtumėte pokalbį
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {currentConversation.messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] px-4 py-3 rounded-xl"
                    style={{
                      background: message.role === 'user' ? '#5a5550' : 'white',
                      color: message.role === 'user' ? 'white' : '#3d3935',
                      border: message.role === 'assistant' ? '1px solid #e8e5e0' : 'none'
                    }}
                  >
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content.replace(/<commercial_offer>[\s\S]*?<\/commercial_offer>/g, '')}
                    </div>
                    {message.thinking && (
                      <details className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                        <summary className="text-xs cursor-pointer" style={{ color: message.role === 'user' ? 'rgba(255,255,255,0.8)' : '#8a857f' }}>
                          Rodyti mąstymo procesą
                        </summary>
                        <div className="mt-2 text-xs whitespace-pre-wrap" style={{ color: message.role === 'user' ? 'rgba(255,255,255,0.7)' : '#8a857f' }}>
                          {message.thinking}
                        </div>
                      </details>
                    )}
                    <div className="text-xs mt-2" style={{ color: message.role === 'user' ? 'rgba(255,255,255,0.7)' : '#8a857f' }}>
                      {new Date(message.timestamp).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-xl" style={{ background: 'white', border: '1px solid #e8e5e0' }}>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#5a5550' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error Display - Always visible when error exists */}
        {error && (
          <div className="px-6 pb-2">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-start gap-2 px-4 py-2 rounded-lg text-sm" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* Input Box - Always visible */}
        <div className="px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Rašykite žinutę..."
                rows={1}
                className="w-full px-4 py-3 pr-24 text-sm rounded-lg resize-none transition-all"
                style={{ background: 'white', color: '#3d3935', border: '1px solid #e8e5e0' }}
                disabled={loading || !systemPrompt}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  className="p-2 rounded-md transition-colors"
                  style={{ color: '#8a857f' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  disabled={loading}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || loading || !systemPrompt}
                  className="p-2 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: inputValue.trim() && !loading ? '#5a5550' : '#e8e5e0',
                    color: inputValue.trim() && !loading ? 'white' : '#8a857f'
                  }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Artifact Panel */}
      {currentConversation?.artifact && showArtifact && (
        <div className="w-[500px] border-l flex-shrink-0 flex flex-col" style={{ borderColor: '#f0ede8', background: 'white' }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#f0ede8' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>{currentConversation.artifact.title}</h3>
              <p className="text-xs" style={{ color: '#8a857f' }}>Versija {currentConversation.artifact.version}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  background: showDiff ? '#5a5550' : '#f0ede8',
                  color: showDiff ? 'white' : '#5a5550'
                }}
              >
                {showDiff ? 'Rodyti turinį' : 'Rodyti pakeitimus'}
              </button>
              <button
                onClick={() => setShowArtifact(false)}
                className="p-1 rounded transition-colors"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {showDiff && currentConversation.artifact.diff_history.length > 0 ? (
              <div className="space-y-4">
                {currentConversation.artifact.diff_history.map((diff, index) => (
                  <div key={index} className="text-xs font-mono">
                    <div className="mb-2 font-semibold" style={{ color: '#8a857f' }}>
                      Versija {diff.version} - {new Date(diff.timestamp).toLocaleString('lt-LT')}
                    </div>
                    {diff.changes.added.map((line, i) => (
                      <div key={`add-${i}`} className="px-2 py-1 rounded" style={{ background: '#f0fdf4', color: '#15803d' }}>
                        + {line}
                      </div>
                    ))}
                    {diff.changes.removed.map((line, i) => (
                      <div key={`rem-${i}`} className="px-2 py-1 rounded" style={{ background: '#fef2f2', color: '#991b1b' }}>
                        - {line}
                      </div>
                    ))}
                    {diff.changes.modified.map((change, i) => (
                      <div key={`mod-${i}`} className="space-y-1">
                        <div className="px-2 py-1 rounded" style={{ background: '#fef2f2', color: '#991b1b' }}>- {change.before}</div>
                        <div className="px-2 py-1 rounded" style={{ background: '#f0fdf4', color: '#15803d' }}>+ {change.after}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="prose max-w-none text-sm whitespace-pre-wrap" style={{ color: '#3d3935' }}>
                {currentConversation.artifact.content}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] rounded-lg overflow-hidden"
            style={{ background: 'white', border: '1px solid #e8e5e0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#f0ede8' }}>
              <h3 className="text-lg font-semibold" style={{ color: '#3d3935' }}>Sistema Prompt'as</h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed" style={{ color: '#3d3935' }}>
                {systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
