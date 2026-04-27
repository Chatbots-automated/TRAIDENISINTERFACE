import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Upload, FileText, Search, Trash2, X, ChevronLeft, ChevronRight,
  Send, MessageSquare, AlertCircle, CheckCircle, Loader2, Image,
  Code, Type, FileJson, ChevronDown, Sparkles, Settings2,
  PanelRightClose, PanelRightOpen, Download, FlaskConical, ClipboardCopy,
  Braces, SlidersHorizontal
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import type { AppUser, ParsedDocument, DocumentChatMessage, ParseTier } from '../types';
import { parseDocument as llamaParse } from '../lib/llamaParseService';
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
  fetchDocumentChats,
  saveDocumentChat,
} from '../lib/analizeService';
import SafeHtml from './SafeHtml';
import { renderMarkdown, renderChatContent } from './analize/markdownRenderer';

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

const TANK_SCHEMA = {
  type: 'object',
  properties: {
    talpos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pavadinimas: { type: 'string' },
          pozicija: { type: 'string' },
          talpa_m3: { type: 'number' },
          skersmuo_mm: { type: 'number' },
          aukstis_mm: { type: 'number' },
          medziaga: { type: 'string' },
          vieta: { type: 'string' },
          terpe: { type: 'string' },
          temperatura_c: { type: 'number' },
          slegis_bar_g: { type: 'number' },
          jungtys: { type: 'string' },
          pastabos: { type: 'string' },
        },
      },
    },
  },
  required: ['talpos'],
};

const EXTRACT_TARGETS: { value: ExtractTarget; label: string }[] = [
  { value: 'per_doc', label: 'Visas dokumentas' },
  { value: 'per_page', label: 'Kiekvienas puslapis' },
  { value: 'per_table_row', label: 'Lentelės eilutės' },
];

const EXTRACT_TIERS: { value: ExtractTier; label: string }[] = [
  { value: 'agentic', label: 'Tikslus' },
  { value: 'cost_effective', label: 'Ekonomiškas' },
];

// ============================================================================
// Tank Extraction Prompt (for quick-action button)
// ============================================================================

const TANK_EXTRACTION_PROMPT = `Išanalizuok VISĄ pateiktą dokumento turinį — el. laišką, priedus, lenteles, PDF turinį. Kiekvienai talpai/reaktoriui, kuris randamas dokumentuose, sukurk atskirą techninį aprašymą. PRIVALOMA ištraukti VISAS talpas — nepraleisti nė vienos.

Grąžink VISADA validų JSON masyvą. Jokio teksto prieš ar po JSON.
Jei tik 1 talpa — grąžink masyvą su vienu objektu.

Kiekvienos talpos objekto struktūra (pildyk TIK tuos laukus, kuriems randi informaciją — jei parametras nerastas, PRALEISK lauką):

Galimi laukai:
- pavadinimas, eilės_nr, pozicija
- projekto_kontekstas_Klientas, projekto_kontekstas_Užsakovas, projekto_kontekstas_Kontaktinis_asmuo, projekto_kontekstas_Užklausos_data, projekto_kontekstas_Projekto_pavadinimas
- Talpa_m3, Skersmuo_mm, Aukštis_mm, Orientacija, Dugno_tipas
- Medžiaga (FRP / PP / PE / HDPE / kita)
- Vieta (INDOOR / OUTDOOR)
- Cheminė_aplinka_Terpė, Cheminė_aplinka_Koncentracija, Cheminė_aplinka_Tankis_kg_m3, Cheminė_aplinka_Temperatūra_°C, Cheminė_aplinka_Slėgis_bar_g
- Apšiltinimas, Elektrinis_šildymas
- Maišyklė (Taip/Ne), Maišyklė_aprašymas
- Jungtys, Pastabos

Taisyklės:
- Peržiūrėk VISĄ dokumento turinį — nesustok ties pirmu rastu šaltiniu
- KIEKVIENA rasta talpa PRIVALO būti ištraukta atskirai
- Jei ta pati talpa minima keliose vietose — sujunk informaciją į vieną bloką
- Jei informacija dviprasmiška arba prieštaringa — pažymėk pastabose
- Cheminės formulės tikslios: H₂SO₄, CuSO₄, NiSO₄, CoSO₄, LiOH, Li₂SO₄, HF, NH₃, NaOH, HCl
- Matavimo vienetai: m³, mm, °C, bar(g), kg/m³, wt.%, g/L
- Nesutrumpinti ir neapibendinti kelių talpų į vieną
- Laukai turi būti FLAT — jokių nested objektų
- Grąžink tik validų JSON masyvą. Jokio teksto prieš ar po JSON.`;

type ViewTab = 'markdown' | 'text' | 'json' | 'images';

interface AnalizeInterfaceProps {
  user: AppUser;
  projectId: string;
}

export default function AnalizeInterface({ user, projectId }: AnalizeInterfaceProps) {
  void projectId;
  // --- Document list ---
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Selected document ---
  const [selectedDoc, setSelectedDoc] = useState<ParsedDocument | null>(null);
  const [selectedDocFull, setSelectedDocFull] = useState<ParsedDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // --- Upload & parsing ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseTier, setParseTier] = useState<ParseTier>('agentic');
  const [userPrompt, setUserPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'uploading' | 'parsing' | 'done' | 'error'>('idle');
  const [parseStatusText, setParseStatusText] = useState('');
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Viewer ---
  const [activeTab, setActiveTab] = useState<ViewTab>('markdown');
  const [currentPage, setCurrentPage] = useState(0);

  // --- Chat ---
  const [chatOpen, setChatOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'extract' | 'chat'>('extract');
  const [chatMessages, setChatMessages] = useState<DocumentChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStreaming, setChatStreaming] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // --- LlamaCloud Extract ---
  const [extractTier, setExtractTier] = useState<ExtractTier>('agentic');
  const [extractTarget, setExtractTarget] = useState<ExtractTarget>('per_doc');
  const [extractCitations, setExtractCitations] = useState(true);
  const [extractConfidence, setExtractConfidence] = useState(true);
  const [extractMaxPages, setExtractMaxPages] = useState('');
  const [extractTargetPages, setExtractTargetPages] = useState('');
  const [extractParseConfigId, setExtractParseConfigId] = useState('');
  const [extractVersion, setExtractVersion] = useState('latest');
  const [extractSystemPrompt, setExtractSystemPrompt] = useState('Ištrauk struktūruotus techninius duomenis lietuviškai. Jei informacija nerasta, lauką praleisk.');
  const [extractSchemaText, setExtractSchemaText] = useState(JSON.stringify(TANK_SCHEMA, null, 2));
  const [showExtractAdvanced, setShowExtractAdvanced] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState('');
  const [extractResult, setExtractResult] = useState<ExtractJob | null>(null);

  // --- Image lightbox ---
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ---- Load documents on mount ----
  const loadDocuments = useCallback(async () => {
    try {
      setDocsLoading(true);
      setDocsError('');
      const docs = await fetchParsedDocuments(user.id);
      setDocuments(docs);
    } catch (err: unknown) {
      console.error('Failed to load documents:', err);
      const msg = err instanceof Error ? err.message : '';
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
      setDocsError(
        msg.toLowerCase().includes('permission') || code === '403'
          ? 'Prieigos klaida (403) – patikrinkite VITE_DIRECTUS_TOKEN konfigūraciją Netlify aplinkoje.'
          : msg || 'Nepavyko įkelti dokumentų.'
      );
    } finally {
      setDocsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const selectedDocId = selectedDoc?.id;

  // ---- Load full document when selected ----
  useEffect(() => {
    if (!selectedDocId) {
      setSelectedDocFull(null);
      setChatMessages([]);
      return;
    }
    loadFullDocument(selectedDocId);
    loadChats(selectedDocId);
  }, [selectedDocId]);

  const loadFullDocument = async (id: string) => {
    try {
      setDocLoading(true);
      const doc = await getParsedDocument(id);
      setSelectedDocFull(doc);
      setCurrentPage(0);
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      setDocLoading(false);
    }
  };

  const loadChats = async (docId: string) => {
    try {
      const msgs = await fetchDocumentChats(docId);
      setChatMessages(msgs);
    } catch {
      setChatMessages([]);
    }
  };

  // ---- Scroll chat to bottom ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatStreaming]);

  // ---- Filtered documents ----
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(d => d.file_name.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  // ---- Parse markdown into pages ----
  const pages = useMemo(() => {
    const md = selectedDocFull?.parsed_markdown || '';
    if (!md) return [''];
    // Split by page separators (common patterns: ---, \\newpage, PAGE_BREAK)
    const parts = md.split(/\n---\n|\n\\newpage\n|\n<!-- PAGE_BREAK -->\n/);
    return parts.length > 0 ? parts : [md];
  }, [selectedDocFull?.parsed_markdown]);

  const totalPages = pages.length;

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

  // ---- JSON ----
  const jsonContent = useMemo(() => {
    const j = selectedDocFull?.parsed_json;
    if (!j) return null;
    if (typeof j === 'string') {
      try { return JSON.parse(j); } catch { return j; }
    }
    return j;
  }, [selectedDocFull?.parsed_json]);

  // ===========================================================================
  // FILE UPLOAD & PARSING
  // ===========================================================================

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setParseStatus('idle');
    setParseError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleParse = async () => {
    if (!selectedFile) return;

    setParseStatus('uploading');
    setParseStatusText('Įkeliamas failas...');
    setParseError('');

    try {
      // Save placeholder to Directus first
      const doc = await saveParsedDocument({
        user_id: user.id,
        file_name: selectedFile.name,
        file_type: selectedFile.type || selectedFile.name.split('.').pop() || 'unknown',
        file_size: selectedFile.size,
        tier: parseTier,
        job_id: '',
        status: 'PENDING',
        user_prompt: userPrompt || undefined,
      });

      setParseStatus('parsing');

      // Run LlamaParse
      const result = await llamaParse(
        selectedFile,
        { tier: parseTier, userPrompt: userPrompt || undefined },
        (status) => setParseStatusText(status)
      );

      // Update Directus with results
      await updateParsedDocument(doc.id, {
        status: 'SUCCESS',
        job_id: result.id,
        parsed_markdown: result.result_content_markdown || '',
        parsed_text: result.result_content_text || '',
        parsed_json: result.result_content_json || null,
        images_metadata: result.images_content_metadata || null,
        page_count: (result.result_content_markdown || '').split(/\n---\n/).length,
      });

      setParseStatus('done');
      setParseStatusText('Dokumentas sėkmingai apdorotas!');
      setSelectedFile(null);
      setUserPrompt('');

      // Reload and select
      await loadDocuments();
      const fullDoc = await getParsedDocument(doc.id);
      setSelectedDoc(fullDoc);
      setSelectedDocFull(fullDoc);
    } catch (err: unknown) {
      setParseStatus('error');
      setParseError(err instanceof Error ? err.message : 'Apdorojimas nepavyko');
      setParseStatusText('');
    }
  };

  const handleDeleteDoc = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const wasSelected = selectedDoc?.id === id;
    if (wasSelected) setSelectedDoc(null);
    try {
      await deleteParsedDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
      if (wasSelected) setSelectedDoc(documents.find(d => d.id === id) ?? null);
      setDocsError('Nepavyko ištrinti dokumento');
    }
  };

  // ===========================================================================
  // CHAT WITH DOCUMENT
  // ===========================================================================

  const handleSendChat = useCallback(async (overrideMessage?: string) => {
    const msg = (overrideMessage || chatInput).trim();
    if (!msg || !selectedDocFull || chatLoading) return;

    setChatInput('');
    setChatLoading(true);
    setChatStreaming('');

    // Save user message
    try {
      const userMsg = await saveDocumentChat(selectedDocFull.id, 'user', msg);
      setChatMessages(prev => [...prev, userMsg]);
    } catch {
      // Still try to chat even if save fails
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        document_id: selectedDocFull.id,
        role: 'user' as const,
        content: msg,
        created_at: new Date().toISOString(),
      }]);
    }

    try {
      const client = new Anthropic({
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      // Build conversation history
      const history = chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      history.push({ role: 'user', content: msg });

      // Truncate document content if too long (keep first 80k chars)
      const docContent = (selectedDocFull.parsed_markdown || selectedDocFull.parsed_text || '').slice(0, 80000);

      const systemPrompt = `Tu esi pagalbinis asistentas, kuris analizuoja dokumentus. Atsakyk į klausimus apie šį dokumentą lietuviškai arba ta kalba, kuria kreipiasi vartotojas.

DOKUMENTO PAVADINIMAS: ${selectedDocFull.file_name}

DOKUMENTO TURINYS:
${docContent}

Atsakyk tiksliai ir remkis tik dokumento turiniu. Jei informacijos dokumente nėra, pasakyk apie tai.`;

      let fullResponse = '';

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: history,
      });

      stream.on('text', (text) => {
        fullResponse += text;
        setChatStreaming(fullResponse);
      });

      await stream.finalMessage();

      setChatStreaming('');

      // Save assistant message
      try {
        const assistantMsg = await saveDocumentChat(selectedDocFull.id, 'assistant', fullResponse);
        setChatMessages(prev => [...prev, assistantMsg]);
      } catch {
        setChatMessages(prev => [...prev, {
          id: Date.now().toString(),
          document_id: selectedDocFull.id,
          role: 'assistant' as const,
          content: fullResponse,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err: unknown) {
      console.error('Chat error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Nepavyko gauti atsakymo';
      setChatMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        document_id: selectedDocFull.id,
        role: 'assistant' as const,
        content: `Klaida: ${errorMessage}`,
        created_at: new Date().toISOString(),
      }]);
      setChatStreaming('');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, selectedDocFull, chatLoading, chatMessages]);

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleRunExtract = async () => {
    if (!selectedDocFull || extractLoading) return;

    setExtractLoading(true);
    setExtractError('');
    setExtractStatus('Ruošiamas ištraukimas...');
    setExtractResult(null);

    try {
      const parsedSchema = JSON.parse(extractSchemaText);
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
        system_prompt: extractSystemPrompt.trim() || null,
      };

      const fallbackText = selectedDocFull.parsed_markdown || selectedDocFull.parsed_text || '';
      const job = await runExtract({
        fileInput: selectedDocFull.job_id || undefined,
        fallbackText,
        fallbackFileName: selectedDocFull.file_name.replace(/\.[^.]+$/, '') || 'document',
        configuration,
        onStatus: setExtractStatus,
      });

      setExtractResult(job);
      setExtractStatus('Ištraukimas baigtas');
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

  return (
    <div className="h-full flex" style={{ background: '#fdfcfb' }}>

      {/* ================================================================== */}
      {/* LEFT SIDEBAR — Document List & Upload                              */}
      {/* ================================================================== */}
      <div
        className="w-72 flex-shrink-0 flex flex-col h-full"
        style={{ borderRight: '1px solid #f0ede8' }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#3d3935' }}>Analizė</h2>

          {/* Upload Zone */}
          <div
            className={`relative rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
              dragOver ? 'scale-[1.02]' : ''
            }`}
            style={{
              border: `2px dashed ${dragOver ? '#007AFF' : 'rgba(0,0,0,0.12)'}`,
              background: dragOver ? 'rgba(0,122,255,0.04)' : 'rgba(0,0,0,0.02)',
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
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
            />
            <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#8a857f' }} />
            <p className="text-xs font-medium" style={{ color: '#5a5550' }}>
              Vilkite failą arba paspauskite
            </p>
            <p className="text-[10px] mt-1" style={{ color: '#8a857f' }}>
              PDF, DOCX, PPTX, XLSX, HTML, vaizdai...
            </p>
          </div>

          {/* Selected file info */}
          {selectedFile && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(0,122,255,0.05)', border: '0.5px solid rgba(0,122,255,0.15)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 shrink-0" style={{ color: '#007AFF' }} />
                <span className="text-xs font-medium truncate" style={{ color: '#3d3935' }}>{selectedFile.name}</span>
                <button onClick={() => setSelectedFile(null)} className="ml-auto p-0.5 rounded hover:bg-black/5">
                  <X className="w-3 h-3" style={{ color: '#8a857f' }} />
                </button>
              </div>
              <p className="text-[10px] mb-2" style={{ color: '#8a857f' }}>{formatFileSize(selectedFile.size)}</p>

              {/* Tier selector */}
              <div className="mb-2">
                <label className="text-[10px] font-medium block mb-1" style={{ color: '#8a857f' }}>Apdorojimo lygis</label>
                <div className="grid grid-cols-2 gap-1">
                  {TIERS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setParseTier(t.value)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                      style={{
                        background: parseTier === t.value ? 'rgba(0,122,255,0.1)' : 'rgba(0,0,0,0.03)',
                        color: parseTier === t.value ? '#007AFF' : '#5a5550',
                        border: parseTier === t.value ? '1px solid rgba(0,122,255,0.3)' : '0.5px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <span className="block">{t.label}</span>
                      <span className="block opacity-60 mt-0.5" style={{ fontSize: '9px' }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom prompt toggle */}
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="flex items-center gap-1 text-[10px] font-medium mb-1"
                style={{ color: '#8a857f' }}
              >
                <Settings2 className="w-3 h-3" />
                <span>Papildomos instrukcijos</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
              </button>

              {showPrompt && (
                <textarea
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                  placeholder="Pvz: Ištraukti tik lenteles ir skaičius..."
                  className="w-full text-xs rounded-lg p-2 resize-none outline-none transition-all"
                  style={{
                    background: 'rgba(0,0,0,0.03)',
                    border: '0.5px solid rgba(0,0,0,0.08)',
                    color: '#3d3935',
                    minHeight: '48px',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                />
              )}

              {/* Parse button */}
              <button
                onClick={handleParse}
                disabled={parseStatus === 'uploading' || parseStatus === 'parsing'}
                className="w-full mt-2 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                style={{
                  background: 'linear-gradient(180deg, #3a8dff 0%, #007AFF 100%)',
                  boxShadow: '0 1px 3px rgba(0,122,255,0.3)',
                }}
              >
                {parseStatus === 'uploading' || parseStatus === 'parsing' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {parseStatusText || 'Apdorojama...'}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Analizuoti
                  </span>
                )}
              </button>
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
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#8a857f' }} />
            <input
              type="text"
              placeholder="Ieškoti dokumentų..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-8 text-xs rounded-lg pl-8 pr-3 outline-none transition-all"
              style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,122,255,0.4)'; e.currentTarget.style.background = '#fff'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
            />
          </div>
        </div>

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
                  onClick={() => setSelectedDoc(doc)}
                  className="w-full text-left p-2.5 rounded-lg transition-all group"
                  style={{
                    background: selectedDoc?.id === doc.id ? 'rgba(0,122,255,0.08)' : 'transparent',
                    border: selectedDoc?.id === doc.id ? '0.5px solid rgba(0,122,255,0.2)' : '0.5px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedDoc?.id !== doc.id) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { if (selectedDoc?.id !== doc.id) e.currentTarget.style.background = 'transparent'; }}
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
                </button>
              ))}
            </div>
          )}
        </div>
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
              <h3 className="text-base font-medium mb-1" style={{ color: '#3d3935' }}>Pasirinkite dokumentą</h3>
              <p className="text-sm" style={{ color: '#8a857f' }}>
                Įkelkite naują failą arba pasirinkite iš sąrašo kairėje
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
            <div className="px-5 pt-4 pb-3 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid #f0ede8' }}>
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold truncate" style={{ color: '#3d3935' }}>
                  {selectedDocFull?.file_name || selectedDoc.file_name}
                </h3>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
                  {tierLabel(selectedDoc.tier)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Chat toggle */}
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className="p-1.5 rounded-lg transition-all"
                  style={{
                    background: chatOpen ? 'rgba(0,122,255,0.1)' : 'rgba(0,0,0,0.04)',
                    color: chatOpen ? '#007AFF' : '#8a857f',
                    border: '0.5px solid rgba(0,0,0,0.08)',
                  }}
                  title={chatOpen ? 'Uždaryti pokalbį' : 'Atidaryti pokalbį'}
                >
                  {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-5 pt-2 shrink-0 flex items-center gap-1" style={{ borderBottom: '1px solid #f0ede8' }}>
              {([
                { key: 'markdown' as ViewTab, icon: Type, label: 'Markdown' },
                { key: 'text' as ViewTab, icon: Code, label: 'Tekstas' },
                { key: 'json' as ViewTab, icon: FileJson, label: 'JSON' },
                { key: 'images' as ViewTab, icon: Image, label: 'Vaizdai' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all rounded-t-lg -mb-px"
                  style={{
                    color: activeTab === tab.key ? '#007AFF' : '#8a857f',
                    borderBottom: activeTab === tab.key ? '2px solid #007AFF' : '2px solid transparent',
                    background: activeTab === tab.key ? 'rgba(0,122,255,0.04)' : 'transparent',
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

            {/* Content Area + Chat */}
            <div className="flex-1 flex min-h-0">
              {/* Viewer Content */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-auto p-5">
                  {activeTab === 'markdown' && (
                    <div
                      className="mx-auto bg-white rounded-xl p-6 shadow-sm"
                      style={{ maxWidth: '800px', border: '0.5px solid rgba(0,0,0,0.06)' }}
                    >
                      {pages[currentPage] ? (
                        <SafeHtml html={renderMarkdown(pages[currentPage])} />
                      ) : (
                        <p className="text-sm text-center" style={{ color: '#8a857f' }}>Nėra turinio</p>
                      )}
                    </div>
                  )}

                  {activeTab === 'text' && (
                    <div
                      className="mx-auto bg-white rounded-xl shadow-sm overflow-hidden"
                      style={{ maxWidth: '800px', border: '0.5px solid rgba(0,0,0,0.06)' }}
                    >
                      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid #f0ede8', background: '#faf9f7' }}>
                        <span className="text-[10px] font-medium" style={{ color: '#8a857f' }}>Erdvinis tekstas</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedDocFull?.parsed_text || '');
                          }}
                          className="p-1 rounded transition-colors hover:bg-black/5"
                          title="Kopijuoti"
                        >
                          <Download className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                        </button>
                      </div>
                      <pre className="p-4 text-xs whitespace-pre-wrap overflow-auto" style={{ color: '#3d3935', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', maxHeight: 'calc(100vh - 280px)' }}>
                        {selectedDocFull?.parsed_text || 'Nėra teksto'}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'json' && (
                    <div
                      className="mx-auto bg-white rounded-xl shadow-sm overflow-hidden"
                      style={{ maxWidth: '800px', border: '0.5px solid rgba(0,0,0,0.06)' }}
                    >
                      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid #f0ede8', background: '#faf9f7' }}>
                        <span className="text-[10px] font-medium" style={{ color: '#8a857f' }}>JSON struktūra</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(jsonContent, null, 2));
                          }}
                          className="p-1 rounded transition-colors hover:bg-black/5"
                          title="Kopijuoti"
                        >
                          <Download className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                        </button>
                      </div>
                      <pre className="p-4 text-xs whitespace-pre-wrap overflow-auto" style={{ color: '#3d3935', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', maxHeight: 'calc(100vh - 280px)' }}>
                        {jsonContent ? JSON.stringify(jsonContent, null, 2) : 'Nėra JSON duomenų'}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'images' && (
                    <div className="mx-auto" style={{ maxWidth: '800px' }}>
                      {images.length === 0 ? (
                        <div className="text-center py-16">
                          <Image className="w-12 h-12 mx-auto mb-3" style={{ color: '#d1cdc7' }} />
                          <p className="text-sm" style={{ color: '#8a857f' }}>Vaizdų nerasta</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {images.map((img, i) => (
                            <div
                              key={i}
                              className="rounded-xl overflow-hidden bg-white shadow-sm cursor-pointer transition-all hover:shadow-md"
                              style={{ border: '0.5px solid rgba(0,0,0,0.06)' }}
                              onClick={() => setLightboxUrl(img.url)}
                            >
                              <img
                                src={img.url}
                                alt={img.filename || `Image ${i + 1}`}
                                className="w-full h-48 object-cover"
                              />
                              <div className="px-3 py-2">
                                <p className="text-xs truncate" style={{ color: '#3d3935' }}>{img.filename || `image_${i}`}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Page Navigation */}
                {activeTab === 'markdown' && totalPages > 1 && (
                  <div
                    className="px-5 py-2 shrink-0 flex items-center justify-center gap-3"
                    style={{ borderTop: '1px solid #f0ede8' }}
                  >
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                      style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)' }}
                    >
                      <ChevronLeft className="w-4 h-4" style={{ color: '#3d3935' }} />
                    </button>
                    <span className="text-xs font-medium" style={{ color: '#5a5550' }}>
                      {currentPage + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1}
                      className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                      style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)' }}
                    >
                      <ChevronRight className="w-4 h-4" style={{ color: '#3d3935' }} />
                    </button>
                  </div>
                )}
              </div>

              {/* ============================================================ */}
              {/* RIGHT PANEL — Extract + Chat                                 */}
              {/* ============================================================ */}
              {chatOpen && (
                <div
                  className="w-[420px] flex-shrink-0 flex flex-col h-full"
                  style={{ borderLeft: '1px solid #f0ede8' }}
                >
                  <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold" style={{ color: '#3d3935' }}>LlamaCloud Extract</p>
                        <p className="text-[10px] truncate" style={{ color: '#8a857f' }}>
                          Struktūruotas ištraukimas iš įkelto dokumento
                        </p>
                      </div>
                      <Braces className="w-4 h-4 shrink-0" style={{ color: '#007AFF' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.04)' }}>
                      {([
                        { key: 'extract' as const, label: 'Ištraukimas' },
                        { key: 'chat' as const, label: 'Pokalbis' },
                      ]).map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setRightPanelTab(tab.key)}
                          className="h-8 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: rightPanelTab === tab.key ? '#fff' : 'transparent',
                            color: rightPanelTab === tab.key ? '#3d3935' : '#8a857f',
                            boxShadow: rightPanelTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {rightPanelTab === 'extract' ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div className="rounded-xl bg-white p-3 shadow-sm" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold" style={{ color: '#3d3935' }}>Schema</span>
                          <button
                            onClick={() => setExtractSchemaText(JSON.stringify(TANK_SCHEMA, null, 2))}
                            className="text-[10px] font-medium"
                            style={{ color: '#007AFF' }}
                          >
                            Talpų šablonas
                          </button>
                        </div>
                        <textarea
                          value={extractSchemaText}
                          onChange={e => setExtractSchemaText(e.target.value)}
                          spellCheck={false}
                          className="w-full h-44 resize-none rounded-lg p-3 text-[11px] outline-none"
                          style={{
                            background: '#faf9f7',
                            border: '0.5px solid rgba(0,0,0,0.08)',
                            color: '#3d3935',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        />
                      </div>

                      <div className="rounded-xl bg-white p-3 shadow-sm space-y-3" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#007AFF' }} />
                          <span className="text-[11px] font-semibold" style={{ color: '#3d3935' }}>Parametrai</span>
                        </div>

                        <div>
                          <label className="text-[10px] font-medium block mb-1" style={{ color: '#8a857f' }}>Tikslumas</label>
                          <div className="grid grid-cols-2 gap-1">
                            {EXTRACT_TIERS.map(tier => (
                              <button
                                key={tier.value}
                                onClick={() => setExtractTier(tier.value)}
                                className="h-8 rounded-lg text-xs font-medium transition-all"
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

                        <div>
                          <label className="text-[10px] font-medium block mb-1" style={{ color: '#8a857f' }}>Ištraukimo apimtis</label>
                          <select
                            value={extractTarget}
                            onChange={e => setExtractTarget(e.target.value as ExtractTarget)}
                            className="w-full h-9 rounded-lg px-3 text-xs outline-none"
                            style={{ background: '#faf9f7', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
                          >
                            {EXTRACT_TARGETS.map(target => (
                              <option key={target.value} value={target.value}>{target.label}</option>
                            ))}
                          </select>
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

                        <button
                          onClick={handleRunExtract}
                          disabled={!selectedDocFull || extractLoading}
                          className="w-full h-10 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                          style={{ background: '#1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
                        >
                          {extractLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {extractStatus || 'Ištraukiama...'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5" />
                              Ištraukti
                            </span>
                          )}
                        </button>
                      </div>

                      {extractError && (
                        <div className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'rgba(239,68,68,0.07)', color: '#ef4444', border: '0.5px solid rgba(239,68,68,0.18)' }}>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{extractError}</span>
                        </div>
                      )}

                      {extractResult && (
                        <div className="rounded-xl bg-white shadow-sm overflow-hidden" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #f0ede8', background: '#faf9f7' }}>
                            <div>
                              <span className="text-[11px] font-semibold" style={{ color: '#3d3935' }}>Rezultatas</span>
                              <p className="text-[10px]" style={{ color: '#8a857f' }}>{extractResult.id}</p>
                            </div>
                            <button
                              onClick={() => navigator.clipboard.writeText(extractResultJson)}
                              className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                              title="Kopijuoti"
                            >
                              <ClipboardCopy className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
                            </button>
                          </div>
                          <pre className="max-h-80 overflow-auto p-3 text-[11px] whitespace-pre-wrap" style={{ color: '#3d3935', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {extractResultJson}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>

                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                    {chatMessages.length === 0 && !chatStreaming && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center px-4">
                          <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: '#d1cdc7' }} />
                          <p className="text-xs mb-3" style={{ color: '#8a857f' }}>
                            Užduokite klausimą apie dokumentą
                          </p>
                          <button
                            onClick={() => handleSendChat(TANK_EXTRACTION_PROMPT)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all hover:scale-[1.02]"
                            style={{
                              background: 'linear-gradient(180deg, rgba(0,122,255,0.08) 0%, rgba(0,122,255,0.14) 100%)',
                              color: '#007AFF',
                              border: '0.5px solid rgba(0,122,255,0.25)',
                            }}
                            disabled={chatLoading}
                          >
                            <FlaskConical className="w-3 h-3" />
                            Ištraukti talpų specifikacijas
                          </button>
                        </div>
                      </div>
                    )}

                    {chatMessages.map(msg => {
                      const rendered = msg.role === 'assistant' ? renderChatContent(msg.content) : null;
                      const isExtractionPrompt = msg.role === 'user' && msg.content.includes('Kiekvienai talpai/reaktoriui') && msg.content.length > 200;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className="max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                            style={{
                              background: msg.role === 'user' ? '#007AFF' : 'rgba(0,0,0,0.04)',
                              color: msg.role === 'user' ? '#fff' : '#3d3935',
                              borderBottomRightRadius: msg.role === 'user' ? '4px' : undefined,
                              borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : undefined,
                            }}
                          >
                            {rendered?.isJson ? (
                              <SafeHtml html={rendered.html} />
                            ) : isExtractionPrompt ? (
                              <div className="flex items-center gap-1.5">
                                <FlaskConical className="w-3 h-3 shrink-0" />
                                <span>Talpų specifikacijų ištraukimas...</span>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap">{msg.content}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Streaming response */}
                    {chatStreaming && (
                      <div className="flex justify-start">
                        <div
                          className="max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                          style={{ background: 'rgba(0,0,0,0.04)', color: '#3d3935', borderBottomLeftRadius: '4px' }}
                        >
                          <div className="whitespace-pre-wrap">{chatStreaming}</div>
                        </div>
                      </div>
                    )}

                    {chatLoading && !chatStreaming && (
                      <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#8a857f', animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#8a857f', animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#8a857f', animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat Input */}
                  <div className="px-3 pb-3 pt-1 shrink-0">
                    <div
                      className="flex items-end gap-2 rounded-xl p-2"
                      style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                    >
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Klauskite apie dokumentą..."
                        rows={1}
                        className="flex-1 text-xs resize-none outline-none py-1 px-1"
                        style={{ color: '#3d3935', maxHeight: '80px' }}
                        onInput={e => {
                          const t = e.currentTarget;
                          t.style.height = 'auto';
                          t.style.height = Math.min(t.scrollHeight, 80) + 'px';
                        }}
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={!chatInput.trim() || chatLoading}
                        className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                        style={{ background: '#007AFF', color: '#fff' }}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                    </>
                  )}
                </div>
              )}
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
