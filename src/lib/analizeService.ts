/**
 * ============================================================================
 * ANALIZĖ SERVICE — Directus-backed LlamaParse files, configs and extractions
 * ============================================================================
 *
 * Directus does not need relationship wiring for this module. The app stores
 * parent ids as plain UUID/string fields and manually joins the pieces it needs.
 * ============================================================================
 */

import { db } from './database';
import type { ParsedDocument, ParseTier, ParseStatus } from '../types';

const FILES_COLLECTION = 'llamaparse_files';
const PARSE_JOBS_COLLECTION = 'llamaparse_jobs';
const EXTRACTIONS_COLLECTION = 'llamaparse_extractions';
const EXTRACT_CONFIGS_COLLECTION = 'llamaparse_extract_configs';
const API_EVENTS_COLLECTION = 'llamaparse_api_events';

const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org').trim().replace(/\/$/, '');
const DIRECTUS_TOKEN = (import.meta.env.VITE_DIRECTUS_TOKEN || '').trim();

interface DirectusFileMeta {
  id: string;
  filename_download?: string;
  title?: string;
  type?: string;
  filesize?: number;
  uploaded_on?: string;
}

export interface CreateParsedDocumentInput {
  user_id: string;
  original_file?: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  tier: ParseTier;
  llama_file_id?: string | null;
  job_id: string;
  status: ParseStatus;
  parsed_markdown?: string;
  parsed_text?: string;
  parsed_json?: any;
  page_count?: number;
  images_metadata?: any;
  user_prompt?: string;
}

export interface LlamaParseExtraction {
  id: string;
  file_id: string;
  file_input?: string | null;
  extract_job_id: string;
  extract_status: string;
  extract_config: any;
  extract_result: any;
  extract_metadata: any;
  error_message?: string | null;
  created_at?: string;
  config_id?: string | null;
  request_json?: any;
  response_json?: any;
  status_history_json?: any;
}

export interface LlamaParseJobRecord {
  id: string;
  file_id: string;
  llama_file_id?: string | null;
  parse_job_id?: string | null;
  request_json?: any;
  response_json?: any;
  status?: string | null;
  status_history_json?: any;
  parsed_markdown?: string | null;
  parsed_text?: string | null;
  parsed_json?: any;
  images_metadata?: any;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface SaveParseJobAttemptInput {
  file_id: string;
  llama_file_id?: string | null;
  parse_job_id?: string | null;
  request_json?: any;
  response_json?: any;
  status?: string | null;
  status_history_json?: any;
  parsed_markdown?: string | null;
  parsed_text?: string | null;
  parsed_json?: any;
  images_metadata?: any;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export type UpdateParseJobAttemptInput = Partial<Omit<SaveParseJobAttemptInput, 'file_id'>>;

export interface SaveExtractConfigSnapshotInput {
  user_id: string;
  project_id?: string | null;
  name?: string;
  configuration: any;
  schema_mode: 'auto' | 'fields' | 'raw';
  extract_goal?: string;
  raw_schema_text?: string;
}

export interface SaveAnalizeApiEventInput {
  file_id?: string | null;
  job_id?: string | null;
  event_type: string;
  status?: string | null;
  request_json?: any;
  response_json?: any;
  error_message?: string | null;
}

export interface SaveExtractionRunInput {
  file_id: string;
  file_input?: string | null;
  extract_job_id: string;
  extract_status: string;
  extract_config: any;
  extract_result?: any;
  extract_metadata?: any;
  error_message?: string | null;
  config_id?: string | null;
  request_json?: any;
  response_json?: any;
  status_history_json?: any;
}

export type UpdateExtractionRunInput = Partial<Omit<SaveExtractionRunInput, 'file_id'>>;

const directusFileMetaCache = new Map<string, Promise<DirectusFileMeta | null>>();

function getOriginalFileIdFromRow(row: any): string | null {
  const originalFile = row?.original_file;
  if (typeof originalFile === 'string') return originalFile;
  if (originalFile && typeof originalFile === 'object') return originalFile.id || null;
  return row?.original_file_id || null;
}

function normalizeFile(row: any): ParsedDocument {
  const originalFile: DirectusFileMeta | string | null = row.original_file || null;
  const fileMeta = typeof originalFile === 'object' ? originalFile : null;
  const originalFileId = getOriginalFileIdFromRow(row);

  return {
    id: row.id,
    user_id: row.user_id,
    original_file: originalFile,
    original_file_id: originalFileId,
    file_name: row.file_name_snapshot || row.file_name || fileMeta?.filename_download || fileMeta?.title || 'Dokumentas',
    file_type: row.file_type_snapshot || row.file_type || fileMeta?.type || 'unknown',
    file_size: Number(row.file_size_snapshot || row.file_size || fileMeta?.filesize || 0),
    tier: row.parse_tier || row.tier || 'agentic',
    llama_file_id: row.llama_file_id || null,
    job_id: row.current_parse_job || row.parse_job_id || row.job_id || '',
    status: row.parse_status || row.status || 'PENDING',
    parsed_markdown: row.parsed_markdown || '',
    parsed_text: row.parsed_text || '',
    parsed_json: row.parsed_json || null,
    page_count: Number(row.page_count || 0),
    images_metadata: row.images_metadata || null,
    user_prompt: row.parse_user_prompt || row.user_prompt || undefined,
    created_at: row.created_at || new Date().toISOString(),
  };
}

function normalizeExtraction(row: any): LlamaParseExtraction {
  const requestJson = row.request_json || {};
  const responseJson = row.response_json || {};
  return {
    ...row,
    file_input: row.file_input || requestJson.file_input || responseJson.file_input || null,
    extract_status: row.extract_status || row.status || 'PENDING',
    extract_config: row.extract_config || row.configuration_snapshot_json || requestJson.configuration || {},
    extract_result: row.extract_result ?? responseJson.extract_result ?? responseJson.result ?? null,
    extract_metadata: row.extract_metadata ?? responseJson.extract_metadata ?? responseJson.metadata ?? null,
    error_message: row.error_message || responseJson.error_message || null,
  };
}

function normalizeParseJob(row: any): LlamaParseJobRecord {
  return {
    ...row,
    llama_file_id: row.llama_file_id || null,
    parse_job_id: row.parse_job_id || null,
    status: row.status || null,
    request_json: row.request_json || null,
    response_json: row.response_json || null,
    status_history_json: row.status_history_json || [],
    parsed_markdown: row.parsed_markdown || '',
    parsed_text: row.parsed_text || '',
    parsed_json: row.parsed_json || null,
    images_metadata: row.images_metadata || null,
    error_message: row.error_message || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

function toFileInsert(input: CreateParsedDocumentInput) {
  return {
    user_id: input.user_id,
    original_file: input.original_file || null,
    llama_file_id: input.llama_file_id || null,
    parse_tier: input.tier,
    parse_job_id: input.job_id,
    current_parse_job: input.job_id || null,
    parse_status: input.status,
    parse_user_prompt: input.user_prompt || null,
    parsed_markdown: input.parsed_markdown || '',
    parsed_text: input.parsed_text || '',
    parsed_json: input.parsed_json || null,
    images_metadata: input.images_metadata || null,
    page_count: input.page_count || 0,
    file_name_snapshot: input.file_name,
    file_type_snapshot: input.file_type,
    file_size_snapshot: String(input.file_size || 0),
  };
}

function toParseJobPayload(input: SaveParseJobAttemptInput | UpdateParseJobAttemptInput) {
  const payload: Record<string, any> = {};

  if ('file_id' in input) payload.file_id = input.file_id;
  if ('llama_file_id' in input) payload.llama_file_id = input.llama_file_id || null;
  if ('parse_job_id' in input) payload.parse_job_id = input.parse_job_id || null;
  if ('request_json' in input) payload.request_json = input.request_json || null;
  if ('response_json' in input) payload.response_json = input.response_json || null;
  if ('status' in input) payload.status = input.status || null;
  if ('status_history_json' in input) payload.status_history_json = input.status_history_json || [];
  if ('parsed_markdown' in input) payload.parsed_markdown = input.parsed_markdown || '';
  if ('parsed_text' in input) payload.parsed_text = input.parsed_text || '';
  if ('parsed_json' in input) payload.parsed_json = input.parsed_json || null;
  if ('images_metadata' in input) {
    payload.images_metadata = typeof input.images_metadata === 'string'
      ? input.images_metadata
      : input.images_metadata == null
      ? null
      : JSON.stringify(input.images_metadata);
  }
  if ('error_message' in input) payload.error_message = input.error_message || null;
  if ('started_at' in input) payload.started_at = input.started_at || null;
  if ('completed_at' in input) payload.completed_at = input.completed_at || null;

  return payload;
}

function toFileUpdate(
  updates: Partial<Pick<ParsedDocument, 'status' | 'tier' | 'llama_file_id' | 'job_id' | 'parsed_markdown' | 'parsed_text' | 'parsed_json' | 'page_count' | 'images_metadata' | 'user_prompt'>>
) {
  const data: Record<string, any> = {};
  if ('status' in updates) data.parse_status = updates.status;
  if ('tier' in updates) data.parse_tier = updates.tier;
  if ('llama_file_id' in updates) data.llama_file_id = updates.llama_file_id;
  if ('job_id' in updates) {
    data.parse_job_id = updates.job_id;
    data.current_parse_job = updates.job_id || null;
  }
  if ('user_prompt' in updates) data.parse_user_prompt = updates.user_prompt || null;
  if ('parsed_markdown' in updates) data.parsed_markdown = updates.parsed_markdown;
  if ('parsed_text' in updates) data.parsed_text = updates.parsed_text;
  if ('parsed_json' in updates) data.parsed_json = updates.parsed_json;
  if ('page_count' in updates) data.page_count = updates.page_count;
  if ('images_metadata' in updates) data.images_metadata = updates.images_metadata;
  return data;
}

function shouldRetryWithoutOptionalField(error: unknown): boolean {
  const text = JSON.stringify(error || {}).toLowerCase();
  return text.includes('invalid') || text.includes('field') || text.includes('payload') || text.includes('unknown');
}

async function insertSingleWithFieldFallback<T>(
  collection: string,
  payload: Record<string, any>,
  fallbackFieldGroups: string[][] = []
): Promise<T> {
  let currentPayload = { ...payload };
  let result = await db.from(collection).insert([currentPayload]).select('*').single();

  if (!result.error) return result.data as T;

  let lastError = result.error;
  for (const fields of fallbackFieldGroups) {
    if (!shouldRetryWithoutOptionalField(lastError)) break;
    currentPayload = { ...currentPayload };
    for (const field of fields) delete currentPayload[field];
    result = await db.from(collection).insert([currentPayload]).select('*').single();
    if (!result.error) return result.data as T;
    lastError = result.error;
  }

  throw lastError;
}

async function updateSingleWithFieldFallback<T>(
  collection: string,
  id: string,
  payload: Record<string, any>,
  fallbackFieldGroups: string[][] = []
): Promise<T> {
  let currentPayload = { ...payload };
  let result = await db.from(collection).update(currentPayload).eq('id', id).select('*').single();

  if (!result.error) return result.data as T;

  let lastError = result.error;
  for (const fields of fallbackFieldGroups) {
    if (!shouldRetryWithoutOptionalField(lastError)) break;
    currentPayload = { ...currentPayload };
    for (const field of fields) delete currentPayload[field];
    result = await db.from(collection).update(currentPayload).eq('id', id).select('*').single();
    if (!result.error) return result.data as T;
    lastError = result.error;
  }

  throw lastError;
}

async function fetchDirectusFileMeta(fileId: string): Promise<DirectusFileMeta | null> {
  if (!fileId || !DIRECTUS_TOKEN) return null;
  if (!directusFileMetaCache.has(fileId)) {
    directusFileMetaCache.set(fileId, (async () => {
      try {
        const response = await fetch(`${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}`, {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, Accept: 'application/json' },
        });
        if (!response.ok) return null;
        const json = await response.json();
        return json.data as DirectusFileMeta;
      } catch {
        return null;
      }
    })());
  }
  return directusFileMetaCache.get(fileId)!;
}

async function hydrateFile(row: any): Promise<ParsedDocument> {
  const normalized = normalizeFile(row);
  const originalFileId = normalized.original_file_id;
  if (!originalFileId || (normalized.original_file && typeof normalized.original_file === 'object')) {
    return normalized;
  }

  const fileMeta = await fetchDirectusFileMeta(originalFileId);
  if (!fileMeta) return normalized;

  return normalizeFile({
    ...row,
    original_file: fileMeta,
  });
}

async function hydrateFiles(rows: any[]): Promise<ParsedDocument[]> {
  return Promise.all((rows || []).map(hydrateFile));
}

export async function uploadOriginalDocument(file: File): Promise<DirectusFileMeta> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Nepavyko įkelti failo į Directus (${response.status}): ${message}`);
  }

  const json = await response.json();
  const meta = json.data as DirectusFileMeta;
  if (meta?.id) directusFileMetaCache.set(meta.id, Promise.resolve(meta));
  return meta;
}

// ============================================================================
// LlamaParse Files
// ============================================================================

export async function saveParsedDocument(input: CreateParsedDocumentInput): Promise<ParsedDocument> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .insert([toFileInsert(input)])
    .select('*')
    .single();

  if (error) {
    console.error('Error saving LlamaParse file:', error);
    throw error;
  }

  return hydrateFile(data);
}

export async function updateParsedDocument(
  id: string,
  updates: Partial<Pick<ParsedDocument, 'status' | 'tier' | 'llama_file_id' | 'job_id' | 'parsed_markdown' | 'parsed_text' | 'parsed_json' | 'page_count' | 'images_metadata' | 'user_prompt'>>
): Promise<void> {
  const { error } = await db
    .from(FILES_COLLECTION)
    .update(toFileUpdate(updates))
    .eq('id', id);

  if (error) {
    console.error('Error updating LlamaParse file:', error);
    throw error;
  }
}

// ============================================================================
// LlamaParse Parse Jobs
// ============================================================================

export async function saveParseJobAttempt(input: SaveParseJobAttemptInput): Promise<LlamaParseJobRecord | null> {
  const status = input.status || 'PENDING';
  const startedAt = input.started_at || new Date().toISOString();

  try {
    const data = await insertSingleWithFieldFallback<any>(PARSE_JOBS_COLLECTION, {
      ...toParseJobPayload(input),
      status,
      started_at: startedAt,
      status_history_json: input.status_history_json || [
        { status, at: startedAt },
      ],
    }, [
      ['completed_at'],
      ['status_history_json', 'request_json', 'response_json'],
    ]);

    return normalizeParseJob(data);
  } catch (error) {
    console.warn('Could not save LlamaParse job attempt:', error);
    return null;
  }
}

export async function updateParseJobAttempt(
  id: string | null | undefined,
  updates: UpdateParseJobAttemptInput
): Promise<void> {
  if (!id) return;
  const payload = toParseJobPayload(updates);
  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from(PARSE_JOBS_COLLECTION)
    .update(payload)
    .eq('id', id);

  if (error) {
    console.warn('Could not update LlamaParse job attempt:', error);
  }
}

export async function updateParseJobAttemptByParseJobId(
  parseJobId: string | null | undefined,
  updates: UpdateParseJobAttemptInput
): Promise<void> {
  if (!parseJobId) return;
  const payload = toParseJobPayload(updates);
  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from(PARSE_JOBS_COLLECTION)
    .update(payload)
    .eq('parse_job_id', parseJobId);

  if (error) {
    console.warn('Could not update LlamaParse job attempt by parse id:', error);
  }
}

export async function updateParsedDocumentExtractionPointer(
  id: string,
  updates: { current_extract_job?: string | null; active_extract_config?: string | null }
): Promise<void> {
  const payload: Record<string, any> = {};
  if ('current_extract_job' in updates) payload.current_extract_job = updates.current_extract_job || null;
  if ('active_extract_config' in updates) payload.active_extract_config = updates.active_extract_config || null;
  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from(FILES_COLLECTION)
    .update(payload)
    .eq('id', id);

  if (error) {
    console.warn('Could not update LlamaParse file extraction pointer:', error);
  }
}

export async function fetchParsedDocuments(userId: string): Promise<ParsedDocument[]> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching LlamaParse files:', error);
    throw error;
  }

  return hydrateFiles(data || []);
}

export async function getParsedDocument(id: string): Promise<ParsedDocument> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting LlamaParse file:', error);
    throw error;
  }

  return hydrateFile(data);
}

export async function deleteParsedDocument(id: string): Promise<void> {
  try {
    await db.from(EXTRACTIONS_COLLECTION).delete().eq('file_id', id);
  } catch {
    // If permissions block child cleanup, still attempt deleting the parent.
  }
  try {
    await db.from(PARSE_JOBS_COLLECTION).delete().eq('file_id', id);
  } catch {
    // Parse job cleanup is helpful, but the parent delete remains the source of truth.
  }

  const { error } = await db
    .from(FILES_COLLECTION)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting LlamaParse file:', error);
    throw error;
  }
}

// ============================================================================
// LlamaCloud Extract Configs and Runs
// ============================================================================

export async function saveExtractConfigSnapshot(input: SaveExtractConfigSnapshotInput): Promise<string | null> {
  const configuration = input.configuration || {};
  const payload = {
    user_id: input.user_id,
    project_id: input.project_id || null,
    name: input.name || 'Analizė konfiguracija',
    data_schema_json: configuration.data_schema || {},
    tier: configuration.tier || '',
    extraction_target: configuration.extraction_target || '',
    system_prompt: configuration.system_prompt || '',
    target_pages: configuration.target_pages || '',
    max_pages: configuration.max_pages == null ? '' : String(configuration.max_pages),
    cite_sources: String(Boolean(configuration.cite_sources)),
    confidence_scores: String(Boolean(configuration.confidence_scores)),
    extract_version: configuration.extract_version || 'latest',
    parse_config_id: configuration.parse_config_id || '',
    raw_options_json: {
      ...configuration,
      schema_mode: input.schema_mode,
      extract_goal: input.extract_goal || '',
      raw_schema_text: input.raw_schema_text || '',
    },
    llama_configuration_id: configuration.parse_config_id || '',
    is_shared: 'false',
  };

  try {
    const data = await insertSingleWithFieldFallback<any>(EXTRACT_CONFIGS_COLLECTION, payload, [
      ['project_id', 'llama_configuration_id', 'is_shared'],
    ]);
    return data?.id || null;
  } catch (error) {
    console.warn('Could not save extraction config snapshot:', error);
    return null;
  }
}

export async function saveAnalizeApiEvent(input: SaveAnalizeApiEventInput): Promise<void> {
  try {
    await insertSingleWithFieldFallback(API_EVENTS_COLLECTION, {
      file_id: input.file_id || null,
      job_id: input.job_id || null,
      event_type: input.event_type,
      status: input.status || null,
      request_json: input.request_json || null,
      response_json: input.response_json || null,
      error_message: input.error_message || null,
    }, [
      ['job_id'],
      ['request_json', 'response_json'],
    ]);
  } catch (error) {
    console.warn('Could not save Analizė API event:', error);
  }
}

export async function saveExtractionRun(input: SaveExtractionRunInput): Promise<LlamaParseExtraction> {
  const isCompleted = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PARTIAL_SUCCESS'].includes(String(input.extract_status || '').toUpperCase());
  const resolvedFileInput = input.file_input || input.request_json?.file_input || null;
  const requestJson = {
    ...(input.request_json || {}),
    file_input: resolvedFileInput,
    configuration: input.extract_config,
  };
  const responseJson = input.response_json || {
    id: input.extract_job_id,
    status: input.extract_status,
    extract_result: input.extract_result || null,
    extract_metadata: input.extract_metadata || null,
    error_message: input.error_message || null,
    file_input: resolvedFileInput,
  };

  const payload = {
    file_id: input.file_id,
    file_input: resolvedFileInput,
    extract_job_id: input.extract_job_id,
    extract_status: input.extract_status,
    status: input.extract_status,
    extract_config: input.extract_config,
    configuration_snapshot_json: input.extract_config,
    extract_result: input.extract_result || null,
    extract_metadata: input.extract_metadata || null,
    error_message: input.error_message || null,
    parse_job_id: input.request_json?.parse_job_id || null,
    config_id: input.config_id || null,
    request_json: requestJson,
    response_json: responseJson,
    status_history_json: input.status_history_json || [
      { status: input.extract_status, at: new Date().toISOString() },
    ],
    completed_at: isCompleted ? new Date().toISOString() : null,
  };

  const data = await insertSingleWithFieldFallback<any>(EXTRACTIONS_COLLECTION, payload, [
    ['completed_at'],
    ['config_id', 'configuration_snapshot_json', 'request_json', 'response_json', 'status', 'status_history_json', 'parse_job_id'],
  ]);

  await updateParsedDocumentExtractionPointer(input.file_id, {
    current_extract_job: input.extract_job_id,
    active_extract_config: input.config_id || null,
  });

  return normalizeExtraction(data);
}

export async function updateExtractionRun(
  id: string | null | undefined,
  updates: UpdateExtractionRunInput
): Promise<LlamaParseExtraction | null> {
  if (!id) return null;

  const payload: Record<string, any> = {};
  const resolvedFileInput = updates.file_input || updates.request_json?.file_input || null;
  const status = updates.extract_status ? String(updates.extract_status).toUpperCase() : '';
  const isCompleted = ['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PARTIAL_SUCCESS'].includes(status);

  if ('file_input' in updates || resolvedFileInput) payload.file_input = resolvedFileInput;
  if ('extract_job_id' in updates) payload.extract_job_id = updates.extract_job_id || null;
  if ('extract_status' in updates) {
    payload.extract_status = updates.extract_status || null;
    payload.status = updates.extract_status || null;
    if (isCompleted) payload.completed_at = new Date().toISOString();
  }
  if ('extract_config' in updates) {
    payload.extract_config = updates.extract_config || {};
    payload.configuration_snapshot_json = updates.extract_config || {};
  }
  if ('extract_result' in updates) payload.extract_result = updates.extract_result ?? null;
  if ('extract_metadata' in updates) payload.extract_metadata = updates.extract_metadata ?? null;
  if ('error_message' in updates) payload.error_message = updates.error_message || null;
  if ('config_id' in updates) payload.config_id = updates.config_id || null;
  if ('request_json' in updates) {
    payload.request_json = {
      ...(updates.request_json || {}),
      ...(resolvedFileInput ? { file_input: resolvedFileInput } : {}),
      ...(updates.extract_config ? { configuration: updates.extract_config } : {}),
    };
  }
  if ('response_json' in updates) payload.response_json = updates.response_json || null;
  if ('status_history_json' in updates) payload.status_history_json = updates.status_history_json || [];

  if (Object.keys(payload).length === 0) return null;

  const data = await updateSingleWithFieldFallback<any>(EXTRACTIONS_COLLECTION, id, payload, [
    ['completed_at'],
    ['config_id', 'configuration_snapshot_json', 'request_json', 'response_json', 'status', 'status_history_json', 'parse_job_id'],
  ]);

  return normalizeExtraction(data);
}

export async function fetchExtractionRuns(fileId: string): Promise<LlamaParseExtraction[]> {
  const { data, error } = await db
    .from(EXTRACTIONS_COLLECTION)
    .select('*')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching extraction runs:', error);
    throw error;
  }

  return (data || []).map(normalizeExtraction);
}
