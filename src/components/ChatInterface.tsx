import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Plus,
  MessageSquare,
  Bot,
  User as UserIcon,
  Loader2
} from 'lucide-react';
import { createChatThread, sendMessage, getChatThreads, getChatMessages } from '../lib/supabase';
import { appLogger } from '../lib/appLogger';
import type { AppUser } from '../types';

interface ChatInterfaceProps {
  user: AppUser;
  projectId: string;
}

interface Thread {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  author_ref?: string;
}

type QueryType = 'Komercinio pasiūlymo užklausa' | 'Bendra užklausa' | 'Nestandartinių gaminių užklausa' | null;

export default function ChatInterface({ user, projectId }: ChatInterfaceProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showQueryTypeModal, setShowQueryTypeModal] = useState(false);
  const [selectedQueryType, setSelectedQueryType] = useState<QueryType>(null);
  const [pendingMessage, setPendingMessage] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Load threads on component mount
  useEffect(() => {
    loadThreads();
  }, [projectId]);

  // Load messages when thread changes
  useEffect(() => {
    if (currentThread) {
      loadMessages(currentThread.id);
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

  const scrollToBottom = () => {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const loadThreads = async () => {
    try {
      setThreadsLoading(true);
      console.log('Loading threads for project:', projectId);
      
      const { data, error } = await getChatThreads(projectId);
      
      if (error) {
        console.error('Error loading threads:', error);
        setThreads([]);
        return;
      }

      console.log('Loaded threads:', data);
      setThreads(data || []);
      
      // Auto-select first thread if none selected
      if (!currentThread && data && data.length > 0) {
        setCurrentThread(data[0]);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setThreadsLoading(false);
    }
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

  const createNewThread = async () => {
    try {
      setCreating(true);
      console.log('Creating new thread for project:', projectId, 'user:', user.email);
      
      const title = `New Chat ${new Date().toLocaleString()}`;
      const { data: threadId, error } = await createChatThread(projectId, title, user.email || '');

      if (error) {
        console.error('Error creating thread:', error);
        return;
      }

      console.log('Created thread with ID:', threadId);

      // Log thread creation
      await appLogger.logChat({
        action: 'thread_created',
        userId: user.id,
        userEmail: user.email,
        threadId: threadId || 'unknown',
        metadata: { title, project_id: projectId }
      });

      // Reload threads
      await loadThreads();
      
      // Find and select the new thread
      const { data: updatedThreads } = await getChatThreads(projectId);
      const newThread = updatedThreads?.find(t => t.id === threadId);
      
      if (newThread) {
        setCurrentThread(newThread);
        setMessages([]);
      } else {
        // Fallback: select the first thread
        if (updatedThreads && updatedThreads.length > 0) {
          setCurrentThread(updatedThreads[0]);
        }
      }
    } catch (error) {
      console.error('Error creating thread:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentThread || loading) return;

    // Show query type selection modal
    setPendingMessage(newMessage.trim());
    setNewMessage('');
    setShowQueryTypeModal(true);
  };

  const handleQueryTypeSelected = async (queryType: QueryType) => {
    if (!queryType || !pendingMessage || !currentThread) return;

    setSelectedQueryType(queryType);
    setShowQueryTypeModal(false);
    setLoading(true);

    try {
      console.log('Sending message:', pendingMessage, 'to thread:', currentThread.id, 'with query type:', queryType);

      // Add user message to UI immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: pendingMessage,
        timestamp: new Date().toISOString(),
        author_ref: user.email || ''
      };
      setMessages(prev => [...prev, userMessage]);

      // Save user message to chat_history
      const { error: userMessageError } = await sendMessage(
        projectId,
        currentThread.id,
        pendingMessage,
        'user',
        user.email || ''
      );

      if (userMessageError) {
        console.error('Error saving user message:', userMessageError);
      }

      // Log user message sent
      await appLogger.logChat({
        action: 'message_sent',
        userId: user.id,
        userEmail: user.email,
        threadId: currentThread.id,
        messagePreview: pendingMessage,
        queryType: queryType || undefined,
        metadata: { message_length: pendingMessage.length }
      });

      // Send to webhook with streaming
      try {
        console.log('Sending to webhook...');

        // Create streaming message ID
        const streamingMessageId = (Date.now() + 1).toString();
        streamingMessageIdRef.current = streamingMessageId;

        // Start streaming
        setIsStreaming(true);
        setStreamingContent('');

        const webhookUrl = 'https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6';
        const startTime = Date.now();

        await appLogger.logChat({
          action: 'response_started',
          userId: user.id,
          userEmail: user.email,
          threadId: currentThread.id,
          messagePreview: pendingMessage,
          queryType: queryType || undefined,
          metadata: { webhook_url: webhookUrl }
        });

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            question: pendingMessage,
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
          const aiMessage: Message = {
            id: streamingMessageId,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
            author_ref: 'ai-assistant'
          };

          console.log('Adding AI message to state...');
          setMessages(prev => [...prev, aiMessage]);

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
            'ai-assistant'
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
            const aiMessage: Message = {
              id: streamingMessageId,
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date().toISOString(),
              author_ref: 'ai-assistant'
            };
            setMessages(prev => [...prev, aiMessage]);

            // Save the streaming content
            await sendMessage(
              projectId,
              currentThread.id,
              streamingContent,
              'assistant',
              'ai-assistant'
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
          messagePreview: pendingMessage,
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
            message: pendingMessage
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
      await loadThreads();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
      setPendingMessage('');
      setSelectedQueryType(null);
    }
  };

  const queryTypes: QueryType[] = [
    'Komercinio pasiūlymo užklausa',
    'Bendra užklausa',
    'Nestandartinių gaminių užklausa'
  ];

  return (
    <div className="flex h-full bg-white relative overflow-hidden">
      {/* Left Sidebar - Threads */}
      <div className="w-80 border-r border-gray-200 flex flex-col min-h-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Chats</h2>
            <button
              onClick={createNewThread}
              disabled={creating}
              className="p-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Threads List - with max height to prevent infinite expansion */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-200px)]">
          {threadsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-2">No chats yet</p>
              <button
                onClick={createNewThread}
                disabled={creating}
                className="text-sm text-green-600 hover:text-green-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Start your first chat'}
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setCurrentThread(thread)}
                  className={`
                    w-full text-left p-3 rounded-lg transition-colors
                    ${currentThread?.id === thread.id
                      ? 'bg-gradient-to-r from-green-50 to-blue-50 border border-green-200'
                      : 'hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {thread.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {thread.message_count || 0} messages
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(thread.last_message_at || thread.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {currentThread ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {currentThread.title}
              </h3>
              <p className="text-sm text-gray-500">
                {currentThread.message_count || 0} messages
              </p>
            </div>

            {/* Messages Area - with max height to prevent infinite expansion */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-280px)]">
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
                        {message.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-75 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}

              {isStreaming && streamingContent && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs opacity-75">AI Assistant</span>
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
                    <div className="flex items-center space-x-2">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs">AI Assistant</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex space-x-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loading}
                />
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
              <p className="text-gray-500 mb-4">
                Choose a chat from the sidebar or create a new one
              </p>
              <button
                onClick={createNewThread}
                disabled={creating}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Start New Chat'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Query Type Selection Modal */}
      {showQueryTypeModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Pasirinkite užklausos tipą
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Prieš siųsdami žinutę, pasirinkite užklausos kategorią:
            </p>
            <div className="space-y-3">
              {queryTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => handleQueryTypeSelected(type)}
                  className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all"
                >
                  <span className="font-medium text-gray-900">{type}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setShowQueryTypeModal(false);
                setNewMessage(pendingMessage);
                setPendingMessage('');
              }}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Atšaukti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}