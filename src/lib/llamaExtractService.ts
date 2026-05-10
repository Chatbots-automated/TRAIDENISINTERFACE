/**
 * LlamaCloud Extract v2 client.
 *
 * Mirrors the official @llamaindex/llama-cloud Extract API. The browser calls
 * the local /api/llamacloud proxy; the proxy owns the LlamaCloud API key.
 */

const API_BASE = '/api/llamacloud';

export type ExtractTier = 'cost_effective' | 'agentic';
export type ExtractTarget = 'per_doc' | 'per_page' | 'per_table_row';

export interface ExtractConfiguration {
  data_schema: Record<string, unknown>;
  tier?: ExtractTier;
  extraction_target?: ExtractTarget;
  parse_tier?: string | null;
  parse_config_id?: string | null;
  target_pages?: string | null;
  max_pages?: number | null;
  system_prompt?: string | null;
  cite_sources?: boolean;
  confidence_scores?: boolean;
  extract_version?: string;
}

export interface ExtractJob {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  file_input: string;
  created_at?: string;
  updated_at?: string;
  configuration?: ExtractConfiguration | null;
  error_message?: string | null;
  extract_result?: unknown;
  extract_metadata?: unknown;
  metadata?: {
    usage?: {
      num_document_tokens?: number | null;
      num_output_tokens?: number | null;
      num_pages_extracted?: number | null;
    } | null;
  } | null;
}

export interface RunExtractInput {
  fileInput?: string;
  fallbackText?: string;
  fallbackFileName?: string;
  configuration: ExtractConfiguration;
  onStatus?: (status: string) => void;
}

export class RetryableExtractPollError extends Error {
  readonly retryable = true;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableExtractPollError';
  }
}

function requestHeaders(): Record<string, string> {
  return { Accept: 'application/json' };
}

async function readError(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

function normalizeExtractStatus(status?: string): string {
  return String(status || '').trim().toUpperCase();
}

export function isRetryableExtractPollError(error: unknown): error is RetryableExtractPollError {
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

function buildExpandQuery(expand: string[]): string {
  const uniqueExpands = [...new Set(expand.map(item => item.trim()).filter(Boolean))];
  if (uniqueExpands.length === 0) return '';

  const params = new URLSearchParams();
  params.set('expand', uniqueExpands.join(','));
  return params.toString();
}

export async function uploadExtractText(content: string, fileName = 'document.md'): Promise<string> {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const file = new File([blob], fileName.endsWith('.md') ? fileName : `${fileName}.md`, { type: blob.type });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'extract');

  const res = await fetch(`${API_BASE}/api/v1/beta/files`, {
    method: 'POST',
    headers: requestHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Extract file upload failed (${res.status}): ${await readError(res)}`);
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error('Extract file upload did not return a file id');
  }
  return data.id;
}

export async function createExtractJob(fileInput: string, configuration: ExtractConfiguration): Promise<ExtractJob> {
  const res = await fetch(`${API_BASE}/api/v2/extract`, {
    method: 'POST',
    headers: {
      ...requestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_input: fileInput,
      configuration,
    }),
  });

  if (!res.ok) {
    throw new Error(`Extract request failed (${res.status}): ${await readError(res)}`);
  }

  return res.json();
}

export async function getExtractJob(jobId: string): Promise<ExtractJob> {
  const query = buildExpandQuery(['configuration', 'extract_metadata']);

  const res = await fetch(`${API_BASE}/api/v2/extract/${jobId}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: requestHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Get extract job failed (${res.status}): ${await readError(res)}`);
  }

  return res.json();
}

export async function pollExtractJob(
  jobId: string,
  onStatus?: (status: string, job: ExtractJob) => void | Promise<void>,
  intervalMs = 2500,
  maxAttempts = 120
): Promise<ExtractJob> {
  let transientFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let job: ExtractJob;
    try {
      job = await getExtractJob(jobId);
      transientFailures = 0;
    } catch (err) {
      if (!isTransientPollError(err)) throw err;

      transientFailures += 1;
      if (transientFailures >= 8) {
        throw new RetryableExtractPollError('Nepavyko patikrinti analizės būsenos dėl laikino ryšio sutrikimo. Darbas išsaugotas ir bus galima tikrinti dar kartą.', err);
      }

      await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs * transientFailures, 15000)));
      continue;
    }

    const status = normalizeExtractStatus(job.status);
    await onStatus?.(status || job.status, job);

    if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PARTIAL_SUCCESS'].includes(status)) {
      return { ...job, status };
    }
    if (['FAILED', 'ERROR'].includes(status)) throw new Error(job.error_message || 'Extraction failed');
    if (['CANCELLED', 'CANCELED'].includes(status)) throw new Error('Extraction was cancelled');

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new RetryableExtractPollError('Duomenų analizė vis dar vyksta. Darbas išsaugotas, pabandykite dar kartą po kelių akimirkų.');
}

export async function runExtract(input: RunExtractInput): Promise<ExtractJob> {
  let fileInput = input.fileInput?.trim();

  if (!fileInput && input.fallbackText?.trim()) {
    input.onStatus?.('Įkeliamas dokumento tekstas...');
    fileInput = await uploadExtractText(input.fallbackText, input.fallbackFileName);
  }

  if (!fileInput) {
    throw new Error('Pirmiausia paruoškite dokumentą arba pateikite tekstą.');
  }

  input.onStatus?.('Pradedamas ištraukimas...');
  const job = await createExtractJob(fileInput, input.configuration);

  return pollExtractJob(job.id, status => {
    input.onStatus?.(`Ištraukiama... (${status})`);
  });
}
