/**
 * ============================================================================
 * ANALIZĖ SERVICE — Directus-backed LlamaParse files and extractions
 * ============================================================================
 *
 * Collections:
 *   llamaparse_files        — uploaded/parsed document records
 *   llamaparse_extractions  — each structured extraction run for a file
 * ============================================================================
 */

import { db } from './database';
import type { ParsedDocument, ParseTier, ParseStatus } from '../types';

const FILES_COLLECTION = 'llamaparse_files';
const EXTRACTIONS_COLLECTION = 'llamaparse_extractions';
const DIRECTUS_URL = (import.meta.env.VITE_DIRECTUS_URL || 'https://sql.traidenis.org').trim();
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
  extract_job_id: string;
  extract_status: string;
  extract_config: any;
  extract_result: any;
  extract_metadata: any;
  error_message?: string | null;
  created_at?: string;
  date_created?: string;
}

function normalizeFile(row: any): ParsedDocument {
  const originalFile: DirectusFileMeta | string | null = row.original_file || null;
  const fileMeta = typeof originalFile === 'object' ? originalFile : null;

  return {
    id: row.id,
    user_id: row.user_id,
    file_name: row.file_name || fileMeta?.filename_download || fileMeta?.title || 'Dokumentas',
    file_type: row.file_type || fileMeta?.type || 'unknown',
    file_size: Number(row.file_size || fileMeta?.filesize || 0),
    tier: row.parse_tier || row.tier || 'agentic',
    job_id: row.parse_job_id || row.job_id || '',
    status: row.parse_status || row.status || 'PENDING',
    parsed_markdown: row.parsed_markdown || '',
    parsed_text: row.parsed_text || '',
    parsed_json: row.parsed_json || null,
    page_count: Number(row.page_count || 0),
    images_metadata: row.images_metadata || null,
    user_prompt: row.parse_user_prompt || row.user_prompt || undefined,
    created_at: row.created_at || row.date_created || new Date().toISOString(),
  };
}

function toFileInsert(input: CreateParsedDocumentInput) {
  return {
    user_id: input.user_id,
    original_file: input.original_file || null,
    parse_tier: input.tier,
    parse_job_id: input.job_id,
    parse_status: input.status,
    parse_user_prompt: input.user_prompt || null,
    parsed_markdown: input.parsed_markdown || '',
    parsed_text: input.parsed_text || '',
    parsed_json: input.parsed_json || null,
    images_metadata: input.images_metadata || null,
    page_count: input.page_count || 0,
  };
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
  return json.data as DirectusFileMeta;
}

function toFileUpdate(
  updates: Partial<Pick<ParsedDocument, 'status' | 'job_id' | 'parsed_markdown' | 'parsed_text' | 'parsed_json' | 'page_count' | 'images_metadata'>>
) {
  const data: Record<string, any> = {};
  if ('status' in updates) data.parse_status = updates.status;
  if ('job_id' in updates) data.parse_job_id = updates.job_id;
  if ('parsed_markdown' in updates) data.parsed_markdown = updates.parsed_markdown;
  if ('parsed_text' in updates) data.parsed_text = updates.parsed_text;
  if ('parsed_json' in updates) data.parsed_json = updates.parsed_json;
  if ('page_count' in updates) data.page_count = updates.page_count;
  if ('images_metadata' in updates) data.images_metadata = updates.images_metadata;
  return data;
}

// ============================================================================
// LlamaParse Files
// ============================================================================

export async function saveParsedDocument(input: CreateParsedDocumentInput): Promise<ParsedDocument> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .insert([toFileInsert(input)])
    .select('*,original_file.id,original_file.filename_download,original_file.title,original_file.type,original_file.filesize,original_file.uploaded_on')
    .single();

  if (error) {
    console.error('Error saving LlamaParse file:', error);
    throw error;
  }

  return normalizeFile(data);
}

export async function updateParsedDocument(
  id: string,
  updates: Partial<Pick<ParsedDocument, 'status' | 'job_id' | 'parsed_markdown' | 'parsed_text' | 'parsed_json' | 'page_count' | 'images_metadata'>>
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

export async function fetchParsedDocuments(userId: string): Promise<ParsedDocument[]> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .select('*,original_file.id,original_file.filename_download,original_file.title,original_file.type,original_file.filesize,original_file.uploaded_on')
    .eq('user_id', userId)
    .order('date_created', { ascending: false });

  if (error) {
    console.error('Error fetching LlamaParse files:', error);
    throw error;
  }

  return (data || []).map(normalizeFile);
}

export async function getParsedDocument(id: string): Promise<ParsedDocument> {
  const { data, error } = await db
    .from(FILES_COLLECTION)
    .select('*,original_file.id,original_file.filename_download,original_file.title,original_file.type,original_file.filesize,original_file.uploaded_on')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting LlamaParse file:', error);
    throw error;
  }

  return normalizeFile(data);
}

export async function deleteParsedDocument(id: string): Promise<void> {
  try {
    await db.from(EXTRACTIONS_COLLECTION).delete().eq('file_id', id);
  } catch {
    // If permissions block child cleanup, still attempt deleting the parent.
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
// LlamaCloud Extract Runs
// ============================================================================

export async function saveExtractionRun(input: {
  file_id: string;
  extract_job_id: string;
  extract_status: string;
  extract_config: any;
  extract_result?: any;
  extract_metadata?: any;
  error_message?: string | null;
}): Promise<LlamaParseExtraction> {
  const { data, error } = await db
    .from(EXTRACTIONS_COLLECTION)
    .insert([{
      file_id: input.file_id,
      extract_job_id: input.extract_job_id,
      extract_status: input.extract_status,
      extract_config: input.extract_config,
      extract_result: input.extract_result || null,
      extract_metadata: input.extract_metadata || null,
      error_message: input.error_message || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving extraction run:', error);
    throw error;
  }

  return data as LlamaParseExtraction;
}

export async function fetchExtractionRuns(fileId: string): Promise<LlamaParseExtraction[]> {
  const { data, error } = await db
    .from(EXTRACTIONS_COLLECTION)
    .select('*')
    .eq('file_id', fileId)
    .order('date_created', { ascending: false });

  if (error) {
    console.error('Error fetching extraction runs:', error);
    throw error;
  }

  return (data || []) as LlamaParseExtraction[];
}
