import Anthropic from '@anthropic-ai/sdk';
import { db } from './database';
import { getInstructionVariable } from './instructionsService';

export type InternetAnalysisId = 'nafta' | 'politika' | 'kainos';

export interface InternetAnalysisRecord {
  id: InternetAnalysisId;
  content: string;
  tokens: string | null;
  date_updated: string | null;
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface ToolSchemaCandidate {
  type?: unknown;
  name?: unknown;
  description?: unknown;
  input_schema?: unknown;
}

const PROMPT_KEYS: Record<InternetAnalysisId, string> = {
  nafta: 'kainos_ai_nafta_prompt',
  politika: 'kainos_ai_geo_prompt',
  kainos: 'kainos_ai_prediction_prompt',
};

const ALLOWED_PROMPT_VARS = new Set(['today', 'oilAnalysis', 'geoPolitical']);
const inFlightAnalyses = new Set<InternetAnalysisId>();

function extractResponseText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const textBlocks = content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => String(block.text).trim())
    .filter(Boolean);

  // Deterministic join: preserve paragraph-level spacing between text blocks.
  return textBlocks.join('\n\n').trim();
}

function findTemplateVars(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{|\}|\s/g, ''))));
}

function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => values[key] ?? '');
}

export function parseTokenUsage(tokensRaw: string | null): { input: number; output: number; total: number } | null {
  if (!tokensRaw) return null;
  try {
    const parsed = JSON.parse(tokensRaw) as TokenUsage;
    const input = Number(parsed.input_tokens || 0);
    const output = Number(parsed.output_tokens || 0);
    if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
    const persistedTotal = Number(parsed.total_tokens);
    const total = Number.isFinite(persistedTotal) ? persistedTotal : input + output;
    return { input, output, total };
  } catch {
    return null;
  }
}

export async function fetchInternetAnalyses(): Promise<InternetAnalysisRecord[]> {
  const { data, error } = await db
    .from('medziagos_analize_internetas')
    .select('id,content,tokens,date_updated')
    .limit(-1);

  if (error) throw error;
  return (data || []) as InternetAnalysisRecord[];
}

async function getRuntimePrompt(analysisId: InternetAnalysisId): Promise<string> {
  const promptVar = await getInstructionVariable(PROMPT_KEYS[analysisId]);
  const template = promptVar?.content?.trim();
  if (!template) {
    throw new Error(`Nerastas promptas: ${PROMPT_KEYS[analysisId]}`);
  }

  const detectedVars = findTemplateVars(template);
  const invalidVars = detectedVars.filter((v) => !ALLOWED_PROMPT_VARS.has(v));
  if (invalidVars.length > 0) {
    throw new Error(`Prompte naudojami neleistini kintamieji: ${invalidVars.join(', ')}`);
  }

  const [oil, geo] = await Promise.all([
    db.from('medziagos_analize_internetas').select('content').eq('id', 'nafta').single(),
    db.from('medziagos_analize_internetas').select('content').eq('id', 'politika').single(),
  ]);

  const values: Record<string, string> = {
    today: new Date().toISOString().split('T')[0],
    oilAnalysis: typeof oil.data?.content === 'string' ? oil.data.content : '',
    geoPolitical: typeof geo.data?.content === 'string' ? geo.data.content : '',
  };

  // kainos prediction should not run with missing upstream context if prompt needs it.
  if (analysisId === 'kainos') {
    if (detectedVars.includes('oilAnalysis') && !values.oilAnalysis.trim()) {
      throw new Error('Kainų prognozei trūksta naftos analizės turinio.');
    }
    if (detectedVars.includes('geoPolitical') && !values.geoPolitical.trim()) {
      throw new Error('Kainų prognozei trūksta geopolitinės analizės turinio.');
    }
  }

  return interpolateTemplate(template, values);
}

function validateToolSchemas(tools: unknown[]): Anthropic.Tool[] {
  const validated: Anthropic.Tool[] = [];

  for (const candidate of tools) {
    const tool = candidate as ToolSchemaCandidate;
    const type = typeof tool.type === 'string' ? tool.type.trim() : '';
    const name = typeof tool.name === 'string' ? tool.name.trim() : '';
    const description = typeof tool.description === 'string' ? tool.description.trim() : '';
    const inputSchema = tool.input_schema;

    // Built-in web search tool schema
    if (type) {
      if (!type.startsWith('web_search_')) {
        throw new Error(`Nepalaikomas tool tipas: ${type}`);
      }
      if (!name) {
        throw new Error(`Netinkama tool schema (${type}): trūksta name.`);
      }
      validated.push(tool as Anthropic.Tool);
      continue;
    }

    // Custom tool schema
    if (!name) throw new Error('Netinkama tool schema: trūksta name.');
    if (!description) throw new Error(`Netinkama tool schema (${name}): trūksta description.`);
    if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
      throw new Error(`Netinkama tool schema (${name}): input_schema turi būti objektas.`);
    }
    validated.push(tool as Anthropic.Tool);
  }

  return validated;
}

async function getDynamicTools(): Promise<Anthropic.Tool[]> {
  const toolsVar = await getInstructionVariable('kainos_ai_tool_schemas');
  if (!toolsVar?.content?.trim()) return [];

  const parsed = JSON.parse(toolsVar.content);
  if (!Array.isArray(parsed)) {
    throw new Error('kainos_ai_tool_schemas turi būti JSON masyvas');
  }
  return validateToolSchemas(parsed);
}

function getToolResultErrors(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block: any) => block?.type === 'web_search_tool_result_error')
    .map((block: any) => String(block?.error || block?.message || 'Įrankio klaida'))
    .filter(Boolean);
}

export async function runInternetAnalysis(analysisId: InternetAnalysisId): Promise<void> {
  if (inFlightAnalyses.has(analysisId)) {
    throw new Error('Ši analizė jau vykdoma. Palaukite kol baigsis.');
  }
  inFlightAnalyses.add(analysisId);

  const prompt = await getRuntimePrompt(analysisId);
  const tools = await getDynamicTools();

  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      ...(tools.length > 0 ? { tools } : {}),
    });

    const toolErrors = getToolResultErrors(response.content);
    if (toolErrors.length > 0) {
      throw new Error(`Įrankio klaida: ${toolErrors[0]}`);
    }

    const content = extractResponseText(response.content);
    if (!content.trim()) {
      throw new Error('DI atsakymas neturi tekstinio turinio.');
    }
    const usage = response.usage || {};
    const inputTokens = Number((usage as any).input_tokens || 0);
    const outputTokens = Number((usage as any).output_tokens || 0);
    const tokens = JSON.stringify({
      input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      total_tokens: (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0),
    });

    const { error } = await db
      .from('medziagos_analize_internetas')
      .update({ content, tokens, date_updated: new Date().toISOString() })
      .eq('id', analysisId);

    if (error) throw error;
  } catch (err: unknown) {
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic APIError', {
        status: err.status,
        name: err.name,
        headers: err.headers,
      });
      throw new Error('Nepavyko gauti DI atsakymo. Patikrinkite API konfigūraciją arba bandykite vėliau.');
    }
    throw err;
  } finally {
    inFlightAnalyses.delete(analysisId);
  }
}

export function validatePromptVariablesForEditor(template: string): string[] {
  const detectedVars = findTemplateVars(template);
  return detectedVars.filter((v) => !ALLOWED_PROMPT_VARS.has(v));
}
