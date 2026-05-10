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

function requestHeaders(): Record<string, string> {
  return { Accept: 'application/json' };
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
  presigned_url?: string;
  page_number?: number;
}

export interface ParseOptions {
  tier: ParseTier;
  userPrompt?: string;
  onJobStarted?: (job: ParseJobResponse) => void | Promise<void>;
  onJobProgress?: (result: ParseResult) => void | Promise<void>;
}

export interface DirectusUploadInput {
  directusFileId: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

const DEFAULT_PARSE_EXPANDS = ['markdown', 'text', 'items', 'job_metadata'];
const PARSE_RESULT_EXPAND_FALLBACKS = [
  DEFAULT_PARSE_EXPANDS,
  ['markdown', 'text', 'job_metadata'],
  ['text', 'job_metadata'],
  ['markdown', 'job_metadata'],
  ['text'],
  ['markdown'],
  [],
];

export function supportsParseInstructions(tier: ParseTier): boolean {
  return tier !== 'fast';
}

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
    if (Array.isArray(record.pages)) {
      return record.pages
        .map(page => contentToString(page))
        .filter(Boolean)
        .join('\n\n---\n\n');
    }

    if (Array.isArray(record.items)) {
      return record.items
        .map(item => contentToString(item))
        .filter(Boolean)
        .join('\n');
    }

    for (const key of ['value', 'content', 'text', 'markdown', 'md']) {
      const nested = contentToString(record[key]);
      if (nested) return nested;
    }
  }
  return '';
}

function hasResultContent(result: ParseResult): boolean {
  if (result.result_content_text?.trim()) return true;
  if (result.result_content_markdown?.trim()) return true;
  if (result.result_content_json != null) return true;
  return false;
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

function normalizeImagesMetadata(value: unknown): ImageMetadata[] {
  const normalizeImage = (image: unknown, index: number): ImageMetadata | null => {
    if (!image || typeof image !== 'object') return null;
    const record = image as Record<string, unknown>;
    const url = typeof record.url === 'string'
      ? record.url
      : typeof record.presigned_url === 'string'
      ? record.presigned_url
      : '';
    if (!url) return null;

    return {
      ...(record as Partial<ImageMetadata>),
      filename: typeof record.filename === 'string' && record.filename.trim()
        ? record.filename
        : `vaizdas_${index + 1}`,
      url,
      page_number: typeof record.page_number === 'number'
        ? record.page_number
        : typeof record.page === 'number'
        ? record.page
        : undefined,
    };
  };

  if (Array.isArray(value)) {
    return value
      .map(normalizeImage)
      .filter((image): image is ImageMetadata => Boolean(image));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.images)) {
      return record.images
        .map(normalizeImage)
        .filter((image): image is ImageMetadata => Boolean(image));
    }
  }

  return [];
}

function buildExpandQuery(expand: string[]): string {
  const uniqueExpands = [...new Set(expand.map(item => item.trim()).filter(Boolean))];
  if (uniqueExpands.length === 0) return '';

  const params = new URLSearchParams();
  params.set('expand', uniqueExpands.join(','));
  return params.toString();
}

export class RetryableParsePollError extends Error {
  readonly retryable = true;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableParsePollError';
  }
}

export function isRetryableParsePollError(error: unknown): error is RetryableParsePollError {
  return Boolean(error && typeof error === 'object' && (error as { retryable?: unknown }).retryable === true);
}

function isTransientPollError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  const statusMatch = message.match(/\((\d{3})\)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  return (
    status === 408
    || status === 409
    || status === 425
    || status === 429
    || status >= 500
    || lower.includes('failed to fetch')
    || lower.includes('network')
    || lower.includes('timeout')
    || lower.includes('temporarily')
    || lower.includes('load failed')
  );
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
    headers: requestHeaders(),
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
      ...requestHeaders(),
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

  if (supportsParseInstructions(tier) && userPrompt?.trim()) {
    body.agentic_options = { custom_prompt: userPrompt.trim() };
  }

  const res = await fetch(`${API_BASE}/api/v2/parse`, {
    method: 'POST',
    headers: {
      ...requestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Dokumento paruošti nepavyko (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    ...data,
    request_json: body,
  };
}

/**
 * Get parse result by job ID with optional expand parameters.
 * Common expand values:
 *  - markdown
 *  - text
 *  - items
 *  - job_metadata
 *  - images_content_metadata
 */
export async function getParseResult(
  jobId: string,
  expand: string[] = DEFAULT_PARSE_EXPANDS
): Promise<ParseResult> {
  const query = buildExpandQuery(expand);
  const url = `${API_BASE}/api/v2/parse/${jobId}${query ? `?${query}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: requestHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Rezultato gauti nepavyko (${res.status}): ${errText}`);
  }

  return normalizeParseResult(await res.json());
}

async function getCompletedParseResult(jobId: string): Promise<ParseResult> {
  let lastError: unknown;
  let lastResult: ParseResult | null = null;
  let sawTransientError = false;

  for (const expand of PARSE_RESULT_EXPAND_FALLBACKS) {
    try {
      const result = await getParseResult(jobId, expand);
      if (hasResultContent(result)) return result;
      lastResult = result;
    } catch (err) {
      lastError = err;
      if (isTransientPollError(err)) sawTransientError = true;
    }
  }

  if (sawTransientError && !lastResult) {
    throw new RetryableParsePollError('Ryšys su apdorojimo rezultatu laikinai nutrūko. Dokumento būsena liko nebaigta ir bus galima tikrinti dar kartą.', lastError);
  }

  if (lastResult) {
    throw new Error('Dokumentas apdorotas, bet LlamaParse negrąžino teksto, Markdown ar struktūrinių elementų.');
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Rezultato gauti nepavyko');
}

/**
 * Get extracted images metadata (presigned URLs) for a completed parse job.
 */
export async function getParseImages(jobId: string): Promise<ImageMetadata[]> {
  const result = await getParseResult(jobId, ['images_content_metadata']);
  return normalizeImagesMetadata(result.images_content_metadata);
}

/**
 * Poll a parse job until it reaches SUCCESS or ERROR status.
 * Calls onProgress on each poll with the current status.
 */
export async function pollUntilDone(
  jobId: string,
  onProgress?: (status: string, result: ParseResult) => void,
  intervalMs: number = 3000,
  maxAttempts: number = 120 // 6 minutes max in the foreground UI
): Promise<ParseResult> {
  let transientFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let statusResult: ParseResult;
    try {
      statusResult = await getParseResult(jobId, []);
      transientFailures = 0;
    } catch (err) {
      if (!isTransientPollError(err)) throw err;

      transientFailures += 1;
      if (transientFailures >= 8) {
        throw new RetryableParsePollError('Nepavyko patikrinti dokumento būsenos dėl laikino ryšio sutrikimo. Darbas nepažymėtas kaip klaida, pabandykite atidaryti dokumentą dar kartą.', err);
      }

      await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs * transientFailures, 15000)));
      continue;
    }

    const status = statusResult.status || statusResult.job?.status || statusResult.metadata?.status || '';
    onProgress?.(status, statusResult);

    if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'PARTIAL_SUCCESS') {
      let result: ParseResult;
      try {
        result = await getCompletedParseResult(jobId);
      } catch (err) {
        if (!isRetryableParsePollError(err) && !isTransientPollError(err)) throw err;

        transientFailures += 1;
        if (transientFailures >= 8) {
          throw err instanceof RetryableParsePollError
            ? err
            : new RetryableParsePollError('Dokumentas apdorotas, bet rezultato dabar nepavyko atsisiųsti. Būsena liko nebaigta, pabandykite dar kartą.', err);
        }

        await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs * transientFailures, 15000)));
        continue;
      }
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
      throw new Error(statusResult.error_message || 'Dokumento paruošti nepavyko');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new RetryableParsePollError('Dokumentas vis dar ruošiamas. Būsena liko nebaigta, pabandykite dar kartą po kelių akimirkų.');
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
  const result = await pollUntilDone(jobId, (status, statusResult) => {
    onStatus?.(`Skaitomas dokumentas... (${status})`);
    void options.onJobProgress?.(statusResult);
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

  const result = await pollUntilDone(job.id, (status, statusResult) => {
    onStatus?.(`Skaitomas dokumentas... (${status})`);
    void options.onJobProgress?.(statusResult);
  });

  return { ...result, id: job.id, file_id: uploaded.id };
}
