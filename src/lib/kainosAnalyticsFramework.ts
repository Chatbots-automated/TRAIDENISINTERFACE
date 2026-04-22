import Anthropic from '@anthropic-ai/sdk';
import { getInstructionVariable } from './instructionsService';

export type AnalyticsStepKey = 'nafta' | 'geo' | 'analysis';

export interface ExtractedCitation {
  title: string;
  url: string;
  citedText?: string;
}

export interface SdkStepResult {
  text: string;
  citations: ExtractedCitation[];
  stopReason: string | null;
}

const PROMPT_KEYS: Record<AnalyticsStepKey, string> = {
  nafta: 'kainos_ai_nafta_prompt',
  geo: 'kainos_ai_geo_prompt',
  analysis: 'kainos_ai_analysis_prompt',
};

export function injectPromptVars(template: string, vars: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.split(`{{${key}}}`).join(value);
  }
  return output;
}

export function findUnresolvedPromptVars(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, '').trim())));
}

export function extractTextAndCitationsFromMessage(contentBlocks: any[]): Pick<SdkStepResult, 'text' | 'citations'> {
  let text = '';
  const citations: ExtractedCitation[] = [];

  for (const block of contentBlocks || []) {
    if (block?.type !== 'text') continue;
    if (typeof block.text === 'string') text += `${block.text}\n`;
    if (!Array.isArray(block.citations)) continue;

    for (const citation of block.citations) {
      const title = citation?.title || citation?.document_title || 'Šaltinis';
      const url = citation?.url || citation?.source_url;
      const citedText = citation?.cited_text;
      if (!url) continue;
      if (!citations.some((existing) => existing.url === url && existing.title === title)) {
        citations.push({
          title: String(title),
          url: String(url),
          citedText: citedText ? String(citedText) : undefined,
        });
      }
    }
  }

  return { text: text.trim(), citations };
}

export async function fetchAnalyticsPromptTemplates(): Promise<Record<AnalyticsStepKey, string>> {
  const [naftaVar, geoVar, analysisVar] = await Promise.all([
    getInstructionVariable(PROMPT_KEYS.nafta),
    getInstructionVariable(PROMPT_KEYS.geo),
    getInstructionVariable(PROMPT_KEYS.analysis),
  ]);

  const templates = {
    nafta: naftaVar?.content?.trim() || '',
    geo: geoVar?.content?.trim() || '',
    analysis: analysisVar?.content?.trim() || '',
  };

  if (!templates.nafta || !templates.geo || !templates.analysis) {
    throw new Error('Trūksta promptų instruction_variables lentelėje. Užpildykite: kainos_ai_nafta_prompt, kainos_ai_geo_prompt, kainos_ai_analysis_prompt.');
  }

  return templates;
}

export async function fetchKainosToolSchemas(): Promise<Anthropic.Tool[]> {
  const schemaVar = await getInstructionVariable('kainos_ai_tool_schemas');
  if (!schemaVar?.content?.trim()) return [];

  const parsed = JSON.parse(schemaVar.content);
  if (!Array.isArray(parsed)) {
    throw new Error('kainos_ai_tool_schemas turi būti JSON masyvas');
  }

  return parsed as Anthropic.Tool[];
}

export async function runSdkRequest(
  client: Anthropic,
  model: string,
  prompt: string,
  maxTokens: number,
  tools?: Anthropic.Tool[]
): Promise<SdkStepResult> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    ...(tools && tools.length > 0 ? { tools } : {}),
  });

  const extracted = extractTextAndCitationsFromMessage(response.content as any[]);

  return {
    text: extracted.text,
    citations: extracted.citations,
    stopReason: typeof response.stop_reason === 'string' ? response.stop_reason : null,
  };
}
