import type { AppUser } from '../types';
import {
  createInstructionVariable,
  getInstructionVariable,
  saveInstructionVariable,
} from './instructionsService';

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_MODEL_VARIABLE_KEY = 'app_claude_model';

const normalizeModel = (model: string | null | undefined): string => {
  const trimmed = String(model || '').trim();
  return trimmed || DEFAULT_CLAUDE_MODEL;
};

export async function getClaudeModel(): Promise<string> {
  const variable = await getInstructionVariable(CLAUDE_MODEL_VARIABLE_KEY);
  return normalizeModel(variable?.content);
}

export async function saveClaudeModel(model: string, user: AppUser): Promise<{ success: boolean; error?: string }> {
  const normalizedModel = normalizeModel(model);
  const existing = await getInstructionVariable(CLAUDE_MODEL_VARIABLE_KEY);

  if (existing) {
    return saveInstructionVariable(
      CLAUDE_MODEL_VARIABLE_KEY,
      normalizedModel,
      user.id,
      user.email,
      false
    );
  }

  return createInstructionVariable(
    {
      variable_key: CLAUDE_MODEL_VARIABLE_KEY,
      variable_name: 'Claude API modelis',
      description: 'Bendras Claude modelis SDK pokalbiui ir analizių generavimui.',
      content: normalizedModel,
      display_order: 900,
    },
    user.id,
    user.email,
    false
  );
}
