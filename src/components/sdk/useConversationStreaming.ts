import { useCallback, useEffect, useState } from 'react';

export function useConversationStreaming(currentConversationId?: string) {
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingContentByConversation, setStreamingContentByConversation] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!currentConversationId) {
      setStreamingContent('');
      return;
    }
    setStreamingContent(streamingContentByConversation[currentConversationId] || '');
  }, [currentConversationId, streamingContentByConversation]);

  const setConversationStreamingContent = useCallback((conversationId: string, content: string) => {
    setStreamingContentByConversation(prev => {
      if (content) return { ...prev, [conversationId]: content };
      if (!(conversationId in prev)) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  return {
    streamingContent,
    setConversationStreamingContent
  };
}
