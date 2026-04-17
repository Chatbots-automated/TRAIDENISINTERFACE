import { useEffect, useRef, useState } from 'react';
import type { AppUserData } from '../../lib/userService';
import { loadTeamSelection, saveTeamSelection } from './sdkInterfaceUtils';

interface UseTeamSelectionParams {
  currentConversationId?: string;
  economists: AppUserData[];
  managers: AppUserData[];
}

export function useTeamSelection({ currentConversationId, economists, managers }: UseTeamSelectionParams) {
  const [selectedEconomist, setSelectedEconomist] = useState<AppUserData | null>(null);
  const [selectedManager, setSelectedManager] = useState<AppUserData | null>(null);
  const skipTeamSave = useRef(true);

  useEffect(() => {
    if (currentConversationId) {
      const team = loadTeamSelection(currentConversationId);
      setSelectedEconomist(team.economistId ? economists.find(e => e.id === team.economistId) || null : null);
      setSelectedManager(team.managerId ? managers.find(m => m.id === team.managerId) || null : null);
    } else {
      setSelectedEconomist(null);
      setSelectedManager(null);
    }
  }, [currentConversationId, economists, managers]);

  useEffect(() => {
    if (skipTeamSave.current) {
      skipTeamSave.current = false;
      return;
    }

    if (!currentConversationId) return;
    saveTeamSelection(currentConversationId, selectedManager?.id || null, selectedEconomist?.id || null);
  }, [currentConversationId, selectedManager?.id, selectedEconomist?.id]);

  useEffect(() => {
    skipTeamSave.current = true;
  }, [currentConversationId]);

  return {
    selectedEconomist,
    setSelectedEconomist,
    selectedManager,
    setSelectedManager
  };
}
