import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import { sendMessage, getChatMessages, updateChatThreadTitle } from '../lib/supabase';
import { appLogger } from '../lib/appLogger';
import {
  saveCommercialOffer,
  parseAgentResponse,
  setLatestCommercialMessageId,
  isLatestCommercialMessage,
  addAcceptedMessageId,
  isMessageAccepted,
  hasAcceptedMessages,
  cleanupDeletedThreads
} from '../lib/commercialOfferStorage';
import type { AppUser } from '../types';

interface Thread {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

interface ChatInterfaceProps {
  user: AppUser;
  projectId: string;
  currentThread: Thread | null;
  onCommercialOfferUpdate?: (threadId: string, hasOffer: boolean) => void;
  onFirstCommercialAccept?: () => void;
  onThreadsUpdate?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  author_ref?: string;
  author_name?: string; // User's display name
  queryType?: string; // Store the query type tag for user messages
}

type QueryType = 'Komercinio pasiūlymo užklausa' | 'Bendra užklausa' | 'Nestandartinių gaminių užklausa' | null;

// Query type tag configuration
interface QueryTagConfig {
  tag: string;
  label: string;
  queryType: QueryType;
  description: string; // Hover tooltip description
}

const QUERY_TAGS: QueryTagConfig[] = [
  { tag: '/General', label: 'Bendra', queryType: 'Bendra užklausa', description: 'Bendri klausimai apie produkciją' },
  { tag: '/Commercial', label: 'Komercinis', queryType: 'Komercinio pasiūlymo užklausa', description: 'Gauti komercinį pasiūlymą su kainomis' },
  { tag: '/Custom', label: 'Nestandartinis', queryType: 'Nestandartinių gaminių užklausa', description: 'Nestandartiniai/specialūs gaminiai' },
];

const DEFAULT_QUERY_TAG = QUERY_TAGS[0]; // /General as default

// LocalStorage key for tracking if user has seen the query type tooltip
const QUERY_TOOLTIP_SHOWN_KEY = 'traidenis_query_tooltip_shown';

// Fun loading messages that rotate while waiting for response
const LOADING_MESSAGES = [
  "Hmmm...",
  "Thinking...",
  "Calculating HNV...",
  "Working on it...",
  "Processing your request...",
  "Consulting the knowledge base...",
  "Analyzing data...",
  "Almost there...",
  "Crunching numbers...",
  "Searching for answers...",
  "Let me think about that...",
  "One moment please...",
  "Gathering information...",
  "Running calculations...",
  "Checking the database...",
  "Formulating response...",
  "Cross-referencing data...",
  "Putting thoughts together...",
  "Reading through documents...",
  "Connecting the dots...",
  "Preparing your answer...",
  "Just a sec...",
  "On it...",
  "Diving deep...",
  "Exploring possibilities...",
  "Synthesizing information...",
  "Building your response...",
  "Hang tight...",
  "Processing query...",
  "Analyzing patterns...",
];

// Get time-based greeting in Lithuanian
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Labas rytas';
  if (hour >= 12 && hour < 18) return 'Laba diena';
  if (hour >= 18 && hour < 22) return 'Labas vakaras';
  return 'Labas';
};

// Get display name for a message author
const getDisplayName = (authorName?: string, authorRef?: string): string => {
  // Use stored display name if available
  if (authorName) {
    // Extract first name from full name (e.g., "Vitalijus Smith" -> "Vitalijus")
    return authorName.split(' ')[0];
  }

  // Fallback for old messages without author_name - extract from email
  if (!authorRef || authorRef === 'ai-assistant' || authorRef === 'system') {
    return 'Traidenis';
  }

  // Get the part before @ symbol
  const emailName = authorRef.split('@')[0];

  // Get first part before any dots or underscores (first name)
  const firstName = emailName.split(/[._-]/)[0];

  // Capitalize first letter
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
};

export default function ChatInterface({ user, projectId, currentThread, onCommercialOfferUpdate, onFirstCommercialAccept, onThreadsUpdate }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentQueryTag, setCurrentQueryTag] = useState<QueryTagConfig>(DEFAULT_QUERY_TAG);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showQueryTooltip, setShowQueryTooltip] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingQueryTypeRef = useRef<string | null>(null); // Track query type for pending response

  // Load messages when thread changes
  useEffect(() => {
    if (currentThread) {
      loadMessages(currentThread.id);
    } else {
      setMessages([]);
    }
  }, [currentThread]);

  // Auto scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto scroll during streaming
  useEffect(() => {
    if (isStreaming && streamingContent) {
      scrollToBottom();
    }
  }, [isStreaming, streamingContent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show query type tooltip for first-time users
  useEffect(() => {
    const hasSeenTooltip = localStorage.getItem(QUERY_TOOLTIP_SHOWN_KEY);
    if (!hasSeenTooltip && currentThread) {
      // Show tooltip after a short delay to let the UI settle
      const timer = setTimeout(() => {
        setShowQueryTooltip(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentThread]);

  // Rotate loading messages while waiting for response
  useEffect(() => {
    if (!loading || isStreaming) {
      setLoadingMessageIndex(0);
      return;
    }

    // Start with a random message
    setLoadingMessageIndex(Math.floor(Math.random() * LOADING_MESSAGES.length));

    // Change message every 2-4 seconds (random interval for more natural feel)
    const interval = setInterval(() => {
      setLoadingMessageIndex(prev => {
        let nextIndex;
        do {
          nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
        } while (nextIndex === prev); // Ensure we get a different message
        return nextIndex;
      });
    }, 2500 + Math.random() * 1500); // Random interval between 2.5-4 seconds

    return () => clearInterval(interval);
  }, [loading, isStreaming]);

  const scrollToBottom = () => {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const loadMessages = async (threadId: string) => {
    try {
      console.log('Loading messages for thread:', threadId);

      const { data, error } = await getChatMessages(threadId);

      if (error) {
        console.error('Error loading messages:', error);
        setMessages([]);
        return;
      }

      console.log('Loaded messages:', data);
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentThread || loading) return;

    const messageToSend = newMessage.trim();
    const queryType = currentQueryTag.queryType;
    const isCommercialQuery = currentQueryTag.tag === '/Commercial';

    // Store the query type for the pending response
    pendingQueryTypeRef.current = currentQueryTag.tag;

    setNewMessage('');
    setLoading(true);

    try {
      console.log('Sending message:', messageToSend, 'to thread:', currentThread.id, 'with query type:', queryType);

      // Add user message to UI immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: messageToSend,
        timestamp: new Date().toISOString(),
        author_ref: user.email || '',
        author_name: user.display_name || '',
        queryType: currentQueryTag.tag // Store the tag used for this message
      };
      setMessages(prev => [...prev, userMessage]);

      // Save user message to chat_history
      const { error: userMessageError } = await sendMessage(
        projectId,
        currentThread.id,
        messageToSend,
        'user',
        user.email || '',
        user.display_name || ''
      );

      if (userMessageError) {
        console.error('Error saving user message:', userMessageError);
      }

      // Auto-rename thread on first message (keep the date from original title)
      if (currentThread.message_count === 0) {
        const dateMatch = currentThread.title.match(/\d{1,2}\/\d{1,2}\/\d{4}.*$/);
        const datePart = dateMatch ? ` - ${dateMatch[0]}` : ` - ${new Date().toLocaleDateString()}`;
        const messagePart = messageToSend.length > 40
          ? messageToSend.substring(0, 40).trim() + '...'
          : messageToSend;
        const newTitle = messagePart + datePart;

        await updateChatThreadTitle(currentThread.id, newTitle);
        console.log('Auto-renamed thread to:', newTitle);
      }

      // Log user message sent
      await appLogger.logChat({
        action: 'message_sent',
        userId: user.id,
        userEmail: user.email,
        threadId: currentThread.id,
        messagePreview: messageToSend,
        queryType: queryType || undefined,
        metadata: { message_length: messageToSend.length }
      });

      // Send to webhook with streaming
      try {
        console.log('Sending to webhook...');

        // Create streaming message ID
        const streamingMessageId = (Date.now() + 1).toString();
        streamingMessageIdRef.current = streamingMessageId;

        // Note: Don't set isStreaming=true yet - wait until we have content
        // This keeps the loading messages visible while waiting for the response

        const webhookUrl = 'https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6';
        const startTime = Date.now();

        await appLogger.logChat({
          action: 'response_started',
          userId: user.id,
          userEmail: user.email,
          threadId: currentThread.id,
          messagePreview: messageToSend,
          queryType: queryType || undefined,
          metadata: { webhook_url: webhookUrl }
        });

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: messageToSend,
            query_type: queryType,
            chat_id: currentThread.id,
            parent_id: currentThread.id,
            user_id: user.id,
            project_id: projectId
          })
        });

        // DEBUG: Log response details
        console.log('=== WEBHOOK RESPONSE DEBUG ===');
        console.log('Status:', webhookResponse.status);
        console.log('Status Text:', webhookResponse.statusText);
        console.log('Headers:', Object.fromEntries(webhookResponse.headers));
        console.log('Body Type:', webhookResponse.body?.constructor.name);
        console.log('Response OK:', webhookResponse.ok);

        const contentType = webhookResponse.headers.get('content-type') || '';
        console.log('Content-Type:', contentType);
        const isStreamingResponse = contentType.includes('text/event-stream') ||
                                   contentType.includes('application/x-ndjson') ||
                                   contentType.includes('text/plain');
        console.log('Is Streaming Response:', isStreamingResponse);

        const responseTimeMs = Date.now() - startTime;

        if (!webhookResponse.ok) {
          console.error('Webhook response not ok:', webhookResponse.status);

          await appLogger.logAPI({
            action: 'webhook_call',
            userId: user.id,
            userEmail: user.email,
            endpoint: webhookUrl,
            method: 'POST',
            statusCode: webhookResponse.status,
            responseTimeMs,
            level: 'error',
            metadata: { query_type: queryType, thread_id: currentThread.id }
          });

          await appLogger.logError({
            action: 'webhook_failed',
            error: `Webhook returned ${webhookResponse.status}`,
            userId: user.id,
            userEmail: user.email,
            metadata: {
              webhook_url: webhookUrl,
              status: webhookResponse.status,
              thread_id: currentThread.id
            }
          });

          throw new Error(`Webhook returned ${webhookResponse.status}`);
        }

        let fullResponse = '';

        // Read response body as text to avoid locking the stream
        console.log('📦 Reading response body as text...');
        const responseText = await webhookResponse.text();
        console.log('✅ Received response text, length:', responseText.length);
        console.log('📄 First 200 chars:', responseText.substring(0, 200));

        // Now that we have the response, switch from loading to streaming mode
        setIsStreaming(true);
        setStreamingContent('');

        // Try to parse as single JSON object
        if (contentType.includes('application/json')) {
          try {
            const jsonResponse = JSON.parse(responseText);
            console.log('✅ Parsed as single JSON object');
            console.log('📋 Available fields:', Object.keys(jsonResponse));

            // Extract text from various possible fields
            if (jsonResponse.response) {
              fullResponse = jsonResponse.response;
            } else if (jsonResponse.output) {
              fullResponse = jsonResponse.output;
            } else if (jsonResponse.text) {
              fullResponse = jsonResponse.text;
            } else if (jsonResponse.message) {
              fullResponse = jsonResponse.message;
            } else if (jsonResponse.data) {
              fullResponse = typeof jsonResponse.data === 'string' ? jsonResponse.data : JSON.stringify(jsonResponse.data);
            } else {
              console.warn('⚠️ Unknown JSON structure:', Object.keys(jsonResponse));
              fullResponse = JSON.stringify(jsonResponse);
            }

            console.log('✅ Extracted response text, length:', fullResponse.length);
            setStreamingContent(fullResponse);
          } catch (e) {
            console.log('⚠️ Not a single JSON object, trying newline-delimited JSON...');
            // Try parsing as newline-delimited JSON (NDJSON)
            const lines = responseText.split('\n');
            console.log(`📝 Split into ${lines.length} lines`);

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const parsed = JSON.parse(line);
                console.log('  ✓ Parsed JSON line:', parsed);
                console.log('  📋 Available fields:', Object.keys(parsed));

                // Handle multiple possible response formats from n8n
                let textContent = null;

                if (parsed.response) {
                  textContent = parsed.response;
                  console.log('  ✓ Found "response" field');
                } else if (parsed.data) {
                  textContent = parsed.data;
                  console.log('  ✓ Found "data" field');
                } else if (parsed.message) {
                  textContent = parsed.message;
                  console.log('  ✓ Found "message" field');
                } else if (parsed.output) {
                  textContent = parsed.output;
                  console.log('  ✓ Found "output" field');
                } else if (parsed.text) {
                  textContent = parsed.text;
                  console.log('  ✓ Found "text" field');
                } else if (parsed.type === 'chunk' && parsed.data) {
                  textContent = parsed.data;
                  console.log('  ✓ Found n8n chunk with data');
                } else if (parsed.type === 'message' && parsed.data) {
                  textContent = parsed.data;
                  console.log('  ✓ Found n8n message with data');
                } else if (parsed.type === 'item' && parsed.content) {
                  textContent = parsed.content;
                  console.log('  ✓ Found n8n item with content');
                } else {
                  console.log('  ⚠️ No recognized text field in JSON');
                  console.log('  💡 Full JSON:', JSON.stringify(parsed));
                }

                if (textContent) {
                  fullResponse += textContent;
                  setStreamingContent(fullResponse);
                  console.log('  ✓ Added to fullResponse, new length:', fullResponse.length);
                }
              } catch (lineError) {
                console.log('  ℹ️ Line is not JSON, treating as plain text:', line.substring(0, 50));
                if (line.trim()) {
                  fullResponse += line;
                  setStreamingContent(fullResponse);
                }
              }
            }
          }
        } else if (isStreamingResponse) {
          // Handle SSE or plain text streaming format
          console.log('📡 Processing as streaming format (SSE or plain text)');
          const lines = responseText.split('\n');
          console.log(`📝 Split into ${lines.length} lines`);

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              // SSE format
              const data = line.slice(6).trim();
              console.log('  📨 SSE data:', data.substring(0, 50));
              if (data && data !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data);
                  console.log('  ✓ Parsed JSON:', parsed);

                  let textContent = null;
                  if (parsed.response) {
                    textContent = parsed.response;
                  } else if (parsed.data) {
                    textContent = parsed.data;
                  } else if (parsed.message) {
                    textContent = parsed.message;
                  } else if (parsed.output) {
                    textContent = parsed.output;
                  } else if (parsed.text) {
                    textContent = parsed.text;
                  }

                  if (textContent) {
                    fullResponse += textContent;
                    setStreamingContent(fullResponse);
                  }
                } catch (e) {
                  fullResponse += data;
                  setStreamingContent(fullResponse);
                }
              }
            } else if (line.trim() && !line.startsWith(':')) {
              // Plain text line
              fullResponse += line;
              setStreamingContent(fullResponse);
            }
          }
        } else {
          // Fallback: use the entire response text
          console.log('📝 Using entire response text as-is');
          fullResponse = responseText;
          setStreamingContent(fullResponse);
        }

        // Streaming complete - add final message to chat
        const finalResponseTime = Date.now() - startTime;

        console.log('=== STREAM ENDED ===');
        console.log('Full response length:', fullResponse.length);
        console.log('Full response preview:', fullResponse.substring(0, 200));

        if (fullResponse) {
          const isCommercialQuery = pendingQueryTypeRef.current === '/Commercial';

          const aiMessage: Message = {
            id: streamingMessageId,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
            author_ref: 'ai-assistant'
          };

          // If this is a /Commercial response, track it as the latest
          if (isCommercialQuery && currentThread) {
            setLatestCommercialMessageId(currentThread.id, streamingMessageId);
          }

          console.log('Adding AI message to state...');
          setMessages(prev => [...prev, aiMessage]);

          // Clear the pending query type
          pendingQueryTypeRef.current = null;

          // Clear streaming state AFTER adding the message
          setStreamingContent('');
          setIsStreaming(false);
          streamingMessageIdRef.current = null;

          // Save AI message to chat_history
          const { error: aiMessageError } = await sendMessage(
            projectId,
            currentThread.id,
            fullResponse,
            'assistant',
            'ai-assistant',
            'Traidenis'
          );

          if (aiMessageError) {
            console.error('Error saving AI message:', aiMessageError);
          }

          await appLogger.logChat({
            action: 'response_received',
            userId: user.id,
            userEmail: user.email,
            threadId: currentThread.id,
            messagePreview: fullResponse,
            queryType: queryType || undefined,
            responseTimeMs: finalResponseTime,
            metadata: { response_length: fullResponse.length }
          });

          await appLogger.logAPI({
            action: 'webhook_call',
            userId: user.id,
            userEmail: user.email,
            endpoint: webhookUrl,
            method: 'POST',
            statusCode: 200,
            responseTimeMs: finalResponseTime,
            metadata: {
              query_type: queryType,
              thread_id: currentThread.id,
              response_length: fullResponse.length
            }
          });
        } else {
          console.warn('⚠️ Stream ended but fullResponse is empty!');
          console.log('Streaming content at end:', streamingContent);

          // If we have streaming content but no fullResponse, use streaming content
          if (streamingContent) {
            console.log('Using streamingContent as fallback');
            const isCommercialQuery = pendingQueryTypeRef.current === '/Commercial';

            const aiMessage: Message = {
              id: streamingMessageId,
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date().toISOString(),
              author_ref: 'ai-assistant'
            };

            // If this is a /Commercial response, track it as the latest
            if (isCommercialQuery && currentThread) {
              setLatestCommercialMessageId(currentThread.id, streamingMessageId);
            }

            setMessages(prev => [...prev, aiMessage]);

            // Clear the pending query type
            pendingQueryTypeRef.current = null;

            // Save the streaming content
            await sendMessage(
              projectId,
              currentThread.id,
              streamingContent,
              'assistant',
              'ai-assistant',
              'Traidenis'
            );
          }

          // Clear streaming state
          setStreamingContent('');
          setIsStreaming(false);
          streamingMessageIdRef.current = null;
        }

      } catch (webhookError: any) {
        console.error('Webhook error:', webhookError);
        setIsStreaming(false);
        setStreamingContent('');
        streamingMessageIdRef.current = null;

        await appLogger.logChat({
          action: 'response_failed',
          userId: user.id,
          userEmail: user.email,
          threadId: currentThread.id,
          messagePreview: messageToSend,
          queryType: queryType || undefined,
          level: 'error',
          metadata: { error: webhookError.message }
        });

        await appLogger.logError({
          action: 'chat_webhook_error',
          error: webhookError,
          userId: user.id,
          userEmail: user.email,
          metadata: {
            thread_id: currentThread.id,
            query_type: queryType,
            message: messageToSend
          }
        });

        // Add error message
        const errorMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
          author_ref: 'system'
        };
        setMessages(prev => [...prev, errorMessage]);
      }

      // Reload threads to update message count
      onThreadsUpdate?.();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);

      // Reset to General tag after sending Commercial or Custom queries
      // These are typically one-off specialized queries
      if (currentQueryTag.tag !== '/General') {
        setCurrentQueryTag(DEFAULT_QUERY_TAG);
      }
    }
  };

  // Dismiss the first-time user tooltip
  const dismissQueryTooltip = () => {
    setShowQueryTooltip(false);
    localStorage.setItem(QUERY_TOOLTIP_SHOWN_KEY, 'true');
  };

  // Handle tag selection from dropdown
  const handleTagSelect = (tag: QueryTagConfig) => {
    setCurrentQueryTag(tag);
    setShowTagDropdown(false);
    // Dismiss tooltip when user interacts with the selector
    if (showQueryTooltip) {
      dismissQueryTooltip();
    }
    // Focus back to the input
    inputRef.current?.focus();
  };

  // Handle accepting a commercial offer response
  const handleAcceptOffer = (messageId: string, content: string) => {
    if (!currentThread) return;

    // Check if this is the first commercial accept for this thread
    const isFirstAccept = !hasAcceptedMessages(currentThread.id);

    // Parse the response into commercial offer sections
    const parsedOffer = parseAgentResponse(content);

    // Save to localStorage
    const deletedThreadIds = saveCommercialOffer(currentThread.id, parsedOffer);

    // Clean up tracking data for deleted threads (FIFO cleanup)
    if (deletedThreadIds.length > 0) {
      console.log('Removed old commercial offers for threads:', deletedThreadIds);
      cleanupDeletedThreads(deletedThreadIds);
    }

    // Mark this message as accepted in localStorage (persists across refresh)
    addAcceptedMessageId(currentThread.id, messageId);

    // Notify parent component (Layout) that this thread now has an offer
    if (onCommercialOfferUpdate) {
      onCommercialOfferUpdate(currentThread.id, true);
    }

    // Trigger glow effect on doc icon if this is the first accept
    if (isFirstAccept && onFirstCommercialAccept) {
      onFirstCommercialAccept();
    }

    console.log('Commercial offer accepted and saved for thread:', currentThread.id);
  };

  // Handle rejecting a commercial offer response
  const handleRejectOffer = () => {
    // Pre-fill the input with a feedback prompt
    // The buttons will disappear when a new /Commercial response arrives
    setNewMessage('Please regenerate the commercial offer with the following changes: ');

    // Focus the input for the user to add their feedback
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 h-full">
        {currentThread ? (
          <>
            {/* Messages Area - flexbox handles the height, scrollable when content overflows */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Welcome screen when chat is empty */}
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {/* Greeting */}
                  <div className="mb-8">
                    <div className="text-4xl mb-4">🌿</div>
                    <h2 className="text-3xl font-light text-gray-800 mb-2">
                      {getGreeting()}, {user.display_name?.split(' ')[0] || 'Vartotojau'}
                    </h2>
                    <p className="text-gray-500 text-lg">Kuo galiu padėti?</p>
                  </div>

                  {/* Quick action suggestions */}
                  <div className="flex flex-wrap justify-center gap-3 max-w-xl">
                    <button
                      onClick={() => {
                        setNewMessage('Reikia sukurti komercinį pasiūlymą...');
                        handleTagSelect(QUERY_TAGS[1]); // Commercial
                        inputRef.current?.focus();
                      }}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                      📄 Komercinis pasiūlymas
                    </button>
                    <button
                      onClick={() => {
                        setNewMessage('Turiu klausimą apie ');
                        handleTagSelect(QUERY_TAGS[0]); // General
                        inputRef.current?.focus();
                      }}
                      className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm hover:bg-green-100 transition-colors border border-green-200"
                    >
                      💬 Bendras klausimas
                    </button>
                    <button
                      onClick={() => {
                        setNewMessage('Reikia nestandartinio sprendimo...');
                        handleTagSelect(QUERY_TAGS[2]); // Custom
                        inputRef.current?.focus();
                      }}
                      className="px-4 py-2 bg-purple-50 text-purple-700 rounded-full text-sm hover:bg-purple-100 transition-colors border border-purple-200"
                    >
                      🔧 Nestandartinis gaminys
                    </button>
                  </div>

                  {/* Hint about query types */}
                  <p className="text-xs text-gray-400 mt-6 max-w-md">
                    Pasirinkite užklausos tipą kairėje pusėje arba tiesiog pradėkite rašyti
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      {message.role === 'user' ? (
                        <UserIcon className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                      <span className="text-xs opacity-75">
                        {message.role === 'user' ? getDisplayName(message.author_name, message.author_ref) : 'Traidenis'}
                      </span>
                      {message.role === 'user' && message.queryType && (
                        <span className="text-xs opacity-75 bg-white/20 px-1.5 py-0.5 rounded">
                          {message.queryType}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs opacity-75">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                      {/* Accept/Reject buttons for commercial responses */}
                      {message.role === 'assistant' &&
                       currentThread &&
                       isLatestCommercialMessage(currentThread.id, message.id) &&
                       !isMessageAccepted(currentThread.id, message.id) && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button
                            onClick={() => handleAcceptOffer(message.id, message.content)}
                            className="p-1 rounded hover:bg-green-200 text-green-600 transition-colors"
                            title="Accept this commercial offer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRejectOffer()}
                            className="p-1 rounded hover:bg-red-200 text-red-600 transition-colors"
                            title="Reject and request changes"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {/* Show accepted indicator */}
                      {message.role === 'assistant' &&
                       currentThread &&
                       isMessageAccepted(currentThread.id, message.id) && (
                        <span className="text-xs text-green-600 ml-2 flex items-center">
                          <Check className="w-3 h-3 mr-1" />
                          Saved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isStreaming && streamingContent && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs opacity-75">Traidenis</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
                    <div className="flex items-center space-x-1 mt-1">
                      <div className="w-1 h-1 bg-gray-600 rounded-full animate-pulse" />
                      <div className="w-1 h-1 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1 h-1 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}

              {loading && !isStreaming && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs opacity-75">Traidenis</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className="text-sm text-gray-700 animate-breathe"
                        style={{
                          animation: 'breathe 2s ease-in-out infinite',
                        }}
                      >
                        {LOADING_MESSAGES[loadingMessageIndex]}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* CSS for breathing animation and tooltip bounce */}
              <style>{`
                @keyframes breathe {
                  0%, 100% {
                    opacity: 0.4;
                  }
                  50% {
                    opacity: 1;
                  }
                }
                .animate-breathe {
                  animation: breathe 2s ease-in-out infinite;
                }
                @keyframes bounce-subtle {
                  0%, 100% {
                    transform: translateY(0);
                  }
                  50% {
                    transform: translateY(-4px);
                  }
                }
                .animate-bounce-subtle {
                  animation: bounce-subtle 2s ease-in-out infinite;
                }
              `}</style>

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input with Query Type Tag */}
            <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex space-x-3">
                <div className="flex-1 flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-green-500 focus-within:border-transparent bg-white">
                  {/* Query Type Tag with Dropdown */}
                  <div
                    className="relative"
                    ref={tagDropdownRef}
                    onMouseEnter={() => {
                      if (!loading) {
                        setShowTagDropdown(true);
                        // Also dismiss tooltip when user discovers the dropdown
                        if (showQueryTooltip) {
                          dismissQueryTooltip();
                        }
                      }
                    }}
                    onMouseLeave={() => setShowTagDropdown(false)}
                  >
                    {/* First-time user tooltip */}
                    {showQueryTooltip && (
                      <div className="absolute bottom-full left-0 mb-2 z-50 animate-bounce-subtle">
                        <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span>Pasirinkite užklausos tipą prieš rašant</span>
                            <button
                              onClick={dismissQueryTooltip}
                              className="text-gray-400 hover:text-white ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Arrow pointing down */}
                          <div className="absolute top-full left-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-900" />
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      className="flex items-center space-x-1 px-3 py-2 bg-blue-100 text-blue-700 font-medium text-sm rounded-l-lg hover:bg-blue-200 transition-colors border-r border-gray-200 disabled:opacity-50"
                    >
                      <span>{currentQueryTag.tag}</span>
                      <ChevronUp className="w-3 h-3" />
                    </button>

                    {/* Dropdown Menu (drops UP since input is at bottom) */}
                    {showTagDropdown && (
                      <div className="absolute bottom-full left-0 z-50 pb-2">
                        {/* pb-2 creates invisible bridge to prevent hover gap issues */}
                        <div className="w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                            Pasirinkite užklausos tipą
                          </div>
                          {QUERY_TAGS.map((tag) => (
                            <button
                              key={tag.tag}
                              type="button"
                              onClick={() => handleTagSelect(tag)}
                              className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${
                                currentQueryTag.tag === tag.tag ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-medium text-sm ${currentQueryTag.tag === tag.tag ? 'text-blue-700' : 'text-gray-700'}`}>
                                  {tag.tag}
                                </span>
                                <span className="text-xs text-gray-500">{tag.label}</span>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{tag.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Text Input */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-3 py-2 border-0 focus:ring-0 focus:outline-none rounded-r-lg"
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !newMessage.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No chat selected
              </h3>
              <p className="text-gray-500">
                Select a chat from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}