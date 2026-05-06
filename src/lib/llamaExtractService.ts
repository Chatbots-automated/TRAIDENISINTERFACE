/**
 * LlamaCloud Extract v2 client.
 *
 * Mirrors the official @llamaindex/llama-cloud Extract API while keeping the
 * existing browser-side API-key pattern used by the Analizė page.
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

function getApiKey(): string {
  return import.meta.env.VITE_LLAMAPARSE_API_KEY || '';
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key
    ? { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    : { Accept: 'application/json' };
}

async function readError(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

function normalizeExtractStatus(status?: string): string {
  return String(status || '').trim().toUpperCase();
}

export async function uploadExtractText(content: string, fileName = 'document.md'): Promise<string> {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const file = new File([blob], fileName.endsWith('.md') ? fileName : `${fileName}.md`, { type: blob.type });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'extract');

  const res = await fetch(`${API_BASE}/api/v1/beta/files`, {
    method: 'POST',
    headers: authHeaders(),
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
      ...authHeaders(),
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
  const params = new URLSearchParams();
  params.append('expand', 'configuration');
  params.append('expand', 'extract_metadata');

  const res = await fetch(`${API_BASE}/api/v2/extract/${jobId}?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Get extract job failed (${res.status}): ${await readError(res)}`);
  }

  return res.json();
}

export async function pollExtractJob(
  jobId: string,
  onStatus?: (status: string) => void,
  intervalMs = 2500,
  maxAttempts = 120
): Promise<ExtractJob> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await getExtractJob(jobId);
    const status = normalizeExtractStatus(job.status);
    onStatus?.(status || job.status);

    if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'PARTIAL_SUCCESS'].includes(status)) {
      return { ...job, status };
    }
    if (['FAILED', 'ERROR'].includes(status)) throw new Error(job.error_message || 'Extraction failed');
    if (['CANCELLED', 'CANCELED'].includes(status)) throw new Error('Extraction was cancelled');

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Duomenų ištraukimas vis dar vyksta. Bandykite dar kartą po kelių akimirkų.');
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
