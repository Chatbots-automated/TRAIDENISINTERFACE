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
  Pencil,
  Copy,
  RotateCcw,
  ChevronDown,
  User,
  Check,
  Share2,
  Users
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt, savePromptTemplate, getPromptTemplate } from '../lib/instructionVariablesService';
import MessageContent from './MessageContent';
import RoboticArmLoader from './RoboticArmLoader';
import { colors } from '../lib/designSystem';
import { getWebhookUrl } from '../lib/webhooksService';
import {
  createSDKConversation,
  getSDKConversations,
  getSDKConversation,
  addMessageToConversation,
  updateConversationArtifact,
  deleteSDKConversation,
  renameSDKConversation,
  updateMessageButtonSelection,
  calculateDiff,
  type SDKConversation,
  type SDKMessage,
  type CommercialOfferArtifact
} from '../lib/sdkConversationService';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';
import { tools } from '../lib/toolDefinitions';
import { executeTool } from '../lib/toolExecutors';
import { getEconomists, getManagers, getShareableUsers, type AppUserData } from '../lib/userService';
import {
  shareConversation,
  getSharedConversations,
  getSharedConversationDetails,
  markSharedAsRead,
  checkConversationAccess,
  getUnreadSharedCount,
  type SharedConversation,
  type SharedConversationDetails
} from '../lib/sharedConversationService';
import NotificationContainer, { Notification } from './NotificationContainer';

interface SDKInterfaceNewProps {
  user: AppUser;
  projectId: string;
  mainSidebarCollapsed: boolean;
  onUnreadCountChange?: (count: number) => void;
}

export default function SDKInterfaceNew({ user, projectId, mainSidebarCollapsed, onUnreadCountChange }: SDKInterfaceNewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<SDKConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<SDKConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isToolUse, setIsToolUse] = useState(false);
  const [toolUseName, setToolUseName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [promptTemplate, setPromptTemplate] = useState<string>('');
  const [templateFromDB, setTemplateFromDB] = useState<string>(''); // Template variable from instruction_variables
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showTemplateView, setShowTemplateView] = useState(false);
  const [showArtifact, setShowArtifact] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [displayButtons, setDisplayButtons] = useState<{ message?: string; buttons: Array<{id: string, label: string, value: string}> } | null>(null);
  const [isStreamingArtifact, setIsStreamingArtifact] = useState(false);
  const [artifactStreamContent, setArtifactStreamContent] = useState('');
  const [economists, setEconomists] = useState<AppUserData[]>([]);
  const [selectedEconomist, setSelectedEconomist] = useState<AppUserData | null>(null);
  const [showEconomistDropdown, setShowEconomistDropdown] = useState(false);
  const [managers, setManagers] = useState<AppUserData[]>([]);
  const [selectedManager, setSelectedManager] = useState<AppUserData | null>(null);
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [sendingWebhook, setSendingWebhook] = useState(false);

  // Sharing states
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [shareableUsers, setShareableUsers] = useState<AppUserData[]>([]);
  const [selectedShareUsers, setSelectedShareUsers] = useState<string[]>([]);
  const [sharingConversation, setSharingConversation] = useState(false);
  const [sharedConversations, setSharedConversations] = useState<SharedConversation[]>([]);
  const [unreadSharedCount, setUnreadSharedCount] = useState(0);
  const [sidebarView, setSidebarView] = useState<'conversations' | 'shared'>('conversations');
  const [conversationDetails, setConversationDetails] = useState<SharedConversationDetails | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  // Notification helper functions
  const addNotification = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = `notification-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title, message }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    loadSystemPrompt();
    loadConversations();
    loadEconomists();
    loadManagers();
    loadSharedConversations();
    loadShareableUsers();
  }, []);

  const loadEconomists = async () => {
    try {
      const economistsList = await getEconomists();
      setEconomists(economistsList);
      console.log('[Economists] Loaded', economistsList.length, 'economists');
    } catch (error) {
      console.error('[Economists] Error loading:', error);
    }
  };

  const loadManagers = async () => {
    try {
      const managersList = await getManagers();
      setManagers(managersList);
      console.log('[Managers] Loaded', managersList.length, 'managers');
    } catch (error) {
      console.error('[Managers] Error loading:', error);
    }
  };

  // Propagate unread count to parent for main sidebar badge
  useEffect(() => {
    onUnreadCountChange?.(unreadSharedCount);
  }, [unreadSharedCount, onUnreadCountChange]);

  useEffect(() => {
    // Auto-scroll on new messages only if user hasn't scrolled up
    if (!userScrolledUp) {
      scrollToBottom();
    }
  }, [currentConversation?.messages, userScrolledUp]);

  useEffect(() => {
    // Auto-scroll during streaming if user hasn't scrolled up
    if (streamingContent && !userScrolledUp) {
      scrollToBottom();
    }
  }, [streamingContent, userScrolledUp]);

  useEffect(() => {
    // Reset scroll state when new response starts
    if (loading) {
      setUserScrolledUp(false);
      setShowScrollButton(false);
    }
  }, [loading]);

  const loadSystemPrompt = async () => {
    try {
      setLoadingPrompt(true);
      const [fullPrompt, template, templateVar] = await Promise.all([
        getSystemPrompt(),
        getPromptTemplate(),
        fetchTemplateVariable() // Fetch template variable from instruction_variables
      ]);
      setSystemPrompt(fullPrompt);
      setPromptTemplate(template);
      setTemplateFromDB(templateVar);
      console.log('System prompt loaded, length:', fullPrompt.length);
      console.log('Template loaded, length:', template.length);
      console.log('Template variable from DB loaded, length:', templateVar.length);
    } catch (err) {
      console.error('Error loading system prompt:', err);
      setError('Nepavyko užkrauti sistemos instrukcijų');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const fetchTemplateVariable = async (): Promise<string> => {
    try {
      const { dbAdmin } = await import('../lib/database');
      const { data, error } = await dbAdmin
        .from('instruction_variables')
        .select('content')
        .eq('variable_key', 'template')
        .single();

      if (error) {
        console.warn('[fetchTemplateVariable] No template variable found:', error);
        return promptTemplate; // Fallback to code template
      }

      return data?.content || promptTemplate;
    } catch (error) {
      console.error('[fetchTemplateVariable] Error:', error);
      return promptTemplate; // Fallback to code template
    }
  };

  const saveTemplateVariable = async (content: string): Promise<{ success: boolean; error?: any }> => {
    try {
      const { dbAdmin } = await import('../lib/database');

      // Update the template variable in instruction_variables table
      const { error } = await dbAdmin
        .from('instruction_variables')
        .update({
          content: content,
          updated_at: new Date().toISOString(),
          updated_by: user.email
        })
        .eq('variable_key', 'template');

      if (error) {
        console.error('[saveTemplateVariable] Error:', error);
        return { success: false, error };
      }

      console.log('[saveTemplateVariable] Template saved successfully');
      return { success: true };
    } catch (error) {
      console.error('[saveTemplateVariable] Exception:', error);
      return { success: false, error };
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

  const loadSharedConversations = async () => {
    try {
      const { data, error } = await getSharedConversations(user.id);
      if (error) throw error;
      setSharedConversations(data || []);

      // Update unread count
      const { data: count } = await getUnreadSharedCount(user.id);
      setUnreadSharedCount(count);
    } catch (err) {
      console.error('Error loading shared conversations:', err);
    }
  };

  const loadShareableUsers = async () => {
    try {
      const users = await getShareableUsers(user.id);
      setShareableUsers(users);
    } catch (err) {
      console.error('Error loading shareable users:', err);
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
      const { data: newConversation } = await getSDKConversation(conversationId!);
      setCurrentConversation(newConversation);
      // Optimistically add to conversations list to avoid flicker
      setConversations(prev => [newConversation!, ...prev]);
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

      // Clean up any messages with array content (migration)
      if (data && data.messages) {
        data.messages = data.messages.map(msg => {
          if (typeof msg.content !== 'string') {
            console.warn('[Migration] Converting non-string message content to string', msg);
            const newContent = Array.isArray(msg.content)
              ? msg.content.map((block: any) =>
                  block.type === 'text' ? block.text : ''
                ).filter(Boolean).join('\n\n')
              : '[Content format error]';
            return { ...msg, content: newContent };
          }
          return msg;
        });
      }

      setCurrentConversation(data);
      setError(null);
    } catch (err) {
      console.error('Error selecting conversation:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log('[Delete] Attempting to delete conversation:', conversationId);
      const { data, error: deleteError } = await deleteSDKConversation(conversationId, user.id, user.email);

      if (deleteError || !data) {
        console.error('[Delete] Error:', deleteError);
        setError(`Nepavyko ištrinti pokalbio: ${deleteError?.message || 'nežinoma klaida'}`);
        return;
      }

      console.log('[Delete] Successfully deleted conversation');
      // Optimistically remove from list to avoid flicker
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
      }
    } catch (err: any) {
      console.error('[Delete] Exception:', err);
      setError(`Nepavyko ištrinti pokalbio: ${err.message || 'nežinoma klaida'}`);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    if (!isNearBottom && loading) {
      setUserScrolledUp(true);
      setShowScrollButton(true);
    } else if (isNearBottom) {
      setUserScrolledUp(false);
      setShowScrollButton(false);
    }
  };

  /**
   * Handle toggling share dropdown
   */
  const handleToggleShareDropdown = () => {
    if (!showShareDropdown) {
      setSelectedShareUsers([]);
    }
    setShowShareDropdown(!showShareDropdown);
  };

  /**
   * Handle sharing conversation
   */
  const handleShareConversation = async () => {
    if (!currentConversation || selectedShareUsers.length === 0) return;

    try {
      setSharingConversation(true);
      const { error } = await shareConversation(
        currentConversation.id,
        selectedShareUsers,
        user.id,
        user.email
      );

      if (error) throw error;

      addNotification('success', 'Sėkmė', `Pokalbis pasidalintas su ${selectedShareUsers.length} vartotojais`);
      setShowShareDropdown(false);
      setSelectedShareUsers([]);

      // Reload conversation details to show updated share list
      loadConversationDetails(currentConversation.id);
    } catch (err) {
      console.error('Error sharing conversation:', err);
      addNotification('error', 'Klaida', 'Nepavyko pasidalinti pokalbiu');
    } finally {
      setSharingConversation(false);
    }
  };

  /**
   * Toggle user selection for sharing
   */
  const toggleUserSelection = (userId: string) => {
    setSelectedShareUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  /**
   * Load detailed information about current conversation (for read-only mode)
   */
  const loadConversationDetails = async (conversationId: string) => {
    try {
      const { data, error } = await getSharedConversationDetails(conversationId, user.id);
      if (error) throw error;
      setConversationDetails(data);
    } catch (err) {
      console.error('Error loading conversation details:', err);
    }
  };

  /**
   * Handle selecting a shared conversation
   */
  const handleSelectSharedConversation = async (sharedConv: SharedConversation) => {
    try {
      // Fetch fresh conversation data (consistent with handleSelectConversation)
      const { data, error: fetchError } = await getSDKConversation(sharedConv.conversation_id);
      if (fetchError || !data) {
        console.error('Error fetching shared conversation:', fetchError);
        return;
      }

      // Run the same content migration as owned conversations
      if (data.messages) {
        data.messages = data.messages.map(msg => {
          if (typeof msg.content !== 'string') {
            const newContent = Array.isArray(msg.content)
              ? (msg.content as any[]).map((block: any) =>
                  block.type === 'text' ? block.text : ''
                ).filter(Boolean).join('\n\n')
              : '[Content format error]';
            return { ...msg, content: newContent };
          }
          return msg;
        });
      }

      // Mark as read
      await markSharedAsRead(sharedConv.conversation_id, user.id);

      // Load full details
      await loadConversationDetails(sharedConv.conversation_id);

      // Set as current conversation with read-only flag
      setCurrentConversation(data);
      setIsReadOnly(true);
      setShowArtifact(false);
      setError(null);

      // Reload shared conversations to update unread count
      loadSharedConversations();
    } catch (err) {
      console.error('Error selecting shared conversation:', err);
    }
  };

  /**
   * Handle selecting an owned conversation
   */
  const handleSelectOwnedConversation = async (conversationId: string) => {
    await handleSelectConversation(conversationId);
    setIsReadOnly(false);
    setConversationDetails(null);

    // Load details to show who it's shared with
    await loadConversationDetails(conversationId);
  };

  /**
   * Handle button click from display_buttons tool - sends silently to API
   */
  const handleButtonClick = async (buttonId: string, value: string, messageIndex: number) => {
    console.log('[Buttons] User clicked button:', buttonId, 'with value:', value);

    // Get current conversation or create one
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
        if (createError || !conversationId) {
          console.error('Error creating conversation:', createError);
          setError('Nepavyko sukurti pokalbio');
          return;
        }

        const { data: newConversation } = await getSDKConversation(conversationId);
        if (!newConversation) {
          setError('Nepavyko sukurti pokalbio');
          return;
        }

        conversation = newConversation;
        setCurrentConversation(newConversation);
        setConversations(prev => [newConversation, ...prev]);
      } catch (err: any) {
        console.error('Error creating conversation:', err);
        setError(err.message || 'Nepavyko sukurti pokalbio');
        return;
      } finally {
        setCreatingConversation(false);
      }
    }

    // Save button selection to database
    await updateMessageButtonSelection(conversation.id, messageIndex, buttonId);

    // Update local state to reflect button selection
    setCurrentConversation(prev => {
      if (!prev) return prev;
      const updatedMessages = [...prev.messages];
      if (updatedMessages[messageIndex]) {
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          selectedButtonId: buttonId
        };
      }
      return { ...prev, messages: updatedMessages };
    });

    // Also update conversations list
    setConversations(prevConvs =>
      prevConvs.map(conv => {
        if (conv.id === conversation.id) {
          const updatedMessages = [...conv.messages];
          if (updatedMessages[messageIndex]) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              selectedButtonId: buttonId
            };
          }
          return { ...conv, messages: updatedMessages };
        }
        return conv;
      })
    );

    // Send button value silently (without displaying in chat)
    const silentUserMessage: SDKMessage = {
      role: 'user',
      content: value,
      timestamp: new Date().toISOString(),
      isSilent: true // Mark as silent so it won't be displayed in UI
    };

    // Save to database but don't show in UI immediately
    await addMessageToConversation(conversation.id, silentUserMessage);

    // Start loading
    setLoading(true);
    setStreamingContent('');
    setError(null);

    try {
      if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY not found');

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      // Build messages array with the silent message
      const messagesWithSilentMessage = [...conversation.messages, silentUserMessage];

      const anthropicMessages: Anthropic.MessageParam[] = [];

      for (const msg of messagesWithSilentMessage) {
        if (typeof msg.content !== 'string') {
          console.warn('[Silent Button] Skipping non-string message');
          continue;
        }

        // Strip display-only <function_calls> XML before sending to API
        const cleaned = (msg.content as string).replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim();
        anthropicMessages.push({
          role: msg.role,
          content: cleaned || msg.content
        });
      }

      const contextualSystemPrompt = systemPrompt + (promptTemplate ? `\n\n${promptTemplate}` : '');

      console.log('[Silent Button] Sending button value to API silently');
      await processAIResponse(anthropic, anthropicMessages, contextualSystemPrompt, conversation, messagesWithSilentMessage);

      // After response, update conversation with both silent message and AI response
      setLoading(false);

    } catch (err: any) {
      console.error('[Silent Button] Error:', err);
      setError(`Klaida: ${err.message || 'Nežinoma klaida'}`);
      setLoading(false);
    }
  };

  /**
   * Process AI response with tool use support (recursive)
   */
  const processAIResponse = async (
    anthropic: Anthropic,
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    conversation: SDKConversation,
    currentMessages: SDKMessage[],
    accumulatedToolXml: string = ''
  ): Promise<void> => {
    try {
      // CRITICAL: Validate messages before API call
      console.log('───────────────────────────────────────────────────');
      console.log('[processAIResponse] ENTRY POINT - Validating messages');
      console.log('[processAIResponse] Total messages:', messages.length);

      const toolUseIds: string[] = [];
      const toolResultIds: string[] = [];

      messages.forEach((msg, idx) => {
        const contentInfo = Array.isArray(msg.content)
          ? `[${msg.content.map((c: any) => {
              if (c.type === 'tool_use') {
                toolUseIds.push(c.id);
                return `tool_use(${c.name}, id:${c.id.substring(0, 12)}...)`;
              }
              if (c.type === 'tool_result') {
                toolResultIds.push(c.tool_use_id);
                return `tool_result(for:${c.tool_use_id.substring(0, 12)}...)`;
              }
              if (c.type === 'text') return `text(${c.text?.length || 0} chars)`;
              return c.type || 'unknown';
            }).join(', ')}]`
          : `"${typeof msg.content === 'string' ? msg.content.substring(0, 60) + '...' : msg.content}"`;

        console.log(`  [${idx}] ${msg.role}: ${contentInfo}`);
      });

      // CRITICAL: Validate tool_use/tool_result ADJACENCY (not just ID matching)
      // Anthropic API requires: if message N has tool_use, message N+1 MUST have tool_result
      let validationErrors: string[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!Array.isArray(msg.content)) continue;

        const hasToolUse = msg.content.some((block: any) => block.type === 'tool_use');
        if (hasToolUse && msg.role === 'assistant') {
          // This message has tool_use blocks, next message MUST be user with tool_results
          const toolUseIdsInMsg = msg.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => block.id);

          if (i + 1 >= messages.length) {
            validationErrors.push(`Message ${i} has tool_use but no following message`);
            continue;
          }

          const nextMsg = messages[i + 1];
          if (nextMsg.role !== 'user') {
            validationErrors.push(`Message ${i} has tool_use but next message ${i + 1} is not user (role=${nextMsg.role})`);
            continue;
          }

          if (!Array.isArray(nextMsg.content)) {
            validationErrors.push(`Message ${i} has tool_use but next message ${i + 1} has non-array content`);
            continue;
          }

          const toolResultIdsInNextMsg = nextMsg.content
            .filter((block: any) => block.type === 'tool_result')
            .map((block: any) => block.tool_use_id);

          const missingInNext = toolUseIdsInMsg.filter(id => !toolResultIdsInNextMsg.includes(id));
          if (missingInNext.length > 0) {
            validationErrors.push(`Message ${i} tool_use IDs [${missingInNext.join(', ')}] not found in next message ${i + 1}`);
          }
        }
      }

      if (validationErrors.length > 0) {
        console.error('❌❌❌ [processAIResponse] STRUCTURAL VALIDATION FAILED:');
        validationErrors.forEach(err => console.error(`  ❌ ${err}`));
        console.error('❌❌❌ This WILL cause a 400 error from Anthropic API!');
        throw new Error(`Message structure validation failed: ${validationErrors.join('; ')}`);
      } else if (toolUseIds.length > 0) {
        console.log('✅ [processAIResponse] All tool_use blocks properly paired with adjacent tool_results');
      }
      console.log('───────────────────────────────────────────────────');

      // FINAL: Log exact message structure being sent to API
      console.log('[API CALL] Sending to Anthropic API:');
      console.log('[API CALL] Total messages:', messages.length);
      console.log('[API CALL] Serialized messages:', JSON.stringify(messages, null, 2));
      console.log('───────────────────────────────────────────────────');

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: messages,
        tools: tools
      });

      let thinkingContent = '';
      let responseContent = '';
      let fullResponseText = '';
      const toolUses: Array<{ id: string; name: string; input: any }> = [];
      let currentToolUse: { id: string; name: string; input: string } | null = null;
      let artifactDetected = false;
      let isInsideArtifact = false;
      let artifactContent = '';
      let chatContent = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'thinking') {
            setIsToolUse(false);
          } else if (event.content_block.type === 'tool_use') {
            setIsToolUse(true);
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
            setToolUseName(event.content_block.name || 'tool');
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'thinking_delta') {
            thinkingContent += event.delta.thinking;
          } else if (event.delta.type === 'text_delta') {
            responseContent += event.delta.text;
            fullResponseText += event.delta.text;

            // Check if we're entering or inside a commercial_offer artifact
            if (fullResponseText.includes('<commercial_offer')) {
              if (!artifactDetected) {
                console.log('[Artifact Streaming] Detected <commercial_offer> tag');
                artifactDetected = true;
                setIsStreamingArtifact(true);
                setShowArtifact(true); // Show artifact panel immediately
              }
              isInsideArtifact = true;
            }

            if (fullResponseText.includes('</commercial_offer>')) {
              isInsideArtifact = false;
            }

            // Route content appropriately
            if (isInsideArtifact) {
              // Extract YAML content (everything between tags)
              const artifactMatch = fullResponseText.match(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>([\s\S]*?)(?:<\/commercial_offer>|$)/);
              if (artifactMatch) {
                artifactContent = artifactMatch[1].trim();
                setArtifactStreamContent(artifactContent);
              }

              // Chat content is everything before the opening tag
              const beforeArtifact = fullResponseText.split('<commercial_offer')[0];
              chatContent = beforeArtifact;
              setStreamingContent(chatContent);
            } else {
              // Normal chat content
              chatContent = fullResponseText;
              setStreamingContent(chatContent);
            }

          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              toolUses.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: JSON.parse(currentToolUse.input)
              });
            } catch (e) {
              console.error('[Tool] Failed to parse tool input:', currentToolUse.input);
            }
            currentToolUse = null;
          }
          setIsToolUse(false);
        }
      }

      // Reset artifact streaming state
      setIsStreamingArtifact(false);
      setArtifactStreamContent('');

      // Get the complete final message to ensure we have all tool_use blocks correctly
      const finalMessage = await stream.finalMessage();
      console.log('[Stream] Final message role:', finalMessage.role);
      console.log('[Stream] Final message content blocks:', finalMessage.content.length);
      console.log('[Stream] Final message stop_reason:', finalMessage.stop_reason);

      // Re-extract tool uses from final message (more authoritative than manual reconstruction)
      const authoritative_toolUses: Array<{ id: string; name: string; input: any }> = [];
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          authoritative_toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input
          });
          console.log(`[Stream] Authoritative tool_use: ${block.name} (ID: ${block.id})`);
        }
      }

      // Compare with manually reconstructed toolUses
      if (toolUses.length !== authoritative_toolUses.length) {
        console.warn(`[Stream] ⚠️  Tool count mismatch! Manual: ${toolUses.length}, Authoritative: ${authoritative_toolUses.length}`);
        console.warn('[Stream] Using authoritative tool uses from finalMessage');
      }

      // Use authoritative tool uses
      const finalToolUses = authoritative_toolUses;

      // Check for artifacts
      if (responseContent.includes('<commercial_offer') || conversation.artifact) {
        await handleArtifactGeneration(responseContent, conversation);
      }

      setStreamingContent('');

      // Filter out empty thinking blocks early (declare before any usage to avoid TDZ error)
      const filteredContent = finalMessage.content.filter((block: any) => {
        if (block.type === 'thinking') {
          const hasContent = block.thinking && block.thinking.trim().length > 0;
          if (!hasContent) {
            console.log('[Content Filter] Filtering out empty thinking block');
            return false;
          }
        }
        return true;
      });
      console.log(`[Content Filter] Filtered blocks: ${finalMessage.content.length} -> ${filteredContent.length}`);

      // Build tool call XML from this round for persistence in chat history
      const buildToolXml = (tools: Array<{ id: string; name: string; input: any }>): string => {
        if (tools.length === 0) return '';
        const invokeBlocks = tools.map(tu => {
          const paramStr = typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input);
          const safeParam = paramStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return '  <invoke name="' + tu.name + '">\n    <parameter name="input">' + safeParam + '</parameter' + '>\n  </invoke' + '>';
        });
        return '\n\n<function_calls' + '>\n' + invokeBlocks.join('\n') + '\n</function_calls' + '>\n';
      };
      const roundToolXml = buildToolXml(finalToolUses);
      const newAccumulatedToolXml = accumulatedToolXml + (responseContent ? responseContent : '') + roundToolXml;

      // If there are tool uses, execute them and continue (don't save intermediate message)
      if (finalToolUses.length > 0) {
        console.log(`[Tool Loop] Executing ${finalToolUses.length} tools...`);

        // Execute all tools with error handling
        const toolResults = await Promise.all(
          finalToolUses.map(async (toolUse) => {
            try {
              const result = await executeTool(toolUse.name, toolUse.input);
              console.log(`[Tool Loop] Tool ${toolUse.name} completed. Result length:`, result.length);
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: result
              };
            } catch (error: any) {
              console.error(`[Tool Loop] Tool ${toolUse.name} threw exception:`, error);
              // Return error as tool_result so the conversation can continue
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message || 'Unknown error executing tool',
                  tool_name: toolUse.name
                })
              };
            }
          })
        );

        // Check if any tool result contains display_buttons marker (should pause conversation)
        const buttonResult = toolResults.find(result => {
          try {
            const parsed = JSON.parse(result.content);
            return parsed.display_buttons === true;
          } catch {
            return false;
          }
        });

        if (buttonResult) {
          console.log('[Tool Loop] Detected display_buttons - pausing conversation');
          const parsed = JSON.parse(buttonResult.content);

          // Extract text content from filteredContent array
          const textContent = filteredContent
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('\n\n');

          // Create assistant message with buttons (ensure content is string)
          // Prepend accumulated tool call XML so tool usage persists in chat history
          const fullButtonContent = newAccumulatedToolXml
            ? (newAccumulatedToolXml + (textContent || 'Displaying options...'))
            : (textContent || 'Displaying options...');
          const assistantMessage: SDKMessage = {
            role: 'assistant',
            content: fullButtonContent,
            timestamp: new Date().toISOString(),
            buttons: parsed.buttons, // Store buttons with the message
            buttonsMessage: parsed.message
          };

          // Save the message to the conversation
          await addMessageToConversation(conversation.id, assistantMessage);
          const finalMessages = [...currentMessages, assistantMessage];

          const updatedConversation = {
            ...conversation,
            messages: finalMessages,
            message_count: finalMessages.length,
            last_message_at: assistantMessage.timestamp,
            updated_at: new Date().toISOString()
          };

          setCurrentConversation(updatedConversation);

          // Optimistically update conversations list
          setConversations(prev => prev.map(conv =>
            conv.id === updatedConversation.id
              ? { ...conv, last_message_at: updatedConversation.last_message_at, message_count: updatedConversation.messages.length }
              : conv
          ));

          setLoading(false);
          setDisplayButtons(null); // Don't use separate state
          return; // PAUSE - don't continue with recursive loop
        }

        // Build messages for next round (with tool_use and tool_result blocks)
        // CRITICAL: Use the ACTUAL content from finalMessage, not reconstructed tool_use blocks!
        // This ensures the tool_use blocks match exactly what Claude sent us.
        // BUT: Filter out empty thinking blocks (API rejects them in recursive calls)

        console.log(`[Tool Loop] Using ${messages.length} messages from previous API call as conversation history`);
        console.log(`[Tool Loop] Using filteredContent with ${filteredContent.length} blocks (already filtered above)`);

        const anthropicMessagesWithToolResults: Anthropic.MessageParam[] = [
          ...messages, // Keep ALL messages from previous API call - they're part of conversation history
          {
            role: 'assistant',
            content: filteredContent  // Use filtered content (no empty thinking blocks)
          },
          {
            role: 'user',
            content: toolResults
          }
        ];

        // CRITICAL VALIDATION: Verify the messages array structure
        console.log('═══════════════════════════════════════════════════');
        console.log('[CRITICAL] Tool Loop - Constructed messages array:');
        console.log('[CRITICAL] Total messages:', anthropicMessagesWithToolResults.length);

        anthropicMessagesWithToolResults.forEach((msg, idx) => {
          const contentInfo = Array.isArray(msg.content)
            ? `[${msg.content.map((c: any) => {
                if (c.type === 'tool_use') return `tool_use(id:${c.id.substring(0, 12)}...)`;
                if (c.type === 'tool_result') return `tool_result(for:${c.tool_use_id.substring(0, 12)}...)`;
                if (c.type === 'text') return 'text';
                return c.type || 'unknown';
              }).join(', ')}]`
            : `"${typeof msg.content === 'string' ? msg.content.substring(0, 50) : msg.content}"`;

          console.log(`[CRITICAL] [${idx}] ${msg.role}: ${contentInfo}`);
        });

        // Validate that every tool_use has a matching tool_result
        const allToolUseIds: string[] = [];
        const allToolResultIds: string[] = [];

        anthropicMessagesWithToolResults.forEach((msg) => {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((block: any) => {
              if (block.type === 'tool_use') allToolUseIds.push(block.id);
              if (block.type === 'tool_result') allToolResultIds.push(block.tool_use_id);
            });
          }
        });

        console.log('[CRITICAL] Tool use IDs:', allToolUseIds);
        console.log('[CRITICAL] Tool result IDs:', allToolResultIds);

        const missingResults = allToolUseIds.filter(id => !allToolResultIds.includes(id));
        if (missingResults.length > 0) {
          console.error('[CRITICAL] ❌ MISSING TOOL RESULTS FOR:', missingResults);
          console.error('');
          console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
          console.error('FATAL: About to send malformed messages to API!');
          console.error('Missing tool_result blocks for tool_use IDs:', missingResults);
          console.error('This WILL cause a 400 error. ABORTING recursive call.');
          console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
          console.error('');
          throw new Error(`Internal error: Constructed message array has tool_use without tool_result. Tool use IDs missing results: ${missingResults.join(', ')}`);
        } else {
          console.log('[CRITICAL] ✅ All tool_use blocks have matching tool_result blocks');
        }
        console.log('═══════════════════════════════════════════════════');

        // Recursively process next response with tool results (don't save intermediate messages)
        await processAIResponse(
          anthropic,
          anthropicMessagesWithToolResults,
          systemPrompt,
          conversation,
          currentMessages, // Keep same currentMessages, not adding anything yet
          newAccumulatedToolXml
        );
      } else {
        // No more tool uses, save final assistant message
        // Prepend accumulated tool call XML so tool usage persists in chat history
        const fullContent = accumulatedToolXml ? (accumulatedToolXml + responseContent) : responseContent;
        const assistantMessage: SDKMessage = {
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
          thinking: thinkingContent
        };

        await addMessageToConversation(conversation.id, assistantMessage);
        const finalMessages = [...currentMessages, assistantMessage];

        const updatedConversation = {
          ...conversation,
          messages: finalMessages,
          message_count: finalMessages.length,
          last_message_at: assistantMessage.timestamp,
          updated_at: new Date().toISOString()
        };

        setCurrentConversation(updatedConversation);

        // Optimistically update conversations list with new last_message_at
        setConversations(prev => prev.map(conv =>
          conv.id === updatedConversation.id
            ? { ...conv, last_message_at: updatedConversation.last_message_at, message_count: updatedConversation.messages.length }
            : conv
        ));

        // CRITICAL: Check for artifacts in final response
        if (responseContent.includes('<commercial_offer')) {
          console.log('[Artifact] Detected commercial_offer in final response');
          await handleArtifactGeneration(responseContent, updatedConversation);
        }
      }
    } catch (err: any) {
      console.error('[processAIResponse] Error:', err);
      throw err;
    }
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
        // Optimistically add to conversations list to avoid flicker
        setConversations(prev => [newConversation, ...prev]);
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
    setStreamingContent('');
    setError(null);

    try {
      if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY not found');

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      // ╔═══════════════════════════════════════════════════════════════╗
      // ║  PHASE 1: ANALYZE RAW MESSAGES FROM DATABASE                  ║
      // ╚═══════════════════════════════════════════════════════════════╝
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  HANDLESEND: Analyzing messages BEFORE filtering             ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('[PHASE 1] Total messages from database:', updatedMessages.length);

      updatedMessages.forEach((msg, idx) => {
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        let preview = '';

        if (contentType === 'string') {
          preview = msg.content.substring(0, 80);
        } else if (isArray) {
          preview = `ARRAY with ${msg.content.length} blocks: ${JSON.stringify(msg.content).substring(0, 80)}`;
        } else {
          preview = `OBJECT: ${JSON.stringify(msg.content).substring(0, 80)}`;
        }

        console.log(`[PHASE 1][${idx}] ${msg.role} | type: ${contentType} | isArray: ${isArray} | preview: "${preview}"`);

        // If non-string content, log full structure
        if (contentType !== 'string') {
          console.warn(`[PHASE 1][${idx}] ⚠️  NON-STRING CONTENT DETECTED:`, JSON.stringify(msg.content, null, 2));
        }
      });
      console.log('');

      // Clean message history: remove tool artifacts and ensure alternating roles
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 2: FILTERING MESSAGES                                  ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');

      const anthropicMessages: Anthropic.MessageParam[] = [];
      let lastRole: 'user' | 'assistant' | null = null;

      let skippedCount = 0;
      let malformedCount = 0;
      let nonStringCount = 0;
      let duplicateRoleCount = 0;

      for (const msg of updatedMessages) {
        const idx = updatedMessages.indexOf(msg);

        // FIRST: Check content type (most important check)
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        const isString = contentType === 'string';

        console.log(`[PHASE 2][${idx}] Checking message: role=${msg.role}, contentType=${contentType}, isArray=${isArray}`);

        // Skip if content is not a string (tool_use blocks, malformed data)
        if (!isString || isArray) {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Content is not a string (type=${contentType}, isArray=${isArray})`);
          const preview = isArray ? JSON.stringify(msg.content).substring(0, 150) : String(msg.content).substring(0, 150);
          console.log(`[PHASE 2][${idx}]    Content preview:`, preview);
          skippedCount++;
          nonStringCount++;
          continue;
        }

        // Now we know content is definitely a string, create safe string representation
        const contentStr = msg.content as string;

        // Skip synthetic tool messages and malformed messages
        if (contentStr.startsWith('[Tool results:') ||
            contentStr.includes('toolu_') ||
            contentStr.trim().length === 0 ||
            contentStr === '{}' ||
            contentStr === '[]') {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Malformed/synthetic message:`, contentStr.substring(0, 100));
          skippedCount++;
          malformedCount++;
          continue;
        }

        // Skip if same role as previous (prevents consecutive assistant/user messages)
        if (msg.role === lastRole) {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Duplicate role (${msg.role} after ${lastRole})`);
          skippedCount++;
          duplicateRoleCount++;
          continue;
        }

        // DOUBLE CHECK before adding (paranoid validation)
        if (typeof msg.content !== 'string') {
          console.error(`[PHASE 2][${idx}] ⚠️  CRITICAL: Message passed checks but content is not string! Type:`, typeof msg.content);
          console.error(`[PHASE 2][${idx}]    This should NEVER happen. Skipping for safety.`);
          skippedCount++;
          nonStringCount++;
          continue;
        }

        // Safe to add - strip display-only <function_calls> XML before sending to API
        const cleanedContent = contentStr.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim();
        console.log(`[PHASE 2][${idx}] ✅ KEEPING: Valid string message, length=${cleanedContent.length}`);
        anthropicMessages.push({
          role: msg.role,
          content: cleanedContent || contentStr
        });
        lastRole = msg.role;
      }

      console.log('');
      console.log(`[PHASE 2] Filtering complete:`);
      console.log(`[PHASE 2]   - Total processed: ${updatedMessages.length}`);
      console.log(`[PHASE 2]   - Kept: ${anthropicMessages.length}`);
      console.log(`[PHASE 2]   - Skipped: ${skippedCount} (non-string: ${nonStringCount}, malformed: ${malformedCount}, duplicate role: ${duplicateRoleCount})`);
      console.log('');

      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 3: FILTERED MESSAGES (GOING TO API)                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('[PHASE 3] Clean message count:', anthropicMessages.length);
      console.log('[PHASE 3] Message roles:', anthropicMessages.map(m => m.role).join(' -> '));

      anthropicMessages.forEach((msg, idx) => {
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        let preview = '';

        if (contentType === 'string') {
          preview = msg.content.substring(0, 80);
        } else if (isArray) {
          preview = `ARRAY[${msg.content.length}]: ${(msg.content as any[]).map((c: any) => c.type || 'unknown').join(', ')}`;
        } else {
          preview = JSON.stringify(msg.content).substring(0, 80);
        }

        console.log(`[PHASE 3][${idx}] ${msg.role} | type: ${contentType} | isArray: ${isArray} | preview: "${preview}"`);

        // If array content, show details
        if (isArray) {
          console.warn(`[PHASE 3][${idx}] ⚠️  ARRAY CONTENT IN FILTERED MESSAGES:`, JSON.stringify(msg.content, null, 2));
        }
      });

      // CRITICAL: Final validation before API call
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 4: FINAL VALIDATION BEFORE API CALL                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');

      // Check for tool_use blocks without corresponding tool_result blocks
      for (let i = 0; i < anthropicMessages.length; i++) {
        const msg = anthropicMessages[i];
        if (Array.isArray(msg.content)) {
          const hasToolUse = (msg.content as any[]).some((block: any) => block.type === 'tool_use');
          if (hasToolUse) {
            console.error(`[PHASE 4] ❌ ERROR: Message [${i}] has tool_use blocks but content is array!`);
            console.error(`[PHASE 4] ❌ This message should have been filtered out!`);
            console.error(`[PHASE 4] ❌ Message:`, JSON.stringify(msg, null, 2));

            // Check if next message has tool_result
            if (i + 1 < anthropicMessages.length) {
              const nextMsg = anthropicMessages[i + 1];
              const hasToolResult = Array.isArray(nextMsg.content) &&
                (nextMsg.content as any[]).some((block: any) => block.type === 'tool_result');
              if (!hasToolResult) {
                console.error(`[PHASE 4] ❌ CRITICAL: Next message [${i + 1}] does NOT have tool_result!`);
                console.error(`[PHASE 4] ❌ This WILL cause 400 error from Anthropic!`);
              }
            } else {
              console.error(`[PHASE 4] ❌ CRITICAL: No next message after tool_use!`);
              console.error(`[PHASE 4] ❌ This WILL cause 400 error from Anthropic!`);
            }
          }
        }
      }

      console.log('[PHASE 4] ✅ Validation complete. Proceeding to API call...');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');

      // Build system prompt with artifact context if exists
      let contextualSystemPrompt = systemPrompt;
      if (conversation.artifact) {
        contextualSystemPrompt += `\n\n---\n\n**CURRENT ARTIFACT CONTEXT:**\nAn active commercial offer artifact exists in this conversation with ID: \`${conversation.artifact.id}\`\n\n**CRITICAL:** When updating or modifying the commercial offer, you MUST reuse this artifact_id:\n\`\`\`xml\n<commercial_offer artifact_id="${conversation.artifact.id}">\n[updated content]\n</commercial_offer>\n\`\`\`\n\nDO NOT create a new artifact. Always use artifact_id="${conversation.artifact.id}" for updates.`;
      }

      // Start recursive tool use loop
      await processAIResponse(anthropic, anthropicMessages, contextualSystemPrompt, conversation, updatedMessages);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Įvyko klaida');
      setStreamingContent('');
    } finally {
      setLoading(false);
      setIsToolUse(false);
    }
  };

  /**
   * Render user message with {{variable}} references highlighted in blue
   */
  const renderUserMessageWithVariables = (text: string): React.ReactNode => {
    const parts = text.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\})/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const varName = part.slice(2, -2);
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[13px] font-mono font-medium"
            style={{ background: '#dbeafe', color: '#1d4ed8' }}
          >
            {`{{${varName}}}`}
          </span>
        );
      }
      return part;
    });
  };

  /**
   * Render YAML content with interactive variables
   */
  const renderInteractiveYAML = (yamlContent: string) => {
    const lines = yamlContent.split('\n');
    // Pattern: variable_key: "value" or variable_key: | (supports mixed case like economy_HNV)
    const variablePattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/;

    return lines.map((line, index) => {
      const match = line.match(variablePattern);

      if (match && !line.startsWith('#') && !line.startsWith(' ')) {
        const [, varKey, value] = match;
        const isMultiline = value.trim() === '|';

        return (
          <div key={index} className="group hover:bg-gray-50 px-2 py-1 -mx-2 rounded transition-colors">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Insert variable reference into chat input
                  setInputValue(`Pakeisk {{${varKey}}} į: `);
                  textareaRef.current?.focus();
                }}
                className="text-left flex-1 font-mono text-xs"
                title="Spustelėkite, kad įterptumėte nuorodą į pokalbį"
              >
                <span style={{ color: '#0066cc', fontWeight: 600 }}>{varKey}</span>
                <span style={{ color: '#666' }}>: </span>
                {!isMultiline && <span style={{ color: '#059669' }}>{value}</span>}
              </button>
              <Copy
                className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ color: '#8a857f' }}
                onClick={() => {
                  navigator.clipboard.writeText(`{{${varKey}}}`);
                }}
                title="Kopijuoti kintamojo nuorodą"
              />
            </div>
          </div>
        );
      }

      // Regular line (comment, multiline content, etc.)
      return (
        <div key={index} className="font-mono text-xs" style={{ color: line.startsWith('#') ? '#888' : '#3d3935' }}>
          {line || '\u00A0'}
        </div>
      );
    });
  };

  const handleArtifactGeneration = async (content: string, conversation: SDKConversation) => {
    try {
      // Match with optional artifact_id attribute
      const match = content.match(/<commercial_offer(?:\s+artifact_id="([^"]*)")?\s*>([\s\S]*?)<\/commercial_offer>/);
      if (!match) return;

      const [_, artifactIdFromAI, offerContent] = match;
      const trimmedContent = offerContent.trim();
      const currentArtifact = conversation.artifact;
      let newArtifact: CommercialOfferArtifact;

      console.log('[Artifact] Detected artifact_id from AI:', artifactIdFromAI);
      console.log('[Artifact] Current artifact exists:', !!currentArtifact);

      // Determine if this is a new artifact or an update
      const isNewArtifact = artifactIdFromAI === 'new' || !currentArtifact;

      if (isNewArtifact) {
        // Create new artifact
        const generatedId = `offer_${crypto.randomUUID().split('-')[0]}`;
        console.log('[Artifact] Creating NEW artifact with ID:', generatedId);

        newArtifact = {
          id: generatedId,
          type: 'commercial_offer',
          title: 'Komercinis pasiūlymas',
          content: trimmedContent,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          diff_history: []
        };
      } else {
        // Update existing artifact
        console.log('[Artifact] UPDATING existing artifact:', currentArtifact.id);

        // Validate artifact_id matches (if provided and not "new")
        if (artifactIdFromAI && artifactIdFromAI !== currentArtifact.id) {
          console.warn(`[Artifact] Warning: AI provided artifact_id "${artifactIdFromAI}" doesn't match current "${currentArtifact.id}". Using current.`);
        }

        const diff = calculateDiff(currentArtifact.content, trimmedContent);
        newArtifact = {
          ...currentArtifact,
          content: trimmedContent,
          version: currentArtifact.version + 1,
          updated_at: new Date().toISOString(),
          diff_history: [...currentArtifact.diff_history, {
            version: currentArtifact.version + 1,
            timestamp: new Date().toISOString(),
            changes: diff
          }]
        };
      }

      console.log('[Artifact] Saving artifact to database...');
      await updateConversationArtifact(conversation.id, newArtifact);
      setCurrentConversation({ ...conversation, artifact: newArtifact });
      setShowArtifact(true);
      console.log('[Artifact] Successfully saved. Version:', newArtifact.version);
    } catch (err) {
      console.error('Error handling artifact:', err);
    }
  };

  const parseYAMLContent = (yamlContent: string): Record<string, any> => {
    const lines = yamlContent.split('\n');
    const parsed: Record<string, any> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();
          // Remove quotes if present
          parsed[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return parsed;
  };

  const handleSendToWebhook = async () => {
    if (!currentConversation?.artifact) {
      setError('No artifact to send');
      return;
    }

    if (!selectedEconomist) {
      setError('Please select an economist first');
      return;
    }

    if (!selectedManager) {
      setError('Please select a manager first');
      return;
    }

    try {
      setSendingWebhook(true);
      console.log('[Webhook] Sending to n8n...');

      // Generate project name: U+[manager code]+[tech code]+[date YY-MM-DD]
      const now = new Date();
      const year = String(now.getFullYear()).substring(2); // Last 2 digits of year
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const managerCode = selectedManager.kodas || 'XX';
      const techCode = user.kodas || 'YY';
      const projectName = `U${managerCode}${techCode}${dateStr}`;

      console.log('[Webhook] Generated project name:', projectName);

      // Rename conversation to project name
      await renameSDKConversation(currentConversation.id, projectName);

      // Update local state
      setCurrentConversation(prev => prev ? { ...prev, title: projectName } : prev);
      setConversations(prevConvs =>
        prevConvs.map(conv =>
          conv.id === currentConversation.id ? { ...conv, title: projectName } : conv
        )
      );

      // Parse YAML content into separate fields
      const parsedYAML = parseYAMLContent(currentConversation.artifact.content);

      // Construct payload with parsed fields
      const payload = {
        // Parsed YAML fields as separate properties
        ...parsedYAML,

        // Project and metadata
        project_name: projectName,
        project_id: projectId,
        conversation_id: currentConversation.id,
        artifact_id: currentConversation.artifact.id,
        timestamp: new Date().toISOString(),

        // Team members
        technologist: user.full_name || user.display_name || user.email,
        technologist_code: techCode,
        technologist_phone: user.phone || '',
        technologist_email: user.email,
        ekonomistas_code: selectedEconomist.kodas || '',
        ekonomistas_name: selectedEconomist.full_name || selectedEconomist.display_name || selectedEconomist.email,
        manager_code: managerCode,
        manager_name: selectedManager.full_name || selectedManager.display_name || selectedManager.email,

        // Original YAML for reference (in case n8n needs it)
        original_yaml: currentConversation.artifact.content
      };

      console.log('[Webhook] Payload:', payload);

      // Send to n8n webhook
      const commercialWebhookUrl = await getWebhookUrl('n8n_commercial_offer');
      if (!commercialWebhookUrl) {
        throw new Error('Webhook "n8n_commercial_offer" not found or inactive. Configure it in Webhooks settings.');
      }

      const response = await fetch(commercialWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Webhook] Success:', result);

      // Extract URL from response
      const generatedUrl = result.standartinis_generatedUrl;

      if (generatedUrl) {
        // Create a fake assistant message with the URL (not sent to API)
        const urlMessage: SDKMessage = {
          role: 'assistant',
          content: `Komercinis pasiūlymas sėkmingai sugeneruotas! Jūsų dokumentas pasiekiamas čia:\n\n${generatedUrl}`,
          timestamp: new Date().toISOString(),
          isSilent: false
        };

        // Add to database
        await addMessageToConversation(currentConversation.id, urlMessage);

        // Update local state immediately
        setCurrentConversation(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...prev.messages, urlMessage]
          };
        });

        // Update conversations list
        setConversations(prevConvs =>
          prevConvs.map(conv => {
            if (conv.id === currentConversation.id) {
              return {
                ...conv,
                messages: [...conv.messages, urlMessage],
                last_message_at: urlMessage.timestamp
              };
            }
            return conv;
          })
        );

        console.log('[Webhook] URL message added to chat:', generatedUrl);
      }

      // Show success message
      setError(null);
      setShowEconomistDropdown(false);
      setShowManagerDropdown(false);

    } catch (err: any) {
      console.error('[Webhook] Error:', err);
      setError(`Failed to send webhook: ${err.message}`);
    } finally {
      setSendingWebhook(false);
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
          <div className="animate-spin rounded-full h-12 w-12 border-3 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
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
          borderColor: '#e8e5e0',
          background: '#fafaf9',
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowPromptModal(true)}
                className="p-1 rounded transition-colors"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Peržiūrėti prompt"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs" style={{ color: '#8a857f' }}>
            Sistemos instrukcijos komerciniam pasiūlymui
          </p>
        </div>

        {/* Conversations Section with Tabs */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="px-4 border-b relative" style={{ borderColor: '#f0ede8' }}>
            <div className="flex items-center">
              <button
                onClick={() => setSidebarView('conversations')}
                className="flex-1 px-3 py-3 text-sm font-medium transition-colors relative"
                style={{
                  color: sidebarView === 'conversations' ? '#3d3935' : '#8a857f'
                }}
              >
                Pokalbiai
              </button>
              <button
                onClick={() => setSidebarView('shared')}
                className="flex-1 px-3 py-3 text-sm font-medium transition-colors relative"
                style={{
                  color: sidebarView === 'shared' ? '#3d3935' : '#8a857f'
                }}
              >
                Bendri
                {unreadSharedCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center" style={{ background: '#f97316', color: 'white' }}>
                    {unreadSharedCount}
                  </span>
                )}
              </button>
            </div>
            {/* Sliding underline indicator */}
            <div
              className="absolute bottom-0 h-0.5 transition-all duration-300 ease-in-out"
              style={{
                background: '#5a5550',
                width: '50%',
                left: sidebarView === 'conversations' ? '0%' : '50%'
              }}
            />
          </div>

          {/* New Conversation Button - Only show in conversations view */}
          {sidebarView === 'conversations' && (
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
          )}

          {/* Conversations List */}
          {sidebarView === 'conversations' && (
            <div className="flex-1 overflow-y-auto px-2">
              {loadingConversations ? (
                <div className="p-4 text-center">
                  <RoboticArmLoader isAnimated={true} size={40} />
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
                      onClick={() => handleSelectOwnedConversation(conv.id)}
                      className="group flex items-start justify-between p-2 rounded-lg cursor-pointer transition-all duration-150"
                      style={{
                        background: currentConversation?.id === conv.id && !isReadOnly ? '#f0ede8' : 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        if (currentConversation?.id !== conv.id || isReadOnly) e.currentTarget.style.background = '#f9f8f6';
                      }}
                      onMouseLeave={(e) => {
                        if (currentConversation?.id !== conv.id || isReadOnly) e.currentTarget.style.background = 'transparent';
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
          )}

          {/* Shared Conversations List */}
          {sidebarView === 'shared' && (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {sharedConversations.length === 0 ? (
                <div className="p-4 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2" style={{ color: '#d1d5db' }} />
                  <p className="text-sm" style={{ color: '#8a857f' }}>Nėra bendrų pokalbių</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {sharedConversations.map((sharedConv) => (
                    <div
                      key={sharedConv.id}
                      onClick={() => handleSelectSharedConversation(sharedConv)}
                      className="group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all duration-150"
                      style={{
                        background: currentConversation?.id === sharedConv.conversation_id && isReadOnly ? '#f0ede8' : 'transparent',
                        border: !sharedConv.is_read ? '1px solid #f97316' : '1px solid transparent'
                      }}
                      onMouseEnter={(e) => {
                        if (currentConversation?.id !== sharedConv.conversation_id || !isReadOnly) e.currentTarget.style.background = '#f9f8f6';
                      }}
                      onMouseLeave={(e) => {
                        if (currentConversation?.id !== sharedConv.conversation_id || !isReadOnly) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {!sharedConv.is_read && (
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#f97316' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: '#3d3935' }}>{sharedConv.conversation?.title}</p>
                        <p className="text-xs truncate" style={{ color: '#8a857f' }}>
                          Bendrino: {sharedConv.shared_by_name || sharedConv.shared_by_email}
                        </p>
                        <p className="text-xs" style={{ color: '#9ca3af' }}>
                          {new Date(sharedConv.shared_at).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Floating Action Buttons - Hidden when artifact panel is open to avoid overlap */}
        {!showArtifact && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
            {/* Artifact Toggle Button - Left of Share when both visible */}
            {(currentConversation?.artifact || isStreamingArtifact) && (
              <button
                onClick={() => setShowArtifact(true)}
                className="px-4 py-2 rounded-lg shadow-lg transition-all hover:shadow-xl"
                style={{
                  background: isStreamingArtifact ? '#5a5550' : 'white',
                  color: isStreamingArtifact ? 'white' : '#5a5550',
                  border: '1px solid #e8e5e0'
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Generuoti
                    {isStreamingArtifact && <span className="ml-1">●</span>}
                  </span>
                </div>
              </button>
            )}

            {/* Share Button - Show when conversation exists and user is owner */}
            {currentConversation && !isReadOnly && (
              <div className="relative">
                <button
                  onClick={handleToggleShareDropdown}
                  className="px-4 py-2 rounded-lg shadow-lg transition-all hover:shadow-xl"
                  style={{
                    background: 'white',
                    color: '#5a5550',
                    border: '1px solid #e8e5e0'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Dalintis</span>
                  </div>
                </button>

                {/* Share Dropdown */}
                {showShareDropdown && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowShareDropdown(false)}
                    />

                    {/* Dropdown Content */}
                    <div
                      className="absolute top-full right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                      style={{ background: 'white', border: '1px solid #e8e5e0' }}
                    >
                      {/* Header */}
                      <div className="px-4 py-3 border-b" style={{ borderColor: '#f0ede8' }}>
                        <h3 className="text-sm font-semibold" style={{ color: '#3d3935' }}>
                          Dalintis pokalbiu
                        </h3>
                        <p className="text-xs mt-1" style={{ color: '#8a857f' }}>
                          Pasirinkite vartotojus
                        </p>
                      </div>

                      {/* User List */}
                      <div className="max-h-64 overflow-y-auto p-2">
                        {shareableUsers.length === 0 ? (
                          <p className="text-xs text-center py-6" style={{ color: '#9ca3af' }}>
                            Nėra vartotojų
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {shareableUsers.map((shareUser) => (
                              <label
                                key={shareUser.id}
                                className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedShareUsers.includes(shareUser.id)}
                                  onChange={() => toggleUserSelection(shareUser.id)}
                                  className="w-4 h-4 rounded"
                                  style={{ accentColor: '#5a5550' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate" style={{ color: '#3d3935' }}>
                                    {shareUser.full_name || shareUser.display_name || shareUser.email}
                                  </div>
                                </div>
                                {selectedShareUsers.includes(shareUser.id) && (
                                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#5a5550' }} />
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="px-3 py-3 border-t flex items-center gap-2" style={{ borderColor: '#f0ede8' }}>
                        <button
                          onClick={() => setShowShareDropdown(false)}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: '#f0ede8', color: '#5a5550' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#e8e5e0'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#f0ede8'}
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={handleShareConversation}
                          disabled={selectedShareUsers.length === 0 || sharingConversation}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: '#5a5550', color: 'white' }}
                          onMouseEnter={(e) => {
                            if (!e.currentTarget.disabled) e.currentTarget.style.background = '#3d3935';
                          }}
                          onMouseLeave={(e) => {
                            if (!e.currentTarget.disabled) e.currentTarget.style.background = '#5a5550';
                          }}
                        >
                          {sharingConversation ? (
                            <span className="flex items-center justify-center gap-1">
                              <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
                              Dalinasi...
                            </span>
                          ) : (
                            `Dalintis (${selectedShareUsers.length})`
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-8"
          style={{ background: '#ffffff' }}
        >
          {!currentConversation ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: '#9ca3af' }}>
                Parašykite žinutę, kad pradėtumėte pokalbį
              </p>
            </div>
          ) : currentConversation.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: '#9ca3af' }}>
                Parašykite žinutę, kad pradėtumėte pokalbį
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              {currentConversation.messages.map((message, index) => {
                // Skip silent messages (button clicks)
                if (message.isSilent) {
                  return null;
                }

                // Ensure content is always a string before rendering
                const contentString = typeof message.content === 'string'
                  ? message.content
                  : (Array.isArray(message.content)
                    ? message.content.map((block: any) =>
                        block.type === 'text' ? block.text : ''
                      ).join('\n\n')
                    : '[Content format error]');

                return (
                  <div key={`${message.timestamp}-${index}`}>
                    {message.role === 'user' ? (
                      // User message - clean bubble on right
                      <div className="flex justify-end mb-6">
                        <div
                          className="max-w-[75%] px-4 py-2.5 rounded-2xl"
                          style={{
                            background: '#f3f4f6',
                            color: '#111827',
                            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
                          }}
                        >
                          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                            {renderUserMessageWithVariables(contentString)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Assistant message - plain text with reaction buttons
                      <div className="mb-8 group">
                        <MessageContent content={
                          contentString.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')
                        } />

                      {/* Interactive Buttons (inline with message) */}
                      {message.buttons && message.buttons.length > 0 && (
                        <div className="mt-4">
                          {message.buttonsMessage && (
                            <p className="text-sm mb-2" style={{ color: '#6b7280' }}>
                              {message.buttonsMessage}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {message.buttons.map(button => {
                              const isSelected = message.selectedButtonId === button.id;
                              const hasSelection = message.selectedButtonId !== undefined && message.selectedButtonId !== null;
                              return (
                                <button
                                  key={button.id}
                                  onClick={() => handleButtonClick(button.id, button.value, index)}
                                  className="px-3 py-1.5 rounded-lg transition-all hover:shadow-md text-sm"
                                  disabled={hasSelection}
                                  style={{
                                    background: isSelected ? 'transparent' : colors.border.dark,
                                    color: isSelected ? colors.border.dark : 'white',
                                    border: isSelected ? `2px solid ${colors.border.dark}` : 'none',
                                    fontWeight: '500',
                                    opacity: hasSelection && !isSelected ? 0.4 : 1,
                                    cursor: hasSelection ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  {button.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Reaction buttons */}
                      <div className="flex items-center gap-1 mt-3">
                        <button
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#6b7280' }}
                          title="Copy"
                          onClick={() => navigator.clipboard.writeText(contentString)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#6b7280' }}
                          title="Regenerate"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        {message.thinking && (
                          <details className="ml-2">
                            <summary className="text-xs cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: '#6b7280' }}>
                              Mąstymas
                            </summary>
                            <div className="mt-2 text-xs whitespace-pre-wrap px-4 py-3 rounded-lg" style={{ color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                              {message.thinking}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}

              {/* Streaming content */}
              {loading && streamingContent && (
                <div className="mb-8">
                  <MessageContent content={streamingContent.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')} />
                </div>
              )}

              {/* Tool usage indicator */}
              {loading && isToolUse && (
                <div className="mb-4 flex items-center gap-2 ml-1">
                  <span className="text-sm" style={{ color: '#8a857f' }}>
                    ✦
                  </span>
                  <span className="text-sm font-medium" style={{ color: '#8a857f' }}>
                    Vykdoma: {toolUseName}...
                  </span>
                </div>
              )}

              {/* Animated loader - always at bottom of all content when loading */}
              {loading && (
                <div className="flex justify-start -ml-2">
                  <RoboticArmLoader isAnimated={true} size={80} />
                </div>
              )}

              {/* Static loader when idle with conversation history */}
              {!loading && currentConversation && currentConversation.messages.length > 0 && (
                <div className="flex justify-start -ml-2">
                  <RoboticArmLoader isAnimated={false} size={70} />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 left-1/2 transform -translate-x-1/2 p-3 rounded-full shadow-lg transition-all hover:shadow-xl z-40"
            style={{
              background: '#5a5550',
              color: 'white'
            }}
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

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

        {/* Input Box or Read-Only Banner */}
        {isReadOnly && conversationDetails ? (
          /* Read-Only Mode Banner */
          <div className="px-6 py-4 border-t" style={{ background: '#fef3c7', borderColor: '#fde68a' }}>
            <div className="max-w-4xl mx-auto">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: '#f59e0b' }} />
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: '#92400e' }}>
                    Bendrinamas pokalbis. Tik skaityti.
                  </p>
                  <p className="text-xs" style={{ color: '#92400e' }}>
                    <strong>Bendrino:</strong> {conversationDetails.shared_by.display_name || conversationDetails.shared_by.email}
                  </p>
                  {conversationDetails.shared_with.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: '#92400e' }}>
                      <strong>Pasidalinta su:</strong> {conversationDetails.shared_with.map(u => u.display_name || u.email).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Regular Input Box */
          <div className="px-6 py-4" style={{ background: '#ffffff' }}>
            <div className="max-w-4xl mx-auto">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Parašykite žinutę..."
                  rows={1}
                  className="w-full px-4 py-3.5 pr-24 text-[15px] rounded-xl resize-none transition-all shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  style={{ background: colors.bg.white, color: colors.text.primary, border: `1px solid ${colors.border.default}`, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
                  disabled={loading || !systemPrompt}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    className="p-2 rounded-lg transition-colors"
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
                    className="p-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        )}
      </div>

      {/* Artifact Panel - Floating Design */}
      {((currentConversation?.artifact && showArtifact) || isStreamingArtifact) && (
        <div className="p-4 flex-shrink-0">
          <div className="w-[460px] bg-white rounded-2xl shadow-xl flex flex-col" style={{ height: 'calc(100vh - 32px)', border: '1px solid #e8e5e0' }}>
            {/* Header */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold" style={{ color: '#3d3935' }}>
                  Komercinis pasiūlymas
                  {isStreamingArtifact && (
                    <span className="ml-2 text-xs" style={{ color: '#3b82f6' }}>
                      Generuojama...
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {!isStreamingArtifact && currentConversation?.artifact && (
                    <button
                      onClick={() => navigator.clipboard.writeText(currentConversation.artifact!.content)}
                      className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2"
                      style={{ background: '#5a5550', color: 'white' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#3d3935'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#5a5550'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  )}
                  <button
                    onClick={() => setShowArtifact(false)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#8a857f' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {currentConversation?.artifact && !isStreamingArtifact && (
                <p className="text-xs mt-1" style={{ color: '#8a857f' }}>
                  Versija {currentConversation.artifact.version}
                </p>
              )}
            </div>

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto px-6 py-6 relative"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)'
              }}
            >
              {isStreamingArtifact ? (
                <div>
                  <div className="text-[15px] leading-relaxed" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
                    {renderInteractiveYAML(artifactStreamContent)}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3b82f6' }} />
                    <span className="text-xs" style={{ color: '#6b7280' }}>Generuojamas pasiūlymas...</span>
                  </div>
                </div>
              ) : currentConversation?.artifact ? (
                <div>
                  <div className="text-[15px] leading-relaxed" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
                    {renderInteractiveYAML(currentConversation.artifact.content)}
                  </div>
                  <div className="mt-6 p-3 rounded-lg" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <p className="text-xs" style={{ color: '#6b7280' }}>
                      <strong>Patarimas:</strong> Spustelėkite ant kintamojo, kad įterptumėte nuorodą į pokalbį. Tada galite paprašyti Claude pakeisti tik tą reikšmę.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer - Economist Selection & Send Button */}
            {!isStreamingArtifact && currentConversation?.artifact && (
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {/* Economist Selection */}
                  <div>
                    <label className="text-xs font-medium mb-2 block" style={{ color: '#6b7280' }}>
                      Select Economist
                    </label>
                    <div className="relative">
                      <button
                        onClick={() => setShowEconomistDropdown(!showEconomistDropdown)}
                        className="w-full px-3 py-2 text-sm rounded-lg border transition-colors flex items-center justify-between"
                        style={{
                          borderColor: '#e8e5e0',
                          background: 'white',
                          color: selectedEconomist ? '#3d3935' : '#8a857f'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5550'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e8e5e0'}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{selectedEconomist ? (selectedEconomist.full_name || selectedEconomist.email) : 'Select economist...'}</span>
                        </div>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {/* Dropdown */}
                      {showEconomistDropdown && (
                        <div className="absolute z-10 w-full bottom-full mb-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                          {economists.length === 0 ? (
                            <div className="p-3 text-xs text-center" style={{ color: '#8a857f' }}>
                              No economists found
                            </div>
                          ) : (
                            economists.map((economist) => (
                              <button
                                key={economist.id}
                                onClick={() => {
                                  setSelectedEconomist(economist);
                                  setShowEconomistDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between"
                                style={{ color: '#3d3935' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                              >
                                <div>
                                  <div className="font-medium">{economist.full_name || economist.display_name || economist.email}</div>
                                  {economist.kodas && (
                                    <div className="text-xs" style={{ color: '#8a857f' }}>Code: {economist.kodas}</div>
                                  )}
                                </div>
                                {selectedEconomist?.id === economist.id && (
                                  <Check className="w-4 h-4" style={{ color: '#10b981' }} />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manager Selection */}
                  <div>
                    <label className="text-xs font-medium mb-2 block" style={{ color: '#6b7280' }}>
                      Select Manager (Vadybininkas)
                    </label>
                    <div className="relative">
                      <button
                        onClick={() => setShowManagerDropdown(!showManagerDropdown)}
                        className="w-full px-3 py-2 text-sm rounded-lg border transition-colors flex items-center justify-between"
                        style={{
                          borderColor: '#e8e5e0',
                          background: 'white',
                          color: selectedManager ? '#3d3935' : '#8a857f'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5550'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e8e5e0'}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{selectedManager ? (selectedManager.full_name || selectedManager.email) : 'Select manager...'}</span>
                        </div>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {/* Dropdown */}
                      {showManagerDropdown && (
                        <div className="absolute z-10 w-full bottom-full mb-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                          {managers.length === 0 ? (
                            <div className="p-3 text-xs text-center" style={{ color: '#8a857f' }}>
                              No managers found
                            </div>
                          ) : (
                            managers.map((manager) => (
                              <button
                                key={manager.id}
                                onClick={() => {
                                  setSelectedManager(manager);
                                  setShowManagerDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between"
                                style={{ color: '#3d3935' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                              >
                                <div>
                                  <div className="font-medium">{manager.full_name || manager.display_name || manager.email}</div>
                                  {manager.kodas && (
                                    <div className="text-xs" style={{ color: '#8a857f' }}>Code: {manager.kodas}</div>
                                  )}
                                </div>
                                {selectedManager?.id === manager.id && (
                                  <Check className="w-4 h-4" style={{ color: '#10b981' }} />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSendToWebhook}
                    disabled={!selectedEconomist || !selectedManager || sendingWebhook}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: selectedEconomist && !sendingWebhook ? '#5a5550' : '#d4cfc8',
                      color: 'white'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedEconomist && !sendingWebhook) {
                        e.currentTarget.style.background = '#3d3935';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedEconomist && !sendingWebhook) {
                        e.currentTarget.style.background = '#5a5550';
                      }
                    }}
                  >
                    {sendingWebhook ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                        <span>Generuojama...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Generuoti</span>
                      </>
                    )}
                  </button>
                </div>
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
          onClick={() => {
            setShowPromptModal(false);
            setShowTemplateView(false);
          }}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] rounded-lg overflow-hidden"
            style={{ background: 'white', border: '1px solid #e8e5e0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#f0ede8' }}>
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold" style={{ color: '#3d3935' }}>
                  {showTemplateView ? 'Prompt Šablonas' : 'Pilnas Prompt'}
                </h3>
                <button
                  onClick={() => setShowTemplateView(!showTemplateView)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: showTemplateView ? '#f0ede8' : '#5a5550',
                    color: showTemplateView ? '#5a5550' : 'white',
                    border: showTemplateView ? '1px solid #e8e5e0' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (showTemplateView) {
                      e.currentTarget.style.background = '#e8e5e0';
                    } else {
                      e.currentTarget.style.background = '#3d3935';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (showTemplateView) {
                      e.currentTarget.style.background = '#f0ede8';
                    } else {
                      e.currentTarget.style.background = '#5a5550';
                    }
                  }}
                >
                  {showTemplateView ? 'Rodyti pilną prompt' : 'Rodyti šabloną'}
                </button>
              </div>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setShowTemplateView(false);
                }}
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
                {showTemplateView ? (templateFromDB || promptTemplate) : systemPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}


      {/* Notification Container */}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </div>
  );
}
