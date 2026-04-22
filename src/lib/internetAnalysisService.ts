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

export class InternetAnalysisConfigError extends Error {
  reason: string;
  promptContent: string;
  toolSchemaContent: string;
  resolvedPrompt?: string;

  constructor(params: {
    reason: string;
    promptContent: string;
    toolSchemaContent: string;
    resolvedPrompt?: string;
  }) {
    super(params.reason);
    this.name = 'InternetAnalysisConfigError';
    this.reason = params.reason;
    this.promptContent = params.promptContent;
    this.toolSchemaContent = params.toolSchemaContent;
    this.resolvedPrompt = params.resolvedPrompt;
  }
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
  allowed_callers?: unknown;
  max_uses?: unknown;
}

const PROMPT_KEYS: Record<InternetAnalysisId, string> = {
  nafta: 'kainos_ai_nafta_prompt',
  politika: 'kainos_ai_geo_prompt',
  kainos: 'kainos_ai_prediction_prompt',
};

const ALLOWED_PROMPT_VARS = new Set(['today', 'oilAnalysis', 'geoPolitical', 'latestPrices', 'materialList']);
const inFlightAnalyses = new Set<InternetAnalysisId>();
const WEB_SEARCH_MAX_USES_DEFAULT = 1;
const WEB_SEARCH_MAX_USES_LIMIT = 3;

interface PriceHistoryRowLite {
  artikulas: string;
  kaina_min: number | null;
  kaina_max: number | null;
  data: string;
}

interface MaterialRowLite {
  artikulas: string;
  pavadinimas: string;
  vienetas: string;
}

export function buildLatestPricesSummary(rows: PriceHistoryRowLite[]): string {
  if (!rows.length) return 'Nėra kainų duomenų.';

  const byArt = new Map<string, PriceHistoryRowLite[]>();
  for (const row of rows) {
    if (!row.artikulas) continue;
    if (!byArt.has(row.artikulas)) byArt.set(row.artikulas, []);
    byArt.get(row.artikulas)!.push(row);
  }

  const lines: string[] = [];
  for (const [artikulas, artRows] of Array.from(byArt.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const latestDate = artRows.reduce((max, r) => (r.data > max ? r.data : max), '');
    const latestRows = artRows.filter((r) => r.data === latestDate);

    const mins = latestRows.map((r) => Number(r.kaina_min)).filter((v) => Number.isFinite(v));
    const maxs = latestRows.map((r) => Number(r.kaina_max)).filter((v) => Number.isFinite(v));

    const avgMin = mins.length > 0 ? mins.reduce((a, b) => a + b, 0) / mins.length : null;
    const avgMax = maxs.length > 0 ? maxs.reduce((a, b) => a + b, 0) / maxs.length : null;

    const minText = avgMin != null ? `kaina_min=${avgMin.toFixed(4)}` : 'kaina_min=—';
    const maxText = avgMax != null ? `kaina_max=${avgMax.toFixed(4)}` : 'kaina_max=—';
    lines.push(`- ${artikulas}: ${minText}, ${maxText} @ ${latestDate || 'nežinoma data'}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'Nėra kainų duomenų.';
}

export function buildMaterialListSummary(rows: MaterialRowLite[]): string {
  if (!rows.length) return 'Nėra medžiagų sąrašo.';
  return rows
    .filter((row) => row.artikulas && row.pavadinimas)
    .sort((a, b) => a.artikulas.localeCompare(b.artikulas))
    .map((row) => `- ${row.artikulas} | ${row.pavadinimas} | ${row.vienetas || '—'}`)
    .join('\n');
}

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

async function getRuntimePrompt(
  analysisId: InternetAnalysisId,
  templateRaw: string,
  toolSchemaRaw: string
): Promise<string> {
  const template = templateRaw.trim();
  if (!template) {
    throw new InternetAnalysisConfigError({
      reason: `Promptas ${PROMPT_KEYS[analysisId]} yra tuščias arba neužpildytas.`,
      promptContent: templateRaw,
      toolSchemaContent: toolSchemaRaw,
    });
  }

  const detectedVars = findTemplateVars(template);
  const invalidVars = detectedVars.filter((v) => !ALLOWED_PROMPT_VARS.has(v));
  if (invalidVars.length > 0) {
    throw new InternetAnalysisConfigError({
      reason: `Prompte naudojami neleistini kintamieji: ${invalidVars.join(', ')}`,
      promptContent: templateRaw,
      toolSchemaContent: toolSchemaRaw,
    });
  }

  const [oil, geo] = await Promise.all([
    db.from('medziagos_analize_internetas').select('content').eq('id', 'nafta').single(),
    db.from('medziagos_analize_internetas').select('content').eq('id', 'politika').single(),
  ]);

  let latestPrices = '';
  let materialList = '';
  if (detectedVars.includes('latestPrices')) {
    const { data: priceRows, error: priceError } = await db
      .from('medziagos_kainu_istorija')
      .select('artikulas,kaina_min,kaina_max,data')
      .limit(-1);
    if (priceError) throw priceError;
    latestPrices = buildLatestPricesSummary((priceRows || []) as PriceHistoryRowLite[]);
  }
  if (detectedVars.includes('materialList')) {
    const { data: materials, error: materialsError } = await db
      .from('medziagos')
      .select('artikulas,pavadinimas,vienetas')
      .limit(-1);
    if (materialsError) throw materialsError;
    materialList = buildMaterialListSummary((materials || []) as MaterialRowLite[]);
  }

  const values: Record<string, string> = {
    today: new Date().toISOString().split('T')[0],
    oilAnalysis: typeof oil.data?.content === 'string' ? oil.data.content : '',
    geoPolitical: typeof geo.data?.content === 'string' ? geo.data.content : '',
    latestPrices,
    materialList,
  };

  const resolvedPrompt = interpolateTemplate(template, values);

  // kainos prediction should not run with missing upstream context if prompt needs it.
  if (analysisId === 'kainos') {
    if (detectedVars.includes('oilAnalysis') && !values.oilAnalysis.trim()) {
      throw new InternetAnalysisConfigError({
        reason: 'Kainų prognozei trūksta naftos analizės turinio.',
        promptContent: templateRaw,
        toolSchemaContent: toolSchemaRaw,
        resolvedPrompt,
      });
    }
    if (detectedVars.includes('geoPolitical') && !values.geoPolitical.trim()) {
      throw new InternetAnalysisConfigError({
        reason: 'Kainų prognozei trūksta geopolitinės analizės turinio.',
        promptContent: templateRaw,
        toolSchemaContent: toolSchemaRaw,
        resolvedPrompt,
      });
    }
  }

  return resolvedPrompt;
}

function validateToolSchemas(
  tools: unknown[],
  promptContent: string,
  toolSchemaContent: string
): Anthropic.Tool[] {
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
        throw new InternetAnalysisConfigError({
          reason: `Nepalaikomas tool tipas: ${type}`,
          promptContent,
          toolSchemaContent,
        });
      }
      if (!name) {
        throw new InternetAnalysisConfigError({
          reason: `Netinkama tool schema (${type}): trūksta name.`,
          promptContent,
          toolSchemaContent,
        });
      }
      const callers = Array.isArray(tool.allowed_callers)
        ? tool.allowed_callers.filter((v) => typeof v === 'string')
        : [];
      const normalizedCallers = callers.length > 0 ? callers : ['direct'];
      if (!normalizedCallers.includes('direct')) normalizedCallers.push('direct');

      const rawMaxUses = tool.max_uses;
      const numericMaxUses =
        typeof rawMaxUses === 'number' && Number.isFinite(rawMaxUses)
          ? Math.trunc(rawMaxUses)
          : WEB_SEARCH_MAX_USES_DEFAULT;
      if (numericMaxUses < 1 || numericMaxUses > WEB_SEARCH_MAX_USES_LIMIT) {
        throw new InternetAnalysisConfigError({
          reason: `Netinkama tool schema (${type}): max_uses turi būti 1-${WEB_SEARCH_MAX_USES_LIMIT}.`,
          promptContent,
          toolSchemaContent,
        });
      }

      validated.push({
        ...(tool as any),
        allowed_callers: normalizedCallers,
        max_uses: numericMaxUses,
      } as Anthropic.Tool);
      continue;
    }

    // Custom tool schema
    if (!name) throw new InternetAnalysisConfigError({
      reason: 'Netinkama tool schema: trūksta name.',
      promptContent,
      toolSchemaContent,
    });
    if (!description) throw new InternetAnalysisConfigError({
      reason: `Netinkama tool schema (${name}): trūksta description.`,
      promptContent,
      toolSchemaContent,
    });
    if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
      throw new InternetAnalysisConfigError({
        reason: `Netinkama tool schema (${name}): input_schema turi būti objektas.`,
        promptContent,
        toolSchemaContent,
      });
    }
    validated.push(tool as Anthropic.Tool);
  }

  return validated;
}

async function getDynamicTools(
  promptContent: string,
  toolSchemaRaw: string
): Promise<Anthropic.Tool[]> {
  if (!toolSchemaRaw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolSchemaRaw);
  } catch {
    throw new InternetAnalysisConfigError({
      reason: 'kainos_ai_tool_schemas nėra validus JSON.',
      promptContent,
      toolSchemaContent: toolSchemaRaw,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new InternetAnalysisConfigError({
      reason: 'kainos_ai_tool_schemas turi būti JSON masyvas.',
      promptContent,
      toolSchemaContent: toolSchemaRaw,
    });
  }
  return validateToolSchemas(parsed, promptContent, toolSchemaRaw);
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

  try {
    const promptVar = await getInstructionVariable(PROMPT_KEYS[analysisId]);
    const toolsVar = await getInstructionVariable('kainos_ai_tool_schemas');
    const promptContent = promptVar?.content ?? '';
    const toolSchemaContent = toolsVar?.content ?? '';
    const prompt = await getRuntimePrompt(analysisId, promptContent, toolSchemaContent);
    const tools = await getDynamicTools(promptContent, toolSchemaContent);
    const apiKey = String(import.meta.env.VITE_ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      throw new InternetAnalysisConfigError({
        reason: 'Nerastas ANTHROPIC API raktas. Netlify aplinkoje nustatykite VITE_ANTHROPIC_API_KEY.',
        promptContent,
        toolSchemaContent,
        resolvedPrompt: prompt,
      });
    }

    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

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
        message: err.message,
      });
      throw new Error(`Anthropic API klaida (${err.status ?? 'unknown'}): ${err.message || 'Neteisinga užklausa.'}`);
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
