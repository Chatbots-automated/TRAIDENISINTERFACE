import { useCallback, useEffect, useState } from 'react';
import { getDefaultOfferParameters, loadOfferParameters, saveOfferParameters } from '../../lib/offerParametersService';

export function useOfferParameters(currentConversationId?: string) {
  const [offerParameters, setOfferParameters] = useState<Record<string, string>>(getDefaultOfferParameters());
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({ offerData: true, objectParams: true });

  useEffect(() => {
    if (currentConversationId) {
      setOfferParameters(loadOfferParameters(currentConversationId));
    } else {
      setOfferParameters(getDefaultOfferParameters());
    }
  }, [currentConversationId]);

  const persistOfferParameters = useCallback((conversationId: string | undefined, updated: Record<string, string>) => {
    setOfferParameters(updated);
    if (conversationId) {
      saveOfferParameters(conversationId, updated);
    }
  }, []);

  const updateOfferParameter = useCallback((conversationId: string | undefined, key: string, value: string) => {
    setOfferParameters(prev => {
      const updated = { ...prev, [key]: value };
      if (conversationId) {
        saveOfferParameters(conversationId, updated);
      }
      return updated;
    });
  }, []);

  return {
    offerParameters,
    setOfferParameters,
    sectionCollapsed,
    setSectionCollapsed,
    persistOfferParameters,
    updateOfferParameter
  };
}
