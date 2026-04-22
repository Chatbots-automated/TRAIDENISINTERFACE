import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FileText,
  Save,
  Edit3,
  Clock,
  ChevronRight,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Shield,
  BookOpen,
  Lock,
  ChevronDown,
  Eye,
  Pencil,
  Loader2
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  getInstructionVariables,
  getInstructionVariable,
  saveInstructionVariable,
  verifyUserPassword,
  getVersionHistory,
  revertToVersion,
  InstructionVariable,
  InstructionVersion
} from '../lib/instructionsService';
import { dbAdmin } from '../lib/database';
import { colors } from '../lib/designSystem';
import { tools as defaultSdkTools } from '../lib/toolDefinitions';
import {
  fetchMedziagas,
  fetchIstorija,
  fetchGeneralAnalysis,
  formatPrice,
} from '../lib/kainosService';
import NotificationContainer from './NotificationContainer';
import { useNotifications } from './sdk/useNotifications';

interface InstructionsInterfaceProps {
  user: AppUser;
}

type View = 'editor' | 'versions';
const DEFAULT_KAINOS_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search' }
];
const DEFAULT_KAINOS_OIL_PROMPT = `Šiandien yra {{today}}. Ieškokite internete dabartinių naftos kainų ir pateikite:

1. Brent žalia nafta — dabartinė kaina (USD/bbl ir EUR/bbl), savaitės ir mėnesio pokytis procentais
2. Rytų Europos kontekstas — kaip naftos kainos veikia regioną
3. Nafta → dervos ryšys
4. Styreno kaina Europoje (jei randama)

Pateikite trumpai ir struktūruotai lietuvių kalba.`;
const DEFAULT_KAINOS_GEO_PROMPT = `Šiandien yra {{today}}. Ieškokite internete naujausių geopolitinių įvykių, kurie gali turėti įtakos dervų, stiklo pluošto ir kompozitinių medžiagų kainoms.

Sutelkite dėmesį į: naftą, sankcijas, tarifus, energetiką, tiekimo grandines.
Pateikite 4-6 konkrečius punktus lietuvių kalba.`;
const DEFAULT_KAINOS_ANALYSIS_PROMPT = `Šiandien yra {{today}}. Įvertinkite žaliavų kainų prognozes.

MEDŽIAGŲ SĄRAŠAS ({{chunkInfo}}):
{{materialList}}

DABARTINĖS / PASKUTINĖS KAINOS:
{{latestPrices}}

KAINŲ TENDENCIJOS:
{{trendData}}

ISTORINIAI KAINŲ DUOMENYS:
{{priceData}}

NAFTOS KAINŲ KONTEKSTAS:
{{oilAnalysisContext}}

GEOPOLITINIS KONTEKSTAS:
{{geoPoliticalContext}}

Atsakykite TIK JSON formatu su:
- analysis_markdown
- forecasts[] (artikulas, kaina, data, confidence, reasoning).`;
type KainosPromptKey = 'kainos_ai_nafta_prompt' | 'kainos_ai_geo_prompt' | 'kainos_ai_analysis_prompt';
const KAINOS_PROMPTS: Record<KainosPromptKey, { label: string; help: string; defaultContent: string }> = {
  kainos_ai_nafta_prompt: {
    label: 'Nafta',
    help: 'Placeholderiai: {{today}}',
    defaultContent: DEFAULT_KAINOS_OIL_PROMPT,
  },
  kainos_ai_geo_prompt: {
    label: 'Ekonomika',
    help: 'Placeholderiai: {{today}}',
    defaultContent: DEFAULT_KAINOS_GEO_PROMPT,
  },
  kainos_ai_analysis_prompt: {
    label: 'Prognozė',
    help: 'Placeholderiai: {{today}} {{chunkInfo}} {{materialList}} {{latestPrices}} {{trendData}} {{priceData}} {{oilAnalysisContext}} {{geoPoliticalContext}} (alias: {{boundedNaftaText}} {{boundedGeoText}})',
    defaultContent: DEFAULT_KAINOS_ANALYSIS_PROMPT,
  },
};

function injectPromptVars(template: string, vars: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.split(`{{${key}}}`).join(value);
  }
  return output;
}

function findUnresolvedPromptVars(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, '').trim())));
}

function truncatePromptSection(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[sutrumpinta dėl ilgio: ${text.length - maxChars} simbolių]`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export default function InstructionsInterface({ user }: InstructionsInterfaceProps) {
  const location = useLocation();
  const [view, setView] = useState<View>('editor');
  const [variables, setVariables] = useState<InstructionVariable[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [versions, setVersions] = useState<InstructionVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [schemaKey, setSchemaKey] = useState<'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas'>('sdk_chat_tool_schemas');
  const [editorTab, setEditorTab] = useState<'schema' | 'kainos_prompt'>('schema');
  const [schemaContent, setSchemaContent] = useState('');
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaSuccess, setSchemaSuccess] = useState<string | null>(null);
  const [kainosPromptContent, setKainosPromptContent] = useState('');
  const [kainosPromptKey, setKainosPromptKey] = useState<KainosPromptKey>('kainos_ai_analysis_prompt');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptSuccess, setPromptSuccess] = useState<string | null>(null);
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState<string | null>(null);
  const [promptPreviewText, setPromptPreviewText] = useState('');
  const [promptPreviewMissing, setPromptPreviewMissing] = useState<string[]>([]);
  const [promptPreviewMode, setPromptPreviewMode] = useState(false);
  const [editorUnlocked, setEditorUnlocked] = useState(false);
  const [editorPassword, setEditorPassword] = useState('');
  const [editorPasswordError, setEditorPasswordError] = useState('');
  const [unlockingEditor, setUnlockingEditor] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { notifications, addNotification, addErrorNotification, removeNotification } = useNotifications();

  const selectedVariable = variables[selectedIndex] || null;

  useEffect(() => {
    loadVariables();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const schemaParam = params.get('schema');
    if (schemaParam === 'sdk') {
      openCombinedEditor('schema', 'sdk_chat_tool_schemas');
    } else if (schemaParam === 'kainos') {
      openCombinedEditor('schema', 'kainos_ai_tool_schemas');
    } else if (schemaParam === 'kainos-prompt') {
      openCombinedEditor('kainos_prompt');
    }
  }, [location.search]);

  useEffect(() => {
    if (view === 'versions') {
      loadVersions();
    }
  }, [view]);

  useEffect(() => {
    if (selectedVariable) {
      setEditContent(selectedVariable.content);
      setIsEditing(false);
      setIsAuthenticated(false);
      setShowPasswordInput(false);
      setPassword('');
      setPasswordError('');
    }
  }, [selectedIndex, variables]);

  const loadVariables = async (preferredVariableKey?: string | null) => {
    try {
      setLoading(true);
      const data = await getInstructionVariables();
      const chatOnly = data.filter((variable) => variable.variable_key.startsWith('chat'));
      setVariables(chatOnly);
      setSelectedIndex((currentIndex) => {
        const currentKey = variables[currentIndex]?.variable_key ?? null;
        const targetKey = preferredVariableKey ?? currentKey;
        if (!targetKey) return 0;
        const targetIndex = chatOnly.findIndex((variable) => variable.variable_key === targetKey);
        return targetIndex >= 0 ? targetIndex : 0;
      });
    } catch (err: any) {
      setError('Nepavyko įkelti instrukcijų');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      setLoadingVersions(true);
      const data = await getVersionHistory(50);
      setVersions(data);
    } catch (err: any) {
      console.error('Error loading versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleAuthenticate = async () => {
    setPasswordError('');
    const isValid = await verifyUserPassword(user.email, password);
    if (isValid) {
      setIsAuthenticated(true);
      setIsEditing(true);
      setShowPasswordInput(false);
      setPassword('');
    } else {
      setPasswordError('Neteisingas slaptažodis');
    }
  };

  const handleSave = async () => {
    if (!selectedVariable) return;

    try {
      setSaving(true);
      setError(null);

      const result = await saveInstructionVariable(
        selectedVariable.variable_key,
        editContent,
        user.id,
        user.email,
        true
      );

      if (result.success) {
        setSuccess('Išsaugota!');
        addNotification('success', 'Išsaugota', 'Instrukcija sėkmingai atnaujinta.');
        setTimeout(() => setSuccess(null), 3000);
        setIsEditing(false);
        setIsAuthenticated(false);
        await loadVariables(selectedVariable.variable_key);
      } else {
        const saveError = result.error || 'Nepavyko išsaugoti';
        setError(saveError);
        addNotification('error', 'Klaida', saveError);
      }
    } catch (err: any) {
      setError(err.message || 'Klaida saugant instrukciją');
      addErrorNotification('Klaida', err, 'Nepavyko išsaugoti instrukcijos');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (versionNumber: number) => {
    if (!confirm(`Grąžinti versiją #${versionNumber}?`)) {
      return;
    }

    try {
      setRevertingVersion(versionNumber);
      const result = await revertToVersion(versionNumber, user.id, user.email);

      if (result.success) {
        setSuccess('Versija grąžinta!');
        addNotification('success', 'Versija grąžinta', `Atstatyta versija #${versionNumber}.`);
        setTimeout(() => setSuccess(null), 3000);
        await loadVariables();
        await loadVersions();
      } else {
        const revertError = result.error || 'Nepavyko grąžinti versijos';
        setError(revertError);
        addNotification('error', 'Klaida', revertError);
      }
    } catch (err: any) {
      setError(err.message);
      addErrorNotification('Klaida', err, 'Nepavyko grąžinti versijos');
    } finally {
      setRevertingVersion(null);
    }
  };

  const handleCancelEdit = () => {
    if (selectedVariable) {
      setEditContent(selectedVariable.content);
    }
    setIsEditing(false);
    setIsAuthenticated(false);
  };

  const loadSchemaContent = async (targetKey: 'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas') => {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const existing = await getInstructionVariable(targetKey);
      if (existing?.content?.trim()) {
        const parsed = JSON.parse(existing.content);
        setSchemaContent(JSON.stringify(parsed, null, 2));
      } else {
        const fallback = targetKey === 'sdk_chat_tool_schemas' ? defaultSdkTools : DEFAULT_KAINOS_TOOLS;
        setSchemaContent(JSON.stringify(fallback, null, 2));
      }
    } catch (err: any) {
      console.error('[SchemaEditor] Load failed:', err);
      setSchemaError('Nepavyko užkrauti schemos JSON');
      const fallback = targetKey === 'sdk_chat_tool_schemas' ? defaultSdkTools : DEFAULT_KAINOS_TOOLS;
      setSchemaContent(JSON.stringify(fallback, null, 2));
    } finally {
      setSchemaLoading(false);
    }
  };

  const openSchemaEditor = async (targetKey: 'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas') => {
    setEditorTab('schema');
    setSchemaKey(targetKey);
    setSchemaSuccess(null);
    setSchemaError(null);
    setShowSchemaEditor(true);
    setEditorUnlocked(false);
    setEditorPassword('');
    setEditorPasswordError('');
    await loadSchemaContent(targetKey);
  };

  const getSchemaDisplayName = (key: 'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas') => (
    key === 'sdk_chat_tool_schemas' ? 'SDK pokalbių įrankių schema' : 'Žaliavų (Kainos) analizės įrankių schema'
  );

  const validateSchemaArray = (parsed: any): string | null => {
    if (!Array.isArray(parsed)) return 'Schema turi būti JSON masyvas';
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') return `Įrašas #${i + 1} turi būti objektas`;
      if (!item.name || typeof item.name !== 'string') return `Įrašas #${i + 1} neturi teisingo "name"`;
      if (!item.input_schema || typeof item.input_schema !== 'object') return `Įrašas #${i + 1} neturi "input_schema" objekto`;
    }
    return null;
  };

  const saveSchema = async () => {
    setSchemaSaving(true);
    setSchemaError(null);
    setSchemaSuccess(null);
    try {
      const parsed = JSON.parse(schemaContent);
      const validationError = validateSchemaArray(parsed);
      if (validationError) {
        setSchemaError(validationError);
        return;
      }

      const normalized = JSON.stringify(parsed, null, 2);
      const existing = await getInstructionVariable(schemaKey);
      if (existing) {
        const result = await saveInstructionVariable(schemaKey, normalized, user.id, user.email, true);
        if (!result.success) throw new Error(result.error || 'Nepavyko išsaugoti schemos');
      } else {
        const { error: insertError } = await dbAdmin
          .from('instruction_variables')
          .insert([{
            variable_key: schemaKey,
            variable_name: getSchemaDisplayName(schemaKey),
            content: normalized,
            display_order: 999,
            updated_by: user.id
          }]);
        if (insertError) throw insertError;
        await loadVariables();
      }

      setSchemaContent(normalized);
      setSchemaSuccess('Schema išsaugota');
      setTimeout(() => setSchemaSuccess(null), 3000);
    } catch (err: any) {
      console.error('[SchemaEditor] Save failed:', err);
      setSchemaError(err?.message || 'Nepavyko išsaugoti schemos');
    } finally {
      setSchemaSaving(false);
    }
  };

  const openPromptEditor = async (targetKey: KainosPromptKey = kainosPromptKey) => {
    setPromptLoading(true);
    setPromptError(null);
    setPromptSuccess(null);
    setPromptPreviewText('');
    setPromptPreviewMissing([]);
    setPromptPreviewError(null);
    setPromptPreviewMode(false);
    setKainosPromptKey(targetKey);
    try {
      const promptVar = await getInstructionVariable(targetKey);
      const fallback = KAINOS_PROMPTS[targetKey].defaultContent;
      setKainosPromptContent(promptVar?.content?.trim() ? promptVar.content : fallback);
    } catch (err: any) {
      console.error('[KainosPrompt] Load failed:', err);
      setPromptError('Nepavyko užkrauti Žaliavų prompt');
      setKainosPromptContent(KAINOS_PROMPTS[targetKey].defaultContent);
    } finally {
      setPromptLoading(false);
    }
  };

  const openCombinedEditor = async (tab: 'schema' | 'kainos_prompt', schemaTarget?: 'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas') => {
    setShowSchemaEditor(true);
    setEditorTab(tab);
    setEditorUnlocked(false);
    setEditorPassword('');
    setEditorPasswordError('');
    if (tab === 'schema') {
      await openSchemaEditor(schemaTarget || schemaKey);
    } else {
      await openPromptEditor(kainosPromptKey);
    }
  };

  const handleUnlockEditor = async () => {
    setEditorPasswordError('');
    setUnlockingEditor(true);
    try {
      const isValid = await verifyUserPassword(user.email, editorPassword);
      if (!isValid) {
        setEditorPasswordError('Neteisingas slaptažodis');
        return;
      }
      setEditorUnlocked(true);
      setEditorPassword('');
    } finally {
      setUnlockingEditor(false);
    }
  };

  const saveKainosPrompt = async () => {
    setPromptSaving(true);
    setPromptError(null);
    setPromptSuccess(null);
    try {
      const content = kainosPromptContent.trim();
      if (!content) {
        setPromptError('Prompt negali būti tuščias');
        return;
      }
      const existing = await getInstructionVariable(kainosPromptKey);
      if (existing) {
        const result = await saveInstructionVariable(kainosPromptKey, content, user.id, user.email, true);
        if (!result.success) throw new Error(result.error || 'Nepavyko išsaugoti prompt');
      } else {
        const { error: insertError } = await dbAdmin
          .from('instruction_variables')
          .insert([{
            variable_key: kainosPromptKey,
            variable_name: KAINOS_PROMPTS[kainosPromptKey].label,
            content,
            display_order: 998,
            updated_by: user.id
          }]);
        if (insertError) throw insertError;
      }
      setPromptSuccess('Prompt išsaugotas');
      setTimeout(() => setPromptSuccess(null), 3000);
    } catch (err: any) {
      console.error('[KainosPrompt] Save failed:', err);
      setPromptError(err?.message || 'Nepavyko išsaugoti prompt');
    } finally {
      setPromptSaving(false);
    }
  };

  const generatePromptPreview = async () => {
    setPromptPreviewLoading(true);
    setPromptPreviewError(null);
    setPromptPreviewMissing([]);
    try {
      const template = kainosPromptContent || KAINOS_PROMPTS[kainosPromptKey].defaultContent;
      const today = new Date().toISOString().split('T')[0];
      if (kainosPromptKey !== 'kainos_ai_analysis_prompt') {
        const rendered = injectPromptVars(template, { today });
        setPromptPreviewText(rendered);
        setPromptPreviewMissing(findUnresolvedPromptVars(rendered));
        setPromptPreviewMode(true);
        return;
      }

      const [medziagos, istorija, analytics] = await Promise.all([
        fetchMedziagas(),
        fetchIstorija(),
        fetchGeneralAnalysis(),
      ]);
      const MAX_MATERIALS_PER_ANALYSIS_REQUEST = 15;
      const materialChunks = chunkArray(medziagos, MAX_MATERIALS_PER_ANALYSIS_REQUEST);
      const chunk = materialChunks[0] || [];
      const chunkCodes = new Set(chunk.map((m) => m.artikulas));
      const chunkHist = istorija.filter((h) => chunkCodes.has(h.artikulas));
      const latestPrices = chunk
        .map((m) => {
          const latest = chunkHist
            .filter((e) => e.artikulas === m.artikulas && e.kaina_min != null)
            .sort((a, b) => b.data.localeCompare(a.data))[0];
          if (!latest) return `- ${m.artikulas} (${m.pavadinimas}): nėra kainos`;
          return `- ${m.artikulas} (${m.pavadinimas}): ${formatPrice(latest)} @ ${latest.data}`;
        })
        .join('\n') || 'Nėra kainų duomenų.';
      const trendData = chunk
        .map((m) => {
          const entries = chunkHist
            .filter((e) => e.artikulas === m.artikulas && e.kaina_min != null)
            .sort((a, b) => a.data.localeCompare(b.data));
          if (entries.length < 2) return `- ${m.artikulas}: nepakanka istorijos trendui`;
          const first = Number(entries[0].kaina_min);
          const last = Number(entries[entries.length - 1].kaina_min);
          if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return `- ${m.artikulas}: trendas nenustatytas`;
          const deltaPct = ((last - first) / first) * 100;
          return `- ${m.artikulas}: pokytis ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}% (${entries[0].data} → ${entries[entries.length - 1].data})`;
        })
        .join('\n') || 'Tendencijai nepakanka duomenų.';
      const priceData = chunk
        .map((m) => {
          const entries = chunkHist
            .filter((e) => e.artikulas === m.artikulas && e.kaina_min != null)
            .sort((a, b) => a.data.localeCompare(b.data));
          if (!entries.length) return null;
          return `${m.pavadinimas} [${m.artikulas}] (${m.vienetas}): ${entries.map(e => `${e.data}: ${formatPrice(e)}`).join(' | ')}`;
        })
        .filter(Boolean)
        .join('\n') || 'Nėra kainų duomenų.';

      const boundedNaftaText = truncatePromptSection(analytics?.nafta || '', 2500);
      const boundedGeoText = truncatePromptSection(analytics?.geoevents || '', 2200);
      const vars = {
        today,
        chunkInfo: materialChunks.length > 0 ? `DALIS 1/${materialChunks.length}` : 'DALIS 1/1',
        materialList: chunk.map(m => `- ${m.artikulas}: ${m.pavadinimas} (${m.vienetas})`).join('\n') || 'Nėra medžiagų',
        latestPrices: truncatePromptSection(latestPrices, 4500),
        trendData: truncatePromptSection(trendData, 9000),
        priceData: truncatePromptSection(priceData, 7000),
        boundedNaftaText,
        boundedGeoText,
        oilAnalysisContext: boundedNaftaText,
        geoPoliticalContext: boundedGeoText,
      };
      const rendered = injectPromptVars(template, vars);
      setPromptPreviewText(rendered);
      setPromptPreviewMissing(findUnresolvedPromptVars(rendered));
      setPromptPreviewMode(true);
    } catch (err: any) {
      setPromptPreviewError(err?.message || 'Nepavyko sugeneruoti prompt preview');
    } finally {
      setPromptPreviewLoading(false);
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ką tik';
    if (diffMins < 60) return `${diffMins} min.`;
    if (diffHours < 24) return `${diffHours} val.`;
    if (diffDays < 30) return `${diffDays} d.`;
    return date.toLocaleDateString('lt-LT');
  };

  if (!user.is_admin) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: colors.bg.secondary }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{
            background: colors.status.error,
            color: colors.status.errorText
          }}>
            <Shield className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>Prieiga uždrausta</h3>
          <p style={{ color: colors.text.secondary }}>Jums reikia administratoriaus teisių</p>
        </div>
      </div>
    );
  }

  // Versions View
  if (view === 'versions') {
    return (
      <div className="h-full flex flex-col" style={{ background: colors.bg.secondary }}>
        {/* Simple Header */}
        <div className="px-6 py-4" style={{
          background: colors.bg.white,
          borderBottom: `1px solid ${colors.border.default}`
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BackButton onClick={() => setView('editor')} />
              <div className="w-px h-5" style={{ background: colors.border.default }} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: colors.interactive.accent }}>
                <Clock className="w-4 h-4" style={{ color: colors.bg.white }} />
              </div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>Versijų istorija</h2>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="px-6 pt-4">
            {error && (
              <div className="alert alert-soft alert-error text-sm">
                <AlertCircle className="w-4 h-4" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
              </div>
            )}
            {success && (
              <div className="alert alert-soft alert-success text-sm">
                <Check className="w-4 h-4" />
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingVersions ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: colors.bg.white }} />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-16" style={{ color: colors.text.secondary }}>
              <Clock className="w-12 h-12 mx-auto mb-3" style={{ color: colors.border.default }} />
              <p>Versijų dar nėra</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {versions.map((version, index) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  index={index}
                  onRevert={handleRevert}
                  revertingVersion={revertingVersion}
                  getRelativeTime={getRelativeTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Editor View - Document Style
  return (
    <div className="h-full flex" style={{ background: colors.bg.white }}>
      {/* Left Sidebar - Table of Contents */}
      <div className="w-72 flex flex-col" style={{
        borderRight: `1px solid ${colors.border.default}`,
        background: colors.bg.secondary
      }}>
        {/* Sidebar Header */}
        <div className="p-4" style={{
          borderBottom: `1px solid ${colors.border.default}`,
          background: colors.interactive.accentLight
        }}>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: colors.interactive.accent }}>
              <BookOpen className="w-3.5 h-3.5" style={{ color: colors.bg.white }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: colors.text.primary }}>AI Agento Instrukcijos</h2>
          </div>
          <p className="text-xs ml-8" style={{ color: colors.text.secondary }}>
            {variables.filter(v => v.content).length} iš {variables.length} užpildyta
          </p>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 rounded animate-pulse" style={{ background: colors.border.default }} />
              ))}
            </div>
          ) : (
            <nav className="space-y-0.5 px-2">
              {variables.map((variable, index) => (
                <NavButton
                  key={variable.id}
                  variable={variable}
                  index={index}
                  isSelected={selectedIndex === index}
                  onClick={() => setSelectedIndex(index)}
                />
              ))}
            </nav>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3" style={{ borderTop: `1px solid ${colors.border.default}` }}>
          <div className="mb-2 space-y-2">
            <button
              onClick={() => openCombinedEditor('schema', 'sdk_chat_tool_schemas')}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: colors.bg.white, color: colors.text.primary, border: `1px solid ${colors.border.default}` }}
            >
              Schemos
            </button>
            <button
              onClick={() => openCombinedEditor('kainos_prompt')}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: colors.bg.white, color: colors.text.primary, border: `1px solid ${colors.border.default}` }}
            >
              Promptai
            </button>
          </div>
          <VersionHistoryButton onClick={() => setView('versions')} />
        </div>
      </div>

      {/* Right Panel - Content Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedVariable ? (
          <>
            {/* Content Header */}
            <div className="px-8 py-5" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                      color: colors.interactive.accent,
                      background: colors.interactive.accentLight,
                      border: `1px solid ${colors.interactive.accent}33`
                    }}>
                      {selectedVariable.variable_key}
                    </span>
                    <span className="text-xs" style={{ color: colors.border.default }}>•</span>
                    <span className="text-xs" style={{ color: colors.text.tertiary }}>
                      Sekcija {selectedIndex + 1} iš {variables.length}
                    </span>
                  </div>
                  <h1 className="text-xl font-semibold" style={{ color: colors.text.primary }}>
                    {selectedVariable.variable_name}
                  </h1>
                  {selectedVariable.description && (
                    <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>{selectedVariable.description}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {isEditing ? (
                    <>
                      <CancelButton onClick={handleCancelEdit} />
                      <SaveButton
                        onClick={handleSave}
                        disabled={saving || editContent === selectedVariable.content}
                        saving={saving}
                      />
                    </>
                  ) : (
                    <EditButton onClick={() => setShowPasswordInput(true)} />
                  )}
                </div>
              </div>

              {/* Password Input */}
              {showPasswordInput && !isAuthenticated && (
                <PasswordInput
                  password={password}
                  passwordError={passwordError}
                  onPasswordChange={(e) => setPassword(e.target.value)}
                  onAuthenticate={handleAuthenticate}
                  onCancel={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                />
              )}

              {/* Messages */}
              {error && (
                <div className="alert alert-soft alert-error mt-4 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                </div>
              )}
              {success && (
                <div className="alert alert-soft alert-success mt-4 text-sm">
                  <Check className="w-4 h-4" />
                  <span>{success}</span>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto" ref={contentRef}>
              <div className="px-8 py-6">
                {isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-h-[500px] p-4 text-sm resize-none focus:outline-none transition-colors"
                    style={{
                      color: colors.text.primary,
                      background: colors.bg.secondary,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: '8px',
                      lineHeight: '1.75',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                    }}
                    onFocus={(e) => {
                      e.target.style.background = colors.bg.white;
                      e.target.style.boxShadow = `0 0 0 2px ${colors.interactive.accent}33`;
                    }}
                    onBlur={(e) => {
                      e.target.style.background = colors.bg.secondary;
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder="Įveskite instrukcijos turinį..."
                    autoFocus
                  />
                ) : (
                  <div className="max-w-none">
                    {selectedVariable.content ? (
                      <pre
                        className="whitespace-pre-wrap text-sm p-4 rounded-lg min-h-[500px] m-0"
                        style={{
                          color: colors.text.secondary,
                          background: colors.bg.secondary,
                          border: `1px solid ${colors.border.default}`,
                          lineHeight: '1.75',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                        }}
                      >
                        {selectedVariable.content}
                      </pre>
                    ) : (
                      <EmptyContentPlaceholder onClick={() => setShowPasswordInput(true)} />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Footer - Fixed at bottom */}
            <div className="px-8 py-4 flex-shrink-0" style={{
              borderTop: `1px solid ${colors.border.default}`,
              background: colors.bg.white
            }}>
              <div className="flex items-center justify-between">
                <PrevButton
                  onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                  disabled={selectedIndex === 0}
                />
                <span className="text-sm font-medium" style={{ color: colors.text.tertiary }}>
                  {selectedIndex + 1} / {variables.length}
                </span>
                <NextButton
                  onClick={() => setSelectedIndex(Math.min(variables.length - 1, selectedIndex + 1))}
                  disabled={selectedIndex === variables.length - 1}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: colors.text.secondary }}>
            <div className="text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-3" style={{ color: colors.border.default }} />
              <p>Pasirinkite instrukciją iš sąrašo</p>
            </div>
          </div>
        )}
      </div>

      {showSchemaEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)' }}
          onClick={() => setShowSchemaEditor(false)}
        >
          <div
            className="w-full max-w-6xl h-[88vh] rounded-3xl overflow-hidden border shadow-2xl flex flex-col"
            style={{ background: '#f8fafc', borderColor: '#dbe2ea' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-2.5 border-b space-y-2" style={{ borderColor: '#e5e7eb', background: '#ffffff' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: '#0f172a' }}>AI redaktorius</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                    {editorTab === 'schema' ? schemaKey : kainosPromptKey}
                  </span>
                  <button
                    onClick={() => setShowSchemaEditor(false)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors"
                    style={{ color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex items-center gap-1 p-0.5 rounded-lg border" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                    <button
                      onClick={() => openCombinedEditor('schema')}
                      className="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                      style={{
                        color: editorTab === 'schema' ? '#ffffff' : '#475569',
                        background: editorTab === 'schema' ? '#2563eb' : 'transparent',
                      }}
                    >
                      Schemos
                    </button>
                    <button
                      onClick={() => openCombinedEditor('kainos_prompt')}
                      className="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                      style={{
                        color: editorTab === 'kainos_prompt' ? '#ffffff' : '#475569',
                        background: editorTab === 'kainos_prompt' ? '#2563eb' : 'transparent',
                      }}
                    >
                      Promptai
                    </button>
                  </div>

                  {editorTab === 'schema' ? (
                    <select
                      value={schemaKey}
                      onChange={(e) => openSchemaEditor(e.target.value as 'sdk_chat_tool_schemas' | 'kainos_ai_tool_schemas')}
                      className="select select-xs rounded-md"
                      style={{ minWidth: 170 }}
                    >
                      <option value="sdk_chat_tool_schemas">SDK schema</option>
                      <option value="kainos_ai_tool_schemas">Žaliavų schema</option>
                    </select>
                  ) : (
                    <select
                      value={kainosPromptKey}
                      onChange={(e) => openPromptEditor(e.target.value as KainosPromptKey)}
                      className="select select-xs rounded-md"
                      style={{ minWidth: 170 }}
                    >
                      {(Object.keys(KAINOS_PROMPTS) as KainosPromptKey[]).map((key) => (
                        <option key={key} value={key}>{KAINOS_PROMPTS[key].label}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!editorUnlocked && (
                    <>
                      <input
                        type="password"
                        value={editorPassword}
                        onChange={(e) => setEditorPassword(e.target.value)}
                        placeholder="Slaptažodis"
                        className="input input-xs w-36"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUnlockEditor(); }}
                      />
                      <button
                        className="btn btn-primary btn-xs"
                        onClick={handleUnlockEditor}
                        disabled={unlockingEditor || !editorPassword.trim()}
                      >
                        {unlockingEditor ? '...' : 'Atrakinti'}
                      </button>
                    </>
                  )}

                  {editorTab === 'schema' ? (
                    <>
                      <button
                        className="btn btn-soft btn-xs"
                        onClick={() => loadSchemaContent(schemaKey)}
                        disabled={schemaLoading || schemaSaving || !editorUnlocked}
                      >
                        Perkrauti
                      </button>
                      <button
                        className="btn btn-primary btn-xs gap-1"
                        disabled={schemaSaving || schemaLoading || !editorUnlocked}
                        onClick={saveSchema}
                      >
                        {schemaSaving ? <Save className="w-3.5 h-3.5 animate-pulse" /> : <Save className="w-3.5 h-3.5" />}
                        Išsaugoti
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-soft btn-xs gap-1"
                        onClick={() => {
                          if (promptPreviewMode) {
                            setPromptPreviewMode(false);
                          } else {
                            generatePromptPreview();
                          }
                        }}
                        disabled={promptLoading || promptSaving}
                      >
                        {!promptPreviewMode && promptPreviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        {promptPreviewMode ? 'Redaguoti' : 'Preview'}
                      </button>
                      <button
                        className="btn btn-soft btn-xs"
                        onClick={() => openPromptEditor(kainosPromptKey)}
                        disabled={promptLoading || promptSaving || !editorUnlocked}
                      >
                        Perkrauti
                      </button>
                      <button className="btn btn-primary btn-xs gap-1" disabled={promptLoading || promptSaving || !editorUnlocked} onClick={saveKainosPrompt}>
                        {promptSaving ? <Save className="w-3.5 h-3.5 animate-pulse" /> : <Save className="w-3.5 h-3.5" />}
                        Išsaugoti
                      </button>
                    </>
                  )}
                </div>
              </div>
              {!editorUnlocked && editorPasswordError && <p className="text-[10px]" style={{ color: colors.status.errorText }}>{editorPasswordError}</p>}
            </div>

            <div className="px-6 py-5 flex-1 min-h-0 overflow-y-auto">
              {editorTab === 'schema' ? (
                schemaLoading ? (
                  <div className="h-[560px] rounded-2xl animate-pulse" style={{ background: '#e2e8f0', border: '1px solid #cbd5e1' }} />
                ) : (
                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#cbd5e1' }}>
                    <div className="px-4 py-2.5 text-[11px] font-medium flex items-center justify-between" style={{ background: '#0f172a', color: '#cbd5e1' }}>
                      JSON • UTF-8
                    </div>
                    <textarea
                      value={schemaContent}
                      onChange={(e) => setSchemaContent(e.target.value)}
                      spellCheck={false}
                      className="w-full min-h-[560px] font-mono text-xs p-5 focus:outline-none"
                      style={{ background: '#020617', color: '#e2e8f0', lineHeight: '1.6' }}
                      readOnly={!editorUnlocked}
                    />
                  </div>
                )
              ) : promptLoading ? (
                <div className="h-[560px] rounded-2xl animate-pulse" style={{ background: '#e2e8f0', border: '1px solid #cbd5e1' }} />
		              ) : (
		                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#cbd5e1' }}>
		                  <div className="px-4 py-2.5 text-[11px] font-medium flex items-center justify-between" style={{ background: '#0f172a', color: '#cbd5e1' }}>
		                    <span>{promptPreviewMode ? 'Prompt preview (su reikšmėmis)' : 'Prompt tekstas'}</span>
		                    <span className="text-[10px]" style={{ color: promptPreviewMode && promptPreviewMissing.length > 0 ? '#fca5a5' : '#9ca3af' }}>
		                      {promptPreviewMode
		                        ? (promptPreviewMissing.length > 0 ? `Nerasti: ${promptPreviewMissing.join(', ')}` : 'Visi placeholderiai užpildyti')
		                        : KAINOS_PROMPTS[kainosPromptKey].help}
		                    </span>
		                  </div>
		                  {promptPreviewMode ? (
		                    <>
		                      <pre className="w-full min-h-[560px] max-h-[560px] overflow-auto font-mono text-xs p-5"
		                        style={{ background: '#020617', color: '#dbeafe', lineHeight: '1.6' }}>
		                        {promptPreviewLoading
		                          ? 'Generuojamas preview...'
		                          : promptPreviewError
		                          ? `Klaida: ${promptPreviewError}`
		                          : (promptPreviewText || 'Preview dar negeneruotas.')}
		                      </pre>
		                    </>
		                  ) : (
		                    <textarea
		                      value={kainosPromptContent}
		                      onChange={(e) => { setKainosPromptContent(e.target.value); if (promptPreviewMode) setPromptPreviewMode(false); }}
		                      className="w-full min-h-[560px] font-mono text-xs p-5 focus:outline-none"
		                      style={{ background: '#020617', color: '#e2e8f0', lineHeight: '1.6' }}
		                      readOnly={!editorUnlocked}
		                    />
		                  )}
		                </div>
		              )}
            </div>

          </div>
        </div>
      )}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </div>
  );
}

// Helper Components

function BackButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="transition-colors"
      style={{ color: isHovered ? colors.interactive.accent : colors.text.secondary }}
    >
      ← Atgal
    </button>
  );
}

function VersionCard({
  version,
  index,
  onRevert,
  revertingVersion,
  getRelativeTime
}: {
  version: InstructionVersion;
  index: number;
  onRevert: (versionNumber: number) => void;
  revertingVersion: number | null;
  getRelativeTime: (date: string) => string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const isCurrent = index === 0;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: isCurrent ? colors.interactive.accentLight : colors.bg.white,
        border: `1px solid ${isCurrent ? colors.interactive.accent + '33' : colors.border.default}`
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-mono px-2 py-1 rounded" style={{
            background: isCurrent ? colors.interactive.accentLight : colors.bg.secondary,
            color: isCurrent ? colors.interactive.accent : colors.text.secondary
          }}>
            v{version.version_number}
          </span>
          <div>
            <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
              {version.variable_key}
            </p>
            <p className="text-xs" style={{ color: colors.text.tertiary }}>
              {version.changed_by_email || 'Sistema'} • {getRelativeTime(version.created_at)}
            </p>
          </div>
        </div>
        {isCurrent ? (
          <span className="text-xs font-medium" style={{ color: colors.interactive.accent }}>Dabartinė</span>
        ) : (
          <button
            onClick={() => onRevert(version.version_number)}
            disabled={revertingVersion === version.version_number}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="text-sm flex items-center space-x-1 transition-colors"
            style={{ color: isHovered ? colors.interactive.accent : colors.text.secondary }}
          >
            {revertingVersion === version.version_number ? (
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{
                borderColor: colors.border.default,
                borderTopColor: colors.text.primary
              }} />
            ) : (
              <>
                <RotateCcw className="w-3 h-3" />
                <span>Grąžinti</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function NavButton({
  variable,
  index,
  isSelected,
  onClick
}: {
  variable: InstructionVariable;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const isCommercialBridgeVariable = variable.variable_key === 'chat_commercial_offer_generation';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all group"
      style={{
        background: isSelected
          ? colors.bg.white
          : isCommercialBridgeVariable
            ? colors.bg.white + '66'
            : (isHovered ? colors.bg.white + '99' : 'transparent'),
        boxShadow: isSelected ? '0 1px 3px 0 rgba(0, 0, 0, 0.05)' : 'none',
        border: isSelected
          ? `1px solid ${colors.interactive.accent}33`
          : isCommercialBridgeVariable
            ? `1px solid ${colors.border.default}`
            : '1px solid transparent',
        borderLeft: isSelected
          ? `2px solid ${colors.interactive.accent}`
          : isCommercialBridgeVariable
            ? `2px solid ${colors.border.default}`
            : '2px solid transparent'
      }}
    >
      <div className="flex items-start space-x-3">
        <span className="text-xs font-mono mt-0.5" style={{
          color: isSelected ? colors.interactive.accent : colors.text.tertiary
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{
            color: isSelected ? colors.text.primary : colors.text.secondary
          }}>
            {variable.variable_name}
          </p>
          {isCommercialBridgeVariable && (
            <p className="text-[11px] mt-0.5 font-medium" style={{ color: colors.text.tertiary }}>
              Pagrindinis tiltas į .docx
            </p>
          )}
          {!variable.content && (
            <p className="text-xs mt-0.5" style={{ color: colors.status.warningText }}>Tuščia</p>
          )}
        </div>
        {isSelected && (
          <ChevronRight className="w-4 h-4 mt-0.5" style={{ color: colors.interactive.accent }} />
        )}
      </div>
    </button>
  );
}

function VersionHistoryButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors"
      style={{
        color: isHovered ? colors.interactive.accent : colors.text.secondary,
        background: isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <Clock className="w-4 h-4" />
      <span>Versijų istorija</span>
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg transition-colors"
      style={{
        color: isHovered ? colors.text.primary : colors.text.secondary,
        border: `1px solid ${colors.border.default}`,
        background: isHovered ? colors.bg.secondary : 'transparent'
      }}
    >
      Atšaukti
    </button>
  );
}

function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
      style={{
        background: disabled ? colors.interactive.accent : (isHovered ? colors.interactive.accentHover : colors.interactive.accent),
        color: colors.bg.white
      }}
    >
      {saving ? (
        <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{
          borderColor: colors.bg.white + '33',
          borderTopColor: colors.bg.white
        }} />
      ) : (
        <Save className="w-4 h-4" />
      )}
      <span>Išsaugoti</span>
    </button>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center space-x-2"
      style={{
        color: colors.interactive.accent,
        background: isHovered ? colors.interactive.accentLight : colors.interactive.accentLight + '80',
        border: `1px solid ${colors.interactive.accent}33`
      }}
    >
      <Pencil className="w-4 h-4" />
      <span>Redaguoti</span>
    </button>
  );
}

function PasswordInput({
  password,
  passwordError,
  onPasswordChange,
  onAuthenticate,
  onCancel
}: {
  password: string;
  passwordError: string;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAuthenticate: () => void;
  onCancel: () => void;
}) {
  const [confirmHovered, setConfirmHovered] = React.useState(false);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8"
        style={{ border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lock Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: colors.interactive.accentLight }}
          >
            <Lock className="w-8 h-8" style={{ color: colors.interactive.accent }} />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-center text-lg font-semibold mb-6" style={{ color: colors.text.primary }}>
          Dokumentas apsaugotas
        </h3>

        {/* Password Input */}
        <input
          type="password"
          value={password}
          onChange={onPasswordChange}
          onKeyDown={(e) => e.key === 'Enter' && onAuthenticate()}
          placeholder="Slaptažodis"
          className="w-full px-4 py-3 text-sm rounded-lg focus:outline-none transition-all mb-4"
          style={{
            border: `2px solid ${passwordError ? colors.status.errorBorder : colors.border.default}`,
            background: colors.bg.white,
            color: colors.text.primary
          }}
          onFocus={(e) => e.target.style.borderColor = colors.interactive.accent}
          onBlur={(e) => e.target.style.borderColor = passwordError ? colors.status.errorBorder : colors.border.default}
          autoFocus
        />

        {/* Error Message */}
        {passwordError && (
          <p className="text-xs text-center mb-4" style={{ color: colors.status.errorText }}>
            {passwordError}
          </p>
        )}

        {/* Confirm Button */}
        <button
          onClick={onAuthenticate}
          onMouseEnter={() => setConfirmHovered(true)}
          onMouseLeave={() => setConfirmHovered(false)}
          className="w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors"
          style={{
            color: colors.bg.white,
            background: confirmHovered ? colors.interactive.accentHover : colors.interactive.accent
          }}
        >
          Patvirtinti
        </button>
      </div>
    </div>
  );
}

function EmptyContentPlaceholder({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div className="text-center py-16 rounded-lg border-2 border-dashed" style={{
      background: `linear-gradient(to bottom, ${colors.interactive.accentLight}80, ${colors.bg.secondary})`,
      borderColor: colors.interactive.accent + '33'
    }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{
        background: colors.interactive.accentLight
      }}>
        <FileText className="w-6 h-6" style={{ color: colors.interactive.accent }} />
      </div>
      <p className="mb-4" style={{ color: colors.text.secondary }}>Ši sekcija dar neužpildyta</p>
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="px-4 py-2 text-sm rounded-lg transition-colors"
        style={{
          color: colors.interactive.accent,
          border: `1px solid ${colors.interactive.accent}`,
          background: isHovered ? colors.interactive.accentLight : 'transparent'
        }}
      >
        Pridėti turinį
      </button>
    </div>
  );
}

function PrevButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center space-x-2 px-4 py-2 text-sm rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        color: disabled ? colors.text.tertiary : (isHovered ? colors.interactive.accent : colors.text.secondary),
        background: !disabled && isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <span>←</span>
      <span>Ankstesnė</span>
    </button>
  );
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center space-x-2 px-4 py-2 text-sm rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        color: disabled ? colors.text.tertiary : (isHovered ? colors.interactive.accent : colors.text.secondary),
        background: !disabled && isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <span>Kita</span>
      <span>→</span>
    </button>
  );
}
