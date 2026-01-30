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
  PanelLeft,
  ChevronDown
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
}

export default function SDKInterfaceNew({ user, projectId }: SDKInterfaceNewProps) {
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      setError('Nepavyko užkrauti sistemos instrukcijų. Patikrinkite instruction_variables lentelę.');
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
    if (!inputValue.trim() || loading || !systemPrompt || !currentConversation) return;

    const userMessage: SDKMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    await addMessageToConversation(currentConversation.id, userMessage);

    const updatedMessages = [...currentConversation.messages, userMessage];
    setCurrentConversation({
      ...currentConversation,
      messages: updatedMessages
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

      const anthropicMessages = updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content
      }));

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

      if (responseContent.includes('<commercial_offer>') || currentConversation.artifact) {
        await handleArtifactGeneration(responseContent, currentConversation);
      }

      await addMessageToConversation(currentConversation.id, assistantMessage);

      setCurrentConversation({
        ...currentConversation,
        messages: [...updatedMessages, assistantMessage]
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
      const match = content.match(/<commercial_offer>([\s\S]*?)<\/commercial_offer>/);
      if (!match) return;

      const offerContent = match[1].trim();
      const currentArtifact = conversation.artifact;

      let newArtifact: CommercialOfferArtifact;

      if (currentArtifact) {
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
      <div className="h-full flex items-center justify-center bg-anthropic-bg">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-anthropic-accent" />
          <p className="text-base font-semibold mb-2 text-anthropic-text-primary">
            Kraunamos sistemos instrukcijos
          </p>
          <p className="text-sm text-anthropic-text-secondary">
            Gaunami kintamieji iš duomenų bazės...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-anthropic-bg">
      {/* Secondary Sidebar */}
      <div
        className={`anthropic-sidebar flex-shrink-0 transition-all duration-300 flex flex-col ${
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80'
        }`}
      >
        {/* Project Header */}
        <div className="p-4 border-b border-anthropic-border flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <FileText className="w-5 h-5 flex-shrink-0 text-anthropic-text-secondary" />
            <span className="font-semibold truncate text-anthropic-text-primary">
              Standartinis
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md transition-colors hover:bg-anthropic-bg-hover text-anthropic-text-secondary"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions Section */}
        <div className="p-4 border-b border-anthropic-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-anthropic-text-primary">
              Instrukcijos
            </span>
            <button
              onClick={() => setShowPromptModal(true)}
              className="p-1 rounded hover:bg-anthropic-bg-hover transition-colors"
              title="Peržiūrėti prompt'ą"
            >
              <Eye className="w-4 h-4 text-anthropic-text-secondary" />
            </button>
          </div>
          <p className="text-xs text-anthropic-text-muted">
            Sistemos instrukcijos komerciniam pasiūlymui
          </p>
        </div>

        {/* Conversations Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-anthropic-border">
            <h3 className="text-sm font-medium text-anthropic-text-primary">Conversations</h3>
          </div>

          {/* New Conversation Button */}
          <div className="p-3">
            <button
              onClick={handleCreateConversation}
              disabled={creatingConversation}
              className="anthropic-btn anthropic-btn-secondary w-full flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Naujas pokalbis</span>
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto anthropic-scrollbar px-2">
            {loadingConversations ? (
              <div className="p-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-anthropic-text-secondary" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-anthropic-text-muted">
                  Pokalbių nėra
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`anthropic-list-item group flex items-start justify-between ${
                      currentConversation?.id === conv.id ? 'active' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate text-anthropic-text-primary">
                        {conv.title}
                      </p>
                      <p className="text-xs text-anthropic-text-muted">
                        {new Date(conv.last_message_at).toLocaleDateString('lt-LT', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-anthropic-bg-hover transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-macos-red" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reopen Sidebar Button (when collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed left-0 top-4 z-10 anthropic-btn anthropic-btn-secondary rounded-r-md rounded-l-none"
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
              <h2 className="text-2xl font-semibold mb-2 text-anthropic-text-primary">
                Start a conversation in this project
              </h2>
              <p className="text-sm mb-6 text-anthropic-text-secondary">
                Use this project to keep your conversations and files in a single place.
              </p>
              <button
                onClick={handleCreateConversation}
                className="anthropic-btn anthropic-btn-primary"
              >
                Pradėti pokalbį
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto anthropic-scrollbar px-6 py-4">
              {currentConversation.messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-anthropic-text-muted">
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
                      <div className={`max-w-[85%] ${message.role === 'user' ? 'anthropic-message-user' : 'anthropic-message-assistant'}`}>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content.replace(/<commercial_offer>[\s\S]*?<\/commercial_offer>/g, '')}
                        </div>
                        {message.thinking && (
                          <details className="mt-2 pt-2 border-t border-anthropic-border">
                            <summary className="text-xs cursor-pointer text-anthropic-text-secondary">
                              Rodyti mąstymo procesą
                            </summary>
                            <div className="mt-2 text-xs text-anthropic-text-muted whitespace-pre-wrap">
                              {message.thinking}
                            </div>
                          </details>
                        )}
                        <div className="text-xs mt-2 text-anthropic-text-muted">
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
                      <div className="anthropic-message-assistant">
                        <Loader2 className="w-5 h-5 animate-spin text-anthropic-accent" />
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
                  <div className="flex items-start gap-2 px-4 py-2 rounded-lg text-sm bg-macos-red bg-opacity-10 text-macos-red border border-macos-red border-opacity-20">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t border-anthropic-border px-6 py-4">
              <div className="max-w-4xl mx-auto">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Rašykite žinutę..."
                    rows={1}
                    className="anthropic-input w-full pr-24 resize-none"
                    disabled={loading || !systemPrompt}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                    <button
                      className="p-2 rounded-md transition-colors hover:bg-anthropic-bg-hover text-anthropic-text-secondary"
                      disabled={loading}
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() || loading || !systemPrompt}
                      className={`p-2 rounded-md transition-all ${
                        inputValue.trim() && !loading
                          ? 'bg-anthropic-accent text-white hover:bg-anthropic-accent-hover'
                          : 'bg-anthropic-bg-hover text-anthropic-text-muted opacity-40 cursor-not-allowed'
                      }`}
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

      {/* Artifact Panel */}
      {currentConversation?.artifact && showArtifact && (
        <div className="w-[500px] anthropic-sidebar flex-shrink-0 flex flex-col">
          <div className="p-4 border-b border-anthropic-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-anthropic-text-primary">
                {currentConversation.artifact.title}
              </h3>
              <p className="text-xs text-anthropic-text-muted">
                Versija {currentConversation.artifact.version}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className={`anthropic-btn text-xs ${
                  showDiff ? 'anthropic-btn-primary' : 'anthropic-btn-secondary'
                }`}
              >
                {showDiff ? 'Rodyti turinį' : 'Rodyti pakeitimus'}
              </button>
              <button
                onClick={() => setShowArtifact(false)}
                className="p-1 rounded transition-colors hover:bg-anthropic-bg-hover text-anthropic-text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto anthropic-scrollbar p-4">
            {showDiff && currentConversation.artifact.diff_history.length > 0 ? (
              <div className="space-y-4">
                {currentConversation.artifact.diff_history.map((diff, index) => (
                  <div key={index} className="text-xs font-mono">
                    <div className="mb-2 font-semibold text-anthropic-text-secondary">
                      Versija {diff.version} - {new Date(diff.timestamp).toLocaleString('lt-LT')}
                    </div>
                    {diff.changes.added.map((line, i) => (
                      <div key={`add-${i}`} className="px-2 py-1 bg-macos-green bg-opacity-10 text-macos-green">
                        + {line}
                      </div>
                    ))}
                    {diff.changes.removed.map((line, i) => (
                      <div key={`rem-${i}`} className="px-2 py-1 bg-macos-red bg-opacity-10 text-macos-red">
                        - {line}
                      </div>
                    ))}
                    {diff.changes.modified.map((change, i) => (
                      <div key={`mod-${i}`} className="space-y-1">
                        <div className="px-2 py-1 bg-macos-red bg-opacity-10 text-macos-red">
                          - {change.before}
                        </div>
                        <div className="px-2 py-1 bg-macos-green bg-opacity-10 text-macos-green">
                          + {change.after}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="prose prose-invert max-w-none text-sm text-anthropic-text-primary whitespace-pre-wrap">
                {currentConversation.artifact.content}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompt Preview Modal */}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black bg-opacity-80"
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] rounded-lg overflow-hidden anthropic-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-anthropic-border">
              <h3 className="text-lg font-semibold text-anthropic-text-primary">
                Sistema Prompt'as
              </h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="p-2 rounded-lg transition-colors hover:bg-anthropic-bg-hover text-anthropic-text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto anthropic-scrollbar max-h-[calc(80vh-80px)]">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-anthropic-text-secondary">
                {systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
