import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Loader2,
  AlertCircle,
  Paperclip,
  FileText,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  MoreHorizontal,
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
  renameSDKConversation,
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
}

export default function SDKInterfaceNew({ user, projectId }: SDKInterfaceNewProps) {
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'sources'>('conversations');

  // Conversations state
  const [conversations, setConversations] = useState<SDKConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<SDKConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  // Chat state
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // System prompt state
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Artifact state
  const [showArtifact, setShowArtifact] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Anthropic API key
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
    } catch (err) {
      console.error('Error loading system prompt:', err);
      setError('Nepavyko užkrauti sistemos nurodymus');
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

      // Reload conversations and select the new one
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

  const handleDeleteConversation = async (conversationId: string) => {
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
    if (!inputValue.trim() || loading || !systemPrompt || !currentConversation) return;

    const userMessage: SDKMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    // Add user message to conversation
    await addMessageToConversation(currentConversation.id, userMessage);

    // Update local state
    setCurrentConversation({
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage]
    });

    setInputValue('');
    setLoading(true);
    setError(null);

    try {
      if (!anthropicApiKey) {
        throw new Error('VITE_ANTHROPIC_API_KEY not found');
      }

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      // Build messages array
      const anthropicMessages = currentConversation.messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      }));

      anthropicMessages.push({
        role: 'user',
        content: userMessage.content
      });

      // Make API call with extended thinking
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        thinking: {
          type: 'enabled',
          budget_tokens: 5000
        },
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: anthropicMessages
      });

      // Extract thinking and response
      let thinkingContent = '';
      let responseContent = '';

      for (const block of response.content) {
        if (block.type === 'thinking') {
          thinkingContent = block.thinking;
        } else if (block.type === 'text') {
          responseContent += block.text;
        }
      }

      const assistantMessage: SDKMessage = {
        role: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString(),
        thinking: thinkingContent
      };

      // Check if response contains commercial offer artifact
      if (responseContent.includes('<commercial_offer>') || currentConversation.artifact) {
        await handleArtifactGeneration(responseContent, currentConversation);
      }

      // Add assistant message to conversation
      await addMessageToConversation(currentConversation.id, assistantMessage);

      // Update local state
      setCurrentConversation({
        ...currentConversation,
        messages: [...currentConversation.messages, userMessage, assistantMessage]
      });

      await appLogger.logDocument({
        action: 'sdk_message_sent',
        userId: user.id,
        userEmail: user.email,
        metadata: {
          conversation_id: currentConversation.id,
          has_thinking: !!thinkingContent,
          has_artifact: responseContent.includes('<commercial_offer>')
        }
      });
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Įvyko klaida');
    } finally {
      setLoading(false);
    }
  };

  const handleArtifactGeneration = async (content: string, conversation: SDKConversation) => {
    try {
      // Extract artifact content
      const match = content.match(/<commercial_offer>([\s\S]*?)<\/commercial_offer>/);
      if (!match) return;

      const offerContent = match[1].trim();
      const currentArtifact = conversation.artifact;

      let newArtifact: CommercialOfferArtifact;

      if (currentArtifact) {
        // Calculate diff
        const diff = calculateDiff(currentArtifact.content, offerContent);
        const newVersion = currentArtifact.version + 1;

        newArtifact = {
          ...currentArtifact,
          content: offerContent,
          version: newVersion,
          updated_at: new Date().toISOString(),
          diff_history: [
            ...currentArtifact.diff_history,
            {
              version: newVersion,
              timestamp: new Date().toISOString(),
              changes: diff
            }
          ]
        };
      } else {
        // Create new artifact
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
      setCurrentConversation({
        ...conversation,
        artifact: newArtifact
      });
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
      <div className="h-full flex items-center justify-center" style={{ background: '#1a1a1a' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: '#f97316' }} />
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
    <div className="h-full flex" style={{ background: '#1a1a1a' }}>
      {/* Secondary Sidebar - Conversations */}
      <div
        className={`flex-shrink-0 border-r transition-all duration-300 flex flex-col`}
        style={{
          width: sidebarCollapsed ? '0px' : '300px',
          borderColor: '#2a2a2a',
          background: '#0f0f0f',
          overflow: sidebarCollapsed ? 'hidden' : 'visible'
        }}
      >
        {/* Project Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#2a2a2a' }}>
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#9ca3af' }} />
            <span className="font-semibold truncate" style={{ color: '#e5e5e5' }}>
              Standartinis
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md transition-colors hover:bg-white/5"
            style={{ color: '#9ca3af' }}
          >
            {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Instructions Section */}
        <div className="p-4 border-b" style={{ borderColor: '#2a2a2a' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: '#e5e5e5' }}>
              Instrukcijos
            </span>
            <button
              onClick={() => setShowPromptModal(true)}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              title="Peržiūrėti prompt'ą"
            >
              <Eye className="w-4 h-4" style={{ color: '#9ca3af' }} />
            </button>
          </div>
          <p className="text-xs" style={{ color: '#6b7280' }}>
            Sistemos instrukcijos komerciniam pasiūlymui
          </p>
        </div>

        {/* Conversations Tab */}
        <div className="border-b" style={{ borderColor: '#2a2a2a' }}>
          <div className="flex">
            <button
              onClick={() => setActiveTab('conversations')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'conversations' ? 'border-b-2' : ''
              }`}
              style={{
                color: activeTab === 'conversations' ? '#f97316' : '#9ca3af',
                borderColor: activeTab === 'conversations' ? '#f97316' : 'transparent'
              }}
            >
              Conversations
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <button
              onClick={handleCreateConversation}
              disabled={creatingConversation}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
              style={{ color: '#e5e5e5', border: '1px solid #2a2a2a' }}
            >
              <Plus className="w-4 h-4" />
              <span>Naujas pokalbis</span>
            </button>
          </div>

          {loadingConversations ? (
            <div className="p-4 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#9ca3af' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm" style={{ color: '#6b7280' }}>
                Pokalbių nėra
              </p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group flex items-start justify-between p-2 rounded-md cursor-pointer transition-colors ${
                    currentConversation?.id === conv.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: '#e5e5e5' }}>
                      {conv.title}
                    </p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>
                      {new Date(conv.last_message_at).toLocaleDateString('lt-LT', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" style={{ color: '#ef4444' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Collapse Toggle Button (when sidebar is collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="absolute left-0 top-4 p-2 rounded-r-md transition-colors"
          style={{ background: '#2a2a2a', color: '#9ca3af' }}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!currentConversation ? (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold mb-2" style={{ color: '#e5e5e5' }}>
                Start a conversation in this project
              </h2>
              <p className="text-sm mb-6" style={{ color: '#9ca3af' }}>
                Use this project to keep your conversations and files in a single place.
              </p>
              <div className="space-y-2">
                <button
                  onClick={handleCreateConversation}
                  className="px-6 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: '#2a2a2a',
                    color: '#e5e5e5',
                    border: '1px solid #3a3a3a'
                  }}
                >
                  Pradėti pokalbį
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {currentConversation.messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm" style={{ color: '#6b7280' }}>
                    Parašykite žinutę, kad pradėtumėte pokalbį
                  </p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  {currentConversation.messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[85%] px-4 py-3 rounded-lg"
                        style={{
                          background: message.role === 'user' ? '#f97316' : '#2a2a2a',
                          color: '#e5e5e5'
                        }}
                      >
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content.replace(/<commercial_offer>[\s\S]*?<\/commercial_offer>/g, '')}
                        </div>
                        {message.thinking && (
                          <details className="mt-2 pt-2 border-t" style={{ borderColor: '#3a3a3a' }}>
                            <summary className="text-xs cursor-pointer" style={{ color: '#9ca3af' }}>
                              Rodyti mąstymo procesą
                            </summary>
                            <div className="mt-2 text-xs" style={{ color: '#d1d5db' }}>
                              {message.thinking}
                            </div>
                          </details>
                        )}
                        <div className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
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
                      <div className="px-4 py-3 rounded-lg" style={{ background: '#2a2a2a' }}>
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#f97316' }} />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-6 pb-2">
                <div className="max-w-4xl mx-auto">
                  <div
                    className="flex items-start gap-2 px-4 py-2 rounded-lg text-sm"
                    style={{ background: '#3d1f1f', color: '#ff6b6b', border: '1px solid #5a2a2a' }}
                  >
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t px-6 py-4" style={{ borderColor: '#2a2a2a' }}>
              <div className="max-w-4xl mx-auto">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Rašykite žinutę..."
                    rows={1}
                    className="w-full px-4 py-3 pr-24 text-sm rounded-lg resize-none focus:outline-none focus:ring-2"
                    style={{
                      background: '#2a2a2a',
                      color: '#e5e5e5',
                      border: '1px solid #3a3a3a',
                      focusRing: '#f97316'
                    }}
                    disabled={loading || !systemPrompt}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                    <button
                      className="p-2 rounded-md transition-colors hover:bg-white/5"
                      style={{ color: '#9ca3af' }}
                      disabled={loading}
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() || loading || !systemPrompt}
                      className="p-2 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: inputValue.trim() && !loading ? '#f97316' : '#3a3a3a',
                        color: inputValue.trim() && !loading ? '#ffffff' : '#6b7280'
                      }}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Artifact Panel (when artifact exists) */}
      {currentConversation?.artifact && showArtifact && (
        <div
          className="w-[500px] border-l flex-shrink-0 flex flex-col"
          style={{ borderColor: '#2a2a2a', background: '#0f0f0f' }}
        >
          {/* Artifact Header */}
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#2a2a2a' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#e5e5e5' }}>
                {currentConversation.artifact.title}
              </h3>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                Versija {currentConversation.artifact.version}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="px-2 py-1 text-xs rounded transition-colors"
                style={{
                  background: showDiff ? '#f97316' : '#2a2a2a',
                  color: showDiff ? '#ffffff' : '#e5e5e5'
                }}
              >
                {showDiff ? 'Rodyti turinį' : 'Rodyti pakeitimus'}
              </button>
              <button
                onClick={() => setShowArtifact(false)}
                className="p-1 rounded transition-colors hover:bg-white/5"
                style={{ color: '#9ca3af' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Artifact Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {showDiff && currentConversation.artifact.diff_history.length > 0 ? (
              /* Diff View */
              <div className="space-y-4">
                {currentConversation.artifact.diff_history.map((diff, index) => (
                  <div key={index} className="text-xs font-mono">
                    <div className="mb-2 font-semibold" style={{ color: '#9ca3af' }}>
                      Versija {diff.version} - {new Date(diff.timestamp).toLocaleString('lt-LT')}
                    </div>
                    {diff.changes.added.map((line, i) => (
                      <div key={`add-${i}`} className="px-2 py-1" style={{ background: '#1f3a1f', color: '#4ade80' }}>
                        + {line}
                      </div>
                    ))}
                    {diff.changes.removed.map((line, i) => (
                      <div key={`rem-${i}`} className="px-2 py-1" style={{ background: '#3d1f1f', color: '#ff6b6b' }}>
                        - {line}
                      </div>
                    ))}
                    {diff.changes.modified.map((change, i) => (
                      <div key={`mod-${i}`} className="space-y-1">
                        <div className="px-2 py-1" style={{ background: '#3d1f1f', color: '#ff6b6b' }}>
                          - {change.before}
                        </div>
                        <div className="px-2 py-1" style={{ background: '#1f3a1f', color: '#4ade80' }}>
                          + {change.after}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* Content View */
              <div
                className="prose prose-invert max-w-none text-sm"
                style={{ color: '#e5e5e5' }}
                dangerouslySetInnerHTML={{ __html: currentConversation.artifact.content }}
              />
            )}
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
            className="w-full max-w-4xl max-h-[80vh] rounded-lg overflow-hidden"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#2a2a2a' }}>
              <h3 className="text-lg font-semibold" style={{ color: '#e5e5e5' }}>
                Sistema Prompt'as
              </h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="p-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: '#9ca3af' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <pre
                className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
                style={{ color: '#d1d5db' }}
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
