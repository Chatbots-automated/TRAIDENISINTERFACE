/**
 * ============================================================================
 * LLAMAPARSE API V2 CLIENT
 * ============================================================================
 *
 * REST API client for LlamaParse (LlamaIndex Cloud) document parsing.
 * Uses the v2 API endpoints directly — no npm SDK dependency.
 *
 * API docs: https://developers.llamaindex.ai/python/cloud/llamaparse/api-v2-guide/
 * ============================================================================
 */

const API_BASE = '/api/llamacloud';

function getApiKey(): string {
  return import.meta.env.VITE_LLAMAPARSE_API_KEY || '';
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key
    ? { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    : { Accept: 'application/json' };
}

// ============================================================================
// Types
// ============================================================================

export type ParseTier = 'cost_effective' | 'agentic' | 'agentic_plus' | 'fast';

export interface UploadResult {
  id: string;
  name: string;
  size?: number;
  mime_type?: string;
  file_type?: string;
  purpose?: string;
}

export interface ParseJobResponse {
  id: string;
  status: string;
  file_id: string;
  [key: string]: any;
}

export interface ParseResult {
  id: string;
  file_id?: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | string;
  job?: {
    id?: string;
    status?: string;
    error_message?: string | null;
    [key: string]: any;
  };
  result_content_markdown?: string;
  result_content_text?: string;
  result_content_json?: any;
  markdown?: unknown;
  markdown_full?: unknown;
  text?: unknown;
  text_full?: unknown;
  items?: unknown;
  metadata?: Record<string, any>;
  images_content_metadata?: ImageMetadata[];
  error_message?: string;
  [key: string]: any;
}

export interface ImageMetadata {
  filename: string;
  url: string;
  page_number?: number;
}

export interface ParseOptions {
  tier: ParseTier;
  userPrompt?: string;
  onJobStarted?: (job: ParseJobResponse) => void | Promise<void>;
}

export interface DirectusUploadInput {
  directusFileId: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

const DEFAULT_PARSE_EXPANDS = ['markdown', 'text', 'items', 'metadata'];

function contentToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map(item => contentToString(item))
      .filter(Boolean)
      .join('\n\n');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['value', 'content', 'text', 'markdown', 'md']) {
      const nested = contentToString(record[key]);
      if (nested) return nested;
    }
  }
  return '';
}

function normalizeParseResult(data: ParseResult): ParseResult {
  const status = data.status || data.job?.status || '';
  const markdown = data.result_content_markdown
    || contentToString(data.markdown)
    || contentToString(data.markdown_full);
  const text = data.result_content_text
    || contentToString(data.text)
    || contentToString(data.text_full);
  const json = data.result_content_json
    ?? data.items
    ?? data.metadata
    ?? null;

  return {
    ...data,
    id: data.id || data.job?.id || '',
    status,
    error_message: data.error_message || data.job?.error_message || undefined,
    result_content_markdown: markdown,
    result_content_text: text,
    result_content_json: json,
  };
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Upload a file to LlamaCloud File API.
 * Returns { id } which is used as file_id for parsing.
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'parse');

  const res = await fetch(`${API_BASE}/api/v1/beta/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failo įkelti nepavyko (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Production-safe upload path.
 *
 * Large browser → Netlify multipart requests can fail at Cloudflare/function
 * boundaries before our function code even runs. The app already stores the
 * original file in Directus, so in production we send only the Directus file id
 * to the Netlify proxy and let the server forward the binary to LlamaCloud.
 */
export async function uploadDirectusFile(input: DirectusUploadInput): Promise<UploadResult> {
  const res = await fetch(`${API_BASE}/directus-file-upload`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      directus_file_id: input.directusFileId,
      file_name: input.fileName,
      file_type: input.fileType,
      file_size: input.fileSize,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failo paruošti nepavyko (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Start a parse job for an uploaded file.
 * Returns the parse job with its id for polling.
 */
export async function startParse(
  fileId: string,
  tier: ParseTier = 'agentic',
  userPrompt?: string
): Promise<ParseJobResponse> {
  const body: Record<string, any> = {
    file_id: fileId,
    tier,
    version: 'latest',
  };

  if (userPrompt?.trim()) {
    body.agentic_options = { custom_prompt: userPrompt.trim() };
  }

  const res = await fetch(`${API_BASE}/api/v2/parse`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Dokumento paruošti nepavyko (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Get parse result by job ID with optional expand parameters.
 * Common expand values:
 *  - markdown
 *  - text
 *  - items
 *  - metadata
 *  - images_content_metadata
 */
export async function getParseResult(
  jobId: string,
  expand: string[] = DEFAULT_PARSE_EXPANDS
): Promise<ParseResult> {
  const params = new URLSearchParams();
  for (const e of expand) {
    params.append('expand', e);
  }

  const res = await fetch(`${API_BASE}/api/v2/parse/${jobId}?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Rezultato gauti nepavyko (${res.status}): ${errText}`);
  }

  return normalizeParseResult(await res.json());
}

/**
 * Get extracted images metadata (presigned URLs) for a completed parse job.
 */
export async function getParseImages(jobId: string): Promise<ImageMetadata[]> {
  const result = await getParseResult(jobId, ['images_content_metadata']);
  return result.images_content_metadata || [];
}

/**
 * Poll a parse job until it reaches SUCCESS or ERROR status.
 * Calls onProgress on each poll with the current status.
 */
export async function pollUntilDone(
  jobId: string,
  onProgress?: (status: string) => void,
  intervalMs: number = 3000,
  maxAttempts: number = 120 // 6 minutes max in the foreground UI
): Promise<ParseResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getParseResult(jobId, DEFAULT_PARSE_EXPANDS);

    const status = result.status || result.job?.status || result.metadata?.status || '';
    onProgress?.(status);

    if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'PARTIAL_SUCCESS') {
      // Fetch images too
      try {
        const images = await getParseImages(jobId);
        result.images_content_metadata = images;
      } catch {
        // Images might not be available, that's ok
      }
      return result;
    }

    if (status === 'ERROR' || status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(result.error_message || 'Dokumento paruošti nepavyko');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Dokumentas vis dar ruošiamas. Bandykite dar kartą po kelių akimirkų.');
}

/**
 * Full pipeline: upload file → start parse → poll until done → return result.
 */
export async function parseDocument(
  file: File,
  options: ParseOptions,
  onStatus?: (status: string) => void
): Promise<ParseResult> {
  // Step 1: Upload
  onStatus?.('Įkeliamas failas...');
  const uploaded = await uploadFile(file);

  // Step 2: Start parsing
  onStatus?.('Pradedamas apdorojimas...');
  const job = await startParse(uploaded.id, options.tier, options.userPrompt);
  await options.onJobStarted?.(job);

  const jobId = job.id;

  // Step 3: Poll until done
  const result = await pollUntilDone(jobId, (status) => {
    onStatus?.(`Skaitomas dokumentas... (${status})`);
  });

  return { ...result, id: jobId, file_id: uploaded.id };
}

export async function parseDirectusDocument(
  input: DirectusUploadInput,
  options: ParseOptions,
  onStatus?: (status: string) => void
): Promise<ParseResult> {
  onStatus?.('Ruošiamas failas...');
  const uploaded = await uploadDirectusFile(input);

  onStatus?.('Pradedamas apdorojimas...');
  const job = await startParse(uploaded.id, options.tier, options.userPrompt);
  await options.onJobStarted?.(job);

  const result = await pollUntilDone(job.id, (status) => {
    onStatus?.(`Skaitomas dokumentas... (${status})`);
  });

  return { ...result, id: job.id, file_id: uploaded.id };
}
