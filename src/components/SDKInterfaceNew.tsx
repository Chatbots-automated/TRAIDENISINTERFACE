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
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  ChevronDown
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt, savePromptTemplate, getPromptTemplate } from '../lib/instructionVariablesService';
import MessageContent from './MessageContent';
import { colors } from '../lib/designSystem';
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
import { tools } from '../lib/toolDefinitions';
import { executeTool } from '../lib/toolExecutors';

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
  const [showEditPromptModal, setShowEditPromptModal] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordError, setEditPasswordError] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptTemplate, setEditedPromptTemplate] = useState('');
  const [showTemplateInEdit, setShowTemplateInEdit] = useState(true);
  const [showArtifact, setShowArtifact] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [displayButtons, setDisplayButtons] = useState<{ message?: string; buttons: Array<{id: string, label: string, value: string}> } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  useEffect(() => {
    loadSystemPrompt();
    loadConversations();
  }, []);

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
      const { supabaseAdmin } = await import('../lib/supabase');
      const { data, error } = await supabaseAdmin
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
      const { supabaseAdmin } = await import('../lib/supabase');

      // Update the template variable in instruction_variables table
      const { error } = await supabaseAdmin
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
      console.log('[Delete] Attempting to delete conversation:', conversationId);
      const { data, error: deleteError } = await deleteSDKConversation(conversationId, user.id, user.email);

      if (deleteError || !data) {
        console.error('[Delete] Error:', deleteError);
        setError(`Nepavyko ištrinti pokalbio: ${deleteError?.message || 'nežinoma klaida'}`);
        return;
      }

      console.log('[Delete] Successfully deleted conversation');
      await loadConversations();
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
   * Handle button click from display_buttons tool
   */
  const handleButtonClick = (value: string) => {
    console.log('[Buttons] User clicked button with value:', value);
    setDisplayButtons(null);
    setInputValue(value);
    // Automatically send the value after a brief delay
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  /**
   * Process AI response with tool use support (recursive)
   */
  const processAIResponse = async (
    anthropic: Anthropic,
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    conversation: SDKConversation,
    currentMessages: SDKMessage[]
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
            setStreamingContent(fullResponseText);
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
          setDisplayButtons({
            message: parsed.message,
            buttons: parsed.buttons
          });

          // Save conversation with assistant's response (but pause here)
          const finalMessages: Anthropic.MessageParam[] = [
            ...messages,
            {
              role: 'assistant',
              content: filteredContent
            },
            {
              role: 'user',
              content: toolResults
            }
          ];

          const updatedConversation = {
            ...conversation,
            messages: finalMessages,
            lastActivity: new Date().toISOString()
          };

          setCurrentConversation(updatedConversation);
          await updateSDKConversation(updatedConversation);
          setLoading(false);
          return; // PAUSE - don't continue with recursive loop
        }

        // Build messages for next round (with tool_use and tool_result blocks)
        // CRITICAL: Use the ACTUAL content from finalMessage, not reconstructed tool_use blocks!
        // This ensures the tool_use blocks match exactly what Claude sent us.
        // BUT: Filter out empty thinking blocks (API rejects them in recursive calls)

        console.log(`[Tool Loop] Using ${messages.length} messages from previous API call as conversation history`);
        console.log(`[Tool Loop] Using finalMessage.content with ${finalMessage.content.length} blocks`);

        // Filter out empty thinking blocks (they cause 400 errors)
        const filteredContent = finalMessage.content.filter((block: any) => {
          if (block.type === 'thinking') {
            const hasContent = block.thinking && block.thinking.trim().length > 0;
            if (!hasContent) {
              console.log('[Tool Loop] Filtering out empty thinking block');
              return false;
            }
          }
          return true;
        });

        console.log(`[Tool Loop] Filtered content blocks: ${finalMessage.content.length} -> ${filteredContent.length}`);

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
          currentMessages // Keep same currentMessages, not adding anything yet
        );
      } else {
        // No more tool uses, save final assistant message
        const assistantMessage: SDKMessage = {
          role: 'assistant',
          content: responseContent,
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

        // CRITICAL: Check for artifacts in final response
        if (responseContent.includes('<commercial_offer')) {
          console.log('[Artifact] Detected commercial_offer in final response');
          await handleArtifactGeneration(responseContent, updatedConversation);
        }

        loadConversations();
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

        // Safe to add
        console.log(`[PHASE 2][${idx}] ✅ KEEPING: Valid string message, length=${contentStr.length}`);
        anthropicMessages.push({
          role: msg.role,
          content: msg.content
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
   * Render YAML content with interactive variables
   */
  const renderInteractiveYAML = (yamlContent: string) => {
    const lines = yamlContent.split('\n');
    // Pattern: variable_key: "value" or variable_key: |
    const variablePattern = /^([a-z_]+[a-z0-9_]*)\s*:\s*(.+)$/;

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
              <button
                onClick={async () => {
                  const template = await fetchTemplateVariable();
                  setEditedPromptTemplate(template);
                  setShowEditPromptModal(true);
                }}
                className="p-1 rounded transition-colors"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0ede8'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Redaguoti prompt šabloną"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
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
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-500 mx-auto"></div>
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
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Floating Artifact Toggle Button */}
        {currentConversation?.artifact && (
          <button
            onClick={() => setShowArtifact(!showArtifact)}
            className="fixed top-6 right-6 z-50 px-4 py-2 rounded-lg shadow-lg transition-all hover:shadow-xl"
            style={{
              background: showArtifact ? '#5a5550' : 'white',
              color: showArtifact ? 'white' : '#5a5550',
              border: '1px solid #e8e5e0'
            }}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">Pasiūlymas</span>
            </div>
          </button>
        )}

        {/* Interactive Buttons (from display_buttons tool) */}
        {displayButtons && !loading && (
          <div className="px-6 pt-4">
            <div className="max-w-4xl mx-auto">
              <div
                className="p-4 rounded-lg border"
                style={{
                  background: '#fafaf9',
                  borderColor: '#e8e5e0'
                }}
              >
                {displayButtons.message && (
                  <p className="text-sm mb-3" style={{ color: '#6b7280' }}>
                    {displayButtons.message}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {displayButtons.buttons.map(button => (
                    <button
                      key={button.id}
                      onClick={() => handleButtonClick(button.value)}
                      className="px-4 py-2 rounded-lg transition-all hover:shadow-md"
                      style={{
                        background: '#5a5550',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
              {currentConversation.messages.map((message, index) => (
                <div key={index}>
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
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Assistant message - plain text with reaction buttons
                    <div className="mb-8 group">
                      <MessageContent content={message.content.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')} />

                      {/* Reaction buttons */}
                      <div className="flex items-center gap-1 mt-3">
                        <button
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#6b7280' }}
                          title="Copy"
                          onClick={() => navigator.clipboard.writeText(message.content)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#6b7280' }}
                          title="Good response"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#6b7280' }}
                          title="Bad response"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
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
              ))}

              {/* Streaming content */}
              {loading && streamingContent && (
                <div className="mb-8">
                  <MessageContent content={streamingContent.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')} />
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3b82f6' }} />
                    <span className="text-xs" style={{ color: '#6b7280' }}>Rašo...</span>
                  </div>
                </div>
              )}

              {/* Tool usage indicator */}
              {loading && isToolUse && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#f0ede8', color: '#5a5550', border: '1px solid #e8e5e0' }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Vykdoma: {toolUseName}</span>
                  </div>
                </div>
              )}

              {/* Initial loading indicator */}
              {loading && !streamingContent && !isToolUse && (
                <div className="py-4 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-500"></div>
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

        {/* Input Box - Always visible */}
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
                className="w-full px-4 py-3.5 pr-80 text-[15px] rounded-xl resize-none transition-all shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
      </div>

      {/* Artifact Panel - Floating Design */}
      {currentConversation?.artifact && showArtifact && (
        <div className="p-4 flex-shrink-0">
          <div className="w-[460px] bg-white rounded-2xl shadow-xl flex flex-col" style={{ height: 'calc(100vh - 32px)', border: '1px solid #e8e5e0' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b" style={{ borderColor: '#e8e5e0' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold" style={{ color: '#3d3935' }}>
                  Komercinis pasiūlymas
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(currentConversation.artifact.content)}
                    className="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2"
                    style={{ background: '#5a5550', color: 'white' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3935'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#5a5550'}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
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
              <p className="text-xs mt-1" style={{ color: '#8a857f' }}>
                Versija {currentConversation.artifact.version}
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="text-[15px] leading-relaxed" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
                {renderInteractiveYAML(currentConversation.artifact.content)}
              </div>
              <div className="mt-6 p-3 rounded-lg" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  <strong>Patarimas:</strong> Spustelėkite ant kintamojo, kad įterptumėte nuorodą į pokalbį. Tada galite paprašyti Claude pakeisti tik tą reikšmę.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Prompt Modal */}
      {showEditPromptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => {
            setShowEditPromptModal(false);
            setEditPassword('');
            setEditPasswordError(false);
            setIsEditingPrompt(false);
            setShowTemplateInEdit(true);
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
                  {isEditingPrompt ? (showTemplateInEdit ? 'Šablonas' : 'Pilnas Prompt') : 'Įveskite slaptažodį'}
                </h3>
                {isEditingPrompt && (
                  <button
                    onClick={() => setShowTemplateInEdit(!showTemplateInEdit)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: showTemplateInEdit ? '#f0ede8' : '#5a5550',
                      color: showTemplateInEdit ? '#5a5550' : 'white',
                      border: showTemplateInEdit ? '1px solid #e8e5e0' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (showTemplateInEdit) {
                        e.currentTarget.style.background = '#e8e5e0';
                      } else {
                        e.currentTarget.style.background = '#3d3935';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (showTemplateInEdit) {
                        e.currentTarget.style.background = '#f0ede8';
                      } else {
                        e.currentTarget.style.background = '#5a5550';
                      }
                    }}
                  >
                    {showTemplateInEdit ? 'Rodyti pilną prompt' : 'Rodyti šabloną'}
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setShowEditPromptModal(false);
                  setEditPassword('');
                  setEditPasswordError(false);
                  setIsEditingPrompt(false);
                  setShowTemplateInEdit(true);
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
              {!isEditingPrompt ? (
                <div className="max-w-md mx-auto">
                  <p className="text-sm mb-4" style={{ color: '#8a857f' }}>
                    Šablonas apsaugotas slaptažodžiu. Įveskite slaptažodį, kad galėtumėte redaguoti.
                  </p>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => {
                      setEditPassword(e.target.value);
                      setEditPasswordError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editPassword === 'ZXCvbn123') {
                          setIsEditingPrompt(true);
                          // Keep the template that was loaded, don't overwrite
                        } else {
                          setEditPasswordError(true);
                        }
                      }
                    }}
                    placeholder="Slaptažodis"
                    className="w-full px-4 py-2 text-sm rounded-lg border"
                    style={{
                      borderColor: editPasswordError ? '#991b1b' : '#e8e5e0',
                      background: 'white',
                      color: '#3d3935'
                    }}
                  />
                  {editPasswordError && (
                    <p className="text-sm mt-2" style={{ color: '#991b1b' }}>
                      Neteisingas slaptažodis
                    </p>
                  )}
                  <button
                    onClick={() => {
                      if (editPassword === 'ZXCvbn123') {
                        setIsEditingPrompt(true);
                        // Keep the template that was loaded, don't overwrite
                      } else {
                        setEditPasswordError(true);
                      }
                    }}
                    className="w-full mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: '#5a5550', color: 'white' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3935'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#5a5550'}
                  >
                    Tęsti
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {showTemplateInEdit ? (
                    <>
                      <p className="text-sm" style={{ color: '#8a857f' }}>
                        Redaguokite prompt šabloną žemiau. Kintamieji {'{variable_key}'} bus pakeisti atitinkamomis reikšmėmis iš duomenų bazės.
                      </p>
                      <textarea
                        value={editedPromptTemplate}
                        onChange={(e) => setEditedPromptTemplate(e.target.value)}
                        className="w-full h-96 px-4 py-3 text-xs font-mono rounded-lg border resize-none"
                        style={{
                          borderColor: '#e8e5e0',
                          background: 'white',
                          color: '#3d3935'
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-sm" style={{ color: '#8a857f' }}>
                        Peržiūra: pilnas prompt su įkeltais kintamaisiais (tik skaitymas)
                      </p>
                      <div className="w-full h-96 px-4 py-3 text-xs font-mono rounded-lg border overflow-y-auto"
                        style={{
                          borderColor: '#e8e5e0',
                          background: '#f9f8f6',
                          color: '#3d3935'
                        }}
                      >
                        <pre className="whitespace-pre-wrap">{systemPrompt}</pre>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowEditPromptModal(false);
                        setEditPassword('');
                        setEditPasswordError(false);
                        setIsEditingPrompt(false);
                        setShowTemplateInEdit(true);
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: '#f0ede8', color: '#5a5550' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#e8e5e0'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#f0ede8'}
                    >
                      Atšaukti
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await saveTemplateVariable(editedPromptTemplate);
                          if (result.success) {
                            // Reload template from DB and full prompt
                            const [newPrompt, newTemplate] = await Promise.all([
                              getSystemPrompt(),
                              fetchTemplateVariable()
                            ]);
                            setSystemPrompt(newPrompt);
                            setTemplateFromDB(newTemplate);
                            setShowEditPromptModal(false);
                            setEditPassword('');
                            setEditPasswordError(false);
                            setIsEditingPrompt(false);
                            setShowTemplateInEdit(true);
                          } else {
                            console.error('Failed to save template:', result.error);
                            alert('Nepavyko išsaugoti šablono');
                          }
                        } catch (err) {
                          console.error('Error saving template:', err);
                          alert('Įvyko klaida išsaugant šabloną');
                        }
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: '#5a5550', color: 'white' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#3d3935'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#5a5550'}
                    >
                      Išsaugoti
                    </button>
                  </div>
                </div>
              )}
            </div>
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
    </div>
  );
}
