import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  Loader2,
  AlertCircle,
  Paperclip,
  FileText,
  Eye,
  Plus,
  Trash2,
  X,
  PanelLeftClose,
  PanelLeft,
  Pencil,
  Copy,
  ChevronDown,
  ChevronUp,
  User,
  Check,
  Share2,
  Users,
  Download,
  Lock,
  Unlock,
  Sparkles,
  ImagePlus,
  Maximize2,
  RotateCcw,
  Crop,
  MoveHorizontal,
  Save,
  Upload
} from 'lucide-react';
import Anthropic from '@anthropic-ai/sdk';
import { getSystemPrompt, getPromptTemplate } from '../lib/instructionVariablesService';
import MessageContent from './MessageContent';
import RoboticArmLoader from './RoboticArmLoader';
import { colors } from '../lib/designSystem';
import { getWebhookUrl } from '../lib/webhooksService';
import {
  createSDKConversation,
  getSDKConversations,
  getSDKConversation,
  addMessageToConversation,
  updateConversationArtifact,
  deleteSDKConversation,
  renameSDKConversation,
  updateMessageButtonSelection,
  calculateDiff,
  type SDKConversation,
  type SDKMessage,
  type CommercialOfferArtifact,
  type VariableCitation
} from '../lib/sdkConversationService';
import { appLogger } from '../lib/appLogger';
import { createStandartinisProjektas, updateStandartinisProjektas, getStandartinisByConversationId } from '../lib/dokumentaiService';
import type { AppUser } from '../types';
import { executeTool } from '../lib/toolExecutors';
import { getEconomists, getManagers, getShareableUsers, type AppUserData } from '../lib/userService';
import { OFFER_PARAMETER_DEFINITIONS } from '../lib/offerParametersService';
import { getInstructionVariable } from '../lib/instructionsService';
import {
  shareConversation,
  getSharedConversations,
  getSharedConversationDetails,
  markSharedAsRead,
  checkConversationAccess,
  getUnreadSharedCount,
  type SharedConversation,
  type SharedConversationDetails
} from '../lib/sharedConversationService';
import NotificationContainer from './NotificationContainer';
import DocumentPreview, { type DocumentPreviewHandle, type VariableClickInfo, type CitationClickInfo } from './DocumentPreview';
import { getDefaultTemplate, renderTemplateForEditor, renderTemplate, sanitizeHtmlForIframe } from '../lib/documentTemplateService';
import { uploadDocxTemplate, getDocxTemplateFileId, getDocxTemplateUrl, uploadDocxBlobToDirectus, getDirectusAssetUrl, getDirectusFileUrl, buildDocxBlob, extractDocxTemplateVariables } from '../lib/globalTemplateService';
import {
  formatLtDate,
  loadSession,
  saveSession,
  extractDirectusFileId
} from './sdk/sdkInterfaceUtils';
import { useNotifications } from './sdk/useNotifications';
import { useConversationStreaming } from './sdk/useConversationStreaming';
import { useTeamSelection } from './sdk/useTeamSelection';
import { useOfferParameters } from './sdk/useOfferParameters';

interface SDKInterfaceNewProps {
  user: AppUser;
  projectId: string;
  mainSidebarCollapsed: boolean;
  onUnreadCountChange?: (count: number) => void;
  onRequestMainSidebarCollapse?: (collapsed: boolean) => void;
}

export default function SDKInterfaceNew({ user, projectId, mainSidebarCollapsed, onUnreadCountChange, onRequestMainSidebarCollapse }: SDKInterfaceNewProps) {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const session = useRef(loadSession()).current;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<SDKConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<SDKConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const { streamingContent, setConversationStreamingContent } = useConversationStreaming(currentConversation?.id);
  const [isToolUse, setIsToolUse] = useState(false);
  const [toolUseName, setToolUseName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [promptTemplate, setPromptTemplate] = useState<string>('');
  const [templateFromDB, setTemplateFromDB] = useState<string>(''); // Template variable from instruction_variables
  const [loadingPrompt, setLoadingPrompt] = useState(true);
  const [promptPreviewError, setPromptPreviewError] = useState<string | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showTemplateView, setShowTemplateView] = useState(false);
  const [showArtifact, setShowArtifact] = useState(session.showArtifact ?? false);
  const [showDiff, setShowDiff] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [displayButtons, setDisplayButtons] = useState<{ message?: string; buttons: Array<{id: string, label: string, value: string}> } | null>(null);
  const [isStreamingArtifact, setIsStreamingArtifact] = useState(false);
  const [artifactStreamContent, setArtifactStreamContent] = useState('');
  const [economists, setEconomists] = useState<AppUserData[]>([]);
  const [showEconomistDropdown, setShowEconomistDropdown] = useState(false);
  const [managers, setManagers] = useState<AppUserData[]>([]);
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  // Rename state
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Sharing states
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [shareableUsers, setShareableUsers] = useState<AppUserData[]>([]);
  const [selectedShareUsers, setSelectedShareUsers] = useState<string[]>([]);
  const [sharingConversation, setSharingConversation] = useState(false);
  const [sharedConversations, setSharedConversations] = useState<SharedConversation[]>([]);
  const [unreadSharedCount, setUnreadSharedCount] = useState(0);
  const [sidebarView, setSidebarView] = useState<'conversations' | 'shared'>('conversations');
  const [conversationDetails, setConversationDetails] = useState<SharedConversationDetails | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Notifications
  const { notifications, addNotification, addErrorNotification, removeNotification } = useNotifications();
  const {
    selectedEconomist,
    setSelectedEconomist,
    selectedManager,
    setSelectedManager
  } = useTeamSelection({
    currentConversationId: currentConversation?.id,
    economists,
    managers
  });

  const {
    offerParameters,
    sectionCollapsed,
    setSectionCollapsed,
    persistOfferParameters,
    updateOfferParameter
  } = useOfferParameters(currentConversation?.id);
  // Artifact panel tab: 'data' (variables) or 'preview' (document preview)
  const [artifactTab, setArtifactTab] = useState<'data' | 'preview'>(session.artifactTab ?? 'preview');
  // Bump to force DocumentPreview to re-fetch the global template
  const [templateVersion, setTemplateVersion] = useState(0);
  // Global template editor
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  // Per-chat document edit mode (lock/unlock)
  const [docEditMode, setDocEditMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const templateEditorIframeRef = useRef<HTMLIFrameElement>(null);
  const templateEditorFileInputRef = useRef<HTMLInputElement>(null);
  // Template editor: edit mode + image editing
  const [tplEditMode, setTplEditMode] = useState(false); // starts locked
  const [tplSelectedImage, setTplSelectedImage] = useState<{
    imgEl: HTMLImageElement;
    naturalWidth: number;
    naturalHeight: number;
    originalWidth: string;
    originalHeight: string;
  } | null>(null);
  const [tplImgWidth, setTplImgWidth] = useState(100);
  const [tplCropMode, setTplCropMode] = useState(false);
  const [tplCropValues, setTplCropValues] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  // DOCX template upload & preview
  const docxFileInputRef = useRef<HTMLInputElement>(null);
  const [hasDocxTemplate, setHasDocxTemplate] = useState(false);
  const [globalDocxFileId, setGlobalDocxFileId] = useState<string | null>(null);
  const [docxUploading, setDocxUploading] = useState(false);
  const [tplEditorTab] = useState<'docx'>('docx');
  const [docxPreviewLoading, setDocxPreviewLoading] = useState(false);
  const [docxPreviewError, setDocxPreviewError] = useState<string | null>(null);
  const [showInstructionNudge, setShowInstructionNudge] = useState(false);
  const [showOnlyMissingTemplateRows, setShowOnlyMissingTemplateRows] = useState(false);
  const [showFilledTemplateRows, setShowFilledTemplateRows] = useState(false);
  const [showSkippedTemplateRows, setShowSkippedTemplateRows] = useState(false);
  const [expandedTemplateValues, setExpandedTemplateValues] = useState<Record<string, boolean>>({});
  const [skippedTemplateRows, setSkippedTemplateRows] = useState<Record<string, boolean>>({});
  const [editingTemplateRows, setEditingTemplateRows] = useState<Record<string, boolean>>({});
  const [templateRowDrafts, setTemplateRowDrafts] = useState<Record<string, string>>({});
  const [templateRowOverrides, setTemplateRowOverrides] = useState<Record<string, string>>({});

  // Floating variable editor state (interactive preview)
  const [editingVariable, setEditingVariable] = useState<{
    key: string;
    filled: boolean;
    x: number;
    y: number;
    editValue: string;
  } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPlacement, setPopupPlacement] = useState<'below' | 'above'>('below');

  // Citation popover state
  const [activeCitation, setActiveCitation] = useState<CitationClickInfo | null>(null);
  const citationPopupRef = useRef<HTMLDivElement>(null);
  const [citationPlacement, setCitationPlacement] = useState<'below' | 'above'>('below');

  // Technological description generator state
  const [techDescLoading, setTechDescLoading] = useState(false);

  // AI-assisted variable editing state
  const [aiVarEditMode, setAiVarEditMode] = useState(false);
  const [aiVarEditInstruction, setAiVarEditInstruction] = useState('');
  const [aiVarEditLoading, setAiVarEditLoading] = useState(false);
  const [aiVarEditResult, setAiVarEditResult] = useState<string | null>(null);
  const [aiVarEditError, setAiVarEditError] = useState<string | null>(null);
  const [activeSdkTools, setActiveSdkTools] = useState<Anthropic.Tool[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const documentPreviewRef = useRef<DocumentPreviewHandle>(null);
  const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  useEffect(() => {
    loadSystemPrompt();
    loadConversations();
    loadEconomists();
    loadManagers();
    loadSharedConversations();
    loadShareableUsers();
    // Hydrate global template cache from DB so all users share the same template

    // Check if a DOCX template exists
    getDocxTemplateFileId().then(id => { setHasDocxTemplate(!!id); setGlobalDocxFileId(id); });
  }, []);

  useEffect(() => {
    const loadActiveSdkTools = async () => {
      try {
        // Source of truth: Directus instruction_variables (editable by admins)
        const schemaVar = await getInstructionVariable('sdk_chat_tool_schemas')
          || await getInstructionVariable('sdk_tool_schemas');

        if (!schemaVar?.content?.trim()) {
          setActiveSdkTools([]);
          addNotification('error', 'SDK schema', 'Nerasta sdk_chat_tool_schemas Directus lentelėje instruction_variables.');
          return;
        }

        const parsed = JSON.parse(schemaVar.content);
        if (!Array.isArray(parsed)) throw new Error('Schema config must be an array');
        setActiveSdkTools(parsed as Anthropic.Tool[]);
      } catch (error) {
        console.error('[SDK Tools] Failed to load schema from Directus.', error);
        setActiveSdkTools([]);
        addNotification('error', 'SDK schema', 'Nepavyko užkrauti SDK schemos iš Directus. Patikrinkite JSON formatą.');
      }
    };

    loadActiveSdkTools();
  }, [addNotification]);

  // Re-hydrate current global template pointer when opening viewers/panels.
  // This avoids stale "null" state in long-lived sessions after template updates.
  useEffect(() => {
    if (!showTemplateEditor && !(showArtifact && currentConversation?.artifact)) return;
    getDocxTemplateFileId().then(id => {
      setHasDocxTemplate(!!id);
      setGlobalDocxFileId(id);
    });
  }, [showTemplateEditor, showArtifact, currentConversation?.artifact]);

  // Sync URL ↔ currentConversation
  useEffect(() => {
    const id = currentConversation?.id;
    if (id && id !== urlConversationId) {
      navigate(`/sdk/${id}`, { replace: true });
    } else if (!id && urlConversationId) {
      navigate('/sdk', { replace: true });
    }
  }, [currentConversation?.id]);

  // Persist non-URL session state so refresh restores panel states
  useEffect(() => { saveSession({ showArtifact }); }, [showArtifact]);
  useEffect(() => { saveSession({ artifactTab }); }, [artifactTab]);
  useEffect(() => { saveSession({ sidebarCollapsed }); }, [sidebarCollapsed]);

  // Auto-exit document edit mode when switching conversations or tabs
  useEffect(() => { setDocEditMode(false); }, [currentConversation?.id, artifactTab]);

  // Smart popup positioning: measure after render, flip above if overflowing container
  useLayoutEffect(() => {
    if (!editingVariable) {
      setPopupPlacement('below');
      return;
    }
    const popup = popupRef.current;
    if (!popup) { setPopupPlacement('below'); return; }
    const container = popup.offsetParent as HTMLElement;
    if (!container) { setPopupPlacement('below'); return; }

    const containerHeight = container.clientHeight;
    const popupHeight = popup.offsetHeight;
    const belowBottom = editingVariable.y + 8 + popupHeight;
    const aboveTop = editingVariable.y - 8 - popupHeight;

    if (belowBottom > containerHeight && aboveTop > 0) {
      setPopupPlacement('above');
    } else {
      setPopupPlacement('below');
    }
  }, [editingVariable]);

  // Smart citation popup positioning
  useLayoutEffect(() => {
    if (!activeCitation) {
      setCitationPlacement('below');
      return;
    }
    const popup = citationPopupRef.current;
    if (!popup) { setCitationPlacement('below'); return; }
    const container = popup.offsetParent as HTMLElement;
    if (!container) { setCitationPlacement('below'); return; }

    const containerHeight = container.clientHeight;
    const popupHeight = popup.offsetHeight;
    const belowBottom = activeCitation.y + 8 + popupHeight;
    const aboveTop = activeCitation.y - 8 - popupHeight;

    if (belowBottom > containerHeight && aboveTop > 0) {
      setCitationPlacement('above');
    } else {
      setCitationPlacement('below');
    }
  }, [activeCitation]);

  const loadEconomists = async () => {
    try {
      const economistsList = await getEconomists();
      setEconomists(economistsList);
      console.log('[Economists] Loaded', economistsList.length, 'economists');
    } catch (error) {
      console.error('[Economists] Error loading:', error);
    }
  };

  const loadManagers = async () => {
    try {
      const managersList = await getManagers();
      setManagers(managersList);
      console.log('[Managers] Loaded', managersList.length, 'managers');
    } catch (error) {
      console.error('[Managers] Error loading:', error);
    }
  };

  // Propagate unread count to parent for main sidebar badge
  useEffect(() => {
    onUnreadCountChange?.(unreadSharedCount);
  }, [unreadSharedCount, onUnreadCountChange]);

  useEffect(() => {
    // Auto-scroll on new messages only if user hasn't scrolled up
    if (!userScrolledUp) {
      scrollToBottom();
    }
  }, [currentConversation?.messages, userScrolledUp]);

  useEffect(() => {
    // Auto-scroll during streaming if user hasn't scrolled up
    if (streamingContent && !userScrolledUp) {
      scrollToBottom();
    }
  }, [streamingContent, userScrolledUp]);

  useEffect(() => {
    // Reset scroll state when new response starts
    if (loading) {
      setUserScrolledUp(false);
      setShowScrollButton(false);
    }
  }, [loading]);

  // Refresh template when conversation changes
  useEffect(() => {
    setTemplateVersion(v => v + 1);
  }, [currentConversation?.id]);

  // Auto-collapse both sidebars when artifact panel opens, restore when closed
  useEffect(() => {
    if (showArtifact) {
      setSidebarCollapsed(true);
      onRequestMainSidebarCollapse?.(true);
    }
  }, [showArtifact]);

  const loadSystemPrompt = async () => {
    try {
      setLoadingPrompt(true);
      const [fullPrompt, template] = await Promise.all([
        getSystemPrompt(),
        getPromptTemplate()
      ]);
      setSystemPrompt(fullPrompt);
      setPromptTemplate(template);
      setTemplateFromDB(template);
      console.log('System prompt loaded, length:', fullPrompt.length);
      console.log('Template loaded, length:', template.length);
    } catch (err) {
      console.error('Error loading system prompt:', err);
      addErrorNotification('Klaida', err, 'Nepavyko užkrauti sistemos instrukcijų');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const limitAnthropicContext = (
    messages: Anthropic.MessageParam[],
    maxChars = 90000,
    maxMessages = 50
  ): { messages: Anthropic.MessageParam[]; trimmed: boolean; originalCount: number } => {
    let totalChars = 0;
    const selected: Anthropic.MessageParam[] = [];

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const contentChars = typeof msg.content === 'string'
        ? msg.content.length
        : JSON.stringify(msg.content).length;

      const exceedsMessageLimit = selected.length >= maxMessages;
      const exceedsCharLimit = totalChars + contentChars > maxChars;
      if ((exceedsMessageLimit || exceedsCharLimit) && selected.length > 0) break;

      selected.push(msg);
      totalChars += contentChars;
    }

    const trimmedMessages = selected.reverse();

    while (trimmedMessages.length > 0 && trimmedMessages[0].role !== 'user') {
      trimmedMessages.shift();
    }

    return {
      messages: trimmedMessages,
      trimmed: trimmedMessages.length < messages.length,
      originalCount: messages.length
    };
  };

  const fetchLatestPromptBundle = async (): Promise<{ fullPrompt: string; template: string }> => {
    try {
      const [fullPrompt, template] = await Promise.all([getSystemPrompt(), getPromptTemplate()]);
      setSystemPrompt(fullPrompt);
      setPromptTemplate(template);
      setTemplateFromDB(template);
      return { fullPrompt, template };
    } catch (error) {
      console.error('[fetchLatestPromptBundle] Error:', error);
      throw error;
    }
  };

  const saveTemplateVariable = async (content: string): Promise<{ success: boolean; error?: any }> => {
    try {
      const { dbAdmin } = await import('../lib/database');

      // Update the template variable in instruction_variables table
      const { error } = await dbAdmin
        .from('instruction_variables')
        .update({
          content: content,
          updated_at: new Date().toISOString(),
          updated_by: user.email
        })
        .eq('variable_key', 'chat_template');

      if (error) {
        console.error('[saveTemplateVariable] Error:', error);
        return { success: false, error };
      }

      console.log('[saveTemplateVariable] Template saved successfully');
      return { success: true };
    } catch (error) {
      console.error('[saveTemplateVariable] Exception:', error);
      return { success: false, error };
    }
  };

  const handleOpenPromptModal = async () => {
    try {
      setLoadingPrompt(true);
      setPromptPreviewError(null);
      await fetchLatestPromptBundle();
      setShowPromptModal(true);
    } catch (err) {
      const message = formatErrorForToast(err, 'Nepavyko sugeneruoti galutinio prompt iš chat_template');
      setPromptPreviewError(message);
      setShowPromptModal(true);
      addErrorNotification('Klaida', err, 'Preview nepavyko: trūksta kintamųjų arba šablonas nekorektiškas');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const { data, error: fetchError } = await getSDKConversations(projectId);
      if (fetchError) throw fetchError;
      setConversations(data || []);

      // Restore conversation from URL parameter
      if (urlConversationId && !currentConversation && data?.some(c => c.id === urlConversationId)) {
        handleSelectConversation(urlConversationId);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadSharedConversations = async () => {
    try {
      const { data, error } = await getSharedConversations(user.id);
      if (error) throw error;
      setSharedConversations(data || []);

      // Update unread count
      const { data: count } = await getUnreadSharedCount(user.id);
      setUnreadSharedCount(count);
    } catch (err) {
      console.error('Error loading shared conversations:', err);
    }
  };

  const loadShareableUsers = async () => {
    try {
      const users = await getShareableUsers(user.id);
      setShareableUsers(users);
    } catch (err) {
      console.error('Error loading shareable users:', err);
    }
  };

  const handleCreateConversation = async () => {
    try {
      setCreatingConversation(true);
      const { data: conversationId, error: createError } = await createSDKConversation(
        projectId,
        user.id,
        user.email,
        'Naujas pokalbis'
      );
      if (createError) throw createError;
      const { data: newConversation } = await getSDKConversation(conversationId!);
      setCurrentConversation(newConversation);
      // Optimistically add to conversations list to avoid flicker
      setConversations(prev => [newConversation!, ...prev]);
      addNotification('success', 'Sukurta', 'Naujas pokalbis sukurtas.');
    } catch (err) {
      console.error('Error creating conversation:', err);
      addErrorNotification('Klaida', err, 'Nepavyko sukurti pokalbio');
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    try {
      const { data, error: fetchError } = await getSDKConversation(conversationId);
      if (fetchError) throw fetchError;

      // Clean up any messages with array content (migration)
      if (data && data.messages) {
        data.messages = data.messages.map(msg => {
          if (typeof msg.content !== 'string') {
            console.warn('[Migration] Converting non-string message content to string', msg);
            const newContent = Array.isArray(msg.content)
              ? msg.content.map((block: any) =>
                  block.type === 'text' ? block.text : ''
                ).filter(Boolean).join('\n\n')
              : '[Content format error]';
            return { ...msg, content: newContent };
          }
          return msg;
        });
      }

      setCurrentConversation(data);

      // Load linked standartiniai_projektai record (if any) for docx download
      setStandartiniaiRecordId(null);
      setSavedDocxFileId(null);
      if (data?.artifact) {
        try {
          const spRecord = await getStandartinisByConversationId(conversationId);
          if (spRecord) {
            setStandartiniaiRecordId(spRecord.id);
            const fid = extractDirectusFileId(spRecord.document ?? spRecord.docx_file_id);
            if (fid) setSavedDocxFileId(fid);
          }
        } catch (spErr) {
          console.warn('[Standartiniai] Failed to load linked record:', spErr);
        }
      }
    } catch (err) {
      console.error('Error selecting conversation:', err);
    }
  };

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log('[Delete] Attempting to delete conversation:', conversationId);
      const { data, error: deleteError } = await deleteSDKConversation(conversationId, user.id, user.email);

      if (deleteError || !data) {
        console.error('[Delete] Error:', deleteError);
        addNotification('error', 'Klaida', formatErrorForToast(deleteError, 'Nepavyko ištrinti pokalbio'));
        return;
      }

      console.log('[Delete] Successfully deleted conversation');
      // Optimistically remove from list to avoid flicker
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setStandartiniaiRecordId(null);
        setSavedDocxFileId(null);
      }
      addNotification('info', 'Pokalbis ištrintas', 'Pokalbis sėkmingai pašalintas.');
    } catch (err: any) {
      console.error('[Delete] Exception:', err);
      addNotification('error', 'Klaida', formatToastMessage('Nepavyko ištrinti pokalbio', err, 'nežinoma klaida'));
    }
  };

  const handleStartRename = (convId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingConvId(convId);
    setRenameValue(currentTitle);
  };

  const handleConfirmRename = async (convId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingConvId(null); return; }
    try {
      await renameSDKConversation(convId, trimmed);
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: trimmed } : c));
      if (currentConversation?.id === convId) {
        setCurrentConversation(prev => prev ? { ...prev, title: trimmed } : prev);
      }
      addNotification('success', 'Atnaujinta', 'Pokalbio pavadinimas atnaujintas.');
    } catch (err) {
      console.error('Error renaming conversation:', err);
      addErrorNotification('Klaida', err, 'Nepavyko atnaujinti pokalbio pavadinimo');
    }
    setRenamingConvId(null);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    if (!isNearBottom && loading) {
      setUserScrolledUp(true);
      setShowScrollButton(true);
    } else if (isNearBottom) {
      setUserScrolledUp(false);
      setShowScrollButton(false);
    }
  };

  /**
   * Handle toggling share dropdown
   */
  const handleToggleShareDropdown = () => {
    if (!showShareDropdown) {
      setSelectedShareUsers([]);
    }
    setShowShareDropdown(!showShareDropdown);
  };

  /**
   * Handle sharing conversation
   */
  const handleShareConversation = async () => {
    if (!currentConversation || selectedShareUsers.length === 0) return;

    try {
      setSharingConversation(true);
      const { error } = await shareConversation(
        currentConversation.id,
        selectedShareUsers,
        user.id,
        user.email
      );

      if (error) throw error;

      addNotification('success', 'Sėkmė', `Pokalbis pasidalintas su ${selectedShareUsers.length} vartotojais`);
      setShowShareDropdown(false);
      setSelectedShareUsers([]);

      // Reload conversation details to show updated share list
      loadConversationDetails(currentConversation.id);
    } catch (err) {
      console.error('Error sharing conversation:', err);
      addErrorNotification('Klaida', err, 'Nepavyko pasidalinti pokalbiu');
    } finally {
      setSharingConversation(false);
    }
  };

  /**
   * Toggle user selection for sharing
   */
  const toggleUserSelection = (userId: string) => {
    setSelectedShareUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  /**
   * Load detailed information about current conversation (for read-only mode)
   */
  const loadConversationDetails = async (conversationId: string) => {
    try {
      const { data, error } = await getSharedConversationDetails(conversationId, user.id);
      if (error) throw error;
      setConversationDetails(data);
    } catch (err) {
      console.error('Error loading conversation details:', err);
    }
  };

  /**
   * Handle selecting a shared conversation
   */
  const handleSelectSharedConversation = async (sharedConv: SharedConversation) => {
    try {
      // Fetch fresh conversation data (consistent with handleSelectConversation)
      const { data, error: fetchError } = await getSDKConversation(sharedConv.conversation_id);
      if (fetchError || !data) {
        console.error('Error fetching shared conversation:', fetchError);
        return;
      }

      // Run the same content migration as owned conversations
      if (data.messages) {
        data.messages = data.messages.map(msg => {
          if (typeof msg.content !== 'string') {
            const newContent = Array.isArray(msg.content)
              ? (msg.content as any[]).map((block: any) =>
                  block.type === 'text' ? block.text : ''
                ).filter(Boolean).join('\n\n')
              : '[Content format error]';
            return { ...msg, content: newContent };
          }
          return msg;
        });
      }

      // Mark as read
      await markSharedAsRead(sharedConv.conversation_id, user.id);

      // Load full details
      await loadConversationDetails(sharedConv.conversation_id);

      // Set as current conversation with read-only flag
      setCurrentConversation(data);
      setIsReadOnly(true);
      setShowArtifact(!!data.artifact);
      setStandartiniaiRecordId(null);
      setSavedDocxFileId(null);

      // Load linked standartiniai record for shared conversations too
      if (data?.artifact) {
        try {
          const spRecord = await getStandartinisByConversationId(sharedConv.conversation_id);
          if (spRecord) {
            setStandartiniaiRecordId(spRecord.id);
            const fid = extractDirectusFileId(spRecord.document ?? spRecord.docx_file_id);
            if (fid) setSavedDocxFileId(fid);
            if (spRecord.html_content) setSavedHtmlFromDb(spRecord.html_content);
          }
        } catch { /* non-fatal */ }
      }

      // Reload shared conversations to update unread count
      loadSharedConversations();
    } catch (err) {
      console.error('Error selecting shared conversation:', err);
    }
  };

  /**
   * Handle selecting an owned conversation
   */
  const handleSelectOwnedConversation = async (conversationId: string) => {
    await handleSelectConversation(conversationId);
    setIsReadOnly(false);
    setConversationDetails(null);

    // Load details to show who it's shared with
    await loadConversationDetails(conversationId);
  };

  /**
   * Handle button click from display_buttons tool - sends silently to API
   */
  const handleButtonClick = async (buttonId: string, value: string, messageIndex: number) => {
    console.log('[Buttons] User clicked button:', buttonId, 'with value:', value);

    // Get current conversation or create one
    let conversation = currentConversation;
    if (!conversation) {
      try {
        setCreatingConversation(true);
        const { data: conversationId, error: createError } = await createSDKConversation(
          projectId,
          user.id,
          user.email,
          'Naujas pokalbis'
        );
        if (createError || !conversationId) {
          console.error('Error creating conversation:', createError);
          addErrorNotification('Klaida', createError, 'Nepavyko sukurti pokalbio');
          return;
        }

        const { data: newConversation } = await getSDKConversation(conversationId);
        if (!newConversation) {
          addNotification('error', 'Klaida', 'Nepavyko sukurti pokalbio');
          return;
        }

        conversation = newConversation;
        setCurrentConversation(newConversation);
        setConversations(prev => [newConversation, ...prev]);
      } catch (err: any) {
        console.error('Error creating conversation:', err);
        addErrorNotification('Klaida', err, 'Nepavyko sukurti pokalbio');
        return;
      } finally {
        setCreatingConversation(false);
      }
    }

    // Save button selection to database
    await updateMessageButtonSelection(conversation.id, messageIndex, buttonId);

    // Update local state to reflect button selection
    setCurrentConversation(prev => {
      if (!prev) return prev;
      const updatedMessages = [...prev.messages];
      if (updatedMessages[messageIndex]) {
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          selectedButtonId: buttonId
        };
      }
      return { ...prev, messages: updatedMessages };
    });

    // Also update conversations list
    setConversations(prevConvs =>
      prevConvs.map(conv => {
        if (conv.id === conversation.id) {
          const updatedMessages = [...conv.messages];
          if (updatedMessages[messageIndex]) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              selectedButtonId: buttonId
            };
          }
          return { ...conv, messages: updatedMessages };
        }
        return conv;
      })
    );

    // Send button value silently (without displaying in chat)
    const silentUserMessage: SDKMessage = {
      role: 'user',
      content: value,
      timestamp: new Date().toISOString(),
      isSilent: true // Mark as silent so it won't be displayed in UI
    };

    // Save to database but don't show in UI immediately
    await addMessageToConversation(conversation.id, silentUserMessage);

    // Start loading
    setLoading(true);
    setConversationStreamingContent(conversation.id, '');

    try {
      if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY not found');

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      // Build messages array with the silent message
      const messagesWithSilentMessage = [...conversation.messages, silentUserMessage];

      const anthropicMessages: Anthropic.MessageParam[] = [];

      for (const msg of messagesWithSilentMessage) {
        if (typeof msg.content !== 'string') {
          console.warn('[Silent Button] Skipping non-string message');
          continue;
        }

        // Strip display-only <function_calls> XML before sending to API
        const cleaned = (msg.content as string).replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim();
        anthropicMessages.push({
          role: msg.role,
          content: cleaned || msg.content
        });
      }

      const { fullPrompt } = await fetchLatestPromptBundle();
      const contextualSystemPrompt = fullPrompt;

      console.log('[Silent Button] Sending button value to API silently');
      const bounded = limitAnthropicContext(anthropicMessages);
      await processAIResponse(anthropic, bounded.messages, contextualSystemPrompt, conversation, messagesWithSilentMessage);

      // After response, update conversation with both silent message and AI response
      setLoading(false);

    } catch (err: any) {
      console.error('[Silent Button] Error:', err);
      await appLogger.logAPI({
        action: 'sdk_anthropic_request_failed',
        userId: user.id,
        userEmail: user.email,
        endpoint: 'anthropic.messages.stream',
        method: 'POST',
        level: 'error',
        metadata: {
          conversation_id: conversation.id,
          trigger: 'button_click',
          button_id: buttonId
        }
      });
      await appLogger.logError({
        action: 'sdk_chat_api_error',
        error: err,
        userId: user.id,
        userEmail: user.email,
        metadata: {
          conversation_id: conversation.id,
          trigger: 'button_click',
          button_id: buttonId
        }
      });
      addErrorNotification('Klaida', err, 'Nepavyko gauti atsakymo iš AI');
      setLoading(false);
    }
  };

  /**
   * Process AI response with tool use support (recursive)
   */
  const processAIResponse = async (
    anthropic: Anthropic,
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    conversation: SDKConversation,
    currentMessages: SDKMessage[],
    accumulatedToolXml: string = ''
  ): Promise<void> => {
    try {
      // CRITICAL: Validate messages before API call
      console.log('───────────────────────────────────────────────────');
      console.log('[processAIResponse] ENTRY POINT - Validating messages');
      console.log('[processAIResponse] Total messages:', messages.length);

      const toolUseIds: string[] = [];
      const toolResultIds: string[] = [];

      messages.forEach((msg, idx) => {
        const contentInfo = Array.isArray(msg.content)
          ? `[${msg.content.map((c: any) => {
              if (c.type === 'tool_use') {
                toolUseIds.push(c.id);
                return `tool_use(${c.name}, id:${c.id.substring(0, 12)}...)`;
              }
              if (c.type === 'tool_result') {
                toolResultIds.push(c.tool_use_id);
                return `tool_result(for:${c.tool_use_id.substring(0, 12)}...)`;
              }
              if (c.type === 'text') return `text(${c.text?.length || 0} chars)`;
              return c.type || 'unknown';
            }).join(', ')}]`
          : `"${typeof msg.content === 'string' ? msg.content.substring(0, 60) + '...' : msg.content}"`;

        console.log(`  [${idx}] ${msg.role}: ${contentInfo}`);
      });

      // CRITICAL: Validate tool_use/tool_result ADJACENCY (not just ID matching)
      // Anthropic API requires: if message N has tool_use, message N+1 MUST have tool_result
      let validationErrors: string[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!Array.isArray(msg.content)) continue;

        const hasToolUse = msg.content.some((block: any) => block.type === 'tool_use');
        if (hasToolUse && msg.role === 'assistant') {
          // This message has tool_use blocks, next message MUST be user with tool_results
          const toolUseIdsInMsg = msg.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => block.id);

          if (i + 1 >= messages.length) {
            validationErrors.push(`Message ${i} has tool_use but no following message`);
            continue;
          }

          const nextMsg = messages[i + 1];
          if (nextMsg.role !== 'user') {
            validationErrors.push(`Message ${i} has tool_use but next message ${i + 1} is not user (role=${nextMsg.role})`);
            continue;
          }

          if (!Array.isArray(nextMsg.content)) {
            validationErrors.push(`Message ${i} has tool_use but next message ${i + 1} has non-array content`);
            continue;
          }

          const toolResultIdsInNextMsg = nextMsg.content
            .filter((block: any) => block.type === 'tool_result')
            .map((block: any) => block.tool_use_id);

          const missingInNext = toolUseIdsInMsg.filter(id => !toolResultIdsInNextMsg.includes(id));
          if (missingInNext.length > 0) {
            validationErrors.push(`Message ${i} tool_use IDs [${missingInNext.join(', ')}] not found in next message ${i + 1}`);
          }
        }
      }

      if (validationErrors.length > 0) {
        console.error('❌❌❌ [processAIResponse] STRUCTURAL VALIDATION FAILED:');
        validationErrors.forEach(err => console.error(`  ❌ ${err}`));
        console.error('❌❌❌ This WILL cause a 400 error from Anthropic API!');
        throw new Error(`Message structure validation failed: ${validationErrors.join('; ')}`);
      } else if (toolUseIds.length > 0) {
        console.log('✅ [processAIResponse] All tool_use blocks properly paired with adjacent tool_results');
      }
      console.log('───────────────────────────────────────────────────');

      // FINAL: Log exact message structure being sent to API
      console.log('[API CALL] Sending to Anthropic API:');
      console.log('[API CALL] Total messages:', messages.length);
      console.log('[API CALL] Serialized messages:', JSON.stringify(messages, null, 2));
      console.log('───────────────────────────────────────────────────');

      const apiStartedAt = Date.now();
      await appLogger.logAPI({
        action: 'sdk_anthropic_request_started',
        userId: user.id,
        userEmail: user.email,
        endpoint: 'anthropic.messages.stream',
        method: 'POST',
        metadata: {
          conversation_id: conversation.id,
          message_count: messages.length
        }
      });

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: messages,
        tools: activeSdkTools
      });

      let thinkingContent = '';
      let responseContent = '';
      let fullResponseText = '';
      const toolUses: Array<{ id: string; name: string; input: any }> = [];
      let currentToolUse: { id: string; name: string; input: string } | null = null;
      let artifactDetected = false;
      let isInsideArtifact = false;
      let artifactContent = '';
      let chatContent = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'thinking') {
            setIsToolUse(false);
          } else if (event.content_block.type === 'tool_use') {
            setIsToolUse(true);
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
            setToolUseName(event.content_block.name || 'tool');
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'thinking_delta') {
            thinkingContent += event.delta.thinking;
          } else if (event.delta.type === 'text_delta') {
            responseContent += event.delta.text;
            fullResponseText += event.delta.text;

            // Check if we're entering or inside a commercial_offer artifact
            if (fullResponseText.includes('<commercial_offer')) {
              if (!artifactDetected) {
                console.log('[Artifact Streaming] Detected <commercial_offer> tag');
                artifactDetected = true;
                setIsStreamingArtifact(true);
                setShowArtifact(true); // Show artifact panel immediately
              }
              isInsideArtifact = true;
            }

            if (fullResponseText.includes('</commercial_offer>')) {
              isInsideArtifact = false;
            }

            // Route content appropriately
            if (isInsideArtifact) {
              // Extract YAML content (everything between tags)
              const artifactMatch = fullResponseText.match(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>([\s\S]*?)(?:<\/commercial_offer>|$)/);
              if (artifactMatch) {
                artifactContent = artifactMatch[1].trim();
                setArtifactStreamContent(artifactContent);
              }

              // Chat content is everything before the opening tag
              const beforeArtifact = fullResponseText.split('<commercial_offer')[0];
              chatContent = beforeArtifact;
              setConversationStreamingContent(conversation.id, accumulatedToolXml + chatContent);
            } else {
              // Normal chat content
              chatContent = fullResponseText;
              setConversationStreamingContent(conversation.id, accumulatedToolXml + chatContent);
            }

          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              toolUses.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: JSON.parse(currentToolUse.input)
              });
            } catch (e) {
              console.error('[Tool] Failed to parse tool input:', currentToolUse.input);
            }
            currentToolUse = null;
          }
          setIsToolUse(false);
        }
      }

      // NOTE: Don't reset isStreamingArtifact here — it's reset AFTER artifact
      // detection in the final response branch, or before recursion in the tool
      // use branch.  Resetting eagerly here causes the artifact panel to
      // disappear during the gap between stream end and artifact save.
      setArtifactStreamContent('');

      // Get the complete final message to ensure we have all tool_use blocks correctly
      const finalMessage = await stream.finalMessage();
      await appLogger.logAPI({
        action: 'sdk_anthropic_response_received',
        userId: user.id,
        userEmail: user.email,
        endpoint: 'anthropic.messages.stream',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: Date.now() - apiStartedAt,
        metadata: {
          conversation_id: conversation.id,
          stop_reason: finalMessage.stop_reason,
          content_blocks: finalMessage.content.length
        }
      });
      console.log('[Stream] Final message role:', finalMessage.role);
      console.log('[Stream] Final message content blocks:', finalMessage.content.length);
      console.log('[Stream] Final message stop_reason:', finalMessage.stop_reason);

      // Re-extract tool uses from final message (more authoritative than manual reconstruction)
      const authoritative_toolUses: Array<{ id: string; name: string; input: any }> = [];
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          authoritative_toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input
          });
          console.log(`[Stream] Authoritative tool_use: ${block.name} (ID: ${block.id})`);
        }
      }

      // Compare with manually reconstructed toolUses
      if (toolUses.length !== authoritative_toolUses.length) {
        console.warn(`[Stream] ⚠️  Tool count mismatch! Manual: ${toolUses.length}, Authoritative: ${authoritative_toolUses.length}`);
        console.warn('[Stream] Using authoritative tool uses from finalMessage');
      }

      // Use authoritative tool uses
      const finalToolUses = authoritative_toolUses;

      // Filter out empty thinking blocks early (declare before any usage to avoid TDZ error)
      const filteredContent = finalMessage.content.filter((block: any) => {
        if (block.type === 'thinking') {
          const hasContent = block.thinking && block.thinking.trim().length > 0;
          if (!hasContent) {
            console.log('[Content Filter] Filtering out empty thinking block');
            return false;
          }
        }
        return true;
      });
      console.log(`[Content Filter] Filtered blocks: ${finalMessage.content.length} -> ${filteredContent.length}`);

      // Build tool call XML from this round for persistence in chat history
      // Includes results and filters out display_buttons (internal UI mechanism)
      const buildToolXml = (tools: Array<{ id: string; name: string; input: any }>, results?: Array<{ tool_use_id: string; content: string }>): string => {
        const filtered = tools.filter(t => t.name !== 'display_buttons');
        if (filtered.length === 0) return '';
        const invokeBlocks = filtered.map(tu => {
          const paramStr = typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input);
          const safeParam = paramStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          let block = '  <invoke name="' + tu.name + '">\n    <parameter name="input">' + safeParam + '</parameter' + '>';
          if (results) {
            const toolResult = results.find(r => r.tool_use_id === tu.id);
            if (toolResult) {
              const safeResult = toolResult.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
              block += '\n    <result>' + safeResult + '</result>';
            }
          }
          block += '\n  </invoke' + '>';
          return block;
        });
        return '\n\n<function_calls' + '>\n' + invokeBlocks.join('\n') + '\n</function_calls' + '>\n';
      };

      // If there are tool uses, execute them and continue (don't save intermediate message)
      if (finalToolUses.length > 0) {
        // Safe to reset streaming state — the recursive call will set it again if needed
        setIsStreamingArtifact(false);
        console.log(`[Tool Loop] Executing ${finalToolUses.length} tools...`);

        // Execute all tools with error handling
        const toolResults = await Promise.all(
          finalToolUses.map(async (toolUse) => {
            try {
              const result = await executeTool(toolUse.name, toolUse.input);
              console.log(`[Tool Loop] Tool ${toolUse.name} completed. Result length:`, result.length);
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: result
              };
            } catch (error: any) {
              console.error(`[Tool Loop] Tool ${toolUse.name} threw exception:`, error);
              // Return error as tool_result so the conversation can continue
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message || 'Unknown error executing tool',
                  tool_name: toolUse.name
                })
              };
            }
          })
        );

        // Build XML with results now that we have them (filters out display_buttons)
        const roundToolXml = buildToolXml(finalToolUses, toolResults);
        const newAccumulatedToolXml = accumulatedToolXml + (responseContent ? responseContent : '') + roundToolXml;

        // Update streaming content immediately so tool tree shows live during gap
        setConversationStreamingContent(conversation.id, newAccumulatedToolXml);

        // Check if any tool result contains display_buttons marker (should pause conversation)
        const buttonResult = toolResults.find(result => {
          try {
            const parsed = JSON.parse(result.content);
            return parsed.display_buttons === true;
          } catch {
            return false;
          }
        });

        if (buttonResult) {
          console.log('[Tool Loop] Detected display_buttons - pausing conversation');
          const parsed = JSON.parse(buttonResult.content);

          // Extract text content from filteredContent array
          const textContent = filteredContent
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('\n\n');

          // Create assistant message with buttons (ensure content is string)
          // Prepend accumulated tool call XML so tool usage persists in chat history
          const fullButtonContent = accumulatedToolXml
            ? (accumulatedToolXml + responseContent + roundToolXml)
            : (responseContent + roundToolXml);
          const assistantMessage: SDKMessage = {
            role: 'assistant',
            content: fullButtonContent,
            timestamp: new Date().toISOString(),
            buttons: parsed.buttons, // Store buttons with the message
            buttonsMessage: parsed.message
          };

          // Save the message to the conversation
          await addMessageToConversation(conversation.id, assistantMessage);
          const finalMessages = [...currentMessages, assistantMessage];

          const updatedConversation = {
            ...conversation,
            messages: finalMessages,
            message_count: finalMessages.length,
            last_message_at: assistantMessage.timestamp,
            updated_at: new Date().toISOString()
          };

          setCurrentConversation(updatedConversation);

          // Optimistically update conversations list and re-sort newest first
          setConversations(prev => prev.map(conv =>
            conv.id === updatedConversation.id
              ? { ...conv, last_message_at: updatedConversation.last_message_at, message_count: updatedConversation.messages.length }
              : conv
          ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));

          setLoading(false);
          setDisplayButtons(null); // Don't use separate state
          return; // PAUSE - don't continue with recursive loop
        }

        // Build messages for next round (with tool_use and tool_result blocks)
        // CRITICAL: Use the ACTUAL content from finalMessage, not reconstructed tool_use blocks!
        // This ensures the tool_use blocks match exactly what Claude sent us.
        // BUT: Filter out empty thinking blocks (API rejects them in recursive calls)

        console.log(`[Tool Loop] Using ${messages.length} messages from previous API call as conversation history`);
        console.log(`[Tool Loop] Using filteredContent with ${filteredContent.length} blocks (already filtered above)`);

        const anthropicMessagesWithToolResults: Anthropic.MessageParam[] = [
          ...messages, // Keep ALL messages from previous API call - they're part of conversation history
          {
            role: 'assistant',
            content: filteredContent  // Use filtered content (no empty thinking blocks)
          },
          {
            role: 'user',
            content: toolResults
          }
        ];

        // CRITICAL VALIDATION: Verify the messages array structure
        console.log('═══════════════════════════════════════════════════');
        console.log('[CRITICAL] Tool Loop - Constructed messages array:');
        console.log('[CRITICAL] Total messages:', anthropicMessagesWithToolResults.length);

        anthropicMessagesWithToolResults.forEach((msg, idx) => {
          const contentInfo = Array.isArray(msg.content)
            ? `[${msg.content.map((c: any) => {
                if (c.type === 'tool_use') return `tool_use(id:${c.id.substring(0, 12)}...)`;
                if (c.type === 'tool_result') return `tool_result(for:${c.tool_use_id.substring(0, 12)}...)`;
                if (c.type === 'text') return 'text';
                return c.type || 'unknown';
              }).join(', ')}]`
            : `"${typeof msg.content === 'string' ? msg.content.substring(0, 50) : msg.content}"`;

          console.log(`[CRITICAL] [${idx}] ${msg.role}: ${contentInfo}`);
        });

        // Validate that every tool_use has a matching tool_result
        const allToolUseIds: string[] = [];
        const allToolResultIds: string[] = [];

        anthropicMessagesWithToolResults.forEach((msg) => {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((block: any) => {
              if (block.type === 'tool_use') allToolUseIds.push(block.id);
              if (block.type === 'tool_result') allToolResultIds.push(block.tool_use_id);
            });
          }
        });

        console.log('[CRITICAL] Tool use IDs:', allToolUseIds);
        console.log('[CRITICAL] Tool result IDs:', allToolResultIds);

        const missingResults = allToolUseIds.filter(id => !allToolResultIds.includes(id));
        if (missingResults.length > 0) {
          console.error('[CRITICAL] ❌ MISSING TOOL RESULTS FOR:', missingResults);
          console.error('');
          console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
          console.error('FATAL: About to send malformed messages to API!');
          console.error('Missing tool_result blocks for tool_use IDs:', missingResults);
          console.error('This WILL cause a 400 error. ABORTING recursive call.');
          console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
          console.error('');
          throw new Error(`Internal error: Constructed message array has tool_use without tool_result. Tool use IDs missing results: ${missingResults.join(', ')}`);
        } else {
          console.log('[CRITICAL] ✅ All tool_use blocks have matching tool_result blocks');
        }
        console.log('═══════════════════════════════════════════════════');

        // Recursively process next response with tool results (don't save intermediate messages)
        await processAIResponse(
          anthropic,
          anthropicMessagesWithToolResults,
          systemPrompt,
          conversation,
          currentMessages, // Keep same currentMessages, not adding anything yet
          newAccumulatedToolXml
        );
      } else {
        // No more tool uses, save final assistant message
        // Prepend accumulated tool call XML so tool usage persists in chat history
        const fullContent = accumulatedToolXml ? (accumulatedToolXml + responseContent) : responseContent;
        const assistantMessage: SDKMessage = {
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
          thinking: thinkingContent
        };

        await addMessageToConversation(conversation.id, assistantMessage);
        const finalMessages = [...currentMessages, assistantMessage];

        const updatedConversation = {
          ...conversation,
          messages: finalMessages,
          message_count: finalMessages.length,
          last_message_at: assistantMessage.timestamp,
          updated_at: new Date().toISOString()
        };

        setCurrentConversation(updatedConversation);

        // Optimistically update conversations list with new last_message_at
        setConversations(prev => prev.map(conv =>
          conv.id === updatedConversation.id
            ? { ...conv, last_message_at: updatedConversation.last_message_at, message_count: updatedConversation.messages.length }
            : conv
        ));

        // CRITICAL: Check for artifacts in final response
        if (responseContent.includes('<commercial_offer')) {
          console.log('[Artifact] Detected commercial_offer in final response');
          await handleArtifactGeneration(
            responseContent,
            updatedConversation,
            thinkingContent,
            responseContent,
            finalMessages.length - 1
          );
        }

        // NOW safe to reset streaming artifact state (after artifact is saved)
        setIsStreamingArtifact(false);
      }
    } catch (err: any) {
      console.error('[processAIResponse] Error:', err);
      await appLogger.logAPI({
        action: 'sdk_anthropic_request_failed',
        userId: user.id,
        userEmail: user.email,
        endpoint: 'anthropic.messages.stream',
        method: 'POST',
        level: 'error',
        metadata: {
          conversation_id: conversation.id,
          message_count: messages.length
        }
      });
      setIsStreamingArtifact(false); // Reset on error too
      throw err;
    }
  };

  const handleSend = async (overrideMessage?: string) => {
    const messageText = overrideMessage ?? inputValue.trim();
    if (!messageText || loading) return;

    // If no conversation exists, create one first
    let conversation = currentConversation;
    if (!conversation) {
      try {
        setCreatingConversation(true);
        const { data: conversationId, error: createError } = await createSDKConversation(
          projectId,
          user.id,
          user.email,
          'Naujas pokalbis'
        );
        if (createError) {
          console.error('Error creating conversation:', createError);
          throw createError;
        }
        if (!conversationId) {
          throw new Error('No conversation ID returned');
        }

        const { data: newConversation, error: fetchError } = await getSDKConversation(conversationId);
        if (fetchError) {
          console.error('Error fetching new conversation:', fetchError);
          throw fetchError;
        }
        if (!newConversation) {
          throw new Error('Failed to fetch newly created conversation');
        }

        conversation = newConversation;
        setCurrentConversation(newConversation);
        // Optimistically add to conversations list to avoid flicker
        setConversations(prev => [newConversation, ...prev]);
      } catch (err: any) {
        console.error('Error creating conversation:', err);
        addErrorNotification('Klaida', err, 'Nepavyko sukurti pokalbio');
        return;
      } finally {
        setCreatingConversation(false);
      }
    }

    // Dismiss any unselected buttons before sending new message
    const dismissedMessages = conversation.messages.map(msg => {
      if (msg.buttons && msg.buttons.length > 0 && msg.selectedButtonId === undefined) {
        const { buttons, buttonsMessage, ...rest } = msg;
        return rest;
      }
      return msg;
    });

    const userMessage: SDKMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };

    await addMessageToConversation(conversation.id, userMessage);
    const updatedMessages = [...dismissedMessages, userMessage];
    setCurrentConversation({ ...conversation, messages: updatedMessages });
    setInputValue('');
    setLoading(true);
    setConversationStreamingContent(conversation.id, '');

    try {
      if (!anthropicApiKey) throw new Error('VITE_ANTHROPIC_API_KEY not found');

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      // ╔═══════════════════════════════════════════════════════════════╗
      // ║  PHASE 1: ANALYZE RAW MESSAGES FROM DATABASE                  ║
      // ╚═══════════════════════════════════════════════════════════════╝
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  HANDLESEND: Analyzing messages BEFORE filtering             ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('[PHASE 1] Total messages from database:', updatedMessages.length);

      updatedMessages.forEach((msg, idx) => {
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        let preview = '';

        if (contentType === 'string') {
          preview = msg.content.substring(0, 80);
        } else if (isArray) {
          preview = `ARRAY with ${msg.content.length} blocks: ${JSON.stringify(msg.content).substring(0, 80)}`;
        } else {
          preview = `OBJECT: ${JSON.stringify(msg.content).substring(0, 80)}`;
        }

        console.log(`[PHASE 1][${idx}] ${msg.role} | type: ${contentType} | isArray: ${isArray} | preview: "${preview}"`);

        // If non-string content, log full structure
        if (contentType !== 'string') {
          console.warn(`[PHASE 1][${idx}] ⚠️  NON-STRING CONTENT DETECTED:`, JSON.stringify(msg.content, null, 2));
        }
      });
      console.log('');

      // Clean message history: remove tool artifacts and ensure alternating roles
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 2: FILTERING MESSAGES                                  ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');

      const anthropicMessages: Anthropic.MessageParam[] = [];
      let lastRole: 'user' | 'assistant' | null = null;

      let skippedCount = 0;
      let malformedCount = 0;
      let nonStringCount = 0;
      let duplicateRoleCount = 0;

      for (const msg of updatedMessages) {
        const idx = updatedMessages.indexOf(msg);

        // FIRST: Check content type (most important check)
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        const isString = contentType === 'string';

        console.log(`[PHASE 2][${idx}] Checking message: role=${msg.role}, contentType=${contentType}, isArray=${isArray}`);

        // Skip if content is not a string (tool_use blocks, malformed data)
        if (!isString || isArray) {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Content is not a string (type=${contentType}, isArray=${isArray})`);
          const preview = isArray ? JSON.stringify(msg.content).substring(0, 150) : String(msg.content).substring(0, 150);
          console.log(`[PHASE 2][${idx}]    Content preview:`, preview);
          skippedCount++;
          nonStringCount++;
          continue;
        }

        // Now we know content is definitely a string, create safe string representation
        const contentStr = msg.content as string;

        // Skip synthetic tool messages and malformed messages
        if (contentStr.startsWith('[Tool results:') ||
            contentStr.includes('toolu_') ||
            contentStr.trim().length === 0 ||
            contentStr === '{}' ||
            contentStr === '[]') {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Malformed/synthetic message:`, contentStr.substring(0, 100));
          skippedCount++;
          malformedCount++;
          continue;
        }

        // Skip if same role as previous (prevents consecutive assistant/user messages)
        if (msg.role === lastRole) {
          console.log(`[PHASE 2][${idx}] ❌ SKIPPING: Duplicate role (${msg.role} after ${lastRole})`);
          skippedCount++;
          duplicateRoleCount++;
          continue;
        }

        // DOUBLE CHECK before adding (paranoid validation)
        if (typeof msg.content !== 'string') {
          console.error(`[PHASE 2][${idx}] ⚠️  CRITICAL: Message passed checks but content is not string! Type:`, typeof msg.content);
          console.error(`[PHASE 2][${idx}]    This should NEVER happen. Skipping for safety.`);
          skippedCount++;
          nonStringCount++;
          continue;
        }

        // Safe to add - strip display-only <function_calls> XML before sending to API
        const cleanedContent = contentStr.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '').trim();
        console.log(`[PHASE 2][${idx}] ✅ KEEPING: Valid string message, length=${cleanedContent.length}`);
        anthropicMessages.push({
          role: msg.role,
          content: cleanedContent || contentStr
        });
        lastRole = msg.role;
      }

      console.log('');
      console.log(`[PHASE 2] Filtering complete:`);
      console.log(`[PHASE 2]   - Total processed: ${updatedMessages.length}`);
      console.log(`[PHASE 2]   - Kept: ${anthropicMessages.length}`);
      console.log(`[PHASE 2]   - Skipped: ${skippedCount} (non-string: ${nonStringCount}, malformed: ${malformedCount}, duplicate role: ${duplicateRoleCount})`);
      console.log('');

      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 3: FILTERED MESSAGES (GOING TO API)                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('[PHASE 3] Clean message count:', anthropicMessages.length);
      console.log('[PHASE 3] Message roles:', anthropicMessages.map(m => m.role).join(' -> '));

      anthropicMessages.forEach((msg, idx) => {
        const contentType = typeof msg.content;
        const isArray = Array.isArray(msg.content);
        let preview = '';

        if (contentType === 'string') {
          preview = msg.content.substring(0, 80);
        } else if (isArray) {
          preview = `ARRAY[${msg.content.length}]: ${(msg.content as any[]).map((c: any) => c.type || 'unknown').join(', ')}`;
        } else {
          preview = JSON.stringify(msg.content).substring(0, 80);
        }

        console.log(`[PHASE 3][${idx}] ${msg.role} | type: ${contentType} | isArray: ${isArray} | preview: "${preview}"`);

        // If array content, show details
        if (isArray) {
          console.warn(`[PHASE 3][${idx}] ⚠️  ARRAY CONTENT IN FILTERED MESSAGES:`, JSON.stringify(msg.content, null, 2));
        }
      });

      // CRITICAL: Final validation before API call
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 4: FINAL VALIDATION BEFORE API CALL                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');

      // Check for tool_use blocks without corresponding tool_result blocks
      for (let i = 0; i < anthropicMessages.length; i++) {
        const msg = anthropicMessages[i];
        if (Array.isArray(msg.content)) {
          const hasToolUse = (msg.content as any[]).some((block: any) => block.type === 'tool_use');
          if (hasToolUse) {
            console.error(`[PHASE 4] ❌ ERROR: Message [${i}] has tool_use blocks but content is array!`);
            console.error(`[PHASE 4] ❌ This message should have been filtered out!`);
            console.error(`[PHASE 4] ❌ Message:`, JSON.stringify(msg, null, 2));

            // Check if next message has tool_result
            if (i + 1 < anthropicMessages.length) {
              const nextMsg = anthropicMessages[i + 1];
              const hasToolResult = Array.isArray(nextMsg.content) &&
                (nextMsg.content as any[]).some((block: any) => block.type === 'tool_result');
              if (!hasToolResult) {
                console.error(`[PHASE 4] ❌ CRITICAL: Next message [${i + 1}] does NOT have tool_result!`);
                console.error(`[PHASE 4] ❌ This WILL cause 400 error from Anthropic!`);
              }
            } else {
              console.error(`[PHASE 4] ❌ CRITICAL: No next message after tool_use!`);
              console.error(`[PHASE 4] ❌ This WILL cause 400 error from Anthropic!`);
            }
          }
        }
      }

      console.log('[PHASE 4] ✅ Validation complete. Proceeding to API call...');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');

      const { fullPrompt } = await fetchLatestPromptBundle();

      // Build system prompt with artifact context if exists
      let contextualSystemPrompt = fullPrompt;
      if (conversation.artifact) {
        contextualSystemPrompt += `\n\n---\n\n**CURRENT ARTIFACT CONTEXT:**\nAn active commercial offer artifact exists in this conversation with ID: \`${conversation.artifact.id}\`\n\n**CRITICAL:** When updating or modifying the commercial offer, you MUST reuse this artifact_id:\n\`\`\`xml\n<commercial_offer artifact_id="${conversation.artifact.id}">\n[updated content]\n</commercial_offer>\n\`\`\`\n\nDO NOT create a new artifact. Always use artifact_id="${conversation.artifact.id}" for updates.`;
      }

      // Start recursive tool use loop
      const bounded = limitAnthropicContext(anthropicMessages);
      if (bounded.trimmed) {
        addNotification('info', 'Kontekstas sutrumpintas', `Siunčiama ${bounded.messages.length}/${bounded.originalCount} paskutinių žinučių, kad neviršytume SDK limito.`);
      }
      await processAIResponse(anthropic, bounded.messages, contextualSystemPrompt, conversation, updatedMessages);
    } catch (err: any) {
      console.error('Error sending message:', err);
      await appLogger.logError({
        action: 'sdk_send_message_failed',
        error: err,
        userId: user.id,
        userEmail: user.email,
        metadata: {
          conversation_id: conversation.id,
          message_length: messageText.length
        }
      });
      addErrorNotification('Klaida', err, 'Nepavyko išsiųsti žinutės');
      if ((err?.message || '').toLowerCase().includes('prompt is too long')) {
        addNotification('info', 'Per ilgas prompt', 'Kontekstas viršijo modelio limitą. Patikrinkite instrukcijas ir SDK schemų dydį.');
      }
      setConversationStreamingContent(conversation.id, '');
    } finally {
      setLoading(false);
      setConversationStreamingContent(conversation.id, '');
      setIsToolUse(false);
    }
  };

  /**
   * Render user message with {{variable}} references highlighted in blue
   */
  const renderUserMessageWithVariables = (text: string): React.ReactNode => {
    const parts = text.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\})/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const varName = part.slice(2, -2);
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[13px] font-mono font-medium"
            style={{ background: '#dbeafe', color: '#1d4ed8' }}
          >
            {`{{${varName}}}`}
          </span>
        );
      }
      return part;
    });
  };

  /**
   * Render YAML content with interactive variables
   */
  const renderInteractiveYAML = (yamlContent: string) => {
    const lines = yamlContent.split('\n');
    // Pattern: variable_key: "value" or variable_key: | or variable_key: (empty → multiline block follows)
    const variablePattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/;

    // Collect multiline values
    const items: { key: string; value: string; lineIndex: number }[] = [];
    let currentMultiline: { key: string; lines: string[]; lineIndex: number } | null = null;

    lines.forEach((line, index) => {
      if (currentMultiline) {
        if (/^\s+/.test(line) || line.trim() === '') {
          currentMultiline.lines.push(line.trimStart());
          return;
        } else {
          items.push({ key: currentMultiline.key, value: currentMultiline.lines.join('\n'), lineIndex: currentMultiline.lineIndex });
          currentMultiline = null;
        }
      }

      const match = line.match(variablePattern);
      if (match && !line.startsWith('#') && !line.startsWith(' ')) {
        const [, varKey, value] = match;
        if (value.trim() === '|' || value.trim() === '>' || value.trim() === '') {
          // Block scalar (|, >) or bare key with indented lines following
          currentMultiline = { key: varKey, lines: [], lineIndex: index };
        } else {
          // Strip surrounding quotes from value
          const cleanValue = value.replace(/^["']|["']$/g, '');
          items.push({ key: varKey, value: cleanValue, lineIndex: index });
        }
      }
    });

    // Flush any remaining multiline
    if (currentMultiline) {
      items.push({ key: currentMultiline.key, value: currentMultiline.lines.join('\n'), lineIndex: currentMultiline.lineIndex });
    }

    return items.map((item) => (
      <div key={item.lineIndex} className="group mb-1">
        <div className="flex items-start gap-1.5">
          <button
            onClick={() => {
              setInputValue(`Pakeisk {{${item.key}}} į: `);
              textareaRef.current?.focus();
            }}
            className="yaml-var-card text-left flex-1 rounded px-3 py-1.5 transition-all"
            style={{
              background: '#ffffff',
              borderLeft: '2px solid #d1d5db',
              fontSize: '12px',
              lineHeight: '1.4',
              color: '#1D1D1F',
            }}
            title="Spustelėkite, kad redaguotumėte"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0f7ff';
              e.currentTarget.style.borderLeftColor = '#3b82f6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderLeftColor = '#d1d5db';
            }}
          >
            <span style={{ fontSize: '9px', color: '#9ca3af', letterSpacing: '0.02em' }}>{item.key}</span>
            <span style={{ whiteSpace: 'pre-wrap', display: 'block', marginTop: '1px' }}>{item.value}</span>
          </button>
          <Copy
            className="w-3 h-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
            style={{ color: 'var(--color-base-content)', opacity: 0.5 }}
            onClick={() => {
              navigator.clipboard.writeText(`{{${item.key}}}`);
              addNotification('info', 'Nukopijuota', `{{${item.key}}} nukopijuota į iškarpinę.`);
            }}
            title="Kopijuoti kintamojo nuorodą"
          />
        </div>
      </div>
    ));
  };

  const handleArtifactGeneration = async (
    content: string,
    conversation: SDKConversation,
    thinkingText?: string,
    chatText?: string,
    messageIndex?: number
  ) => {
    try {
      // Match with optional artifact_id attribute
      const match = content.match(/<commercial_offer(?:\s+artifact_id="([^"]*)")?\s*>([\s\S]*?)<\/commercial_offer>/);
      if (!match) return;

      const [_, artifactIdFromAI, offerContent] = match;
      const trimmedContent = offerContent.trim();
      const currentArtifact = conversation.artifact;
      let newArtifact: CommercialOfferArtifact;

      console.log('[Artifact] Detected artifact_id from AI:', artifactIdFromAI);
      console.log('[Artifact] Current artifact exists:', !!currentArtifact);

      // Determine if this is a new artifact or an update
      const isNewArtifact = artifactIdFromAI === 'new' || !currentArtifact;
      const newVersion = isNewArtifact ? 1 : (currentArtifact.version + 1);
      const nowISO = new Date().toISOString();

      // --- Build citations for changed variables (non-blocking) ---
      let citations: Record<string, VariableCitation> = {};
      try {
        const newYamlVars = parseYAMLContent(trimmedContent);
        const oldYamlVars = currentArtifact ? parseYAMLContent(currentArtifact.content) : {};
        const existingCitations = currentArtifact?.variable_citations || {};

        citations = { ...existingCitations };
        for (const key of Object.keys(newYamlVars)) {
          const isChanged = isNewArtifact || oldYamlVars[key] !== newYamlVars[key];
          if (isChanged) {
            citations[key] = {
              variable_key: key,
              message_index: messageIndex ?? (conversation.messages.length - 1),
              thinking_excerpt: (thinkingText || '').slice(0, 2000),
              chat_excerpt: (chatText || '').replace(/<commercial_offer[\s\S]*?<\/commercial_offer>/g, '').trim().slice(0, 500),
              timestamp: nowISO,
              version: newVersion,
            };
          }
        }
        // Remove citations for variables that no longer exist in YAML
        for (const key of Object.keys(citations)) {
          if (!(key in newYamlVars)) delete citations[key];
        }
        console.log('[Citations] Variables cited:', Object.keys(citations).length, 'of', Object.keys(newYamlVars).length);
      } catch (citationErr) {
        console.warn('[Citations] Failed to build citations (non-fatal):', citationErr);
        citations = currentArtifact?.variable_citations || {};
      }

      if (isNewArtifact) {
        // Create new artifact
        const generatedId = `offer_${crypto.randomUUID().split('-')[0]}`;
        console.log('[Artifact] Creating NEW artifact with ID:', generatedId);

        newArtifact = {
          id: generatedId,
          type: 'commercial_offer',
          title: 'Komercinis pasiūlymas',
          content: trimmedContent,
          version: 1,
          created_at: nowISO,
          updated_at: nowISO,
          diff_history: [],
          variable_citations: citations
        };
      } else {
        // Update existing artifact
        console.log('[Artifact] UPDATING existing artifact:', currentArtifact.id);

        // Validate artifact_id matches (if provided and not "new")
        if (artifactIdFromAI && artifactIdFromAI !== currentArtifact.id) {
          console.warn(`[Artifact] Warning: AI provided artifact_id "${artifactIdFromAI}" doesn't match current "${currentArtifact.id}". Using current.`);
        }

        const diff = calculateDiff(currentArtifact.content, trimmedContent);
        newArtifact = {
          ...currentArtifact,
          content: trimmedContent,
          version: newVersion,
          updated_at: nowISO,
          diff_history: [...currentArtifact.diff_history, {
            version: newVersion,
            timestamp: nowISO,
            changes: diff
          }],
          variable_citations: citations
        };
      }

      console.log('[Artifact] Saving artifact to database...');
      await updateConversationArtifact(conversation.id, newArtifact);

      // Auto-rename conversation with composite code when artifact is first created
      if (isNewArtifact && conversation.title === 'Naujas pokalbis') {
        const _now = new Date();
        const _yy = String(_now.getFullYear()).slice(-2);
        const _mm = String(_now.getMonth() + 1).padStart(2, '0');
        const _dd = String(_now.getDate()).padStart(2, '0');
        const _compositeTitle = `U${selectedManager?.kodas || ''}${selectedEconomist?.kodas || ''}${user.kodas || ''}${_yy}/${_mm}/${_dd}`;
        await renameSDKConversation(conversation.id, _compositeTitle);
        conversation = { ...conversation, title: _compositeTitle };
        setConversations(prev => prev.map(c => c.id === conversation.id ? { ...c, title: _compositeTitle } : c));
      }

      setCurrentConversation({ ...conversation, artifact: newArtifact });
      setShowArtifact(true);
      // Keep the currently linked DOCX ID. YAML save flow below will replace the
      // existing Directus file (no orphan file clutter).
      localStorage.removeItem('doc_edit_' + conversation.id);
      console.log('[Artifact] Successfully saved. Version:', newArtifact.version);
      addNotification('success', 'Pasiūlymas sugeneruotas', `Komercinis pasiūlymas v${newArtifact.version} išsaugotas.`);

      // Auto-generate technological description from the new artifact's components_bulletlist
      const yamlForTechDesc = parseYAMLContent(trimmedContent);
      const bulletlist = yamlForTechDesc['components_bulletlist'] || '';
      if (bulletlist.trim()) {
        // Fire-and-forget — runs in background, saves result automatically
        autoGenerateTechDescription(bulletlist, conversation.id);
      }

      // Auto-create or update standartiniai_projektai record and replace linked DOCX
      // so each YAML save keeps a single up-to-date Directus file.
      try {
        // IMPORTANT: use the freshly parsed artifact content, not currentConversation state,
        // because state updates are async and may still hold the previous artifact here.
        const vars = mergeAllVariables(trimmedContent);
        const projektoKodas = vars['code_yy/mm/dd'] || '';
        const hnv = vars['economy_HNV'] || '';
        let linkedStandartiniaiId: number | null = standartiniaiRecordId;

        if (isNewArtifact) {
          const created = await createStandartinisProjektas({
            conversation_id: conversation.id,
            yaml_content: trimmedContent,
            projekto_kodas: projektoKodas,
            hnv: hnv,
          }, { userId: user.id, userEmail: user.email });
          linkedStandartiniaiId = created.id;
          setStandartiniaiRecordId(created.id);
          console.log('[Standartiniai] Auto-created record:', created.id);
        } else if (linkedStandartiniaiId) {
          await updateStandartinisProjektas(linkedStandartiniaiId, {
            yaml_content: trimmedContent,
            projekto_kodas: projektoKodas,
            hnv: hnv,
          }, { userId: user.id, userEmail: user.email });
          console.log('[Standartiniai] Updated record after AI edit:', linkedStandartiniaiId);
        }

        if (linkedStandartiniaiId && globalDocxFileId) {
          const filename = `${(projektoKodas || 'komercinis-pasiulymas').replace(/\//g, '-')}.docx`;
          const docxBlob = await buildDocxBlob(vars);
          const newFileId = await uploadDocxBlobToDirectus(docxBlob, filename, savedDocxFileId || null);
          await updateStandartinisProjektas(linkedStandartiniaiId, {
            document: newFileId,
          }, { userId: user.id, userEmail: user.email });
          setSavedDocxFileId(newFileId);
        }
      } catch (spErr) {
        console.warn('[Standartiniai] Failed to sync record (non-fatal):', spErr);
        await appLogger.logError({
          action: 'sdk_standartiniai_sync_failed',
          error: spErr as any,
          userId: user.id,
          userEmail: user.email,
          metadata: { conversation_id: conversation.id, standartiniai_record_id: standartiniaiRecordId }
        });
      }
    } catch (err) {
      console.error('Error handling artifact:', err);
      await appLogger.logError({
        action: 'sdk_artifact_generation_failed',
        error: err as any,
        userId: user.id,
        userEmail: user.email,
        metadata: { conversation_id: conversation.id }
      });
      setShowArtifact(false); // Reset so floating buttons become visible again
      addErrorNotification('Klaida', err, 'Nepavyko išsaugoti komercinio pasiūlymo');
    }
  };

  const parseYAMLContent = (yamlContent: string): Record<string, any> => {
    const lines = yamlContent.split('\n');
    const parsed: Record<string, any> = {};
    let currentKey: string | null = null;
    let multilineValue: string[] = [];

    const flushMultiline = () => {
      if (currentKey) {
        parsed[currentKey] = multilineValue.join('\n').trim();
        currentKey = null;
        multilineValue = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // If we're collecting a multi-line block, indented lines belong to it
      if (currentKey && (line.startsWith('  ') || line.startsWith('\t') || trimmed === '')) {
        multilineValue.push(trimmed);
        continue;
      }

      // Non-indented line while collecting → flush previous block
      if (currentKey) flushMultiline();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const rawValue = trimmed.substring(colonIndex + 1).trim();

        if (rawValue === '|' || rawValue === '>' || rawValue === '') {
          // Start of a multi-line block scalar (|, >) or bare key with indented lines
          currentKey = key;
          multilineValue = [];
        } else {
          // Simple key: value
          parsed[key] = rawValue.replace(/^["']|["']$/g, '');
        }
      }
    }

    // Flush any trailing multi-line block
    flushMultiline();

    return parsed;
  };

  /**
   * Replace a single key's value in a YAML string without affecting other keys.
   * Handles both simple (key: value) and block scalar (key: |\n  line1\n  line2) formats.
   */
  const replaceYAMLValue = (yamlContent: string, targetKey: string, newValue: string): string => {
    const lines = yamlContent.split('\n');
    const result: string[] = [];
    let i = 0;
    let found = false;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if this line starts with our target key
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0 && trimmed.substring(0, colonIndex).trim() === targetKey) {
        found = true;
        const rawValue = trimmed.substring(colonIndex + 1).trim();

        if (rawValue === '|' || rawValue === '>') {
          // Block scalar — skip all indented continuation lines
          i++;
          while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
            i++;
          }
        } else {
          // Simple key: value — skip this line
          i++;
        }

        // Write the new value
        if (newValue.includes('\n')) {
          result.push(`${targetKey}: |`);
          for (const valueLine of newValue.split('\n')) {
            result.push(`  ${valueLine}`);
          }
        } else {
          result.push(`${targetKey}: ${newValue}`);
        }
        continue;
      }

      result.push(line);
      i++;
    }

    if (!found) {
      console.warn(`[replaceYAMLValue] Key "${targetKey}" not found in YAML content`);
    }

    return result.join('\n');
  };

  /**
   * Merge all variable sources into a single Record for the document preview.
   * Sources: YAML artifact content + offer parameters + team info.
   */
  const mergeAllVariables = (yamlContentOverride?: string): Record<string, string> => {
    const yamlSource = yamlContentOverride ?? currentConversation?.artifact?.content ?? '';
    const yamlVars: Record<string, string> = yamlSource ? parseYAMLContent(yamlSource) : {};
    const safeOfferParameters: Record<string, string> = Object.fromEntries(
      Object.entries(offerParameters).filter(([, v]) => v !== undefined && v !== null)
    ) as Record<string, string>;

    // Lithuanian date: "2026 m. vasario mėn. 12 d."
    const LITHUANIAN_MONTHS_GENITIVE = [
      'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
      'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'
    ];
    const now = new Date();
    const ltDate = `${now.getFullYear()} m. ${LITHUANIAN_MONTHS_GENITIVE[now.getMonth()]} mėn. ${now.getDate()} d.`;

    // Composite code: U + manager_kodas + economist_kodas + technologist_kodas + yy/mm/dd
    const mgrCode = selectedManager?.kodas || '';
    const econCode = selectedEconomist?.kodas || '';
    const techCode = user.kodas || '';
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const compositeCode = `U${mgrCode}${econCode}${techCode}${yy}/${mm}/${dd}`;

    return {
      ...yamlVars,
      ...safeOfferParameters,
      'date_yyyy-month_men.-dd': ltDate,
      'code_yy/mm/dd': compositeCode,
      technologist: user.full_name || user.email,
      technologist_phone: user.phone || '',
      technologist_email: user.email,
      ekonomistas: selectedEconomist?.full_name || '',
      vadybininkas: selectedManager?.full_name || '',
      project_name: currentConversation?.title || '',
    };
  };

  /**
   * Categorize a variable key to determine which edit control to show.
   * - 'offer'            → offer parameter (BDS, SM, N, P, object, cleaned water, etc.)
   * - 'economist'        → economist dropdown
   * - 'manager'          → manager dropdown
   * - 'team'             → auto-filled from logged-in user (read-only)
   * - 'auto'             → auto-computed (date, code — read-only)
   * - 'tech_description' → technological description with "Generuoti" API call
   * - 'yaml'             → AI-generated, editable via chat prompt
   */
  const categorizeVariable = (key: string): 'offer' | 'economist' | 'manager' | 'team' | 'auto' | 'tech_description' | 'yaml' => {
    if (OFFER_PARAMETER_DEFINITIONS.some((p) => p.key === key)) return 'offer';
    if (key === 'ekonomistas') return 'economist';
    if (key === 'vadybininkas') return 'manager';
    if (['technologist', 'technologist_phone', 'technologist_email'].includes(key)) return 'team';
    if (['date_yyyy-month_men.-dd', 'code_yy/mm/dd'].includes(key)) return 'auto';
    if (key === 'technological_description') return 'tech_description';
    return 'yaml';
  };

  /** Handle a variable click from the interactive preview (null = close). */
  const handleVariableClick = (info: VariableClickInfo | null) => {
    if (!info) {
      setEditingVariable(null);
      return;
    }
    // Reset AI edit state when switching variables
    setAiVarEditMode(false);
    setAiVarEditInstruction('');
    setAiVarEditResult(null);
    setAiVarEditError(null);
    setAiVarEditLoading(false);

    const merged = mergeAllVariables();
    setEditingVariable({
      key: info.key,
      filled: info.filled,
      x: info.x,
      y: info.y,
      editValue: merged[info.key] || '',
    });
  };

  /** Open the visual global template editor. */
  const handleOpenTemplateEditor = () => {
    setShowTemplateEditor(true);
    setDocxViewerUrl(null);
    setDocxPreviewLoading(false);
    setDocxPreviewError(null);

    setTplEditMode(false);
    setTplSelectedImage(null);
    setTplCropMode(false);
    // Fetch version history in the background

  };

  // ── Save document to standartiniai_projektai ──

  // Tracks the linked standartiniai_projektai record id for the current conversation.
  // null = not yet created; number = existing record to update.
  const [standartiniaiRecordId, setStandartiniaiRecordId] = useState<number | null>(null);
  // Directus file ID of the saved .docx — enables download button
  const [savedDocxFileId, setSavedDocxFileId] = useState<string | null>(null);
  const [docxPreviewTick, setDocxPreviewTick] = useState(0);
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const [isSavingToStandartiniai, setIsSavingToStandartiniai] = useState(false);
  const [isRefreshingTemplate, setIsRefreshingTemplate] = useState(false);
  // Auto-save: generate and persist DOCX when artifact is ready and no saved file exists yet
  const [autoSaving, setAutoSaving] = useState(false);
  const lastAutoSyncedArtifactSignatureRef = useRef<string>('');
  useEffect(() => {
    if (savedDocxFileId) setDocxPreviewTick(prev => prev + 1);
  }, [savedDocxFileId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!globalDocxFileId) {
        if (!cancelled) setTemplateVariables([]);
        return;
      }
      try {
        const vars = await extractDocxTemplateVariables();
        if (!cancelled) setTemplateVariables(vars);
      } catch {
        if (!cancelled) setTemplateVariables([]);
      }
    })();
    return () => { cancelled = true; };
  }, [globalDocxFileId]);

  useEffect(() => {
    if (!globalDocxFileId || autoSaving) return;
    if (!currentConversation?.artifact || !currentConversation?.id) return;
    const artifactContent = currentConversation.artifact.content || '';
    const signature = `${currentConversation.id}::${artifactContent}`;
    if (!artifactContent.trim()) return;
    if (lastAutoSyncedArtifactSignatureRef.current === signature) return;
    let cancelled = false;
    (async () => {
      try {
        setAutoSaving(true);
        const vars = mergeAllVariables();
        const docxBlob = await buildDocxBlob(vars);
        if (cancelled) return;
        const projektoKodas = vars['code_yy/mm/dd'] || 'komercinis-pasiulymas';
        const filename = `${projektoKodas.replace(/\//g, '-')}.docx`;
        const newFileId = await uploadDocxBlobToDirectus(docxBlob, filename, savedDocxFileId || null);
        if (cancelled) return;
        const yamlContent = artifactContent;
        const hnv = vars['economy_HNV'] || '';
        const requestedInputs = buildRequestedInputsSnapshot();
        if (standartiniaiRecordId) {
          await updateStandartinisProjektas(standartiniaiRecordId, {
            yaml_content: yamlContent, projekto_kodas: projektoKodas, hnv, document: newFileId,
            requested_inputs: requestedInputs,
            template_file_id: globalDocxFileId || null,
          }, { userId: user.id, userEmail: user.email });
        } else {
          const created = await createStandartinisProjektas({
            conversation_id: currentConversation.id,
            yaml_content: yamlContent, projekto_kodas: projektoKodas, hnv, document: newFileId,
            requested_inputs: requestedInputs,
            template_file_id: globalDocxFileId || null,
          }, { userId: user.id, userEmail: user.email });
          if (!cancelled) setStandartiniaiRecordId(created.id);
        }
        if (!cancelled) {
          setSavedDocxFileId(newFileId);
          lastAutoSyncedArtifactSignatureRef.current = signature;
        }
      } catch (err) {
        console.error('Auto-save DOCX error:', err);
        await appLogger.logError({
          action: 'sdk_docx_autosave_failed',
          error: err as any,
          userId: user.id,
          userEmail: user.email,
          metadata: { conversation_id: currentConversation?.id, standartiniai_record_id: standartiniaiRecordId }
        });
      } finally {
        if (!cancelled) setAutoSaving(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDocxFileId, currentConversation?.id, currentConversation?.artifact?.content, savedDocxFileId]);

  const yamlVarsForUi = useMemo<Record<string, string>>(
    () => (currentConversation?.artifact ? parseYAMLContent(currentConversation.artifact.content) : {}),
    [currentConversation?.artifact?.content]
  );

  const unresolvedTemplateVariables = useMemo<string[]>(() => {
    if (!templateVariables.length) return [];
    const merged = mergeAllVariables();
    const objectAndWaterKeys = new Set(
      OFFER_PARAMETER_DEFINITIONS
        .filter((p) => p.group === 'object')
        .map((p) => p.key)
    );
    return templateVariables.filter((key) => {
      if (objectAndWaterKeys.has(key)) return false;
      if (skippedTemplateRows[key]) return false;
      const override = templateRowOverrides[key];
      const value = override !== undefined ? override : merged[key];
      if (value === undefined || value === null) return true;
      const normalized = String(value).trim();
      return normalized === '' || normalized.toLowerCase() === 'undefined';
    });
  }, [
    templateVariables,
    currentConversation?.artifact?.content,
    offerParameters,
    selectedManager?.id,
    selectedEconomist?.id,
    user.full_name,
    user.email,
    user.phone,
    user.kodas,
    currentConversation?.title,
    skippedTemplateRows,
    templateRowOverrides,
  ]);

  const templateVariablePreviewRows = useMemo(() => {
    if (!templateVariables.length) return [];
    const merged = mergeAllVariables();
    const objectAndWaterKeys = new Set(
      OFFER_PARAMETER_DEFINITIONS
        .filter((p) => p.group === 'object')
        .map((p) => p.key)
    );
    return templateVariables.map((key) => {
      if (objectAndWaterKeys.has(key)) return null;
      const raw = merged[key];
      const override = templateRowOverrides[key];
      const value = override !== undefined
        ? override
        : (raw === undefined || raw === null ? '' : String(raw));
      return { key, value };
    }).filter((row): row is { key: string; value: string } => row !== null);
  }, [
    templateVariables,
    currentConversation?.artifact?.content,
    offerParameters,
    selectedManager?.id,
    selectedEconomist?.id,
    user.full_name,
    user.email,
    user.phone,
    user.kodas,
    currentConversation?.title,
    templateRowOverrides,
  ]);

  const visibleTemplateVariableRows = useMemo(
    () => showOnlyMissingTemplateRows
      ? templateVariablePreviewRows.filter((row) => !row.value && !skippedTemplateRows[row.key])
      : templateVariablePreviewRows.filter((row) => !skippedTemplateRows[row.key]),
    [templateVariablePreviewRows, showOnlyMissingTemplateRows, skippedTemplateRows]
  );
  const missingTemplateRows = useMemo(
    () => visibleTemplateVariableRows.filter((row) => !row.value),
    [visibleTemplateVariableRows]
  );
  const filledTemplateRows = useMemo(
    () => visibleTemplateVariableRows.filter((row) => !!row.value),
    [visibleTemplateVariableRows]
  );
  const skippedTemplateVariableRows = useMemo(
    () => templateVariablePreviewRows.filter((row) => skippedTemplateRows[row.key]),
    [templateVariablePreviewRows, skippedTemplateRows]
  );
  const templateCompletion = useMemo(() => {
    const total = templateVariablePreviewRows.length || 0;
    const missing = templateVariablePreviewRows.filter((row) => !row.value && !skippedTemplateRows[row.key]).length;
    const filled = Math.max(total - missing, 0);
    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { total, missing, filled, percentage };
  }, [templateVariablePreviewRows, skippedTemplateRows]);

  const handleSaveToStandartiniai = async () => {
    if (!currentConversation?.artifact) return;

    try {
      setIsSavingToStandartiniai(true);

      // 1. Generate the .docx blob from the template + current variables
      const vars = mergeAllVariables();
      const docxBlob = await buildDocxBlob(vars);

      // 2. Upload the .docx blob to Directus (delete previous file if updating)
      const previousFileId = savedDocxFileId || null;
      const projektoKodas = vars['code_yy/mm/dd'] || 'komercinis-pasiulymas';
      const filename = `${projektoKodas.replace(/\//g, '-')}.docx`;
      const newFileId = await uploadDocxBlobToDirectus(docxBlob, filename, previousFileId);

      // 3. Save record in standartiniai_projektai with the Directus file ID
      const yamlContent = currentConversation.artifact.content || '';
      const hnv = vars['economy_HNV'] || '';
      const requestedInputs = buildRequestedInputsSnapshot();

      if (standartiniaiRecordId) {
        await updateStandartinisProjektas(standartiniaiRecordId, {
          yaml_content: yamlContent,
          projekto_kodas: projektoKodas,
          hnv: hnv,
          document: newFileId,
          requested_inputs: requestedInputs,
          template_file_id: globalDocxFileId || null,
        }, { userId: user.id, userEmail: user.email });
      } else {
        const created = await createStandartinisProjektas({
          conversation_id: currentConversation.id,
          yaml_content: yamlContent,
          projekto_kodas: projektoKodas,
          hnv: hnv,
          document: newFileId,
          requested_inputs: requestedInputs,
          template_file_id: globalDocxFileId || null,
        }, { userId: user.id, userEmail: user.email });
        setStandartiniaiRecordId(created.id);
      }

      setSavedDocxFileId(newFileId);
      addNotification('success', 'Išsaugota', 'DOCX dokumentas išsaugotas Directus serveryje.');
    } catch (err) {
      console.error('Error saving to standartiniai_projektai:', err);
      addNotification('error', 'Klaida', formatToastMessage('Nepavyko išsaugoti dokumento', err));
    } finally {
      setIsSavingToStandartiniai(false);
    }
  };

  const buildRequestedInputsSnapshot = (): Record<string, string> => {
    const entries = Object.entries(offerParameters || {}).map(([key, value]) => [key, String(value ?? '')]);
    const snapshot = Object.fromEntries(entries) as Record<string, string>;
    if (selectedManager?.full_name) snapshot.requested_manager = selectedManager.full_name;
    if (selectedEconomist?.full_name) snapshot.requested_economist = selectedEconomist.full_name;
    return snapshot;
  };

  const handleRefreshTemplateFromCurrentYaml = async () => {
    if (!currentConversation?.artifact) return;
    if (!globalDocxFileId) {
      addNotification('error', 'DOCX šablonas', 'Nerastas aktyvus Word šablonas. Pirmiausia įkelkite .docx failą.');
      return;
    }

    try {
      setIsRefreshingTemplate(true);

      const merged = mergeAllVariables();
      const missingKeys = templateVariables.filter((key) => {
        const value = merged[key];
        return value === undefined || value === null || String(value).trim() === '';
      });

      if (missingKeys.length > 0) {
        addNotification(
          'info',
          'Šablono suderinamumas',
          `Šis pokalbis turi duomenų iš senesnio šablono. Trūksta ${missingKeys.length} kintamųjų naujam Word šablonui. Peržiūrėkite arba atnaujinkite duomenis prieš generuojant dokumentą.`
        );
        return;
      }

      const docxBlob = await buildDocxBlob(merged);
      const previousFileId = savedDocxFileId || null;
      const projektoKodas = merged['code_yy/mm/dd'] || 'komercinis-pasiulymas';
      const filename = `${projektoKodas.replace(/\//g, '-')}.docx`;
      const newFileId = await uploadDocxBlobToDirectus(docxBlob, filename, previousFileId);
      const yamlContent = currentConversation.artifact.content || '';
      const hnv = merged['economy_HNV'] || '';
      const requestedInputs = buildRequestedInputsSnapshot();

      if (standartiniaiRecordId) {
        await updateStandartinisProjektas(standartiniaiRecordId, {
          yaml_content: yamlContent,
          projekto_kodas: projektoKodas,
          hnv,
          document: newFileId,
          requested_inputs: requestedInputs,
          template_file_id: globalDocxFileId,
        }, { userId: user.id, userEmail: user.email });
      } else {
        const created = await createStandartinisProjektas({
          conversation_id: currentConversation.id,
          yaml_content: yamlContent,
          projekto_kodas: projektoKodas,
          hnv,
          document: newFileId,
          requested_inputs: requestedInputs,
          template_file_id: globalDocxFileId,
        }, { userId: user.id, userEmail: user.email });
        setStandartiniaiRecordId(created.id);
      }

      setSavedDocxFileId(newFileId);
      addNotification('success', 'Atnaujinti šabloną', 'Esamas YAML sėkmingai perrenderintas su naujausiu Word šablonu.');
    } catch (err) {
      console.error('Error refreshing DOCX with latest template:', err);
      addNotification('error', 'Klaida', formatToastMessage('Nepavyko atnaujinti dokumento pagal naują šabloną', err));
    } finally {
      setIsRefreshingTemplate(false);
    }
  };

  // ── Template editor: image editing helpers ──

  const MAX_TPL_IMG_WIDTH = 698; // A4 content area: 523.2pt × 96/72 = 698px

  const tplSelectImage = (img: HTMLImageElement) => {
    const doc = templateEditorIframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
    img.classList.add('img-selected');

    const currentPx = img.getBoundingClientRect().width;
    const pct = img.naturalWidth > 0 ? Math.round((currentPx / img.naturalWidth) * 100) : 100;

    const clipPath = img.style.clipPath || img.style.getPropertyValue('clip-path') || '';
    const insetMatch = clipPath.match(/inset\((\d+)%\s+(\d+)%\s+(\d+)%\s+(\d+)%\)/);
    if (insetMatch) {
      setTplCropValues({ top: +insetMatch[1], right: +insetMatch[2], bottom: +insetMatch[3], left: +insetMatch[4] });
    } else {
      setTplCropValues({ top: 0, right: 0, bottom: 0, left: 0 });
    }

    setTplSelectedImage({
      imgEl: img,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      originalWidth: img.style.width || `${img.naturalWidth}px`,
      originalHeight: img.style.height || `${img.naturalHeight}px`,
    });
    setTplImgWidth(pct);
    setTplCropMode(false);
  };

  const tplDeselectImage = () => {
    const doc = templateEditorIframeRef.current?.contentDocument;
    if (doc) doc.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
    setTplSelectedImage(null);
    setTplCropMode(false);
  };

  const tplResizeIframe = () => {
    const doc = templateEditorIframeRef.current?.contentDocument;
    if (doc?.body && templateEditorIframeRef.current) {
      templateEditorIframeRef.current.style.height = doc.body.scrollHeight + 'px';
    }
  };

  const handleTplReplaceImage = () => templateEditorFileInputRef.current?.click();

  const handleTplFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tplSelectedImage) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl || !tplSelectedImage) return;
      const img = tplSelectedImage.imgEl;
      img.src = dataUrl;
      img.onload = () => {
        const newW = Math.min(img.naturalWidth, MAX_TPL_IMG_WIDTH);
        const ratio = newW / img.naturalWidth;
        img.style.width = `${newW}px`;
        img.style.height = `${Math.round(img.naturalHeight * ratio)}px`;
        img.style.clipPath = '';
        if (img.style.position === 'absolute') { img.style.position = ''; img.style.left = ''; img.style.top = ''; }
        tplResizeIframe();
        tplSelectImage(img);
      };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTplResizeImage = (widthPct: number) => {
    if (!tplSelectedImage) return;
    const img = tplSelectedImage.imgEl;
    const newW = Math.min(Math.round((img.naturalWidth * widthPct) / 100), MAX_TPL_IMG_WIDTH);
    const ratio = newW / img.naturalWidth;
    img.style.width = `${newW}px`;
    img.style.height = `${Math.round(img.naturalHeight * ratio)}px`;
    setTplImgWidth(widthPct);
    setTimeout(tplResizeIframe, 50);
  };

  const handleTplFitToColumn = () => {
    if (!tplSelectedImage) return;
    const img = tplSelectedImage.imgEl;
    img.style.width = '100%';
    img.style.height = 'auto';
    setTplImgWidth(Math.round((MAX_TPL_IMG_WIDTH / img.naturalWidth) * 100));
    setTimeout(tplResizeIframe, 50);
  };

  const handleTplResetImage = () => {
    if (!tplSelectedImage) return;
    const img = tplSelectedImage.imgEl;
    img.style.width = tplSelectedImage.originalWidth;
    img.style.height = tplSelectedImage.originalHeight;
    img.style.clipPath = '';
    setTplImgWidth(100);
    setTplCropValues({ top: 0, right: 0, bottom: 0, left: 0 });
    setTimeout(tplResizeIframe, 50);
  };

  const handleTplCropChange = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    if (!tplSelectedImage) return;
    const newCrop = { ...tplCropValues, [side]: value };
    setTplCropValues(newCrop);
    tplSelectedImage.imgEl.style.clipPath = `inset(${newCrop.top}% ${newCrop.right}% ${newCrop.bottom}% ${newCrop.left}%)`;
  };

  const handleTplToggleEditMode = () => {
    const next = !tplEditMode;
    setTplEditMode(next);
    const doc = templateEditorIframeRef.current?.contentDocument;
    if (doc?.body) {
      doc.body.contentEditable = next ? 'true' : 'false';
      if (next) {
        doc.body.classList.add('img-edit-mode');
      } else {
        doc.body.classList.remove('img-edit-mode');
        tplDeselectImage();
      }
    }
  };

  // Build Google Docs Viewer URL when switching to DOCX tab
  const [docxViewerUrl, setDocxViewerUrl] = useState<string | null>(null);
  useEffect(() => {
    if (tplEditorTab === 'docx' && showTemplateEditor) {
      setDocxPreviewLoading(true);
      setDocxPreviewError(null);
      getDocxTemplateFileId().then(fileId => {
        if (!fileId) {
          setDocxPreviewError('DOCX šablonas dar neįkeltas. Įkelkite .docx failą naudodami mygtuką viršuje.');
          setDocxPreviewLoading(false);
          return;
        }
        const assetUrl = getDocxTemplateUrl(fileId);
        setDocxViewerUrl(`https://docs.google.com/gview?url=${encodeURIComponent(assetUrl)}&embedded=true`);
      });
    } else if (!showTemplateEditor) {
      setDocxPreviewLoading(false);
      setDocxPreviewError(null);
      setDocxViewerUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplEditorTab, showTemplateEditor, hasDocxTemplate]);

  /** Save the current editing variable value — surgical replacement for YAML keys. */
  const handleVariableSave = async (key: string, value: string) => {
    const category = categorizeVariable(key);

    if (category === 'offer') {
      if (currentConversation) {
        updateOfferParameter(currentConversation.id, key, value);
      }
    } else if (category === 'economist') {
      const match = economists.find((e) => e.full_name === value);
      if (match) setSelectedEconomist(match);
    } else if (category === 'manager') {
      const match = managers.find((m) => m.full_name === value);
      if (match) setSelectedManager(match);
    } else if (category === 'tech_description') {
      // Save technological description to offer parameters (persisted per conversation)
      if (currentConversation) {
        updateOfferParameter(currentConversation.id, key, value);
      }
    } else if (category === 'yaml') {
      // Surgical replacement: directly modify YAML without AI round-trip
      if (currentConversation?.artifact) {
        try {
          const currentArtifact = currentConversation.artifact;
          const updatedContent = replaceYAMLValue(currentArtifact.content, key, value);
          const diff = calculateDiff(currentArtifact.content, updatedContent);
          // Clear citation for manually-edited variable
          const updatedCitations = { ...(currentArtifact.variable_citations || {}) };
          delete updatedCitations[key];
          const newArtifact: CommercialOfferArtifact = {
            ...currentArtifact,
            content: updatedContent,
            version: currentArtifact.version + 1,
            updated_at: new Date().toISOString(),
            diff_history: [...currentArtifact.diff_history, {
              version: currentArtifact.version + 1,
              timestamp: new Date().toISOString(),
              changes: diff
            }],
            variable_citations: updatedCitations
          };
          await updateConversationArtifact(currentConversation.id, newArtifact);
          setCurrentConversation({ ...currentConversation, artifact: newArtifact });

          // Keep standartiniai_projektai + DOCX file in sync with manual YAML edits.
          const vars = mergeAllVariables(updatedContent);
          const projektoKodas = vars['code_yy/mm/dd'] || '';
          const hnv = vars['economy_HNV'] || '';
          let linkedStandartiniaiId: number | null = standartiniaiRecordId;

          if (linkedStandartiniaiId) {
            await updateStandartinisProjektas(linkedStandartiniaiId, {
              yaml_content: updatedContent,
              projekto_kodas: projektoKodas,
              hnv,
            }, { userId: user.id, userEmail: user.email });
          } else {
            const created = await createStandartinisProjektas({
              conversation_id: currentConversation.id,
              yaml_content: updatedContent,
              projekto_kodas: projektoKodas,
              hnv,
            }, { userId: user.id, userEmail: user.email });
            linkedStandartiniaiId = created.id;
            setStandartiniaiRecordId(created.id);
          }

          if (linkedStandartiniaiId && globalDocxFileId) {
            const filename = `${(projektoKodas || 'komercinis-pasiulymas').replace(/\//g, '-')}.docx`;
            const docxBlob = await buildDocxBlob(vars);
            const newFileId = await uploadDocxBlobToDirectus(docxBlob, filename, savedDocxFileId || null);
            await updateStandartinisProjektas(linkedStandartiniaiId, { document: newFileId }, { userId: user.id, userEmail: user.email });
            setSavedDocxFileId(newFileId);
          }

          addNotification('success', 'Kintamasis atnaujintas', `„${key}" reikšmė pakeista.`);
        } catch (err) {
          console.error('[Surgical Edit] Error:', err);
          addNotification('error', 'Klaida', 'Nepavyko atnaujinti kintamojo.');
        }
      }
    }

    setEditingVariable(null);
    documentPreviewRef.current?.clearActiveVariable();
  };

  const handleTemplateRowSave = async (key: string, fallbackValue: string) => {
    const draft = templateRowDrafts[key];
    const nextValue = (draft !== undefined ? draft : fallbackValue).trim();
    setTemplateRowOverrides((prev) => ({ ...prev, [key]: nextValue }));
    await handleVariableSave(key, nextValue);
    setEditingTemplateRows((prev) => ({ ...prev, [key]: false }));
    setTemplateRowDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** Auto-generate technological description after artifact creation — fire-and-forget. */
  const autoGenerateTechDescription = async (componentsList: string, conversationId: string) => {
    setTechDescLoading(true);
    try {
      if (!anthropicApiKey) throw new Error('API key not found');

      const promptVar = await getInstructionVariable('tech_description_prompt');
      if (!promptVar || !promptVar.content.trim()) {
        console.warn('[AutoTechDesc] No tech_description_prompt found in DB, skipping.');
        return;
      }

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: promptVar.content,
        messages: [{ role: 'user', content: componentsList }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      if (text) {
        // Auto-save to offerParameters
        const updated = { ...offerParameters, technological_description: text };
        persistOfferParameters(conversationId, updated);
        addNotification('success', 'Technologinis aprašymas', 'Automatiškai sugeneruotas ir išsaugotas.');
        console.log('[AutoTechDesc] Generated and saved successfully.');
      }
    } catch (err: any) {
      console.error('[AutoTechDesc] Failed:', err);
      addNotification('error', 'Technologinis aprašymas', 'Nepavyko automatiškai sugeneruoti.');
    } finally {
      setTechDescLoading(false);
    }
  };

  /** AI-assisted edit for a single YAML variable — dedicated API call, no full regeneration. */
  const handleAIVariableEdit = async () => {
    if (!editingVariable || !currentConversation?.artifact) return;

    setAiVarEditLoading(true);
    setAiVarEditResult(null);
    setAiVarEditError(null);

    try {
      if (!anthropicApiKey) throw new Error('API key not found');

      const yamlContent = currentConversation.artifact.content;
      const currentValue = editingVariable.editValue;
      const variableKey = editingVariable.key;
      const instruction = aiVarEditInstruction.trim();

      if (!instruction) {
        setAiVarEditError('Įveskite instrukciją AI.');
        setAiVarEditLoading(false);
        return;
      }

      // Fetch the variable edit prompt from instruction_variables table
      const promptVar = await getInstructionVariable('variable_edit_prompt');

      // Fallback system prompt if DB entry doesn't exist yet
      const systemPromptText = promptVar?.content?.trim()
        ? promptVar.content
        : `Tu esi Traidenis komercinio pasiūlymo redaktorius. Tau bus pateiktas YAML turinys su visais kintamaisiais, konkretus kintamojo pavadinimas, jo dabartinė reikšmė, ir vartotojo instrukcija.

Tavo užduotis: sugeneruoti NAUJĄ reikšmę TIK nurodytam kintamajam, atsižvelgiant į vartotojo instrukciją ir visą YAML kontekstą.

SVARBU:
- Grąžink TIK naują reikšmę, be jokių paaiškinimų, be YAML formatavimo, be kintamojo pavadinimo
- Jei reikšmė turi būti kelių eilučių (pvz. sąrašas su • ženkleliais), naudok naujas eilutes
- Nekeisk kitų kintamųjų - tik nurodytą
- Atsakyk lietuvių kalba, nebent instrukcija nurodo kitaip`;

      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        dangerouslyAllowBrowser: true
      });

      const userMessage = `YAML turinys:
\`\`\`
${yamlContent}
\`\`\`

Kintamasis: ${variableKey}
Dabartinė reikšmė: ${currentValue || '(tuščia)'}

Vartotojo instrukcija: ${instruction}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPromptText,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      setAiVarEditResult(text);
    } catch (err: any) {
      console.error('[AI Variable Edit] Failed:', err);
      setAiVarEditError(err.message || 'Nepavyko sugeneruoti');
    } finally {
      setAiVarEditLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex bg-base-100">
      {/* Reopen Button (when sidebar collapsed) - positioned next to main sidebar */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-4 z-50 p-2 rounded-r-lg transition-all duration-300 bg-base-100 border border-base-content/10 text-base-content/60 shadow-sm hover:bg-base-200"
          style={{
            left: mainSidebarCollapsed ? '64px' : '208px',
          }}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Secondary Sidebar - slides from main sidebar edge */}
      <div
        className="flex-shrink-0 border-r border-base-content/10 transition-all duration-300 flex flex-col bg-base-200/40"
        style={{
          width: sidebarCollapsed ? '0px' : '320px',
          overflow: sidebarCollapsed ? 'hidden' : 'visible',
          opacity: sidebarCollapsed ? 0 : 1
        }}
      >
        {/* Project Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <FileText className="w-5 h-5 flex-shrink-0 text-base-content/50" />
            <span className="font-semibold truncate text-base-content">
              Standartinis
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="btn btn-circle btn-text btn-xs text-base-content/40"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions Section */}
        <div
          onClick={handleOpenPromptModal}
          className="mx-3 mb-2 p-3 rounded-xl bg-base-100 border border-base-content/5 cursor-pointer hover:bg-base-content/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-base-content/40" />
            <span className="text-sm font-medium text-base-content">
              Instrukcijos
            </span>
          </div>
          <p className="text-xs text-base-content/40 mt-1 ml-6">
            Sistemos instrukcijos komerciniam pasiūlymui
          </p>
        </div>

        {/* Document Template Section */}
        <div
          onClick={handleOpenTemplateEditor}
          className="mx-3 mb-3 p-3 rounded-xl bg-base-100 border border-base-content/5 cursor-pointer hover:bg-base-content/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-base-content/40" />
            <span className="text-sm font-medium text-base-content">
              Komercinis
            </span>
          </div>
          <p className="text-xs text-base-content/40 mt-1 ml-6">
            Redaguokite komercinio dokumento šabloną
          </p>
        </div>

        {/* Conversations Section with Tabs */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="px-4 border-b border-base-content/10 relative">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarView('conversations')}
                className={`flex-1 px-3 py-3 text-sm font-medium transition-colors relative ${sidebarView === 'conversations' ? 'text-base-content' : 'text-base-content/40'}`}
              >
                Pokalbiai
              </button>
              <button
                onClick={() => setSidebarView('shared')}
                className={`flex-1 px-3 py-3 text-sm font-medium transition-colors relative ${sidebarView === 'shared' ? 'text-base-content' : 'text-base-content/40'}`}
              >
                Bendri
                {unreadSharedCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center" style={{ background: '#f97316', color: 'white' }}>
                    {unreadSharedCount}
                  </span>
                )}
              </button>
            </div>
            {/* Sliding underline indicator */}
            <div
              className="absolute bottom-0 h-0.5 bg-primary transition-all duration-300 ease-in-out"
              style={{
                width: '50%',
                left: sidebarView === 'conversations' ? '0%' : '50%'
              }}
            />
          </div>

          {/* New Conversation Button - Only show in conversations view */}
          {sidebarView === 'conversations' && (
            <div className="p-3">
              <button
                onClick={handleCreateConversation}
                disabled={creatingConversation}
                className="btn btn-soft btn-sm w-full"
              >
                <Plus className="w-4 h-4" />
                <span>Naujas pokalbis</span>
              </button>
            </div>
          )}

          {/* Conversations List */}
          {sidebarView === 'conversations' && (
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {loadingConversations ? (
                <div className="p-4 text-center">
                  <span className="loading loading-spinner loading-sm text-primary"></span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-base-content/50">Pokalbių nėra</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conv) => {
                    const isActive = currentConversation?.id === conv.id && !isReadOnly;
                    const isRenaming = renamingConvId === conv.id;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => !isRenaming && handleSelectOwnedConversation(conv.id)}
                        className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                          isActive
                            ? 'bg-base-100 border border-base-content/15 shadow-sm'
                            : 'hover:bg-base-content/5'
                        }`}
                      >
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmRename(conv.id);
                              if (e.key === 'Escape') setRenamingConvId(null);
                            }}
                            onBlur={() => handleConfirmRename(conv.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 text-sm bg-transparent border-b border-base-content/20 outline-none text-base-content py-0"
                          />
                        ) : (
                          <p className="flex-1 min-w-0 text-sm truncate text-base-content">{conv.title}</p>
                        )}
                        {/* Date - hidden on hover/active, replaced by actions */}
                        {!isActive && !isRenaming && (
                          <span className="text-[13px] font-normal whitespace-nowrap flex-shrink-0 group-hover:hidden" style={{ color: '#b0b0b0' }}>
                            {formatLtDate(conv.last_message_at)}
                          </span>
                        )}
                        {/* Action icons - visible on hover or when active */}
                        {!isRenaming && (
                          <div className="items-center gap-0.5 flex-shrink-0 hidden group-hover:flex">
                            <button
                              onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                              className="p-1 rounded transition-colors text-base-content/30 hover:text-primary hover:bg-primary/10"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                              className="p-1 rounded transition-colors text-base-content/30 hover:text-error hover:bg-error/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Shared Conversations List */}
          {sidebarView === 'shared' && (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {sharedConversations.length === 0 ? (
                <div className="p-4 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 text-base-content/20" />
                  <p className="text-sm text-base-content/50">Nėra bendrų pokalbių</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {sharedConversations.map((sharedConv) => {
                    const isActive = currentConversation?.id === sharedConv.conversation_id && isReadOnly;
                    return (
                      <div
                        key={sharedConv.id}
                        onClick={() => handleSelectSharedConversation(sharedConv)}
                        className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                          isActive
                            ? 'bg-base-100 border border-base-content/15 shadow-sm'
                            : 'hover:bg-base-content/5'
                        }`}
                      >
                        {!sharedConv.is_read && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate text-base-content">
                            {sharedConv.conversation?.title}: {sharedConv.shared_by_name || sharedConv.shared_by_email}
                          </p>
                        </div>
                        {!isActive && (
                          <span className="text-[13px] font-normal whitespace-nowrap flex-shrink-0 group-hover:hidden" style={{ color: '#b0b0b0' }}>
                            {formatLtDate(sharedConv.shared_at)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Floating Action Buttons - Hidden when artifact panel is open to avoid overlap */}
        {!showArtifact && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
            {/* Artifact Toggle Button - Left of Share when both visible */}
            {(currentConversation?.artifact || isStreamingArtifact) && (
              <button
                onClick={() => setShowArtifact(true)}
                className={`px-4 py-2 rounded-lg shadow-lg transition-all hover:shadow-xl border border-base-content/10 ${
                  isStreamingArtifact ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Komercinis
                    {isStreamingArtifact && <span className="ml-1">●</span>}
                  </span>
                </div>
              </button>
            )}

            {/* Share Button - Show when conversation exists and user is owner */}
            {currentConversation && !isReadOnly && (
              <div className="relative">
                <button
                  onClick={handleToggleShareDropdown}
                  className="px-4 py-2 rounded-lg shadow-lg transition-all hover:shadow-xl bg-base-100 text-base-content border border-base-content/10"
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Dalintis</span>
                  </div>
                </button>

                {/* Share Dropdown */}
                {showShareDropdown && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowShareDropdown(false)}
                    />

                    {/* Dropdown Content */}
                    <div className="absolute top-full right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 bg-base-100 border border-base-content/10">
                      {/* Header */}
                      <div className="px-4 py-3 border-b border-base-content/10">
                        <h3 className="text-sm font-semibold text-base-content">
                          Dalintis pokalbiu
                        </h3>
                        <p className="text-xs mt-1 text-base-content/50">
                          Pasirinkite vartotojus
                        </p>
                      </div>

                      {/* User List */}
                      <div className="max-h-64 overflow-y-auto p-2">
                        {shareableUsers.length === 0 ? (
                          <p className="text-xs text-center py-6" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>
                            Nėra vartotojų
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {shareableUsers.map((shareUser) => (
                              <label
                                key={shareUser.id}
                                className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-base-200"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedShareUsers.includes(shareUser.id)}
                                  onChange={() => toggleUserSelection(shareUser.id)}
                                  className="checkbox checkbox-primary checkbox-sm"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate text-base-content">
                                    {shareUser.full_name || shareUser.display_name || shareUser.email}
                                  </div>
                                </div>
                                {selectedShareUsers.includes(shareUser.id) && (
                                  <Check className="w-4 h-4 flex-shrink-0 text-primary" />
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="px-3 py-3 border-t border-base-content/10 flex items-center gap-2">
                        <button
                          onClick={() => setShowShareDropdown(false)}
                          className="btn btn-soft btn-sm flex-1"
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={handleShareConversation}
                          disabled={selectedShareUsers.length === 0 || sharingConversation}
                          className="btn btn-primary btn-sm flex-1"
                        >
                          {sharingConversation ? (
                            <span className="flex items-center justify-center gap-1">
                              <span className="loading loading-spinner loading-xs"></span>
                              Dalinasi...
                            </span>
                          ) : (
                            `Dalintis (${selectedShareUsers.length})`
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6 bg-base-100"
        >
          {!currentConversation || currentConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-xl font-medium text-base-content/70 mb-1">
                Pradėkite projektą
              </h1>
              <p className="text-sm text-base-content/30 mb-6">
                Kurkite standartinį projektą šitame puslapyje
              </p>
              <div className="flex gap-3">
                {['HNVN10', 'HNVN12'].map((system) => (
                  <button
                    key={system}
                    onClick={() => handleSend(`Sukomplektuokime naują pasiūlymą, bus reikalinga ${system} sistema`)}
                    className="px-4 py-2.5 rounded-2xl border border-base-content/10 bg-base-content/[0.06] text-sm text-base-content hover:bg-base-content/[0.1] transition-colors cursor-pointer"
                  >
                    {system}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {currentConversation.messages.map((message, index) => {
                // Skip silent messages (button clicks)
                if (message.isSilent) {
                  return null;
                }

                // Ensure content is always a string before rendering
                const contentString = typeof message.content === 'string'
                  ? message.content
                  : (Array.isArray(message.content)
                    ? message.content.map((block: any) =>
                        block.type === 'text' ? block.text : ''
                      ).join('\n\n')
                    : '[Content format error]');

                return (
                  <div key={`${message.timestamp}-${index}`} data-message-index={index}>
                    {message.role === 'user' ? (
                      // User message - outlined capsule on right
                      <div className="flex justify-end mb-4">
                        <div className="max-w-[80%] px-4 py-2.5 rounded-3xl text-base-content" style={{ background: '#f8f8f9', border: '1px solid #e5e5e6' }}>
                          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                            {renderUserMessageWithVariables(contentString)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Assistant message - plain text with reaction buttons
                      <div className="mb-6 group">
                        <MessageContent content={
                          contentString.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')
                        } />

                      {/* Interactive Buttons - hidden completely after selection */}
                      {message.buttons && message.buttons.length > 0 && message.selectedButtonId === undefined && (
                        <div className="mt-4">
                          {message.buttonsMessage && (
                            <p className="text-sm mb-2" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>
                              {message.buttonsMessage}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {message.buttons.map(button => (
                              <button
                                key={button.id}
                                onClick={() => handleButtonClick(button.id, button.value, index)}
                                className="px-4 py-2.5 rounded-3xl text-[15px] leading-relaxed transition-all text-base-content hover:bg-base-content/[0.1] cursor-pointer"
                                style={{
                                  background: '#f8f8f9',
                                  border: '1px solid #e5e5e6',
                                }}
                              >
                                {button.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reaction buttons */}
                      <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="btn btn-circle btn-text btn-xs text-base-content/40 hover:text-base-content/70"
                          title="Kopijuoti"
                          onClick={() => { navigator.clipboard.writeText(contentString); addNotification('info', 'Nukopijuota', 'Žinutės tekstas nukopijuotas.'); }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Thinking section - outside hover opacity div so it doesn't fade when expanded */}
                      {message.thinking && (
                        <details className="mt-1">
                          <summary className="text-xs cursor-pointer px-2 py-1 rounded-lg text-base-content/40 hover:bg-base-200 transition-colors inline-flex items-center gap-1">
                            Mąstymas
                          </summary>
                          <div className="mt-2 text-xs whitespace-pre-wrap px-4 py-3 rounded-lg text-base-content/50 bg-base-200/50 border border-base-content/10">
                            {message.thinking}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}

              {/* Streaming content */}
              {loading && streamingContent && (
                <div className="mb-8">
                  <MessageContent content={streamingContent.replace(/<commercial_offer(?:\s+artifact_id="[^"]*")?\s*>[\s\S]*?<\/commercial_offer>/g, '')} />
                </div>
              )}

              {/* Tool usage indicator */}
              {loading && isToolUse && (
                <div className="mb-4 flex items-center gap-2 ml-1 text-base-content/40">
                  <span className="text-sm">✦</span>
                  <span className="text-sm font-medium">
                    Vykdoma: {toolUseName}...
                  </span>
                </div>
              )}

              {/* Loader - single instance, toggles between animated/static */}
              {(loading || (currentConversation && currentConversation.messages.length > 0)) && (
                <div className="flex justify-start -ml-1">
                  <RoboticArmLoader isAnimated={loading} size={48} />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 left-1/2 transform -translate-x-1/2 p-3 rounded-full shadow-lg transition-all hover:shadow-xl z-40 bg-primary text-primary-content"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {/* Input Box or Read-Only info */}
        {isReadOnly && conversationDetails ? (
          /* Read-Only - no input, just subtle info */
          <div className="px-4 py-3 border-t border-base-content/5 bg-base-100">
            <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-base-content/30 text-sm">
              <Lock className="w-3.5 h-3.5" />
              <span>Tik skaitymo režimas</span>
              <span className="text-base-content/15">·</span>
              <span>Bendrino: {conversationDetails.shared_by.display_name || conversationDetails.shared_by.email}</span>
            </div>
          </div>
        ) : (
          /* Regular Input Box */
          <div className="px-4 py-4 pb-6 bg-base-100">
            <div className="max-w-3xl mx-auto">
              <div className="relative flex items-end gap-2 rounded-3xl border border-base-content/8 px-4 py-2 transition-all focus-within:border-base-content/15 focus-within:shadow-sm" style={{ background: '#f8f8f9' }}>
                <button
                  className="flex-shrink-0 p-1.5 mb-0.5 rounded-lg text-base-content/30 hover:text-base-content/60 transition-colors"
                  disabled={loading}
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Klauskite bet ko..."
                  rows={1}
                  className="flex-1 bg-transparent text-[15px] text-base-content placeholder:text-base-content/30 resize-none py-1.5 outline-none focus:outline-none focus:ring-0 focus:shadow-none border-none leading-relaxed"
                  disabled={loading || !systemPrompt}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || loading || !systemPrompt}
                  className={`flex-shrink-0 w-8 h-8 mb-0.5 flex items-center justify-center rounded-full transition-all disabled:cursor-not-allowed ${
                    inputValue.trim() && !loading
                      ? 'bg-base-content text-base-100 hover:opacity-80'
                      : 'bg-base-content/10 text-base-content/25'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Artifact Panel - Floating Design */}
      {((currentConversation?.artifact && showArtifact) || isStreamingArtifact) && (
        <div className="flex-1 min-w-0 flex-shrink-0" style={{ maxWidth: '50vw' }}>
          <div className="w-full flex flex-col h-screen bg-base-100">
            {/* Header — compact single row */}
            <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-3">
                {/* Tab switcher (Peržiūra first) */}
                {currentConversation?.artifact && !isStreamingArtifact ? (
                  <div className="flex rounded-lg overflow-hidden border border-base-content/10">
                    <button
                      onClick={() => setArtifactTab('preview')}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        artifactTab === 'preview' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/60'
                      }`}
                    >
                      Peržiūra
                    </button>
                    <button
                      onClick={() => setArtifactTab('data')}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        artifactTab === 'data' ? 'bg-base-content text-base-100' : 'text-base-content/40 hover:text-base-content/60'
                      }`}
                    >
                      Duomenys
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-base-content">
                    Komercinis pasiūlymas
                    {isStreamingArtifact && (
                      <span className="ml-2 text-primary">Generuojama...</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!isStreamingArtifact && currentConversation?.artifact && (
                  <>
                    <div className="relative">
                      <button
                        onClick={() => setShowDownloadMenu(prev => !prev)}
                        className="btn btn-circle btn-text btn-xs text-base-content/40 hover:text-base-content/70"
                        title="Atsisiųsti dokumentą"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {showDownloadMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 bg-base-100 border border-base-content/10 rounded-lg shadow-lg py-1 min-w-[180px]">
                            {savedDocxFileId ? (
                              <a
                                href={getDirectusFileUrl(savedDocxFileId)}
                                download
                                className="w-full text-left px-3 py-2 text-sm hover:bg-base-content/5 flex items-center gap-2"
                                onClick={() => setShowDownloadMenu(false)}
                              >
                                <FileText className="w-4 h-4 text-blue-500" />
                                Atsisiųsti .docx
                              </a>
                            ) : (
                              <span className="px-3 py-2 text-sm text-base-content/40 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Dokumentas generuojamas...
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {/* Doc edit mode removed — preview is now Google Docs Viewer (read-only) */}
                    <button
                      onClick={() => { navigator.clipboard.writeText(currentConversation.artifact!.content); addNotification('info', 'Nukopijuota', 'YAML turinys nukopijuotas į iškarpinę.'); }}
                      className="btn btn-circle btn-text btn-xs text-base-content/40 hover:text-base-content/70"
                      title="Kopijuoti YAML"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleSaveToStandartiniai}
                      disabled={isSavingToStandartiniai || isRefreshingTemplate}
                      className="btn btn-sm btn-primary gap-1.5 ml-1"
                      title="Išsaugoti DOCX į Directus šiam komerciniam projektui"
                    >
                      {isSavingToStandartiniai
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Save className="w-3.5 h-3.5" />}
                      Išsaugoti failą
                    </button>
                    <button
                      onClick={handleRefreshTemplateFromCurrentYaml}
                      disabled={!savedDocxFileId || isSavingToStandartiniai || isRefreshingTemplate}
                      className="btn btn-sm btn-outline gap-1.5 ml-1"
                      title={!savedDocxFileId
                        ? 'Pirmiausia išsaugokite failą'
                        : 'Pergeneruoti esamą YAML su naujausiu Word šablonu'}
                    >
                      {isRefreshingTemplate
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />}
                      Atnaujinti šabloną
                    </button>
                    {savedDocxFileId && (
                      <a
                        href={getDirectusFileUrl(savedDocxFileId)}
                        download
                        className="btn btn-sm btn-outline gap-1.5 ml-1"
                        title="Atsisiųsti DOCX iš Directus"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Atsisiųsti
                      </a>
                    )}
                  </>
                )}
                <button
                  onClick={() => setShowArtifact(false)}
                  className="btn btn-circle btn-text btn-xs text-base-content/40 hover:text-base-content/70"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Separator */}
            <div className="h-px bg-base-content/8" />

            {/* Content area — Preview (always mounted for iframe persistence) + Data */}
            <div className="flex-1 overflow-hidden min-h-0 relative flex flex-col" style={{ display: artifactTab === 'preview' && !isStreamingArtifact ? 'flex' : 'none' }}>
              {savedDocxFileId ? (
                <iframe
                  key={`${savedDocxFileId}-${docxPreviewTick}`}
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(`${getDirectusAssetUrl(savedDocxFileId)}&_pv=${docxPreviewTick}`)}&embedded=true`}
                  className="flex-1 w-full border-0"
                  title="DOCX peržiūra"
                />
              ) : autoSaving ? (
                <div className="flex-1 flex items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm text-base-content/50">Generuojamas dokumentas...</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center px-6">
                  <div>
                    <FileText className="w-10 h-10 mx-auto mb-3 text-base-content/20" />
                    <p className="text-sm font-medium text-base-content/60 mb-1">DOCX šablonas neįkeltas</p>
                    <p className="text-xs text-base-content/40">Įkelkite DOCX šabloną per šablono redaktorių</p>
                  </div>
                </div>
              )}

                {false && editingVariable && (() => {
                  const cat = categorizeVariable(editingVariable.key);
                  const paramDef = OFFER_PARAMETER_DEFINITIONS.find((p) => p.key === editingVariable.key);
                  const label = paramDef?.label || editingVariable.key;
                  const categoryLabel = cat === 'offer' ? 'Parametras' : cat === 'economist' ? 'Ekonomistas' : cat === 'manager' ? 'Vadybininkas' : cat === 'team' ? 'Komanda' : cat === 'auto' ? 'Automatinis' : cat === 'tech_description' ? 'Technologija' : 'AI kintamasis';
                  const categoryColor = cat === 'offer' ? '#8b5cf6' : cat === 'economist' ? '#2563eb' : cat === 'manager' ? '#2563eb' : cat === 'team' ? '#059669' : cat === 'auto' ? '#059669' : cat === 'tech_description' ? '#0891b2' : '#d97706';

                  return (
                    <>
                      {/* Invisible overlay to catch clicks outside the popup */}
                      <div
                        style={{ position: 'absolute', inset: 0, zIndex: 49 }}
                        onClick={() => {
                          setEditingVariable(null);
                          documentPreviewRef.current?.clearActiveVariable();
                        }}
                      />

                      {/* Popup card — smart positioning: flips above when overflowing */}
                      <div
                        ref={popupRef}
                        style={{
                          position: 'absolute',
                          left: Math.min(Math.max(editingVariable.x - 130, 8), 260),
                          top: popupPlacement === 'below'
                            ? editingVariable.y + 8
                            : editingVariable.y - 8,
                          transform: popupPlacement === 'above' ? 'translateY(-100%)' : undefined,
                          zIndex: 50,
                          width: '280px',
                          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.10)) drop-shadow(0 1px 3px rgba(0,0,0,0.06))',
                          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                        }}
                      >
                        {/* Pointer triangle — points toward the variable */}
                        {popupPlacement === 'below' && (
                          <div style={{
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent',
                            borderRight: '7px solid transparent',
                            borderBottom: '7px solid #ffffff',
                            marginLeft: Math.min(Math.max(editingVariable.x - Math.min(Math.max(editingVariable.x - 130, 8), 260) - 7, 16), 248) + 'px',
                          }} />
                        )}

                        <div style={{
                          background: '#ffffff',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}>
                          {/* Header — label as title, category as subtle tag */}
                          <div className="px-3.5 py-2.5" style={{ borderBottom: '1px solid #f0eeeb' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[14px] font-semibold truncate" style={{ color: '#1a1a1a', letterSpacing: '-0.01em' }}>{label}</div>
                                <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: categoryColor + '12', color: categoryColor }}>
                                  {categoryLabel}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setEditingVariable(null);
                                  documentPreviewRef.current?.clearActiveVariable();
                                }}
                                className="p-1 rounded-md flex-shrink-0 transition-colors mt-0.5"
                                style={{ color: '#c0bbb5' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = '#f3f2f0'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#c0bbb5'; e.currentTarget.style.background = 'transparent'; }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Body */}
                          <div className="px-3.5 py-3">
                            {cat === 'team' && (
                              <div>
                                <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Automatiškai užpildyta</span>
                                <div className="mt-1 text-[13px] font-medium" style={{ color: 'var(--color-base-content)' }}>{editingVariable.editValue || '—'}</div>
                              </div>
                            )}

                            {cat === 'auto' && (
                              <div>
                                <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Automatiškai sugeneruota</span>
                                <div className="mt-1 text-[13px] font-medium" style={{ color: 'var(--color-base-content)' }}>{editingVariable.editValue || '—'}</div>
                              </div>
                            )}

                            {cat === 'tech_description' && (
                              <div>
                                {techDescLoading ? (
                                  <div className="flex items-center justify-center gap-2 py-4">
                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#0891b2' }} />
                                    <span className="text-[12px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Generuojama automatiškai...</span>
                                  </div>
                                ) : editingVariable.editValue ? (
                                  <div>
                                    <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Automatiškai sugeneruota</span>
                                    <div className="mt-1 text-[12px] max-h-48 overflow-y-auto" style={{ color: '#3d3935', lineHeight: '1.6' }}>
                                      {editingVariable.editValue}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>
                                    Automatiškai sugeneruojama kai sukuriamas komercinis pasiūlymas
                                  </span>
                                )}
                              </div>
                            )}

                            {cat === 'economist' && (
                              <div className="flex flex-col gap-0.5">
                                {economists.length === 0 ? (
                                  <span className="text-[12px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Nėra ekonomistų</span>
                                ) : (
                                  economists.map((econ) => {
                                    const isSelected = selectedEconomist?.id === econ.id;
                                    return (
                                      <button
                                        key={econ.id}
                                        onClick={() => {
                                          setSelectedEconomist(econ);
                                          setEditingVariable(null);
                                          documentPreviewRef.current?.clearActiveVariable();
                                        }}
                                        className="text-left text-[13px] px-2.5 py-2 rounded-lg transition-all"
                                        style={{
                                          background: isSelected ? '#eff6ff' : 'transparent',
                                          color: '#3d3935',
                                        }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8f7f6'; }}
                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <span className={isSelected ? 'font-medium' : ''}>{econ.full_name || econ.email}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 inline ml-1.5" style={{ color: '#3b82f6' }} />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}

                            {cat === 'manager' && (
                              <div className="flex flex-col gap-0.5">
                                {managers.length === 0 ? (
                                  <span className="text-[12px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Nėra vadybininkų</span>
                                ) : (
                                  managers.map((mgr) => {
                                    const isSelected = selectedManager?.id === mgr.id;
                                    return (
                                      <button
                                        key={mgr.id}
                                        onClick={() => {
                                          setSelectedManager(mgr);
                                          setEditingVariable(null);
                                          documentPreviewRef.current?.clearActiveVariable();
                                        }}
                                        className="text-left text-[13px] px-2.5 py-2 rounded-lg transition-all"
                                        style={{
                                          background: isSelected ? '#eff6ff' : 'transparent',
                                          color: '#3d3935',
                                        }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8f7f6'; }}
                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <span className={isSelected ? 'font-medium' : ''}>{mgr.full_name || mgr.email}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 inline ml-1.5" style={{ color: '#3b82f6' }} />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}

                            {cat === 'offer' && (
                              <div>
                                <input
                                  type="text"
                                  value={editingVariable.editValue}
                                  onChange={(e) => setEditingVariable({ ...editingVariable, editValue: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleVariableSave(editingVariable.key, editingVariable.editValue);
                                    if (e.key === 'Escape') { setEditingVariable(null); documentPreviewRef.current?.clearActiveVariable(); }
                                  }}
                                  autoFocus
                                  className="w-full text-[13px] px-2.5 py-2 rounded-lg outline-none transition-all"
                                  style={{ border: '1px solid #e5e2dd', color: '#3d3935', background: '#fafaf8' }}
                                  onFocus={(e) => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.08)'; }}
                                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e2dd'; e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.boxShadow = 'none'; }}
                                />
                                <div className="flex justify-end mt-2.5 gap-2">
                                  <button
                                    onClick={() => { setEditingVariable(null); documentPreviewRef.current?.clearActiveVariable(); }}
                                    className="text-[12px] px-3 py-1.5 rounded-md transition-colors"
                                    style={{ color: 'var(--color-base-content)', opacity: 0.4 }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f2f0'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                  >
                                    Atšaukti
                                  </button>
                                  <button
                                    onClick={() => handleVariableSave(editingVariable.key, editingVariable.editValue)}
                                    className="text-[12px] px-3.5 py-1.5 rounded-md font-medium transition-colors"
                                    style={{ background: '#3d3935', color: 'white' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#2d2925'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#3d3935'}
                                  >
                                    Išsaugoti
                                  </button>
                                </div>
                              </div>
                            )}

                            {cat === 'yaml' && (
                              <div>
                                {!aiVarEditMode ? (
                                  <>
                                    {/* Direct edit mode */}
                                    <textarea
                                      value={editingVariable.editValue}
                                      onChange={(e) => setEditingVariable({ ...editingVariable, editValue: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') { setEditingVariable(null); documentPreviewRef.current?.clearActiveVariable(); }
                                      }}
                                      autoFocus
                                      rows={3}
                                      className="w-full text-[13px] px-2.5 py-2 rounded-lg outline-none resize-none transition-all"
                                      style={{ border: '1px solid #e5e2dd', color: '#3d3935', background: '#fafaf8' }}
                                      onFocus={(e) => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.08)'; }}
                                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e2dd'; e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.boxShadow = 'none'; }}
                                    />
                                    <div className="flex items-center justify-between mt-2.5">
                                      <button
                                        onClick={() => { setAiVarEditMode(true); setAiVarEditInstruction(''); setAiVarEditResult(null); setAiVarEditError(null); }}
                                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                                        style={{ color: '#8b5cf6' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f3ff'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        title="AI redakcija"
                                      >
                                        <Sparkles className="w-3 h-3" />
                                        AI
                                      </button>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => { setEditingVariable(null); documentPreviewRef.current?.clearActiveVariable(); }}
                                          className="text-[12px] px-3 py-1.5 rounded-md transition-colors"
                                          style={{ color: 'var(--color-base-content)', opacity: 0.4 }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f2f0'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                          Atšaukti
                                        </button>
                                        <button
                                          onClick={() => handleVariableSave(editingVariable.key, editingVariable.editValue)}
                                          className="text-[12px] px-3.5 py-1.5 rounded-md font-medium transition-colors"
                                          style={{ background: '#3d3935', color: 'white' }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = '#2d2925'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = '#3d3935'}
                                        >
                                          Išsaugoti
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {/* AI edit mode */}
                                    {!aiVarEditResult && !aiVarEditLoading && !aiVarEditError && (
                                      <div>
                                        {editingVariable.editValue && (
                                          <div className="text-[12px] max-h-20 overflow-y-auto mb-2 px-2.5 py-2 rounded-lg" style={{ color: '#6b7280', background: '#f8f7f6', border: '1px solid #e5e2dd', lineHeight: '1.5' }}>
                                            {editingVariable.editValue.slice(0, 150)}{editingVariable.editValue.length > 150 ? '...' : ''}
                                          </div>
                                        )}
                                        <textarea
                                          value={aiVarEditInstruction}
                                          onChange={(e) => setAiVarEditInstruction(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAIVariableEdit(); }
                                            if (e.key === 'Escape') { setAiVarEditMode(false); }
                                          }}
                                          autoFocus
                                          rows={2}
                                          placeholder="Aprašykite, ką AI turėtų pakeisti..."
                                          className="w-full text-[13px] px-2.5 py-2 rounded-lg outline-none resize-none transition-all"
                                          style={{ border: '1px solid #e5e2dd', color: '#3d3935', background: '#fafaf8' }}
                                          onFocus={(e) => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)'; }}
                                          onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e2dd'; e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.boxShadow = 'none'; }}
                                        />
                                        <div className="flex items-center justify-between mt-2.5">
                                          <button
                                            onClick={() => setAiVarEditMode(false)}
                                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                                            style={{ color: 'var(--color-base-content)', opacity: 0.4 }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f2f0'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                          >
                                            Grįžti
                                          </button>
                                          <button
                                            onClick={handleAIVariableEdit}
                                            disabled={!aiVarEditInstruction.trim()}
                                            className="flex items-center gap-1 text-[12px] px-3.5 py-1.5 rounded-md font-medium transition-colors"
                                            style={{
                                              background: aiVarEditInstruction.trim() ? '#8b5cf6' : '#e5e2dd',
                                              color: aiVarEditInstruction.trim() ? 'white' : '#9ca3af',
                                            }}
                                            onMouseEnter={(e) => { if (aiVarEditInstruction.trim()) e.currentTarget.style.background = '#7c3aed'; }}
                                            onMouseLeave={(e) => { if (aiVarEditInstruction.trim()) e.currentTarget.style.background = '#8b5cf6'; }}
                                          >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Generuoti
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {aiVarEditLoading && (
                                      <div className="flex items-center justify-center gap-2 py-4">
                                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#8b5cf6' }} />
                                        <span className="text-[12px]" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>AI generuoja...</span>
                                      </div>
                                    )}

                                    {aiVarEditError && !aiVarEditLoading && (
                                      <div>
                                        <div className="text-[12px] px-2.5 py-2 rounded-lg" style={{ color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' }}>
                                          {aiVarEditError}
                                        </div>
                                        <button
                                          onClick={() => setAiVarEditError(null)}
                                          className="w-full mt-2 text-[12px] px-3 py-1.5 rounded-md transition-colors"
                                          style={{ color: 'var(--color-base-content)', opacity: 0.4 }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f2f0'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                          Grįžti
                                        </button>
                                      </div>
                                    )}

                                    {aiVarEditResult && !aiVarEditLoading && (
                                      <div>
                                        <div
                                          className="text-[12px] max-h-48 overflow-y-auto rounded-lg p-2.5"
                                          style={{ color: '#3d3935', lineHeight: '1.6', background: '#faf5ff', border: '1px solid #e9d5ff' }}
                                        >
                                          {aiVarEditResult}
                                        </div>
                                        <div className="flex justify-end mt-2.5 gap-2">
                                          <button
                                            onClick={() => { setAiVarEditResult(null); }}
                                            className="text-[12px] px-3 py-1.5 rounded-md transition-colors"
                                            style={{ color: '#ef4444' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                          >
                                            Atmesti
                                          </button>
                                          <button
                                            onClick={async () => {
                                              const key = editingVariable.key;
                                              const value = aiVarEditResult!;
                                              setAiVarEditResult(null);
                                              setAiVarEditMode(false);
                                              await handleVariableSave(key, value);
                                            }}
                                            className="text-[12px] px-3 py-1.5 rounded-md font-medium transition-colors"
                                            style={{ background: '#8b5cf6', color: 'white' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#7c3aed'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#8b5cf6'}
                                          >
                                            Priimti
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {popupPlacement === 'above' && (
                          <div style={{
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent',
                            borderRight: '7px solid transparent',
                            borderTop: '7px solid #ffffff',
                            marginLeft: Math.min(Math.max(editingVariable.x - Math.min(Math.max(editingVariable.x - 130, 8), 260) - 7, 16), 232) + 'px',
                          }} />
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Citation popover — shows AI reasoning for a variable */}
                {activeCitation && (() => {
                  const { key, citation, x, y } = activeCitation;
                  const paramDef = OFFER_PARAMETER_DEFINITIONS.find((p) => p.key === key);
                  const label = paramDef?.label || key;
                  const thinkingText = citation.thinking_excerpt || '';
                  const chatText = citation.chat_excerpt || '';
                  const hasThinking = thinkingText.trim().length > 0;
                  const hasChatText = chatText.trim().length > 0;
                  const msgIdx = citation.message_index;

                  return (
                    <>
                      <div
                        style={{ position: 'absolute', inset: 0, zIndex: 49 }}
                        onClick={() => setActiveCitation(null)}
                      />
                      <div
                        ref={citationPopupRef}
                        style={{
                          position: 'absolute',
                          left: Math.min(Math.max(x - 150, 8), 220),
                          top: citationPlacement === 'below' ? y + 8 : y - 8,
                          transform: citationPlacement === 'above' ? 'translateY(-100%)' : undefined,
                          zIndex: 50,
                          width: '320px',
                          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.10)) drop-shadow(0 1px 3px rgba(0,0,0,0.06))',
                          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                        }}
                      >
                        {citationPlacement === 'below' && (
                          <div style={{
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent',
                            borderRight: '7px solid transparent',
                            borderBottom: '7px solid #ffffff',
                            marginLeft: Math.min(Math.max(x - Math.min(Math.max(x - 150, 8), 220) - 7, 16), 280) + 'px',
                          }} />
                        )}
                        <div style={{
                          background: '#ffffff',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}>
                          {/* Header */}
                          <div className="px-3.5 py-2.5" style={{ borderBottom: '1px solid #f0eeeb' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate" style={{ color: '#1a1a1a', letterSpacing: '-0.01em' }}>{label}</div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(199,168,138,0.12)', color: '#a0845e' }}>
                                    AI šaltinis
                                  </span>
                                  <span className="text-[10px]" style={{ color: '#9ca3af' }}>
                                    v{citation.version}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => setActiveCitation(null)}
                                className="p-1 rounded-md flex-shrink-0 transition-colors mt-0.5"
                                style={{ color: '#c0bbb5' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = '#f3f2f0'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#c0bbb5'; e.currentTarget.style.background = 'transparent'; }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Body — reasoning excerpt */}
                          <div className="px-3.5 py-3">
                            {hasThinking ? (
                              <div>
                                <div className="text-[10px] font-medium mb-1.5" style={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  AI samprotavimas
                                </div>
                                <div
                                  className="text-[12px] leading-relaxed overflow-y-auto"
                                  style={{
                                    color: '#4b5563',
                                    maxHeight: '180px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    background: '#fafaf8',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    border: '1px solid #f0eeeb',
                                  }}
                                >
                                  {thinkingText.length > 800 ? thinkingText.slice(0, 800) + '…' : thinkingText}
                                </div>
                              </div>
                            ) : hasChatText ? (
                              <div>
                                <div className="text-[10px] font-medium mb-1.5" style={{ color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  AI atsakymas
                                </div>
                                <div
                                  className="text-[12px] leading-relaxed overflow-y-auto"
                                  style={{
                                    color: '#4b5563',
                                    maxHeight: '180px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    background: '#fafaf8',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    border: '1px solid #f0eeeb',
                                  }}
                                >
                                  {chatText.length > 500 ? chatText.slice(0, 500) + '…' : chatText}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[12px]" style={{ color: '#9ca3af' }}>
                                Nėra AI samprotavimo šiam kintamajam.
                              </div>
                            )}

                            {/* Timestamp */}
                            <div className="mt-2 text-[10px]" style={{ color: '#b5b0aa' }}>
                              {new Date(citation.timestamp).toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>

                            {/* Jump to message button */}
                            {msgIdx >= 0 && currentConversation?.messages?.[msgIdx] && (
                              <button
                                onClick={() => {
                                  setActiveCitation(null);
                                  // Switch to chat area if needed and scroll to message
                                  const msgEl = document.querySelector(`[data-message-index="${msgIdx}"]`);
                                  if (msgEl) {
                                    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    // Flash highlight
                                    msgEl.classList.add('citation-flash');
                                    setTimeout(() => msgEl.classList.remove('citation-flash'), 2000);
                                  }
                                }}
                                className="mt-2.5 w-full text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors text-center"
                                style={{ background: '#3d3935', color: 'white' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#2d2925'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#3d3935'}
                              >
                                Rodyti žinutę
                              </button>
                            )}
                          </div>
                        </div>
                        {citationPlacement === 'above' && (
                          <div style={{
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent',
                            borderRight: '7px solid transparent',
                            borderTop: '7px solid #ffffff',
                            marginLeft: Math.min(Math.max(x - Math.min(Math.max(x - 150, 8), 220) - 7, 16), 280) + 'px',
                          }} />
                        )}
                      </div>
                    </>
                  );
                })()}

              </div>
            <div
              className="flex-1 overflow-y-auto px-6 py-4 relative"
              style={{
                display: artifactTab === 'data' || isStreamingArtifact ? 'block' : 'none',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)'
              }}
            >

              {/* Section 1: Offer Data (AI-generated YAML variables) */}
              <div className="mb-4">
                <button
                  onClick={() => setSectionCollapsed(prev => ({ ...prev, offerData: !prev.offerData }))}
                  className="w-full flex items-center justify-between py-2 mb-2 transition-colors"
                  style={{ color: 'var(--color-base-content)' }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>
                    Pasiūlymo duomenys
                  </span>
                  {sectionCollapsed.offerData ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-base-content)', opacity: 0.4 }} /> : <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--color-base-content)', opacity: 0.4 }} />}
                </button>

                {!sectionCollapsed.offerData && (
                  <div>
                    {!isStreamingArtifact && currentConversation?.artifact && (
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.45 }}>
                          Sugeneruotų YAML kintamųjų: {Object.keys(yamlVarsForUi).length}
                        </span>
                        {templateVariables.length > 0 && (
                          <span className="text-[11px]" style={{ color: 'var(--color-base-content)', opacity: 0.45 }}>
                            DOCX šablono kintamųjų: {templateVariables.length}
                          </span>
                        )}
                      </div>
                    )}
                    {isStreamingArtifact ? (
                      <div>
                        <div className="text-[15px] leading-relaxed" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
                          {renderInteractiveYAML(artifactStreamContent)}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3b82f6' }} />
                          <span className="text-xs" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>Generuojamas pasiūlymas...</span>
                        </div>
                      </div>
                    ) : currentConversation?.artifact ? (
                      <div
                        className="rounded-[26px] border border-base-content/10 shadow-xl p-4 max-w-5xl mx-auto"
                        style={{
                          background: 'radial-gradient(120% 140% at 0% 0%, rgba(255,255,255,0.96) 0%, rgba(251,249,246,0.98) 45%, rgba(245,242,238,0.96) 100%)'
                        }}
                      >
                        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-4">
                          <div className="rounded-2xl border border-base-content/10 bg-[linear-gradient(168deg,rgba(255,255,255,0.95),rgba(250,247,243,0.88))] p-4 shadow-[0_16px_30px_rgba(60,52,46,0.08)]">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-base-content/45">Būsenos radaras</p>
                            <div className="mt-3 flex items-end justify-between">
                              <div>
                                <p className="text-[34px] font-semibold leading-none text-base-content">{templateCompletion.percentage}%</p>
                                <p className="mt-1 text-[11px] text-base-content/60">šablono parengtis</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                                templateCompletion.missing === 0
                                  ? 'border-success/35 bg-success/12 text-success'
                                  : templateCompletion.percentage >= 70
                                    ? 'border-warning/35 bg-warning/12 text-warning'
                                    : 'border-error/35 bg-error/12 text-error'
                              }`}>
                                {templateCompletion.missing === 0 ? 'Paruošta' : 'Reikia papildyti'}
                              </span>
                            </div>

                            <div className="mt-4">
                              <div className="h-2.5 rounded-full bg-base-content/10 overflow-hidden">
                                <div
                                  className="h-full transition-all duration-300 rounded-full"
                                  style={{
                                    width: `${templateCompletion.percentage}%`,
                                    background: templateCompletion.missing === 0
                                      ? 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)'
                                      : templateCompletion.percentage >= 70
                                        ? 'linear-gradient(90deg, #d97706 0%, #f59e0b 100%)'
                                        : 'linear-gradient(90deg, #dc2626 0%, #f43f5e 100%)'
                                  }}
                                />
                              </div>
                              <p className="mt-2 text-[12px] text-base-content/70">
                                {templateCompletion.missing === 0
                                  ? 'Visi DOCX laukai užpildyti.'
                                  : `Trūksta ${templateCompletion.missing} ${templateCompletion.missing === 1 ? 'lauko' : 'laukų'}.`}
                              </p>
                            </div>

                            <div className="mt-4 space-y-2 text-[11px]">
                              <div className="rounded-xl border border-base-content/10 bg-white/70 px-3 py-2 flex items-center justify-between">
                                <span className="text-base-content/60">Užpildyta</span>
                                <span className="font-semibold text-success">{templateCompletion.filled}</span>
                              </div>
                              <div className="rounded-xl border border-base-content/10 bg-white/70 px-3 py-2 flex items-center justify-between">
                                <span className="text-base-content/60">Trūksta</span>
                                <span className={`font-semibold ${templateCompletion.missing === 0 ? 'text-success' : 'text-warning'}`}>{templateCompletion.missing}</span>
                              </div>
                              <div className="rounded-xl border border-base-content/10 bg-white/70 px-3 py-2 flex items-center justify-between">
                                <span className="text-base-content/60">Iš viso</span>
                                <span className="font-semibold text-base-content/80">{templateCompletion.total}</span>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center justify-between rounded-xl border border-base-content/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.82),rgba(248,244,239,0.75))] px-3 py-2.5 shadow-[0_8px_18px_rgba(60,52,46,0.06)]">
                              <p className="text-[13px] font-semibold text-base-content">
                                {templateCompletion.missing === 0 ? '✅ Visi laukai užpildyti' : '⚠ Reikalingas papildymas prieš dokumento generavimą'}
                              </p>
                              <button
                                onClick={() => setShowOnlyMissingTemplateRows((prev) => !prev)}
                                className={`btn btn-xs border backdrop-blur-md shadow-sm transition-all ${
                                  showOnlyMissingTemplateRows
                                    ? 'border-primary/35 bg-primary/20 text-primary hover:bg-primary/25'
                                    : 'border-white/60 bg-white/65 text-base-content/80 hover:bg-white/80'
                                }`}
                              >
                                {showOnlyMissingTemplateRows ? 'Rodyti visus' : 'Rodyti tik trūkstamus'}
                              </button>
                            </div>

                            <div className="mt-3 max-h-[500px] overflow-auto pr-1 pb-6 space-y-3">
                              {visibleTemplateVariableRows.length > 0 ? (
                                <>
                                  <div className="rounded-2xl border border-warning/30 bg-warning/[0.04] p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warning/90 mb-2">Trūksta</p>
                                    {missingTemplateRows.length > 0 ? (
                                      <div className="space-y-2">
                                        {missingTemplateRows.map((row) => {
                                          const isEditing = !!editingTemplateRows[row.key];
                                          return (
                                            <div
                                              key={row.key}
                                              className={`rounded-2xl border border-warning/35 bg-[linear-gradient(160deg,rgba(255,248,240,0.98),rgba(255,241,226,0.85))] shadow-[0_10px_22px_rgba(234,88,12,0.12)] px-3 py-3 transition-all duration-200 ${
                                                skippedTemplateRows[row.key] ? 'opacity-0 scale-95 pointer-events-none h-0 p-0 m-0 overflow-hidden' : 'opacity-100'
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  <span className="inline-flex rounded-full border border-warning/45 bg-warning/15 px-2.5 py-1 font-mono text-[11px] font-semibold break-all text-base-content">{row.key}</span>
                                                  {isEditing ? (
                                                    <textarea
                                                      value={templateRowDrafts[row.key] ?? templateRowOverrides[row.key] ?? row.value}
                                                      onChange={(e) => setTemplateRowDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                                      className="mt-2 w-full min-h-[72px] rounded-lg border border-warning/30 bg-white/90 px-2 py-1.5 text-[12px] text-base-content"
                                                      placeholder="Įveskite reikšmę..."
                                                    />
                                                  ) : (
                                                    <p className="mt-2 text-[12px] text-base-content/70">Reikšmė neįvesta.</p>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setTemplateRowDrafts((prev) => ({ ...prev, [row.key]: prev[row.key] ?? templateRowOverrides[row.key] ?? row.value }));
                                                      setEditingTemplateRows((prev) => ({ ...prev, [row.key]: !prev[row.key] }));
                                                    }}
                                                    className="btn btn-xs border border-white/55 bg-white/70 backdrop-blur-md text-base-content/80 hover:bg-white/85 shadow-sm"
                                                  >
                                                    {isEditing ? 'Baigti' : 'Redaguoti'}
                                                  </button>
                                                  {isEditing && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleTemplateRowSave(row.key, row.value)}
                                                      className="btn btn-xs border border-success/35 bg-success/15 backdrop-blur-md text-success hover:bg-success/20 shadow-sm"
                                                    >
                                                      Išsaugoti
                                                    </button>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={() => setSkippedTemplateRows((prev) => ({ ...prev, [row.key]: true }))}
                                                    className="btn btn-xs border border-warning/30 bg-warning/12 backdrop-blur-md text-warning hover:bg-warning/20 shadow-sm"
                                                  >
                                                    ✓ Praleisti
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="rounded-lg border border-success/25 bg-success/[0.08] px-3 py-2 text-[12px] text-success">Trūkstamų laukų nėra.</div>
                                    )}
                                  </div>

                                  {!showOnlyMissingTemplateRows && (
                                    <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-3">
                                      <button
                                        type="button"
                                        onClick={() => setShowFilledTemplateRows((prev) => !prev)}
                                        className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-success/90"
                                      >
                                        <span>Užpildyta ({filledTemplateRows.length})</span>
                                        {showFilledTemplateRows ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </button>
                                      <div className={`overflow-hidden transition-all duration-200 ${showFilledTemplateRows ? 'max-h-[1200px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 pb-3">
                                          {filledTemplateRows.map((row) => {
                                            const isExpanded = !!expandedTemplateValues[row.key];
                                            const isEditing = !!editingTemplateRows[row.key];
                                            return (
                                              <div key={row.key} className="rounded-2xl border border-success/30 bg-[linear-gradient(160deg,rgba(239,253,245,0.95),rgba(228,250,237,0.8))] shadow-[0_8px_16px_rgba(22,163,74,0.12)] px-3 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="min-w-0 flex-1">
                                                    <span className="inline-flex rounded-full border border-success/35 bg-success/15 px-2.5 py-1 font-mono text-[11px] font-semibold break-all text-base-content">{row.key}</span>
                                                    {isEditing ? (
                                                      <textarea
                                                        value={templateRowDrafts[row.key] ?? templateRowOverrides[row.key] ?? row.value}
                                                        onChange={(e) => setTemplateRowDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                                        className="mt-2 w-full min-h-[72px] rounded-lg border border-success/30 bg-white/90 px-2 py-1.5 text-[12px] text-base-content"
                                                      />
                                                    ) : (
                                                      <p
                                                        onClick={() => setExpandedTemplateValues((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                                                        className="mt-2 text-[12px] leading-relaxed break-words text-base-content/90 bg-white/75 rounded-md px-2 py-1.5 border border-base-content/10 cursor-pointer"
                                                        style={!isExpanded ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
                                                      >
                                                        {row.value}
                                                      </p>
                                                    )}
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setTemplateRowDrafts((prev) => ({ ...prev, [row.key]: prev[row.key] ?? templateRowOverrides[row.key] ?? row.value }));
                                                      setEditingTemplateRows((prev) => ({ ...prev, [row.key]: !prev[row.key] }));
                                                    }}
                                                    className="btn btn-xs border border-white/55 bg-white/70 backdrop-blur-md text-base-content/80 hover:bg-white/85 shadow-sm"
                                                  >
                                                    {isEditing ? 'Baigti' : 'Redaguoti'}
                                                  </button>
                                                  {isEditing && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleTemplateRowSave(row.key, row.value)}
                                                      className="btn btn-xs border border-success/35 bg-success/15 backdrop-blur-md text-success hover:bg-success/20 shadow-sm"
                                                    >
                                                      Išsaugoti
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <div className="rounded-2xl border border-base-content/15 bg-base-100/80 p-3">
                                    <button
                                      type="button"
                                      onClick={() => setShowSkippedTemplateRows((prev) => !prev)}
                                      className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-base-content/70"
                                    >
                                      <span>Praleisti ({skippedTemplateVariableRows.length})</span>
                                      {showSkippedTemplateRows ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                    <div className={`overflow-hidden transition-all duration-200 ${showSkippedTemplateRows ? 'max-h-[900px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                      <div className="space-y-2">
                                        {skippedTemplateVariableRows.length > 0 ? skippedTemplateVariableRows.map((row) => (
                                          <div key={row.key} className="rounded-xl border border-base-content/15 bg-base-100 px-3 py-2 flex items-center justify-between gap-2">
                                            <span className="font-mono text-[11px] text-base-content/75 break-all">{row.key}</span>
                                            <button
                                              type="button"
                                              onClick={() => setSkippedTemplateRows((prev) => ({ ...prev, [row.key]: false }))}
                                              className="btn btn-xs border border-white/55 bg-white/70 backdrop-blur-md text-base-content/80 hover:bg-white/85 shadow-sm"
                                            >
                                              Grąžinti
                                            </button>
                                          </div>
                                        )) : (
                                          <p className="text-[12px] text-base-content/50">Nėra praleistų laukų.</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="px-2 py-4 text-[12px] text-base-content/40">Nerasta šablono laukų.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs py-4 text-center" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>
                        Pasiūlymo duomenys bus rodomi po generavimo.
                      </p>
                    )}

                    
                  </div>
                )}
              </div>

              {/* Fade divider */}
              <div className="my-3" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 30%, #e5e2dd 70%, transparent)' }} />

              {/* Section 2: Object & Water Parameters */}
              <div className="mb-4">
                <button
                  onClick={() => setSectionCollapsed(prev => ({ ...prev, objectParams: !prev.objectParams }))}
                  className="w-full flex items-center justify-between py-2 mb-2 transition-colors"
                  style={{ color: 'var(--color-base-content)' }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>
                    Objekto ir vandens parametrai
                  </span>
                  {sectionCollapsed.objectParams ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-base-content)', opacity: 0.4 }} /> : <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--color-base-content)', opacity: 0.4 }} />}
                </button>

                {!sectionCollapsed.objectParams && (
                  <div className="space-y-3">
                    {/* Object sentence */}
                    {OFFER_PARAMETER_DEFINITIONS.filter(p => p.group === 'object').map((param) => (
                      <div key={param.key}>
                        <label className="text-[10px] block mb-1" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>{param.label}</label>
                        <input
                          type="text"
                          value={offerParameters[param.key] || ''}
                          onChange={(e) => {
                            updateOfferParameter(currentConversation?.id, param.key, e.target.value);
                          }}
                          className="w-full px-3 py-2 text-sm rounded-md transition-all focus:outline-none"
                          style={{
                            background: '#ffffff',
                            borderLeft: '3px solid #d1d5db',
                            color: '#1D1D1F',
                            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderLeftColor = '#3b82f6';
                            e.currentTarget.style.background = '#f0f7ff';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderLeftColor = '#d1d5db';
                            e.currentTarget.style.background = '#ffffff';
                          }}
                          placeholder={param.defaultValue || 'Įveskite...'}
                        />
                      </div>
                    ))}

                    {/* Contamination & After Cleaning - compact table */}
                    <div className="mt-2">
                      <div className="grid grid-cols-3 gap-1 mb-1">
                        <div className="text-[10px] font-medium" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}></div>
                        <div className="text-[10px] font-medium text-center" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Užterštumo</div>
                        <div className="text-[10px] font-medium text-center" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Po valymo</div>
                      </div>
                      {['BDS', 'SM', 'N', 'P'].map((param) => {
                        const contKey = `${param}_reglamentORprovided`;
                        const afterKey = `${param}_aftercleaning`;
                        const contDef = OFFER_PARAMETER_DEFINITIONS.find(p => p.key === contKey);
                        const afterDef = OFFER_PARAMETER_DEFINITIONS.find(p => p.key === afterKey);
                        return (
                          <div key={param} className="grid grid-cols-3 gap-1 mb-1 items-center">
                            <div className="text-[11px] font-medium" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>{contDef?.label || param}</div>
                            <input
                              type="text"
                              value={offerParameters[contKey] || ''}
                              onChange={(e) => {
                                updateOfferParameter(currentConversation?.id, contKey, e.target.value);
                              }}
                              className="w-full px-2 py-1.5 text-xs rounded transition-all focus:outline-none text-center"
                              style={{
                                background: '#ffffff',
                                borderLeft: '2px solid #d1d5db',
                                color: '#1D1D1F'
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderLeftColor = '#3b82f6';
                                e.currentTarget.style.background = '#f0f7ff';
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderLeftColor = '#d1d5db';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                            />
                            <input
                              type="text"
                              value={offerParameters[afterKey] || ''}
                              onChange={(e) => {
                                updateOfferParameter(currentConversation?.id, afterKey, e.target.value);
                              }}
                              className="w-full px-2 py-1.5 text-xs rounded transition-all focus:outline-none text-center"
                              style={{
                                background: '#ffffff',
                                borderLeft: '2px solid #d1d5db',
                                color: '#1D1D1F'
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderLeftColor = '#3b82f6';
                                e.currentTarget.style.background = '#f0f7ff';
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderLeftColor = '#d1d5db';
                                e.currentTarget.style.background = '#ffffff';
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Fade divider */}
              <div className="my-3" style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e5e2dd 30%, #e5e2dd 70%, transparent)' }} />

              {/* Section 3: Team (Economist & Manager) */}
              {!isStreamingArtifact && currentConversation?.artifact && (
                <div className="mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider block py-2 mb-2" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>
                    Komanda
                  </span>
                  <div className="space-y-2">
                    {/* Economist Selection */}
                    <div>
                      <label className="text-[10px] block mb-1" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Ekonomistas</label>
                      <div className="relative">
                        <button
                          onClick={() => setShowEconomistDropdown(!showEconomistDropdown)}
                          className="w-full px-3 py-2 text-sm rounded-md transition-all flex items-center justify-between"
                          style={{
                            borderLeft: '3px solid ' + (selectedEconomist ? '#10b981' : '#d1d5db'),
                            background: 'white',
                            color: selectedEconomist ? '#3d3935' : '#8a857f'
                          }}
                          onMouseEnter={(e) => { if (!selectedEconomist) e.currentTarget.style.borderLeftColor = '#3b82f6'; e.currentTarget.style.background = '#f0f7ff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = selectedEconomist ? '#10b981' : '#d1d5db'; e.currentTarget.style.background = 'white'; }}
                        >
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5" />
                            <span>{selectedEconomist ? (selectedEconomist.full_name || selectedEconomist.email) : 'Pasirinkti...'}</span>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {showEconomistDropdown && (
                          <div className="absolute z-10 w-full bottom-full mb-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                            {economists.length === 0 ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>Nerasta ekonomistų</div>
                            ) : (
                              economists.map((economist) => (
                                <button
                                  key={economist.id}
                                  onClick={() => { setSelectedEconomist(economist); setShowEconomistDropdown(false); }}
                                  className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between"
                                  style={{ color: 'var(--color-base-content)' }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                  <div>
                                    <div className="font-medium">{economist.full_name || economist.display_name || economist.email}</div>
                                    {economist.kodas && <div className="text-xs" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>Kodas: {economist.kodas}</div>}
                                  </div>
                                  {selectedEconomist?.id === economist.id && <Check className="w-4 h-4" style={{ color: '#10b981' }} />}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Manager Selection */}
                    <div>
                      <label className="text-[10px] block mb-1" style={{ color: 'var(--color-base-content)', opacity: 0.4 }}>Vadybininkas</label>
                      <div className="relative">
                        <button
                          onClick={() => setShowManagerDropdown(!showManagerDropdown)}
                          className="w-full px-3 py-2 text-sm rounded-md transition-all flex items-center justify-between"
                          style={{
                            borderLeft: '3px solid ' + (selectedManager ? '#10b981' : '#d1d5db'),
                            background: 'white',
                            color: selectedManager ? '#3d3935' : '#8a857f'
                          }}
                          onMouseEnter={(e) => { if (!selectedManager) e.currentTarget.style.borderLeftColor = '#3b82f6'; e.currentTarget.style.background = '#f0f7ff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = selectedManager ? '#10b981' : '#d1d5db'; e.currentTarget.style.background = 'white'; }}
                        >
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5" />
                            <span>{selectedManager ? (selectedManager.full_name || selectedManager.email) : 'Pasirinkti...'}</span>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {showManagerDropdown && (
                          <div className="absolute z-10 w-full bottom-full mb-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: '#e8e5e0' }}>
                            {managers.length === 0 ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>Nerasta vadybininkų</div>
                            ) : (
                              managers.map((manager) => (
                                <button
                                  key={manager.id}
                                  onClick={() => { setSelectedManager(manager); setShowManagerDropdown(false); }}
                                  className="w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between"
                                  style={{ color: 'var(--color-base-content)' }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                  <div>
                                    <div className="font-medium">{manager.full_name || manager.display_name || manager.email}</div>
                                    {manager.kodas && <div className="text-xs" style={{ color: 'var(--color-base-content)', opacity: 0.5 }}>Kodas: {manager.kodas}</div>}
                                  </div>
                                  {selectedManager?.id === manager.id && <Check className="w-4 h-4" style={{ color: '#10b981' }} />}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Global Template Editor Modal — visual WYSIWYG */}
      {showTemplateEditor && (() => {
        // Render template for editing — variable chips but no page-break processing
        const tpl = getDefaultTemplate();
        const rendered = renderTemplateForEditor(tpl);
        const sanitized = sanitizeHtmlForIframe(rendered);
        const editorSrcdoc = sanitized.replace(
          '</style>',
          `
          /* Preview host overrides — real A4 dimensions */
          html, body { margin: 0; padding: 0; background: #ffffff; overflow: hidden; }
          body.c47.doc-content {
            /* Let template's .c47 handle content sizing (523.2pt + 36pt×2 = 210mm A4) */
            margin: 0 auto;
            background: #ffffff;
          }
          body:focus { outline: none; }
          .template-var { cursor: default; border-radius: 3px; }
          .template-var.unfilled { cursor: text; }
          .template-var.filled { background: rgba(59,130,246,0.04); box-shadow: 0 0 0 1px rgba(59,130,246,0.12); padding: 0 2px; border-radius: 3px; }
          /* Image constraints */
          img { max-width: 100%; height: auto; }
          /* Edit mode image styles */
          body.img-edit-mode img {
            cursor: pointer;
            transition: outline 0.15s, box-shadow 0.15s;
          }
          body.img-edit-mode img:hover {
            outline: 2px solid rgba(59,130,246,0.4);
            outline-offset: 2px;
          }
          body.img-edit-mode img.img-selected {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(59,130,246,0.12);
          }
          </style>`
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTemplateEditor(false)}>
            <div className="w-full max-w-4xl flex flex-col rounded-xl overflow-hidden bg-base-100 border border-base-content/10 shadow-xl" style={{ height: '88vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.015), transparent)' }}>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[17px] font-semibold text-base-content" style={{ letterSpacing: '-0.02em' }}>Šablono redagavimas</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {globalDocxFileId && (
                    <a
                      href={getDirectusFileUrl(globalDocxFileId)}
                      download
                      className="btn btn-soft btn-sm gap-1.5"
                      title="Atsisiųsti esamą DOCX šabloną"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Atsisiųsti .docx
                    </a>
                  )}
                  {/* DOCX template upload */}
                  <input
                    ref={docxFileInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const hadTemplateBeforeUpload = hasDocxTemplate;
                      try {
                        setDocxUploading(true);
                        await uploadDocxTemplate(file);
                        setHasDocxTemplate(true);
                        getDocxTemplateFileId().then(id => setGlobalDocxFileId(id));
                        setShowInstructionNudge(true);
                        addNotification('success', 'DOCX šablonas', 'Word šablonas sėkmingai įkeltas.');
                        if (hadTemplateBeforeUpload) {
                          addNotification('info', 'Instrukcijos', 'Atnaujintas DOCX šablonas. Peržiūrėkite instrukcijas, kad prompt atitiktų šabloną.');
                        }
                      } catch (err) {
                        addNotification('error', 'Klaida', formatToastMessage('Nepavyko įkelti DOCX', formatErrorForToast(err)));
                      } finally {
                        setDocxUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    onClick={() => docxFileInputRef.current?.click()}
                    className={`btn btn-soft btn-sm gap-1.5 ${hasDocxTemplate ? 'btn-success' : ''}`}
                    title={hasDocxTemplate ? 'DOCX šablonas įkeltas — spauskite, kad pakeistumėte' : 'Įkelti DOCX šabloną (Word atsisiuntimui)'}
                    disabled={docxUploading}
                  >
                    {docxUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Įkelti naują šabloną
                  </button>
                  <button
                    onClick={() => setShowTemplateEditor(false)}
                    className="btn btn-soft btn-sm"
                  >
                    Uždaryti
                  </button>
                </div>
              </div>
              {/* Info bar: tabs + last edited by */}
              <div className="px-5 py-1.5 flex-shrink-0 bg-base-content/[0.02] border-b border-base-content/10 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-base-content/10 text-base-content">
                    DOCX šablono peržiūra
                  </span>
                  <span className="ml-2 text-[10px] text-base-content/40">
                    Tik peržiūra — DOCX failą redaguokite Word programoje ir įkelkite iš naujo.
                  </span>
                </div>
              </div>
              {/* Image replacement input removed — HTML editor removed */}

              {/* Image editing toolbar (docked at top, shown when image selected) */}
              {tplSelectedImage && tplEditMode && (
                <div
                  className="flex-shrink-0"
                  style={{
                    background: '#fafaf9',
                    borderBottom: '1px solid rgba(0,0,0,0.08)',
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  }}
                >
                  <div className="px-4 py-2 flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-semibold" style={{ color: '#1a1a1a' }}>Paveikslėlis</span>
                      <span className="text-[10px]" style={{ color: '#9ca3af' }}>{tplSelectedImage.naturalWidth}×{tplSelectedImage.naturalHeight}</span>
                    </div>
                    <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={handleTplReplaceImage}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                        style={{ background: '#3d3935', color: 'white' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#2d2925'}
                        onMouseLeave={e => e.currentTarget.style.background = '#3d3935'}
                        title="Pakeisti paveikslėlį"
                      >
                        <ImagePlus className="w-3 h-3" />
                        Pakeisti
                      </button>
                      <button
                        onClick={handleTplFitToColumn}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                        style={{ background: '#f3f2f0', color: '#3d3935' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8e6e3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f3f2f0'}
                        title="Pritaikyti prie stulpelio"
                      >
                        <Maximize2 className="w-3 h-3" />
                        Užpildyti
                      </button>
                      <button
                        onClick={handleTplResetImage}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                        style={{ background: '#f3f2f0', color: '#3d3935' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8e6e3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f3f2f0'}
                        title="Atkurti originalų dydį"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                    <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MoveHorizontal className="w-3 h-3 flex-shrink-0" style={{ color: '#6b7280' }} />
                      <input
                        type="range"
                        min={10}
                        max={200}
                        value={tplImgWidth}
                        onChange={e => handleTplResizeImage(+e.target.value)}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer min-w-[60px]"
                        style={{
                          background: `linear-gradient(to right, #3d3935 0%, #3d3935 ${((tplImgWidth - 10) / 190) * 100}%, #e5e2dd ${((tplImgWidth - 10) / 190) * 100}%, #e5e2dd 100%)`,
                          accentColor: '#3d3935',
                        }}
                      />
                      <span className="text-[10px] tabular-nums font-medium flex-shrink-0" style={{ color: '#3d3935' }}>{tplImgWidth}%</span>
                    </div>
                    <div style={{ width: '1px', height: '16px', background: '#e5e2dd', flexShrink: 0 }} />
                    <button
                      onClick={() => setTplCropMode(prev => !prev)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0"
                      style={{ background: tplCropMode ? '#eff6ff' : '#f3f2f0', color: tplCropMode ? '#3b82f6' : '#6b7280' }}
                    >
                      <Crop className="w-3 h-3" />
                      Apkarpyti
                    </button>
                    <button
                      onClick={tplDeselectImage}
                      className="p-1 rounded transition-colors flex-shrink-0"
                      style={{ color: '#9ca3af' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#3d3935'}
                      onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                      title="Uždaryti"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {tplCropMode && (
                    <div className="px-4 pb-2 flex items-center gap-3" style={{ borderTop: '1px solid #f0eeeb' }}>
                      {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                        <div key={side} className="flex items-center gap-1.5 flex-1">
                          <span className="text-[10px] flex-shrink-0" style={{ color: '#9ca3af' }}>
                            {side === 'top' ? 'Viršus' : side === 'right' ? 'Dešinė' : side === 'bottom' ? 'Apačia' : 'Kairė'}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={45}
                            value={tplCropValues[side]}
                            onChange={e => handleTplCropChange(side, +e.target.value)}
                            className="flex-1 h-1 rounded-full appearance-none cursor-pointer min-w-[30px]"
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(tplCropValues[side] / 45) * 100}%, #e5e2dd ${(tplCropValues[side] / 45) * 100}%, #e5e2dd 100%)`,
                              accentColor: '#3b82f6',
                            }}
                          />
                          <span className="text-[10px] w-5 tabular-nums flex-shrink-0" style={{ color: '#9ca3af' }}>{tplCropValues[side]}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Main content area: editor + optional version sidebar */}
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* DOCX preview panel — Google Docs Viewer iframe */}
                {(
                  <div className="flex-1 flex flex-col bg-base-200/40">
                    {docxPreviewError && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <AlertCircle className="w-8 h-8 text-warning mx-auto mb-2" />
                          <p className="text-sm text-base-content/60">{docxPreviewError}</p>
                          <button
                            onClick={() => docxFileInputRef.current?.click()}
                            className="btn btn-soft btn-sm mt-3 gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Įkelti DOCX šabloną
                          </button>
                        </div>
                      </div>
                    )}
                    {docxPreviewLoading && !docxPreviewError && (
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-base-content/40 mr-2" />
                        <span className="text-sm text-base-content/40">Kraunama DOCX peržiūra...</span>
                      </div>
                    )}
                    {docxViewerUrl && !docxPreviewError && (
                      <iframe
                        key={docxViewerUrl}
                        src={docxViewerUrl}
                        className="flex-1 w-full border-none"
                        title="DOCX peržiūra"
                        onLoad={() => setDocxPreviewLoading(false)}
                        onError={() => {
                          setDocxPreviewLoading(false);
                          setDocxPreviewError('Nepavyko užkrauti DOCX peržiūros. Pabandykite atidaryti iš naujo.');
                        }}
                      />
                    )}
                  </div>
                )}
                {/* HTML visual editor removed — .docx template is the single source of truth */}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Prompt Modal */}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40"
          onClick={() => {
            setShowPromptModal(false);
            setShowTemplateView(false);
          }}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] rounded-xl overflow-hidden bg-base-100 border border-base-content/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-content/10">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-base-content">
                  {showTemplateView ? 'Prompt Šablonas' : 'Pilnas Prompt'}
                </h3>
                <button
                  onClick={() => setShowTemplateView(!showTemplateView)}
                  className={`btn btn-xs ${showTemplateView ? 'btn-soft' : 'btn-primary'}`}
                >
                  {showTemplateView ? 'Rodyti pilną prompt' : 'Rodyti šabloną'}
                </button>
                {user.is_admin && (
                  <button
                    onClick={() => {
                      setShowPromptModal(false);
                      setShowTemplateView(false);
                      navigate('/instrukcijos?schema=sdk');
                    }}
                    className="btn btn-xs btn-soft"
                  >
                    SDK schemos
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setShowTemplateView(false);
                }}
                className="btn btn-circle btn-text btn-sm text-base-content/40 hover:text-base-content/70"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {promptPreviewError ? (
                <div className="alert alert-soft alert-error text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{promptPreviewError}</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-base-content">
                  {showTemplateView ? (templateFromDB || promptTemplate) : systemPrompt}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {showInstructionNudge && (
        <div className="fixed bottom-6 right-6 z-50 w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl border border-primary/20 bg-base-100 shadow-2xl p-6">
          <div className="text-base font-semibold text-base-content mb-2">Word šablonas atnaujintas</div>
          <p className="text-sm text-base-content/70 leading-relaxed mb-5">
            Ar norėtumėte peržiūrėti ar Agento Sistemos Instrukcijos suderinamos su nauju Word šablonu?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowInstructionNudge(false)}
              className="btn btn-sm btn-soft min-w-[72px]"
            >
              ne
            </button>
            <button
              onClick={() => {
                setShowInstructionNudge(false);
                setShowTemplateEditor(false);
                navigate('/instrukcijos?variable=chat_commercial_offer_generation');
              }}
              className="btn btn-sm btn-primary min-w-[72px]"
            >
              taip
            </button>
          </div>
        </div>
      )}

      {/* Notification Container */}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </div>
  );
}
