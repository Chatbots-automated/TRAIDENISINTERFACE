import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, FileText, Search, Trash2, X, PanelLeft, PanelLeftClose,
  AlertCircle, CheckCircle, Loader2, Image,
  Code, Type, FileJson, ChevronDown, Sparkles, Settings2,
  ClipboardCopy, SlidersHorizontal
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppUser, ParsedDocument, ParseTier } from '../types';
import {
  parseDirectusDocument,
  parseDocument as llamaParse,
  pollUntilDone,
  supportsParseInstructions,
  type ParseJobResponse,
  type ParseResult,
} from '../lib/llamaParseService';
import {
  runExtract,
  type ExtractConfiguration,
  type ExtractJob,
  type ExtractTarget,
  type ExtractTier,
} from '../lib/llamaExtractService';
import {
  saveParsedDocument,
  updateParsedDocument,
  fetchParsedDocuments,
  getParsedDocument,
  deleteParsedDocument,
  uploadOriginalDocument,
  saveExtractionRun,
  fetchExtractionRuns,
  saveExtractConfigSnapshot,
  saveParseJobAttempt,
  updateParseJobAttempt,
  updateParseJobAttemptByParseJobId,
  type LlamaParseExtraction,
} from '../lib/analizeService';
import { DirectusFilePreview } from './DirectusFilePreview';

// ============================================================================
// Constants
// ============================================================================

const TIERS: { value: ParseTier; label: string; desc: string }[] = [
  { value: 'cost_effective', label: 'Ekonomiškas', desc: 'Greitas, tekstiniams dokumentams' },
  { value: 'agentic', label: 'Agentinis', desc: 'Vaizdai, diagramos, lentelės' },
  { value: 'agentic_plus', label: 'Agentinis+', desc: 'Maksimalus tikslumas' },
  { value: 'fast', label: 'Greitas', desc: 'Tik erdvinis tekstas' },
];

const ACCEPTED_TYPES = '.pdf,.docx,.pptx,.xlsx,.html,.htm,.jpg,.jpeg,.png,.xml,.epub,.rtf,.csv,.txt';

const EXTRACT_TARGETS: { value: ExtractTarget; label: string }[] = [
  { value: 'per_doc', label: 'Document' },
  { value: 'per_page', label: 'Pages' },
  { value: 'per_table_row', label: 'Table rows' },
];

const EXTRACT_TIERS: { value: ExtractTier; label: string }[] = [
  { value: 'agentic', label: 'Tikslus' },
  { value: 'cost_effective', label: 'Ekonomiškas' },
];

const DEFAULT_RAW_EXTRACT_SCHEMA = `{
  "type": "object",
  "properties": {
    "atsakymas": {
      "type": "string",
      "description": "Aiškus atsakymas pagal dokumento turinį."
    }
  },
  "required": ["atsakymas"]
}`;

const EXTRACT_LOADING_MESSAGES = [
  'Skaitomas dokumento kontekstas',
  'Ieškoma susijusių vietų',
  'Formuojamas atsakymas',
  'Tikrinama struktūra',
];

type ViewTab = 'markdown' | 'text' | 'json' | 'images';
type ParseStepKey = 'selected' | 'directus' | 'llama_upload' | 'parse_job' | 'result';
type StepStatus = 'waiting' | 'active' | 'done' | 'error';
type ExtractSchemaMode = 'auto' | 'fields' | 'raw';
type ExtractFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';
type ExtractPanelTab = 'config' | 'results';

interface ExtractFieldDraft {
  id: string;
  name: string;
  description: string;
  type: ExtractFieldType;
  required: boolean;
}

const PARSE_STEPS: { key: ParseStepKey; label: string }[] = [
  { key: 'selected', label: 'Failas pasirinktas' },
  { key: 'directus', label: 'Įkeliama į Directus' },
  { key: 'llama_upload', label: 'Ruošiami duomenys' },
  { key: 'parse_job', label: 'Skaitomas dokumentas' },
  { key: 'result', label: 'Paruošta ištraukimui' },
];

const DEFAULT_PARSE_STEPS = PARSE_STEPS.map(step => ({
  ...step,
  status: 'waiting' as StepStatus,
  detail: '',
}));

interface AnalizeInterfaceProps {
  user: AppUser;
  projectId: string;
  mainSidebarCollapsed?: boolean;
}

function extractionToJob(run: LlamaParseExtraction): ExtractJob {
  return {
    id: run.extract_job_id || run.id,
    status: run.extract_status,
    file_input: run.file_input || run.file_id,
    created_at: run.created_at,
    configuration: run.extract_config,
    error_message: run.error_message || null,
    extract_result: run.extract_result,
    extract_metadata: run.extract_metadata,
  };
}

function normalizeSchemaKey(value: string): string {
  const lithuanian = value
    .trim()
    .toLowerCase()
    .replace(/[ąàáâãäå]/g, 'a')
    .replace(/[č]/g, 'c')
    .replace(/[ęèéêëė]/g, 'e')
    .replace(/[įìíîï]/g, 'i')
    .replace(/[š]/g, 's')
    .replace(/[ųūùúûü]/g, 'u')
    .replace(/[ž]/g, 'z');

  return lithuanian
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function fieldTypeToSchema(type: ExtractFieldType, description: string) {
  if (type === 'array') {
    return { type: 'array', items: { type: 'string' }, description };
  }
  if (type === 'object') {
    return { type: 'object', additionalProperties: true, description };
  }
  return { type, description };
}

function buildSchemaFromFields(fields: ExtractFieldDraft[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  fields.forEach(field => {
    const key = normalizeSchemaKey(field.name);
    if (!key) return;

    const description = field.description.trim() || `Ištrauk reikšmę laukui "${field.name.trim()}".`;
    properties[key] = fieldTypeToSchema(field.type, description);
    if (field.required) required.push(key);
  });

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

function buildAutoSchema(goal: string) {
  const trimmedGoal = goal.trim();
  return {
    type: 'object',
    properties: {
      atsakymas: {
        type: 'string',
        description: trimmedGoal
          ? `Aiškus atsakymas į naudotojo prašymą: ${trimmedGoal}`
          : 'Aiškus paaiškinimas, apie ką yra dokumentas ir kokia svarbiausia jo informacija.',
      },
      svarbiausi_punktai: {
        type: 'array',
        items: { type: 'string' },
        description: 'Svarbiausios dokumento išvados, rekomendacijos, skaičiai, datos, rizikos arba sprendimai.',
      },
      nerasta: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ko naudotojas prašė, bet dokumente nepavyko rasti.',
      },
    },
    required: ['atsakymas'],
  };
}

function createExtractField(): ExtractFieldDraft {
  return {
    id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    description: '',
    type: 'string',
    required: false,
  };
}

function getFieldDescriptionPlaceholder(type: ExtractFieldType): string {
  switch (type) {
    case 'number':
      return 'Kokį skaičių, sumą ar kiekį rasti?';
    case 'boolean':
      return 'Kada atsakymas turi būti taip arba ne?';
    case 'array':
      return 'Kokį sąrašą surinkti?';
    case 'object':
      return 'Kokią susijusių reikšmių grupę surinkti?';
    case 'string':
    default:
      return 'Ką tiksliai ištraukti šiam laukui?';
  }
}

function getOriginalFileId(doc?: ParsedDocument | null): string | null {
  if (doc?.original_file_id) return doc.original_file_id;
  if (!doc?.original_file) return null;
  return typeof doc.original_file === 'string' ? doc.original_file : doc.original_file.id;
}

function isMissingDirectusFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /Upload failed \((403|404)\)/i.test(message)
    || /Failo paruošti nepavyko \((403|404)\)/i.test(message)
    || /directus.*file.*(not found|missing|forbidden|denied)/i.test(message)
    || /(failo|dokument[oą]).*(nerasta|nepavyko rasti|nepasiekiam)/i.test(message);
}

function formatResultLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function isMeaningfulResultValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(isMeaningfulResultValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isMeaningfulResultValue);
  return true;
}

function resultToPlainText(value: unknown, indent = 0): string {
  const prefix = '  '.repeat(indent);
  if (!isMeaningfulResultValue(value)) return '';

  if (Array.isArray(value)) {
    return value
      .filter(isMeaningfulResultValue)
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          return `${prefix}-\n${resultToPlainText(item, indent + 1)}`;
        }
        return `${prefix}- ${String(item)}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => isMeaningfulResultValue(nested))
      .map(([key, nested]) => {
        if (typeof nested === 'object' && nested !== null) {
          return `${prefix}${formatResultLabel(key)}:\n${resultToPlainText(nested, indent + 1)}`;
        }
        return `${prefix}${formatResultLabel(key)}: ${String(nested)}`;
      })
      .join('\n\n');
  }

  return `${prefix}${String(value)}`;
}

function resultToRawText(value: unknown): string {
  if (!isMeaningfulResultValue(value)) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .filter(isMeaningfulResultValue)
      .map(item => resultToRawText(item))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .filter(isMeaningfulResultValue)
      .map(item => resultToRawText(item))
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

function getParseResultStatus(result?: ParseResult | null): string {
  return result?.status || result?.job?.status || result?.metadata?.status || '';
}

function appendParseStatusHistory(
  history: Array<Record<string, unknown>>,
  status: string,
  response?: unknown
) {
  if (!status) return history;
  const last = history[history.length - 1];
  if (last?.status === status) return history;

  return [
    ...history,
    {
      status,
      at: new Date().toISOString(),
      ...(response ? { response } : {}),
    },
  ];
}

function buildParseJobRequestSnapshot(
  job: ParseJobResponse,
  input: {
    directusFileId?: string | null;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    tier: ParseTier;
    userPrompt?: string;
    source: 'browser_file' | 'directus_file';
  }
) {
  return {
    ...(job.request_json || {}),
    source: input.source,
    directus_file_id: input.directusFileId || null,
    file_name: input.fileName || null,
    file_type: input.fileType || null,
    file_size: input.fileSize || null,
    tier: input.tier,
    user_prompt: input.userPrompt || null,
  };
}

function getEffectiveParsePrompt(tier: ParseTier, prompt?: string | null): string | undefined {
  if (!supportsParseInstructions(tier)) return undefined;
  const trimmed = prompt?.trim();
  return trimmed || undefined;
}

export default function AnalizeInterface({ user, projectId, mainSidebarCollapsed = false }: AnalizeInterfaceProps) {
  void projectId;
  const isAdmin = Boolean(user.is_admin);
  const navigate = useNavigate();
  const { documentId: routeDocumentId } = useParams<{ documentId?: string }>();

  const navigateToDocument = useCallback((documentId: string, replace = false) => {
    navigate(`/analize/${documentId}`, { replace });
  }, [navigate]);

  const navigateToAnalizeRoot = useCallback((replace = false) => {
    navigate('/analize', { replace });
  }, [navigate]);

  // --- Document list ---
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  // --- Selected document ---
  const [selectedDoc, setSelectedDoc] = useState<ParsedDocument | null>(null);
  const [selectedDocFull, setSelectedDocFull] = useState<ParsedDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [previewFallbackFileId, setPreviewFallbackFileId] = useState<string | null>(null);

  // --- Upload & parsing ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseTier, setParseTier] = useState<ParseTier>('agentic');
  const [userPrompt, setUserPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'uploading' | 'parsing' | 'done' | 'error'>('idle');
  const [parseStatusText, setParseStatusText] = useState('');
  const [parseError, setParseError] = useState('');
  const [parseSteps, setParseSteps] = useState(DEFAULT_PARSE_STEPS);
  const [resumingParseId, setResumingParseId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const failedResumeIdsRef = useRef<Set<string>>(new Set());
  const selectedFileUploadSeqRef = useRef(0);
  const canUseParseInstructions = supportsParseInstructions(parseTier);

  // --- Result viewer ---
  const [resultViewTab, setResultViewTab] = useState<ViewTab>('markdown');

  // --- LlamaCloud Extract ---
  const [extractTier, setExtractTier] = useState<ExtractTier>('agentic');
  const [extractTarget, setExtractTarget] = useState<ExtractTarget>('per_doc');
  const [extractCitations, setExtractCitations] = useState(true);
  const [extractConfidence, setExtractConfidence] = useState(true);
  const [extractMaxPages, setExtractMaxPages] = useState('');
  const [extractTargetPages, setExtractTargetPages] = useState('');
  const [extractParseConfigId, setExtractParseConfigId] = useState('');
  const [extractVersion, setExtractVersion] = useState('latest');
  const [extractGoal, setExtractGoal] = useState('');
  const [extractSchemaMode, setExtractSchemaMode] = useState<ExtractSchemaMode>('auto');
  const [rawExtractSchemaText, setRawExtractSchemaText] = useState(DEFAULT_RAW_EXTRACT_SCHEMA);
  const [extractFields, setExtractFields] = useState<ExtractFieldDraft[]>([
    { id: 'field_1', name: '', description: '', type: 'string', required: false },
  ]);
  const [extractSystemPrompt, setExtractSystemPrompt] = useState('Atsakyk lietuviškai. Naudok tik dokumente rastą informaciją. Jei informacija nerasta, aiškiai parašyk, kad dokumente jos nėra.');
  const [showExtractAdvanced, setShowExtractAdvanced] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState('');
  const [extractResult, setExtractResult] = useState<ExtractJob | null>(null);
  const [_extractionRuns, setExtractionRuns] = useState<LlamaParseExtraction[]>([]);
  const [extractPanelTab, setExtractPanelTab] = useState<ExtractPanelTab>('config');
  const [extractLoadingMessageIndex, setExtractLoadingMessageIndex] = useState(0);

  // --- Image lightbox ---
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ---- Load documents on mount ----
  const loadDocuments = useCallback(async () => {
    try {
	      setDocsLoading(true);
	      setDocsError('');
	      const docs = await fetchParsedDocuments(user.id);
	      setDocuments(docs);
	      if (routeDocumentId) {
	        const routeDoc = docs.find(doc => doc.id === routeDocumentId) || null;
	        if (routeDoc) {
	          setSelectedDoc(prev => (prev?.id === routeDoc.id ? prev : routeDoc));
	          setPreviewFallbackFileId(getOriginalFileId(routeDoc));
	        } else {
	          setSelectedDoc(null);
	          setSelectedDocFull(null);
	          setPreviewFallbackFileId(null);
	          navigateToAnalizeRoot(true);
	        }
	      } else {
	        setSelectedDoc(null);
	        setSelectedDocFull(null);
	        setPreviewFallbackFileId(null);
	      }
	      setHistoryLoaded(true);
    } catch (err: unknown) {
      console.error('Failed to load documents:', err);
      const msg = err instanceof Error ? err.message : '';
      setDocsError(msg || 'Nepavyko įkelti dokumentų.');
    } finally {
      setDocsLoading(false);
    }
	  }, [navigateToAnalizeRoot, routeDocumentId, user.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

	  const selectDocument = useCallback((doc: ParsedDocument) => {
	    setSelectedDoc(doc);
	    setSelectedDocFull(prev => (prev?.id === doc.id ? prev : null));
	    setPreviewFallbackFileId(getOriginalFileId(doc));
	    if (routeDocumentId !== doc.id) navigateToDocument(doc.id);
	  }, [navigateToDocument, routeDocumentId]);

  const selectedDocId = selectedDoc?.id;

  useEffect(() => {
    if (!extractLoading) {
      setExtractLoadingMessageIndex(0);
      return;
    }
    const interval = window.setInterval(() => {
      setExtractLoadingMessageIndex(index => (index + 1) % EXTRACT_LOADING_MESSAGES.length);
    }, 1400);
    return () => window.clearInterval(interval);
  }, [extractLoading]);

  const loadExtractionHistory = useCallback(async (id: string) => {
    try {
      const runs = await fetchExtractionRuns(id);
      setExtractionRuns(runs);
      const latestCompleted = runs.find(run => run.extract_result);
      const latestJob = latestCompleted ? extractionToJob(latestCompleted) : null;
      setExtractResult(latestJob);
      setExtractPanelTab(latestJob ? 'results' : 'config');
    } catch (err) {
      console.error('Failed to load extraction history:', err);
      setExtractionRuns([]);
    }
  }, []);

  const loadFullDocument = useCallback(async (id: string) => {
    try {
      setDocLoading(true);
	      const doc = await getParsedDocument(id);
	      const fileId = getOriginalFileId(doc);
	      setSelectedDocFull(doc);
	      setPreviewFallbackFileId(fileId);
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      setDocLoading(false);
    }
  }, []);

  const finishParsedDocument = useCallback(async (
    documentId: string,
    result: {
      id?: string;
      file_id?: string;
      status?: string;
      result_content_markdown?: string;
      result_content_text?: string;
      result_content_json?: unknown;
      images_content_metadata?: unknown;
    }
  ) => {
    const markdown = result.result_content_markdown || '';
    const text = result.result_content_text || '';
    const contentForPageCount = markdown || text;
    await updateParsedDocument(documentId, {
      status: 'SUCCESS',
      llama_file_id: result.file_id || null,
      job_id: result.id || '',
      parsed_markdown: markdown,
      parsed_text: text,
      parsed_json: result.result_content_json || null,
      images_metadata: result.images_content_metadata || null,
      page_count: contentForPageCount ? contentForPageCount.split(/\n\n---\n\n|\n---\n/).length : 0,
    });

	    const fullDoc = await getParsedDocument(documentId);
	    const fileId = getOriginalFileId(fullDoc);
	    setPreviewFallbackFileId(fileId);
    setDocuments(prev => {
      const withoutDuplicate = prev.filter(item => item.id !== fullDoc.id);
      return [fullDoc, ...withoutDuplicate];
    });
	    setSelectedDoc(fullDoc);
	    setSelectedDocFull(fullDoc);
	    navigateToDocument(fullDoc.id, true);
	    return fullDoc;
	  }, [navigateToDocument]);

  const removeHistoryRecord = useCallback(async (documentId: string, message: string) => {
    await deleteParsedDocument(documentId).catch((error) => {
      console.warn('Failed to delete unhealthy parsed document:', error);
    });

	    setDocuments(prev => prev.filter(item => item.id !== documentId));
	    setSelectedDoc(prev => (prev?.id === documentId ? null : prev));
	    setSelectedDocFull(prev => (prev?.id === documentId ? null : prev));
	    if (routeDocumentId === documentId) navigateToAnalizeRoot(true);
    setExtractionRuns([]);
    setExtractResult(null);
    setParseSteps(DEFAULT_PARSE_STEPS);
    setParseStatus('idle');
    setPreviewFallbackFileId(null);
    setParseStatusText('');
    setParseError('');
    setDocsError(message);
	  }, [navigateToAnalizeRoot, routeDocumentId]);

  const resumePendingParse = useCallback(async (doc: ParsedDocument) => {
    if (!doc.job_id || resumingParseId === doc.id) return;

    setResumingParseId(doc.id);
    failedResumeIdsRef.current.delete(doc.id);
    setParseStatus('parsing');
    setParseError('');
    setParseStatusText('Tikrinama dokumento būsena...');
    setParseSteps(DEFAULT_PARSE_STEPS.map(step => {
      if (step.key === 'selected') return { ...step, status: 'done', detail: doc.file_name };
      if (step.key === 'directus') return { ...step, status: 'done', detail: 'Failas yra Directus saugykloje' };
      if (step.key === 'llama_upload') return { ...step, status: 'done', detail: doc.llama_file_id || 'Failas perduotas apdorojimui' };
      if (step.key === 'parse_job') return { ...step, status: 'active', detail: 'Dokumentas ruošiamas' };
      return { ...step, status: 'waiting', detail: '' };
    }));

    try {
      let resumeStatusHistory: Array<Record<string, unknown>> = [];
      const result = await pollUntilDone(doc.job_id, (status, statusResult) => {
        setParseStatusText(`Skaitomas dokumentas... (${status})`);
        resumeStatusHistory = appendParseStatusHistory(resumeStatusHistory, status, statusResult);
        void updateParseJobAttemptByParseJobId(doc.job_id, {
          status,
          response_json: statusResult,
          status_history_json: resumeStatusHistory,
        });
      });
      resumeStatusHistory = appendParseStatusHistory(resumeStatusHistory, result.status || 'SUCCESS', result);
      await updateParseJobAttemptByParseJobId(doc.job_id, {
        status: result.status || 'SUCCESS',
        response_json: result,
        parsed_markdown: result.result_content_markdown || '',
        parsed_text: result.result_content_text || '',
        parsed_json: result.result_content_json || null,
        images_metadata: result.images_content_metadata || null,
        status_history_json: resumeStatusHistory,
        completed_at: new Date().toISOString(),
      });
      await finishParsedDocument(doc.id, {
        ...result,
        id: result.id || doc.job_id,
        file_id: result.file_id || doc.llama_file_id || undefined,
      });
      setParseSteps(prev => prev.map(step => (
        step.key === 'parse_job' || step.key === 'result'
          ? { ...step, status: 'done' as StepStatus, detail: step.key === 'result' ? 'Dabar pasirinkite, ką norite ištraukti' : result.status || 'SUCCESS' }
          : step
      )));
      setParseStatus('done');
      setParseStatusText('Dokumentas apdorotas. Pasirinkite, ką norite ištraukti.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepavyko patikrinti dokumento būsenos';
      await updateParseJobAttemptByParseJobId(doc.job_id, {
        status: 'ERROR',
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      setParseSteps(prev => prev.map(step => (
        step.status === 'active' ? { ...step, status: 'error' as StepStatus, detail: message } : step
      )));
      setParseStatus('error');
      setParseError(message);
      setParseStatusText('');
      failedResumeIdsRef.current.add(doc.id);
    } finally {
      setResumingParseId(null);
    }
  }, [finishParsedDocument, resumingParseId]);

  // ---- Load full document when selected ----
  useEffect(() => {
    if (!selectedDocId) {
      setSelectedDocFull(null);
      setPreviewFallbackFileId(null);
      setExtractionRuns([]);
      setExtractResult(null);
      setExtractPanelTab('config');
      return;
    }
    loadFullDocument(selectedDocId);
    loadExtractionHistory(selectedDocId);
  }, [selectedDocId, loadFullDocument, loadExtractionHistory]);

  useEffect(() => {
    if (
      selectedDocFull?.status === 'PENDING'
      && selectedDocFull.job_id
      && resumingParseId !== selectedDocFull.id
      && !failedResumeIdsRef.current.has(selectedDocFull.id)
    ) {
      resumePendingParse(selectedDocFull);
    }
  }, [resumingParseId, resumePendingParse, selectedDocFull]);

  // ---- Filtered documents ----
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(d => d.file_name.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  // ---- Images ----
  const images: { filename: string; url: string }[] = useMemo(() => {
    const meta = selectedDocFull?.images_metadata;
    if (!meta) return [];
    if (Array.isArray(meta)) return meta;
    try {
      return typeof meta === 'string' ? JSON.parse(meta) : [];
    } catch {
      return [];
    }
  }, [selectedDocFull?.images_metadata]);

  // ===========================================================================
  // FILE UPLOAD & PARSING
  // ===========================================================================

	  const handleFileSelect = async (file: File) => {
	    const uploadSeq = selectedFileUploadSeqRef.current + 1;
	    selectedFileUploadSeqRef.current = uploadSeq;
	    setSelectedFile(file);
	    setSelectedDoc(null);
	    setSelectedDocFull(null);
	    setPreviewFallbackFileId(null);
	    navigateToAnalizeRoot();
	    setExtractionRuns([]);
    setExtractResult(null);
    setExtractPanelTab('config');
    setParseStatus('uploading');
    setParseStatusText('Įkeliama į Directus...');
    setParseError('');
    setParseSteps(DEFAULT_PARSE_STEPS.map(step => ({
      ...step,
      status: step.key === 'selected' ? 'done' : step.key === 'directus' ? 'active' : 'waiting',
      detail: step.key === 'selected'
        ? `${file.name} · ${formatFileSize(file.size)}`
        : step.key === 'directus'
        ? 'Failas siunčiamas į Directus saugyklą'
        : '',
    })));

    try {
      const originalFile = await uploadOriginalDocument(file);
      if (selectedFileUploadSeqRef.current !== uploadSeq) return;
      setPreviewFallbackFileId(originalFile.id);
      const effectiveUserPrompt = getEffectiveParsePrompt(parseTier, userPrompt);

      const doc = await saveParsedDocument({
        user_id: user.id,
        original_file: originalFile.id,
        file_name: file.name,
        file_type: file.type || file.name.split('.').pop() || 'unknown',
        file_size: file.size,
        tier: parseTier,
        job_id: '',
        status: 'PENDING',
        user_prompt: effectiveUserPrompt,
      });
      if (selectedFileUploadSeqRef.current !== uploadSeq) return;

      setHistoryLoaded(true);
	      setDocuments(prev => [doc, ...prev.filter(item => item.id !== doc.id)]);
	      setSelectedDoc(doc);
	      setSelectedDocFull(doc);
	      setPreviewFallbackFileId(originalFile.id);
	      navigateToDocument(doc.id, true);
	      setParseStatus('idle');
      setParseStatusText('Failas įkeltas į Directus. Paleiskite analizę.');
      setParseSteps(prev => prev.map(step => (
        step.key === 'directus'
          ? { ...step, status: 'done' as StepStatus, detail: originalFile.filename_download || originalFile.title || 'Failas išsaugotas' }
          : step
      )));
    } catch (err) {
      if (selectedFileUploadSeqRef.current !== uploadSeq) return;
      const message = err instanceof Error ? err.message : 'Nepavyko įkelti failo į Directus';
      setParseStatus('error');
      setParseStatusText('');
      setParseError(message);
      setParseSteps(prev => prev.map(step => (
        step.key === 'directus' ? { ...step, status: 'error' as StepStatus, detail: message } : step
      )));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleParse = async () => {
    if (!selectedFile) return;
    let processingDocId: string | null = null;
    let directusFileId = getOriginalFileId(selectedDocFull || selectedDoc);
    const effectiveUserPrompt = getEffectiveParsePrompt(parseTier, userPrompt);
    const preparedDoc = directusFileId && (selectedDocFull || selectedDoc)?.status === 'PENDING'
      ? (selectedDocFull || selectedDoc)
      : null;
    const preparedOriginalFile = preparedDoc?.original_file && typeof preparedDoc.original_file === 'object'
      ? preparedDoc.original_file
      : null;

    const setStep = (key: ParseStepKey, status: StepStatus, detail = '') => {
      setParseSteps(prev => prev.map(step => step.key === key ? { ...step, status, detail } : step));
    };

    let parseJobRecordId: string | null = null;
    let parseStatusHistory: Array<Record<string, unknown>> = [];
    const recordParseStatus = async (status: string, response?: ParseResult) => {
      if (!parseJobRecordId || !status) return;
      parseStatusHistory = appendParseStatusHistory(parseStatusHistory, status, response);
      await updateParseJobAttempt(parseJobRecordId, {
        status,
        response_json: response || null,
        status_history_json: parseStatusHistory,
      });
    };

    setParseStatus('uploading');
    setParseStatusText('Įkeliama...');
    setParseError('');

    try {
      let doc = preparedDoc;
      let originalFile = preparedOriginalFile;

      if (!doc || !directusFileId) {
        setParseStatusText('Įkeliama į Directus...');
        setStep('directus', 'active', 'Failas siunčiamas į Directus saugyklą');
        originalFile = await uploadOriginalDocument(selectedFile);
        directusFileId = originalFile.id;
        setPreviewFallbackFileId(directusFileId);
        setStep('directus', 'done', originalFile.filename_download || originalFile.title || 'Failas išsaugotas');

        // Save placeholder to Directus first
        doc = await saveParsedDocument({
          user_id: user.id,
          original_file: originalFile.id,
          file_name: selectedFile.name,
          file_type: selectedFile.type || selectedFile.name.split('.').pop() || 'unknown',
          file_size: selectedFile.size,
          tier: parseTier,
          job_id: '',
          status: 'PENDING',
          user_prompt: effectiveUserPrompt,
        });
      } else {
        setPreviewFallbackFileId(directusFileId);
        setStep('directus', 'done', preparedOriginalFile?.filename_download || preparedOriginalFile?.title || 'Failas jau yra Directus saugykloje');
      }

      if (!doc || !directusFileId) {
        throw new Error('Nepavyko paruošti Directus failo.');
      }

      processingDocId = doc.id;
      await updateParsedDocument(doc.id, {
        tier: parseTier,
        user_prompt: effectiveUserPrompt,
      });
      doc = {
        ...doc,
        tier: parseTier,
        user_prompt: effectiveUserPrompt,
      };
      setHistoryLoaded(true);
	      setDocuments(prev => [doc, ...prev.filter(item => item.id !== doc.id)]);
	      setSelectedDoc(doc);
	      setSelectedDocFull(doc);
	      navigateToDocument(doc.id, true);

      setParseStatus('parsing');
      setParseStatusText('Ruošiami duomenys...');
      setStep('llama_upload', 'active', 'Failas perduodamas apdorojimui');

      // Run LlamaParse. In production we avoid sending the large multipart body
      // through Cloudflare/Netlify by forwarding the already-uploaded Directus
      // file server-side.
      const result = import.meta.env.DEV
        ? await llamaParse(
          selectedFile,
          {
            tier: parseTier,
            userPrompt: effectiveUserPrompt,
            onJobStarted: async (job) => {
              setStep('llama_upload', 'done', job.file_id ? 'Failas priimtas' : 'Failas priimtas apdorojimui');
              setParseStatusText('Skaitomas dokumentas...');
              setStep('parse_job', 'active', 'Dokumentas ruošiamas');
              const initialStatus = job.status || 'PENDING';
              parseStatusHistory = appendParseStatusHistory([], initialStatus, job);
              const parseJobRecord = await saveParseJobAttempt({
                file_id: doc.id,
                llama_file_id: job.file_id || null,
                parse_job_id: job.id,
                request_json: buildParseJobRequestSnapshot(job, {
                  directusFileId,
                  fileName: selectedFile.name,
                  fileType: selectedFile.type || undefined,
                  fileSize: selectedFile.size,
                  tier: parseTier,
                  userPrompt: effectiveUserPrompt,
                  source: 'browser_file',
                }),
                response_json: job,
                status: initialStatus,
                status_history_json: parseStatusHistory,
              });
              parseJobRecordId = parseJobRecord?.id || null;
              await updateParsedDocument(doc.id, {
                status: 'PENDING',
                llama_file_id: job.file_id || null,
                job_id: job.id,
              });
            },
            onJobProgress: (statusResult) => {
              void recordParseStatus(getParseResultStatus(statusResult), statusResult);
            },
          },
          (status) => setParseStatusText(status)
        )
        : await parseDirectusDocument(
          {
            directusFileId,
            fileName: selectedFile.name,
            fileType: selectedFile.type || undefined,
            fileSize: selectedFile.size,
          },
          {
            tier: parseTier,
            userPrompt: effectiveUserPrompt,
            onJobStarted: async (job) => {
              setStep('llama_upload', 'done', job.file_id ? 'Failas priimtas' : 'Failas priimtas apdorojimui');
              setParseStatusText('Skaitomas dokumentas...');
              setStep('parse_job', 'active', 'Dokumentas ruošiamas');
              const initialStatus = job.status || 'PENDING';
              parseStatusHistory = appendParseStatusHistory([], initialStatus, job);
              const parseJobRecord = await saveParseJobAttempt({
                file_id: doc.id,
                llama_file_id: job.file_id || null,
                parse_job_id: job.id,
                request_json: buildParseJobRequestSnapshot(job, {
                  directusFileId,
                  fileName: selectedFile.name,
                  fileType: selectedFile.type || undefined,
                  fileSize: selectedFile.size,
                  tier: parseTier,
                  userPrompt: effectiveUserPrompt,
                  source: 'directus_file',
                }),
                response_json: job,
                status: initialStatus,
                status_history_json: parseStatusHistory,
              });
              parseJobRecordId = parseJobRecord?.id || null;
              await updateParsedDocument(doc.id, {
                status: 'PENDING',
                llama_file_id: job.file_id || null,
                job_id: job.id,
              });
            },
            onJobProgress: (statusResult) => {
              void recordParseStatus(getParseResultStatus(statusResult), statusResult);
            },
          },
          (status) => setParseStatusText(status)
        );

      await recordParseStatus(result.status || 'SUCCESS', result);
      await updateParseJobAttempt(parseJobRecordId, {
        status: result.status || 'SUCCESS',
        response_json: result,
        parsed_markdown: result.result_content_markdown || '',
        parsed_text: result.result_content_text || '',
        parsed_json: result.result_content_json || null,
        images_metadata: result.images_content_metadata || null,
        status_history_json: parseStatusHistory,
        completed_at: new Date().toISOString(),
      });
      setStep('parse_job', 'done', result.status || 'SUCCESS');
      setStep('result', 'done', 'Dabar pasirinkite, ką norite ištraukti');

      setParseStatus('done');
      setParseStatusText('Dokumentas apdorotas. Pasirinkite, ką norite ištraukti.');
      setSelectedFile(null);
      setUserPrompt('');

      // Load the freshly processed record without forcing full history open.
      await finishParsedDocument(doc.id, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Apdorojimas nepavyko';
      await updateParseJobAttempt(parseJobRecordId, {
        status: 'ERROR',
        error_message: message,
        status_history_json: appendParseStatusHistory(parseStatusHistory, 'ERROR'),
        completed_at: new Date().toISOString(),
      });
      setParseSteps(prev => prev.map(step => (
        step.status === 'active' ? { ...step, status: 'error' as StepStatus, detail: message } : step
      )));
      if (processingDocId) {
        await updateParsedDocument(processingDocId, { status: 'ERROR' }).catch(() => undefined);
      }
      setParseStatus('error');
      setParseError(message);
      setParseStatusText('');
    }
  };

  const handlePrepareStoredDocument = async () => {
    if (!selectedDocFull || selectedDocFull.status !== 'PENDING' || selectedDocFull.job_id) return;
    const directusFileId = getOriginalFileId(selectedDocFull);
    if (!directusFileId) {
      await removeHistoryRecord(selectedDocFull.id, 'Istorijoje buvo nepasiekiamas failas. Įrašas pašalintas.');
      return;
    }
    setPreviewFallbackFileId(directusFileId);
    const storedTier = selectedDocFull.tier || parseTier;
    const storedUserPrompt = getEffectiveParsePrompt(storedTier, selectedDocFull.user_prompt);

    const setStep = (key: ParseStepKey, status: StepStatus, detail = '') => {
      setParseSteps(prev => prev.map(step => step.key === key ? { ...step, status, detail } : step));
    };

    let parseJobRecordId: string | null = null;
    let parseStatusHistory: Array<Record<string, unknown>> = [];
    const recordParseStatus = async (status: string, response?: ParseResult) => {
      if (!parseJobRecordId || !status) return;
      parseStatusHistory = appendParseStatusHistory(parseStatusHistory, status, response);
      await updateParseJobAttempt(parseJobRecordId, {
        status,
        response_json: response || null,
        status_history_json: parseStatusHistory,
      });
    };

    setParseStatus('parsing');
    setParseError('');
    setParseStatusText('Ruošiamas dokumentas...');
    setParseSteps(DEFAULT_PARSE_STEPS.map(step => {
      if (step.key === 'selected') return { ...step, status: 'done', detail: selectedDocFull.file_name };
      if (step.key === 'directus') return { ...step, status: 'done', detail: 'Failas jau yra Directus saugykloje' };
      if (step.key === 'llama_upload') return { ...step, status: 'active', detail: 'Failas perduodamas apdorojimui' };
      return { ...step, status: 'waiting', detail: '' };
    }));

    try {
      const result = await parseDirectusDocument(
        {
          directusFileId,
          fileName: selectedDocFull.file_name,
          fileType: selectedDocFull.file_type || undefined,
          fileSize: selectedDocFull.file_size || undefined,
        },
        {
          tier: storedTier,
          userPrompt: storedUserPrompt,
          onJobStarted: async (job) => {
            setStep('llama_upload', 'done', job.file_id ? 'Failas priimtas' : 'Failas priimtas apdorojimui');
            setStep('parse_job', 'active', 'Dokumentas ruošiamas');
            setParseStatusText('Skaitomas dokumentas...');
            const initialStatus = job.status || 'PENDING';
            parseStatusHistory = appendParseStatusHistory([], initialStatus, job);
            const parseJobRecord = await saveParseJobAttempt({
              file_id: selectedDocFull.id,
              llama_file_id: job.file_id || null,
              parse_job_id: job.id,
              request_json: buildParseJobRequestSnapshot(job, {
                directusFileId,
                fileName: selectedDocFull.file_name,
                fileType: selectedDocFull.file_type || undefined,
                fileSize: selectedDocFull.file_size || undefined,
                tier: storedTier,
                userPrompt: storedUserPrompt,
                source: 'directus_file',
              }),
              response_json: job,
              status: initialStatus,
              status_history_json: parseStatusHistory,
            });
            parseJobRecordId = parseJobRecord?.id || null;
            await updateParsedDocument(selectedDocFull.id, {
              status: 'PENDING',
              llama_file_id: job.file_id || null,
              job_id: job.id,
            });
          },
          onJobProgress: (statusResult) => {
            void recordParseStatus(getParseResultStatus(statusResult), statusResult);
          },
        },
        status => setParseStatusText(status)
      );

      await recordParseStatus(result.status || 'SUCCESS', result);
      await updateParseJobAttempt(parseJobRecordId, {
        status: result.status || 'SUCCESS',
        response_json: result,
        parsed_markdown: result.result_content_markdown || '',
        parsed_text: result.result_content_text || '',
        parsed_json: result.result_content_json || null,
        images_metadata: result.images_content_metadata || null,
        status_history_json: parseStatusHistory,
        completed_at: new Date().toISOString(),
      });
      setStep('parse_job', 'done', result.status || 'SUCCESS');
      setStep('result', 'done', 'Dabar pasirinkite, ką norite ištraukti');
      await finishParsedDocument(selectedDocFull.id, result);
      setParseStatus('done');
      setParseStatusText('Dokumentas paruoštas. Pasirinkite, ką norite ištraukti.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dokumento paruošti nepavyko';
      await updateParseJobAttempt(parseJobRecordId, {
        status: 'ERROR',
        error_message: message,
        status_history_json: appendParseStatusHistory(parseStatusHistory, 'ERROR'),
        completed_at: new Date().toISOString(),
      });
      if (isMissingDirectusFileError(err)) {
        await removeHistoryRecord(selectedDocFull.id, 'Istorijoje buvo nepasiekiamas failas. Įrašas pašalintas.');
        return;
      }
      setParseSteps(prev => prev.map(step => (
        step.status === 'active' ? { ...step, status: 'error' as StepStatus, detail: message } : step
      )));
      await updateParsedDocument(selectedDocFull.id, { status: 'ERROR' }).catch(() => undefined);
      setParseStatus('error');
      setParseError(message);
      setParseStatusText('');
    }
  };

  const handleDeleteDoc = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const wasSelected = selectedDoc?.id === id;
	    if (wasSelected) {
	      setSelectedDoc(null);
	      setPreviewFallbackFileId(null);
	      navigateToAnalizeRoot(true);
	    }
    try {
      await deleteParsedDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
	      if (wasSelected) {
	        const restoredDoc = documents.find(d => d.id === id) ?? null;
	        setSelectedDoc(restoredDoc);
	        if (restoredDoc) navigateToDocument(restoredDoc.id, true);
	      }
      setDocsError('Nepavyko ištrinti dokumento');
    }
  };

  const activeExtractSchema = useMemo(() => {
    if (extractSchemaMode === 'fields') return buildSchemaFromFields(extractFields);
    if (extractSchemaMode === 'raw') {
      try {
        const parsed = JSON.parse(rawExtractSchemaText);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return buildAutoSchema(extractGoal);
  }, [extractFields, extractGoal, extractSchemaMode, rawExtractSchemaText]);

  const activeExtractSchemaText = useMemo(() => {
    if (extractSchemaMode === 'raw') return rawExtractSchemaText;
    return JSON.stringify(activeExtractSchema, null, 2);
  }, [activeExtractSchema, extractSchemaMode, rawExtractSchemaText]);

  const handleRunExtract = async () => {
    if (!isAdmin || !selectedDocFull || selectedDocFull.status !== 'SUCCESS' || extractLoading) return;

    setExtractLoading(true);
    setExtractError('');
    setExtractStatus('Analizuojama...');
    setExtractResult(null);
    setExtractPanelTab('config');

    try {
      const parsedSchema = extractSchemaMode === 'raw'
        ? JSON.parse(rawExtractSchemaText)
        : activeExtractSchema;
      const fieldKeys = Object.keys((parsedSchema.properties ?? {}) as Record<string, unknown>);
      if (extractSchemaMode === 'fields' && fieldKeys.length === 0) {
        throw new Error('Pridėkite bent vieną lauką arba perjunkite į automatinį režimą.');
      }
      if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
        throw new Error('JSON schema turi būti objektas.');
      }
      const configuration: ExtractConfiguration = {
        data_schema: parsedSchema,
        tier: extractTier,
        extraction_target: extractTarget,
        parse_tier: selectedDocFull.tier,
        parse_config_id: extractParseConfigId.trim() || null,
        extract_version: extractVersion.trim() || 'latest',
        cite_sources: extractCitations,
        confidence_scores: extractConfidence,
        target_pages: extractTargetPages.trim() || null,
        max_pages: extractMaxPages.trim() ? Number(extractMaxPages) : null,
        system_prompt: [
          extractSchemaMode === 'auto'
            ? 'Naudok lanksčią ištraukimo struktūrą: pirmiausia atsakyk į naudotojo prašymą, tada išvardyk svarbiausius punktus ir aiškiai pažymėk, ko dokumente neradai.'
            : extractSchemaMode === 'fields'
            ? 'Naudok tik naudotojo aprašytus laukus. Laukų pavadinimų nekeisk, reikšmes grąžink tik pagal dokumento turinį.'
            : 'Naudok naudotojo įvestą JSON schemą. Grąžink tik tai, kas atitinka schemą ir dokumento turinį.',
          extractGoal.trim()
            ? `Naudotojo tikslas: ${extractGoal.trim()}`
            : 'Naudotojo tikslas: trumpai paaiškink, apie ką dokumentas, ir ištrauk svarbiausią informaciją.',
          extractSystemPrompt.trim(),
        ].filter(Boolean).join('\n\n') || null,
      };

      const fallbackText = selectedDocFull.parsed_markdown || selectedDocFull.parsed_text || '';
      const fileInput = selectedDocFull.llama_file_id || selectedDocFull.job_id || undefined;
      const requestPayload = {
        file_input: fileInput || null,
        configuration,
        file_id: selectedDocFull.id,
        parse_job_id: selectedDocFull.job_id || null,
      };
      const configId = await saveExtractConfigSnapshot({
        user_id: user.id,
        project_id: projectId,
        name: selectedDocFull.file_name,
        configuration,
        schema_mode: extractSchemaMode,
        extract_goal: extractGoal,
        raw_schema_text: rawExtractSchemaText,
      });
      const job = await runExtract({
        fileInput,
        fallbackText,
        fallbackFileName: selectedDocFull.file_name.replace(/\.[^.]+$/, '') || 'document',
        configuration,
        onStatus: status => {
          setExtractStatus(status.replace('Ištraukiama', 'Analizuojama').replace('Pradedamas ištraukimas', 'Pradedama analizė'));
        },
      });

      const savedRun = await saveExtractionRun({
        file_id: selectedDocFull.id,
        file_input: job.file_input || fileInput || null,
        extract_job_id: job.id,
        extract_status: job.status,
        config_id: configId,
        extract_config: configuration,
        extract_result: job.extract_result ?? null,
        extract_metadata: job.extract_metadata ?? job.metadata ?? null,
        error_message: job.error_message || null,
        request_json: {
          ...requestPayload,
          file_input: job.file_input || fileInput || null,
          fallback_used: !fileInput && Boolean(fallbackText.trim()),
          fallback_file_name: selectedDocFull.file_name.replace(/\.[^.]+$/, '') || 'document',
        },
        response_json: job,
        status_history_json: [
          { status: 'REQUESTED', at: new Date().toISOString() },
          { status: job.status, at: new Date().toISOString() },
        ],
      });

      setExtractResult(job);
      setExtractPanelTab('results');
      setExtractionRuns(prev => [savedRun, ...prev.filter(run => run.id !== savedRun.id)]);
      setExtractStatus('Rezultatai paruošti');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ištraukimas nepavyko';
      setExtractError(message);
      setExtractStatus('');
    } finally {
      setExtractLoading(false);
    }
  };

  const extractResultJson = useMemo(() => {
    if (!extractResult) return '';
    return JSON.stringify(extractResult.extract_result ?? extractResult, null, 2);
  }, [extractResult]);

  const extractResultValue = useMemo(() => extractResult?.extract_result ?? null, [extractResult]);

  const extractResultText = useMemo(() => resultToPlainText(extractResultValue), [extractResultValue]);
  const extractResultRawText = useMemo(() => resultToRawText(extractResultValue), [extractResultValue]);

  const workflowStatus = useMemo(() => {
    if (parseStatus === 'uploading') {
      return {
        title: 'Įkeliama',
        detail: parseStatusText || 'Failas įkeliamas į sistemą.',
        tone: 'blue' as const,
      };
    }
    if (parseStatus === 'parsing') {
      return {
        title: 'Apdorojama',
        detail: parseStatusText || 'Dokumentas ruošiamas.',
        tone: 'amber' as const,
      };
    }
    if (selectedDocFull?.status === 'PENDING') {
      return {
        title: selectedDocFull.job_id ? 'Tikrinama būsena' : 'Nepaleista',
        detail: selectedDocFull.job_id
          ? 'Dokumentas dar ruošiamas. Tikrinama būsena.'
          : 'Failas yra istorijoje. Paruoškite jį, kad galėtumėte ištraukti duomenis.',
        tone: selectedDocFull.job_id ? 'amber' as const : 'red' as const,
      };
    }
    if (parseStatus === 'error' || selectedDocFull?.status === 'ERROR') {
      return {
        title: 'Klaida',
        detail: parseError || 'Dokumento apdorojimas nepavyko.',
        tone: 'red' as const,
      };
    }
    if (extractLoading) {
      return {
        title: 'Analizuojama',
        detail: extractStatus || 'Ištraukiami duomenys iš dokumento.',
        tone: 'amber' as const,
      };
    }
    if (selectedDocFull?.status === 'SUCCESS') {
      return {
        title: 'Ką norite ištraukti?',
        detail: 'Dokumentas apdorotas. Įrašykite, ką norite ištraukti.',
        tone: 'blue' as const,
      };
    }
    return {
      title: 'Pasirinkite dokumentą',
      detail: 'Įkelkite naują dokumentą arba atidarykite jį iš istorijos.',
      tone: 'neutral' as const,
    };
  }, [extractLoading, extractStatus, parseError, parseStatus, parseStatusText, selectedDocFull?.job_id, selectedDocFull?.status]);

  const workflowTone = {
    blue: { background: 'rgba(0,122,255,0.08)', color: '#007AFF', border: 'rgba(0,122,255,0.18)' },
    amber: { background: 'rgba(245,158,11,0.09)', color: '#b45309', border: 'rgba(245,158,11,0.2)' },
    green: { background: 'rgba(16,185,129,0.08)', color: '#10b981', border: 'rgba(16,185,129,0.18)' },
    red: { background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'rgba(239,68,68,0.18)' },
    neutral: { background: 'rgba(0,0,0,0.035)', color: '#5a5550', border: 'rgba(0,0,0,0.08)' },
  }[workflowStatus.tone];

  const canExtract = selectedDocFull?.status === 'SUCCESS' && !extractLoading;
  const canStartExtract = isAdmin && canExtract;
  const canConfigureParsing = selectedDocFull?.status === 'PENDING' && !selectedDocFull.job_id && !extractResult;
  const showWorkflowStatus = !extractResult && !canConfigureParsing && (
    parseStatus === 'uploading'
    || parseStatus === 'parsing'
    || parseStatus === 'error'
    || selectedDocFull?.status === 'ERROR'
    || (selectedDocFull?.status === 'PENDING' && Boolean(selectedDocFull.job_id))
  );
  const previewDocument = selectedDocFull || selectedDoc;
  const previewFileId = getOriginalFileId(previewDocument) || previewFallbackFileId;
  const previewFileName = previewDocument?.file_name || selectedFile?.name || 'Dokumentas';
  const previewMimeType = previewDocument?.file_type || selectedFile?.type || '';

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const tierLabel = (tier: string) => TIERS.find(t => t.value === tier)?.label || tier;

  const getHistoryDocSteps = (doc: ParsedDocument) => DEFAULT_PARSE_STEPS.map(step => {
    if (step.key === 'selected') return { ...step, status: 'done' as StepStatus, detail: doc.file_name };
    if (step.key === 'directus' && getOriginalFileId(doc)) return { ...step, status: 'done' as StepStatus, detail: 'Failas yra Directus saugykloje' };
    if (step.key === 'llama_upload' && doc.llama_file_id) return { ...step, status: 'done' as StepStatus, detail: doc.llama_file_id };
    if (step.key === 'parse_job' && doc.job_id) return { ...step, status: doc.status === 'ERROR' ? 'error' as StepStatus : 'active' as StepStatus, detail: doc.status === 'ERROR' ? 'Apdorojimas nepavyko' : 'Dokumentas ruošiamas' };
    if (step.key === 'result' && doc.status === 'SUCCESS') return { ...step, status: 'done' as StepStatus, detail: 'Paruošta ištraukimui' };
    return { ...step, status: doc.status === 'ERROR' ? 'error' as StepStatus : step.status };
  });

  return (
    <div className="h-full flex" style={{ background: '#fdfcfb' }}>
      {historyCollapsed && (
        <button
          onClick={() => setHistoryCollapsed(false)}
          className="fixed top-4 z-50 app-icon-btn rounded-r-lg transition-all duration-300 bg-white shadow-sm"
          style={{
            left: mainSidebarCollapsed ? '64px' : '208px',
          }}
          title="Išskleisti istoriją"
          aria-label="Išskleisti istoriją"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* ================================================================== */}
      {/* LEFT SIDEBAR — Document List & Upload                              */}
      {/* ================================================================== */}
      <div
        className="flex-shrink-0 flex flex-col h-full transition-all duration-300"
        style={{
          width: historyCollapsed ? '0px' : '320px',
          overflow: historyCollapsed ? 'hidden' : 'visible',
          opacity: historyCollapsed ? 0 : 1,
          borderRight: '1px solid #f0ede8',
        }}
      >
        <>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 shrink-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#3d3935' }}>Dokumentų analizė</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHistoryCollapsed(true)}
                className="app-icon-btn"
                title="Sutraukti"
                aria-label="Sutraukti istoriją"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Upload Zone */}
          <div
            className={`relative rounded-lg px-3 py-2 text-left cursor-pointer transition-all duration-200 ${
              dragOver ? 'scale-[1.02]' : ''
            }`}
            style={{
              border: `1px dashed ${dragOver ? '#007AFF' : 'rgba(0,0,0,0.14)'}`,
              background: dragOver ? 'rgba(0,122,255,0.04)' : '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelect(file);
                e.target.value = '';
              }}
            />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                <Plus className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: '#3d3935' }}>
                  Įkelti naują
                </p>
              </div>
            </div>
          </div>

          {/* Selected file info */}
          {selectedFile && (
            <div className="mt-3 rounded-xl bg-white p-3.5 shadow-sm" style={{ border: '0.5px solid rgba(0,0,0,0.09)' }}>
              <div className="mb-3 flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#007AFF' }} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" style={{ color: '#3d3935' }}>{selectedFile.name}</span>
                  <p className="mt-0.5 text-[10px]" style={{ color: '#8a857f' }}>{formatFileSize(selectedFile.size)}</p>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: parseStatus === 'error'
                      ? 'rgba(239,68,68,0.08)'
                      : parseStatus === 'done'
                      ? 'rgba(16,185,129,0.08)'
                      : parseStatus === 'idle'
                      ? 'rgba(0,122,255,0.08)'
                      : 'rgba(245,158,11,0.08)',
                    color: parseStatus === 'error'
                      ? '#ef4444'
                      : parseStatus === 'done'
                      ? '#10b981'
                      : parseStatus === 'idle'
                      ? '#007AFF'
                      : '#b45309',
                  }}
                >
                  {parseStatus === 'idle' ? 'Paruošta' : parseStatus === 'done' ? 'Atlikta' : parseStatus === 'error' ? 'Klaida' : 'Vykdoma'}
                </span>
                <button
	                  onClick={() => {
	                    selectedFileUploadSeqRef.current += 1;
	                    setSelectedFile(null);
	                    setSelectedDoc(null);
	                    setSelectedDocFull(null);
	                    setPreviewFallbackFileId(null);
	                    navigateToAnalizeRoot();
	                    setParseStatus('idle');
	                    setParseStatusText('');
	                    setParseError('');
                    setParseSteps(DEFAULT_PARSE_STEPS);
                  }}
                  className="rounded-md p-1 transition-colors hover:bg-black/5"
                  disabled={parseStatus === 'uploading' || parseStatus === 'parsing'}
                >
                  <X className="h-3.5 w-3.5" style={{ color: '#8a857f' }} />
                </button>
              </div>

              <div className="mb-3 space-y-1.5">
                {parseSteps.map((step, index) => (
                  <div key={step.key} className="flex items-start gap-2 text-[11px]">
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                      style={{
                        background: step.status === 'done'
                          ? 'rgba(16,185,129,0.1)'
                          : step.status === 'active'
                          ? 'rgba(0,122,255,0.1)'
                          : step.status === 'error'
                          ? 'rgba(239,68,68,0.1)'
                          : 'rgba(0,0,0,0.05)',
                        color: step.status === 'done'
                          ? '#10b981'
                          : step.status === 'active'
                          ? '#007AFF'
                          : step.status === 'error'
                          ? '#ef4444'
                          : '#8a857f',
                      }}
                    >
                      {step.status === 'active' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : index + 1}
                    </span>
                    <div className="min-w-0">
                      <p style={{ color: step.status === 'waiting' ? '#8a857f' : '#3d3935' }}>{step.label}</p>
                      {step.detail && (
                        <p className="truncate text-[10px]" style={{ color: '#8a857f' }}>{step.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* Parse status feedback */}
          {parseStatus === 'done' && (
            <div className="mt-2 p-2 rounded-lg flex items-center gap-2 text-xs" style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{parseStatusText}</span>
            </div>
          )}
          {parseStatus === 'error' && (
            <div className="mt-2 p-2 rounded-lg flex items-center gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Search */}
        {historyLoaded && (
          <div className="px-5 pb-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#8a857f' }} />
              <input
                type="text"
                placeholder="Ieškoti istorijoje..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 text-xs rounded-lg pl-8 pr-3 outline-none transition-all"
                style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
              />
            </div>
          </div>
        )}

        {/* Document List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {docsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#8a857f' }} />
            </div>
          ) : docsError ? (
            <div className="mx-2 mt-2 p-2.5 rounded-lg flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)' }}>
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#ef4444' }} />
              <span className="text-xs" style={{ color: '#ef4444' }}>{docsError}</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: '#d1cdc7' }} />
              <p className="text-xs" style={{ color: '#8a857f' }}>
                {searchQuery ? 'Nieko nerasta' : 'Nėra dokumentų'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => selectDocument(doc)}
                  className="w-full text-left p-2.5 rounded-lg transition-all group"
                  style={{
                    background: '#fff',
                    border: '0.5px solid transparent',
                    borderLeft: selectedDoc?.id === doc.id ? '3px solid #007AFF' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedDoc?.id !== doc.id) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: selectedDoc?.id === doc.id ? '#007AFF' : '#8a857f' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#3d3935' }}>{doc.file_name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}
                        >
                          {tierLabel(doc.tier)}
                        </span>
                        <span
                          className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                            doc.status === 'SUCCESS'
                              ? ''
                              : doc.status === 'ERROR'
                              ? ''
                              : ''
                          }`}
                          style={{
                            background: doc.status === 'SUCCESS' ? 'rgba(16,185,129,0.08)' : doc.status === 'ERROR' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                            color: doc.status === 'SUCCESS' ? '#10b981' : doc.status === 'ERROR' ? '#ef4444' : '#f59e0b',
                          }}
                        >
                          {doc.status === 'SUCCESS' ? 'Atlikta' : doc.status === 'ERROR' ? 'Klaida' : 'Vykdoma'}
                        </span>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: '#8a857f' }}>{formatDate(doc.created_at)}</p>
                    </div>
                    <button
                      onClick={e => handleDeleteDoc(doc.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all hover:bg-red-50"
                      title="Ištrinti"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                  {selectedDoc?.id === doc.id && doc.status !== 'SUCCESS' && (
                    <div className="mt-3 space-y-1.5 pl-6">
                      {(selectedFile ? parseSteps : getHistoryDocSteps(doc)).map((step, index) => (
                        <div key={step.key} className="flex items-start gap-2 text-[11px]">
                          <span
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                            style={{
                              background: step.status === 'done'
                                ? 'rgba(16,185,129,0.1)'
                                : step.status === 'active'
                                ? 'rgba(0,122,255,0.1)'
                                : step.status === 'error'
                                ? 'rgba(239,68,68,0.1)'
                                : 'rgba(0,0,0,0.05)',
                              color: step.status === 'done'
                                ? '#10b981'
                                : step.status === 'active'
                                ? '#007AFF'
                                : step.status === 'error'
                                ? '#ef4444'
                                : '#8a857f',
                            }}
                          >
                            {step.status === 'active' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : index + 1}
                          </span>
                          <div className="min-w-0">
                            <p style={{ color: step.status === 'waiting' ? '#8a857f' : '#3d3935' }}>{step.label}</p>
                            {step.detail && (
                              <p className="truncate text-[10px]" style={{ color: '#8a857f' }}>{step.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        </>
      </div>

      {/* ================================================================== */}
      {/* CENTER — Document Viewer                                           */}
      {/* ================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {!selectedDoc ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: '#d1cdc7' }} />
              <h3 className="text-base font-medium mb-1" style={{ color: '#3d3935' }}>Įkelkite dokumentą</h3>
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Pasirinkite dokumentą iš istorijos arba įkelkite naują failą.
              </p>
            </div>
          </div>
        ) : docLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#007AFF' }} />
          </div>
        ) : (
          <>
            {/* Viewer Header */}
            <div className="px-5 pt-4 pb-3 shrink-0 text-center" style={{ borderBottom: '1px solid #f0ede8' }}>
              <h3 className="mx-auto max-w-xl truncate text-base font-semibold" style={{ color: '#3d3935' }}>
                {selectedDocFull?.file_name || selectedDoc.file_name}
              </h3>
            </div>

            {/* Content Area + Extract */}
            <div className="flex-1 flex min-h-0">
              {/* Viewer Content */}
              <div className="flex-1 basis-0 flex flex-col min-w-0">
                <div className="flex-1 overflow-hidden p-4">
                  <div
                    className="mx-auto h-full max-h-full bg-white rounded-xl shadow-sm overflow-hidden"
                    style={{ maxWidth: '900px', border: '0.5px solid rgba(0,0,0,0.06)' }}
                  >
                    <DirectusFilePreview
                      fileId={previewFileId}
                      fileName={previewFileName}
                      mimeType={previewMimeType}
                      title={previewFileName}
                    />
                  </div>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="h-full w-3 shrink-0"
                style={{
                  background: '#f4f2ef',
                  borderLeft: '1px solid rgba(0,0,0,0.08)',
                  borderRight: '1px solid rgba(0,0,0,0.1)',
                  boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.9)',
                }}
              />

              {/* ============================================================ */}
              {/* RIGHT PANEL — Extract                                        */}
              {/* ============================================================ */}
              <div
                className="flex-1 basis-0 min-w-0 flex flex-col h-full"
              >
	                  <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#fbfaf8' }}>
	                      {(canExtract || extractResult) && (
	                        <div className="space-y-3">
	                          <div className="flex items-start justify-between gap-3">
	                            <div>
	                              <h3 className="text-sm font-semibold" style={{ color: '#111827' }}>Configuration</h3>
	                              <p className="mt-0.5 text-[11px]" style={{ color: '#6b7280' }}>Load a saved configuration or start fresh with defaults.</p>
	                            </div>
	                            <button
	                              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium"
	                              style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', color: '#374151' }}
	                            >
	                              Playground
	                              <ChevronDown className="h-3 w-3" />
	                            </button>
	                          </div>
	                          <div className="grid grid-cols-2 gap-1 rounded-lg p-0.5" style={{ background: '#f4f2ef', border: '0.5px solid rgba(0,0,0,0.06)' }}>
	                            <button
	                              onClick={() => setExtractPanelTab('config')}
	                              className="h-8 rounded-md text-[11px] font-semibold transition-all"
	                              style={{
	                                background: extractPanelTab === 'config' ? '#fff' : 'transparent',
	                                color: extractPanelTab === 'config' ? '#1f2937' : '#6b655f',
	                                boxShadow: extractPanelTab === 'config' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
	                              }}
	                            >
	                              Build
	                            </button>
	                            <button
	                              onClick={() => extractResult && setExtractPanelTab('results')}
	                              disabled={!extractResult}
	                              className="h-8 rounded-md text-[11px] font-semibold transition-all disabled:opacity-40"
	                              style={{
	                                background: extractPanelTab === 'results' ? '#fff' : 'transparent',
	                                color: extractPanelTab === 'results' ? '#1f2937' : '#6b655f',
	                                boxShadow: extractPanelTab === 'results' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
	                              }}
	                            >
	                              Results
	                            </button>
	                          </div>
	                        </div>
	                      )}

                      {extractPanelTab === 'results' && extractResult && (
                        <div className="flex items-center gap-5 overflow-x-auto border-b" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                          {([
                            { key: 'markdown' as ViewTab, icon: Type, label: 'Markdown' },
                            { key: 'text' as ViewTab, icon: Code, label: 'Tekstas' },
                            { key: 'json' as ViewTab, icon: FileJson, label: 'JSON' },
                            { key: 'images' as ViewTab, icon: Image, label: 'Vaizdai' },
                          ]).map(tab => (
                            <button
                              key={tab.key}
                              onClick={() => setResultViewTab(tab.key)}
                              className="flex h-8 flex-1 items-center justify-center gap-1.5 px-1 text-[11px] font-semibold transition-all"
                              style={{
                                color: resultViewTab === tab.key ? '#007AFF' : '#8a857f',
                                background: 'transparent',
                                borderBottom: resultViewTab === tab.key ? '2px solid #007AFF' : '2px solid transparent',
                              }}
                            >
                              <tab.icon className="w-3.5 h-3.5" />
                              {tab.label}
                              {tab.key === 'images' && images.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.1)', color: '#007AFF' }}>
                                  {images.length}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {canConfigureParsing && (
                        <div className="rounded-xl bg-white p-3 shadow-sm space-y-3" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                          <div className="flex items-center gap-2">
                            <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
                            <span className="text-[11px] font-semibold" style={{ color: '#3d3935' }}>Dokumento apdorojimas</span>
                          </div>

                          <div>
                            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#8a857f' }}>Apdorojimo lygis</label>
                            <div className="grid grid-cols-1 gap-1.5">
                              {TIERS.map(t => (
                                <button
                                  key={t.value}
                                  onClick={() => {
                                    setParseTier(t.value);
                                    if (!supportsParseInstructions(t.value)) setShowPrompt(false);
                                  }}
                                  className="rounded-lg px-3 py-2 text-left text-xs font-medium transition-all"
                                  style={{
                                    background: parseTier === t.value ? 'rgba(0,122,255,0.08)' : '#faf9f7',
                                    color: parseTier === t.value ? '#007AFF' : '#3d3935',
                                    border: parseTier === t.value ? '0.5px solid rgba(0,122,255,0.3)' : '0.5px solid rgba(0,0,0,0.06)',
                                  }}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span>{t.label}</span>
                                    <span className="text-[10px] font-normal" style={{ color: parseTier === t.value ? '#007AFF' : '#8a857f' }}>{t.desc}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {canUseParseInstructions && (
                            <button
                              onClick={() => setShowPrompt(!showPrompt)}
                              className="flex items-center gap-1 text-[10px] font-medium"
                              style={{ color: '#8a857f' }}
                            >
                              <Settings2 className="w-3 h-3" />
                              <span>Papildomos instrukcijos</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
                            </button>
                          )}

                          {canUseParseInstructions && showPrompt && (
                            <textarea
                              value={userPrompt}
                              onChange={e => setUserPrompt(e.target.value)}
                              placeholder="Pvz: Ištraukti tik lenteles ir skaičius..."
                              className="w-full text-xs rounded-lg p-2 resize-none outline-none transition-all"
                              style={{
                                background: 'rgba(0,0,0,0.03)',
                                border: '0.5px solid rgba(0,0,0,0.08)',
                                color: '#3d3935',
                                minHeight: '72px',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                            />
                          )}

                          <button
                            onClick={selectedFile ? handleParse : handlePrepareStoredDocument}
                            disabled={parseStatus === 'uploading' || parseStatus === 'parsing'}
                            className="h-10 w-full rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                            style={{ background: '#1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
                          >
                            {parseStatus === 'uploading' || parseStatus === 'parsing' ? (
                              <span className="flex items-center justify-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {parseStatusText || 'Apdorojama...'}
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Paruošti dokumentą
                              </span>
                            )}
                          </button>
                        </div>
                      )}

                      {showWorkflowStatus && (
                      <div
                        className="rounded-xl p-3"
                        style={{
                          background: workflowTone.background,
                          border: `0.5px solid ${workflowTone.border}`,
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {workflowStatus.title === 'Analizuojama' || workflowStatus.title === 'Apdorojama' || workflowStatus.title === 'Įkeliama' ? (
                            <Loader2 className="mt-0.5 h-4 w-4 animate-spin shrink-0" style={{ color: workflowTone.color }} />
                          ) : workflowStatus.title === 'Klaida' || workflowStatus.title === 'Nepaleista' ? (
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: workflowTone.color }} />
                          ) : (
                            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: workflowTone.color }} />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold" style={{ color: workflowTone.color }}>{workflowStatus.title}</p>
                            <p className="mt-0.5 text-[11px] leading-5" style={{ color: '#5a5550' }}>{workflowStatus.detail}</p>
                            {selectedDocFull?.status === 'PENDING' && !selectedDocFull.job_id && (
                              <button
                                onClick={handlePrepareStoredDocument}
                                disabled={parseStatus === 'parsing' || parseStatus === 'uploading'}
                                className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[11px] font-semibold text-white transition-all disabled:opacity-60"
                                style={{ background: '#1f2937', boxShadow: '0 1px 2px rgba(0,0,0,0.14)' }}
                              >
                                {parseStatus === 'parsing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                Paruošti dokumentą
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      )}

                      {extractLoading && (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                          <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                            <div className="absolute inset-0 rounded-full border border-blue-100" />
                            <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-[#007AFF] animate-spin" />
                            <Sparkles className="h-5 w-5" style={{ color: '#007AFF' }} />
                          </div>
                          <p className="text-sm font-semibold" style={{ color: '#3d3935' }}>Analizuojama</p>
                          <p className="mt-1 min-h-5 text-xs transition-all" style={{ color: '#8a857f' }}>
                            {EXTRACT_LOADING_MESSAGES[extractLoadingMessageIndex]}
                          </p>
                        </div>
                      )}

	                      <div
	                        className="rounded-xl bg-white p-4 shadow-sm space-y-3"
	                        style={{
	                          border: '0.5px solid rgba(0,0,0,0.08)',
	                          display: !extractLoading && extractPanelTab === 'config' && (canExtract || extractResult) ? undefined : 'none',
	                        }}
	                      >
	                        <div>
	                          <div className="flex items-center gap-2">
	                            <Sparkles className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
	                            <span className="text-xs font-semibold" style={{ color: '#111827' }}>Extract Settings</span>
	                          </div>
	                          <p className="mt-1 text-[11px]" style={{ color: '#6b7280' }}>Describe what the extraction should answer or prioritize.</p>
	                        </div>
	                        <textarea
                          value={extractGoal}
                          onChange={e => setExtractGoal(e.target.value)}
	                          className="w-full resize-none rounded-lg p-3 text-xs outline-none transition-all"
	                          style={{
	                            minHeight: '82px',
	                            background: '#fff',
	                            border: '1px solid rgba(0,0,0,0.1)',
	                            color: '#3d3935',
	                            boxShadow: 'none',
                          }}
                          onFocus={e => {
                            e.currentTarget.style.borderColor = 'rgba(0,122,255,0.42)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.08)';
                          }}
                          onBlur={e => {
                            e.currentTarget.style.borderColor = 'rgba(0,122,255,0.16)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          placeholder="Instrukcijos"
                        />
                      </div>

                      <div
                        className="rounded-xl bg-white p-4 shadow-sm space-y-4"
                        style={{
                          border: '0.5px solid rgba(0,0,0,0.08)',
                          display: !extractLoading && extractPanelTab === 'config' && (canExtract || extractResult) ? undefined : 'none',
                        }}
                      >
                        <div>
                          <p className="text-xs font-semibold" style={{ color: '#111827' }}>Target & Schema</p>
                          <p className="mt-1 text-[11px]" style={{ color: '#6b7280' }}>Choose what each extraction returns and define the output shape.</p>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#8a857f' }}>Extract target</p>
                          <div className="grid grid-cols-3 gap-1 rounded-lg p-0.5" style={{ background: '#f4f2ef', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                            {EXTRACT_TARGETS.map(target => (
                              <button
                                key={target.value}
                                onClick={() => setExtractTarget(target.value)}
                                className="h-7 rounded-md text-[10px] font-semibold transition-all"
                                style={{
                                  background: extractTarget === target.value ? '#fff' : 'transparent',
                                  color: extractTarget === target.value ? '#1f2937' : '#6b655f',
                                  boxShadow: extractTarget === target.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                }}
                              >
                                {target.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#8a857f' }}>Output schema</p>
                          <div className="grid grid-cols-3 gap-1 rounded-lg p-0.5" style={{ background: '#f4f2ef', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                            {[
                              { mode: 'auto' as ExtractSchemaMode, label: 'Automatiškai' },
                              { mode: 'fields' as ExtractSchemaMode, label: 'Įvesti' },
                              { mode: 'raw' as ExtractSchemaMode, label: 'JSON' },
                            ].map(option => (
                              <button
                                key={option.mode}
                                onClick={() => setExtractSchemaMode(option.mode)}
                                className="h-7 rounded-md text-[10px] font-semibold transition-all"
                                style={{
                                  background: extractSchemaMode === option.mode ? '#fff' : 'transparent',
                                  color: extractSchemaMode === option.mode ? '#1f2937' : '#6b655f',
                                  boxShadow: extractSchemaMode === option.mode ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {extractSchemaMode === 'fields' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[minmax(90px,0.9fr)_112px_minmax(140px,1.4fr)_32px] gap-2 px-1 text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#8a857f' }}>
                              <span>Field</span>
                              <span>Type</span>
                              <span>Description</span>
                              <span />
                            </div>
                            {extractFields.map((field, index) => (
                              <div
                                key={field.id}
                                className="rounded-lg p-2"
                                style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)' }}
                              >
                                <div className="grid grid-cols-[minmax(90px,0.9fr)_112px_minmax(140px,1.4fr)_32px] items-center gap-2">
                                  <input
                                    value={field.name}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setExtractFields(prev => prev.map(item => item.id === field.id ? { ...item, name: value } : item));
                                    }}
                                    placeholder="field_name"
                                    className="h-7 min-w-0 rounded-md px-2 text-[11px] outline-none"
                                    style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                                  />
                                  <select
                                    value={field.type}
                                    onChange={e => {
                                      const value = e.target.value as ExtractFieldType;
                                      setExtractFields(prev => prev.map(item => item.id === field.id ? { ...item, type: value } : item));
                                    }}
                                    className="h-7 w-full rounded-md px-2 text-[10px] outline-none"
                                    style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                                  >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="array">Array</option>
                                    <option value="object">Object</option>
                                  </select>
                                  <input
                                    value={field.description}
                                    onChange={e => {
                                      const value = e.target.value;
                                      setExtractFields(prev => prev.map(item => item.id === field.id ? { ...item, description: value } : item));
                                    }}
                                    placeholder={getFieldDescriptionPlaceholder(field.type)}
                                    className="h-7 min-w-0 rounded-md px-2 text-[11px] outline-none"
                                    style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                                  />
                                  <button
                                    onClick={() => setExtractFields(prev => prev.length === 1 ? [createExtractField()] : prev.filter(item => item.id !== field.id))}
                                    className="h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-black/[0.04]"
                                    style={{ color: '#8a857f' }}
                                    title="Pašalinti lauką"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {field.name.trim() && (
                                  <p className="mt-1.5 text-[10px]" style={{ color: '#8a857f' }}>
                                    Key: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{normalizeSchemaKey(field.name) || `field_${index + 1}`}</span>
                                  </p>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => setExtractFields(prev => [...prev, createExtractField()])}
                              className="h-7 rounded-md px-3 text-[10px] font-semibold transition-colors hover:bg-black/[0.03]"
                              style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', color: '#1f2937' }}
                            >
                              + Add field
                            </button>
                          </div>
                        )}

                        {extractSchemaMode === 'raw' && (
                          <textarea
                            value={rawExtractSchemaText}
                            onChange={e => setRawExtractSchemaText(e.target.value)}
                            spellCheck={false}
                            className="h-40 w-full resize-none rounded-lg p-3 text-[11px] outline-none transition-all"
                            style={{
                              background: '#faf9f7',
                              border: '0.5px solid rgba(0,0,0,0.08)',
                              color: '#3d3935',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.35)'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                          />
                        )}
                      </div>

                      <div
                        className="rounded-xl bg-white p-4 shadow-sm space-y-3"
                        style={{
                          border: '0.5px solid rgba(0,0,0,0.08)',
                          display: extractPanelTab === 'config' && (canExtract || extractResult) ? undefined : 'none',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
                          <span className="text-xs font-semibold" style={{ color: '#111827' }}>Options</span>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.08em] block mb-1.5" style={{ color: '#8a857f' }}>Mode</label>
                          <div className="grid grid-cols-2 gap-1">
                            {EXTRACT_TIERS.map(tier => (
                              <button
                                key={tier.value}
                                onClick={() => setExtractTier(tier.value)}
                                className="h-7 rounded-md text-[11px] font-medium transition-all"
                                style={{
                                  background: extractTier === tier.value ? 'rgba(0,122,255,0.1)' : 'rgba(0,0,0,0.03)',
                                  color: extractTier === tier.value ? '#007AFF' : '#5a5550',
                                  border: extractTier === tier.value ? '0.5px solid rgba(0,122,255,0.25)' : '0.5px solid rgba(0,0,0,0.06)',
                                }}
                              >
                                {tier.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => setShowExtractAdvanced(!showExtractAdvanced)}
                          className="flex items-center gap-1 text-[10px] font-medium"
                          style={{ color: '#8a857f' }}
                        >
                          <Settings2 className="w-3 h-3" />
                          Papildomi nustatymai
                          <ChevronDown className={`w-3 h-3 transition-transform ${showExtractAdvanced ? 'rotate-180' : ''}`} />
                        </button>

                        {showExtractAdvanced && (
                          <div className="space-y-3">
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-[10px] font-medium" style={{ color: '#8a857f' }}>Schema preview</span>
                                <button
                                  onClick={() => {
                                    setExtractSchemaMode('fields');
                                    setExtractFields([
                                      { id: 'tank_1', name: 'pavadinimas', description: 'Talpos arba gaminio pavadinimas.', type: 'string', required: false },
                                      { id: 'tank_2', name: 'talpa_m3', description: 'Talpos tūris kubiniais metrais, jei dokumente nurodyta.', type: 'number', required: false },
                                      { id: 'tank_3', name: 'medziaga', description: 'Talpos medžiaga arba konstrukcijos tipas.', type: 'string', required: false },
                                      { id: 'tank_4', name: 'svarbios_pastabos', description: 'Svarbios techninės pastabos, sąlygos arba rizikos.', type: 'array', required: false },
                                    ]);
                                  }}
                                  className="text-[10px] font-medium"
                                  style={{ color: '#007AFF' }}
                                >
                                  Load tank fields
                                </button>
                              </div>
                              <textarea
                                value={activeExtractSchemaText}
                                readOnly
                                spellCheck={false}
                                className="w-full h-40 resize-none rounded-lg p-3 text-[11px] outline-none"
                                style={{
                                  background: '#faf9f7',
                                  border: '0.5px solid rgba(0,0,0,0.08)',
                                  color: '#3d3935',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center gap-2 text-[11px]" style={{ color: '#5a5550' }}>
                                <input type="checkbox" checked={extractCitations} onChange={e => setExtractCitations(e.target.checked)} />
                                Citatos
                              </label>
                              <label className="flex items-center gap-2 text-[11px]" style={{ color: '#5a5550' }}>
                                <input type="checkbox" checked={extractConfidence} onChange={e => setExtractConfidence(e.target.checked)} />
                                Patikimumas
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={extractTargetPages}
                                onChange={e => setExtractTargetPages(e.target.value)}
                                placeholder="Puslapiai: 1,3-5"
                                className="h-8 rounded-lg px-2 text-xs outline-none"
                                style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                              />
                              <input
                                value={extractMaxPages}
                                onChange={e => setExtractMaxPages(e.target.value.replace(/[^\d]/g, ''))}
                                placeholder="Maks. puslapių"
                                className="h-8 rounded-lg px-2 text-xs outline-none"
                                style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={extractVersion}
                                onChange={e => setExtractVersion(e.target.value)}
                                placeholder="Versija: latest"
                                className="h-8 rounded-lg px-2 text-xs outline-none"
                                style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                              />
                              <input
                                value={extractParseConfigId}
                                onChange={e => setExtractParseConfigId(e.target.value)}
                                placeholder="Parse config ID"
                                className="h-8 rounded-lg px-2 text-xs outline-none"
                                style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                              />
                            </div>
                            <textarea
                              value={extractSystemPrompt}
                              onChange={e => setExtractSystemPrompt(e.target.value)}
                              placeholder="Papildomos ištraukimo instrukcijos..."
                              className="w-full h-20 rounded-lg p-2 text-xs resize-none outline-none"
                              style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                            />
                          </div>
                        )}

                        {isAdmin && (
                          <button
                            onClick={handleRunExtract}
                            disabled={!canStartExtract}
                            className="w-full h-9 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                            style={{ background: '#1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
                          >
                            {extractLoading ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {extractStatus || 'Analizuojama...'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5" />
                                Analizuoti
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      {extractError && (
                        <div className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'rgba(239,68,68,0.07)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.18)' }}>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{extractError}</span>
                        </div>
                      )}

                      {extractPanelTab === 'results' && extractResult && (
                        <div className="bg-white overflow-hidden">
                          <div className="flex justify-end pb-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(
                                resultViewTab === 'json'
                                  ? extractResultJson
                                  : resultViewTab === 'text'
                                  ? extractResultRawText || extractResultJson
                                  : extractResultText || extractResultJson
                              )}
                              className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                              title="Kopijuoti"
                            >
                              <ClipboardCopy className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                            </button>
                          </div>

                          {resultViewTab === 'markdown' && (
                            <div className="whitespace-pre-wrap text-sm leading-7" style={{ color: '#3d3935' }}>
                              {extractResultText || 'Rezultate nėra rodomų duomenų.'}
                            </div>
                          )}

                          {resultViewTab === 'text' && (
                            <div className="whitespace-pre-wrap text-sm leading-7" style={{ color: '#3d3935' }}>
                              {extractResultRawText || 'Rezultate nėra teksto.'}
                            </div>
                          )}

                          {resultViewTab === 'json' && (
                            <pre className="max-h-[calc(100vh-320px)] overflow-auto text-[11px] whitespace-pre-wrap" style={{ color: '#3d3935', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                              {extractResultJson}
                            </pre>
                          )}

                          {resultViewTab === 'images' && (
                            <div className="px-4 pb-4">
                              {images.length === 0 ? (
                                <div className="rounded-xl p-8 text-center" style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.06)' }}>
                                  <Image className="w-8 h-8 mx-auto mb-2" style={{ color: '#d1cdc7' }} />
                                  <p className="text-sm" style={{ color: '#8a857f' }}>Vaizdų nerasta</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  {images.map((img, i) => (
                                    <button
                                      key={i}
                                      onClick={() => setLightboxUrl(img.url)}
                                      className="overflow-hidden rounded-xl bg-white text-left shadow-sm transition-all hover:shadow-md"
                                      style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}
                                    >
                                      <img src={img.url} alt={img.filename || `Image ${i + 1}`} className="h-32 w-full object-cover" />
                                      <p className="truncate px-2 py-1.5 text-[10px]" style={{ color: '#5a5550' }}>
                                        {img.filename || `image_${i + 1}`}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                </div>
            </div>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* IMAGE LIGHTBOX                                                     */}
      {/* ================================================================== */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center z-10"
            >
              <X className="w-4 h-4" style={{ color: '#3d3935' }} />
            </button>
            <img
              src={lightboxUrl}
              alt="Enlarged"
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
