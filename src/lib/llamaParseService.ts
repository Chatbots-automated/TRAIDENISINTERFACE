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
  size: number;
  mime_type: string;
}

export interface ParseJobResponse {
  id: string;
  status: string;
  file_id: string;
  [key: string]: any;
}

export interface ParseResult {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | string;
  result_content_markdown?: string;
  result_content_text?: string;
  result_content_json?: any;
  images_content_metadata?: ImageMetadata[];
  error_message?: string;
  metadata?: Record<string, any>;
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

  const res = await fetch(`${API_BASE}/api/v1/files/`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${errText}`);
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
    body.user_prompt = userPrompt.trim();
  }

  const res = await fetch(`${API_BASE}/api/v2/parse/`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Parse request failed (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Get parse result by job ID with optional expand parameters.
 * Common expand values:
 *  - result_content_markdown
 *  - result_content_text
 *  - result_content_json
 *  - images_content_metadata
 */
export async function getParseResult(
  jobId: string,
  expand: string[] = ['result_content_markdown', 'result_content_text']
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
    throw new Error(`Get result failed (${res.status}): ${errText}`);
  }

  return res.json();
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
  intervalMs: number = 2000,
  maxAttempts: number = 150 // 5 minutes max
): Promise<ParseResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getParseResult(jobId, [
      'result_content_markdown',
      'result_content_text',
      'result_content_json',
    ]);

    const status = result.status || result.metadata?.status || '';
    onProgress?.(status);

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      // Fetch images too
      try {
        const images = await getParseImages(jobId);
        result.images_content_metadata = images;
      } catch {
        // Images might not be available, that's ok
      }
      return result;
    }

    if (status === 'ERROR' || status === 'FAILED') {
      throw new Error(result.error_message || 'Parsing failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Parsing timed out — job is still pending');
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

  const jobId = job.id;

  // Step 3: Poll until done
  const result = await pollUntilDone(jobId, (status) => {
    onStatus?.(`Apdorojama... (${status})`);
  });

  return { ...result, id: jobId };
}
