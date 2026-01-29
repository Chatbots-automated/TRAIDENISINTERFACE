import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, getOrCreateDefaultProject, getChatThreads, createChatThread, deleteChatThread, updateChatThreadTitle } from './lib/supabase';
import Layout from './components/Layout';
import ChatInterface from './components/ChatInterface';
import DocumentsInterface from './components/DocumentsInterface';
import AdminUsersInterface from './components/AdminUsersInterface';
import TranscriptsInterface from './components/TranscriptsInterface';
import InstructionsInterface from './components/InstructionsInterface';
import NestandardiniaiInterface from './components/NestandardiniaiInterface';
import SDKInterface from './components/SDKInterface';
import AuthForm from './components/AuthForm';
import CommercialOfferPanel from './components/CommercialOfferPanel';
import { hasCommercialOffer } from './lib/commercialOfferStorage';
import { MessageSquare, FileText, Users, ToggleLeft, ToggleRight, History, Package, Bot } from 'lucide-react';
import type { AppUser } from './types';

type ViewMode = 'chat' | 'documents' | 'users' | 'transcripts' | 'instrukcijos' | 'nestandartiniai' | 'sdk';

interface Thread {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

// localStorage keys for persistence
const STORAGE_KEYS = {
  VIEW_MODE: 'traidenis_view_mode',
  CURRENT_THREAD_ID: 'traidenis_current_thread_id',
  NAUJOKAS_MODE: 'traidenis_naujokas_mode',
  NEW_VERSION_MODE: 'traidenis_new_version_mode',
};

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Initialize viewMode from localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    return (saved as ViewMode) || 'chat';
  });

  // Thread management state (moved from ChatInterface)
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [restoredThreadId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_THREAD_ID);
  });

  // Commercial offer panel state
  const [commercialPanelOpen, setCommercialPanelOpen] = useState(false);
  const [hasOffer, setHasOffer] = useState(false);
  const [showDocGlow, setShowDocGlow] = useState(false);

  // Naujokas (newbie) mode - shows helpful tooltips and guides
  const [naujokasMode, setNaujokasMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NAUJOKAS_MODE);
    // Default to true for new users (no saved preference)
    return saved === null ? true : saved === 'true';
  });

  // New Version mode - shows Voiceflow chat by default
  const [isNewVersion, setIsNewVersion] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NEW_VERSION_MODE);
    // Default to true (Voiceflow) for new users
    return saved === null ? true : saved === 'true';
  });

  // Track if doc icon tooltip should be shown (after first commercial accept)
  const [showDocIconTooltip, setShowDocIconTooltip] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  // Save viewMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
  }, [viewMode]);

  // Save currentThread ID to localStorage when it changes
  useEffect(() => {
    if (currentThread) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_THREAD_ID, currentThread.id);
    }
  }, [currentThread]);

  // Save naujokas mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NAUJOKAS_MODE, String(naujokasMode));
  }, [naujokasMode]);

  // Save new version mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NEW_VERSION_MODE, String(isNewVersion));
  }, [isNewVersion]);

  // Toggle naujokas mode
  const toggleNaujokasMode = useCallback(() => {
    setNaujokasMode(prev => {
      const newValue = !prev;
      // When turning ON naujokas mode, reset the "has seen" flags so tooltips show again
      if (newValue) {
        localStorage.removeItem('traidenis_query_tooltip_shown');
      }
      return newValue;
    });
  }, []);

  // Toggle new version mode
  const toggleNewVersion = useCallback(() => {
    setIsNewVersion(prev => !prev);
  }, []);

  const checkUser = async () => {
    try {
      setInitialLoading(true);
      const { user: currentUser, error } = await getCurrentUser();
      
      if (error || !currentUser) {
        setUser(null);
        setProjectId('');
        return;
      }

      setUser(currentUser);
      
      // Get or create default project
      const defaultProjectId = await getOrCreateDefaultProject(currentUser.id, currentUser.email);
      setProjectId(defaultProjectId);
    } catch (error) {
      console.error('Error checking user:', error);
      setUser(null);
      setProjectId('');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    checkUser();
  };

  // Load threads when projectId changes
  const loadThreads = useCallback(async () => {
    if (!projectId) return;

    try {
      setThreadsLoading(true);
      const { data, error } = await getChatThreads(projectId);

      if (error) {
        console.error('Error loading threads:', error);
        setThreads([]);
        return;
      }

      setThreads(data || []);

      // Try to restore saved thread, or auto-select first thread
      if (!currentThread && data && data.length > 0) {
        // Check if we have a saved thread ID to restore
        const savedThread = restoredThreadId
          ? data.find((t: Thread) => t.id === restoredThreadId)
          : null;

        setCurrentThread(savedThread || data[0]);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setThreadsLoading(false);
    }
  }, [projectId, currentThread, restoredThreadId]);

  // Load threads when projectId is set
  useEffect(() => {
    if (projectId) {
      loadThreads();
    }
  }, [projectId]);

  // Handle creating a new thread
  const handleCreateThread = async () => {
    if (!projectId || !user) return;

    try {
      setCreatingThread(true);
      const title = `New Chat ${new Date().toLocaleString()}`;
      const { data: threadId, error } = await createChatThread(projectId, title, user.email || '');

      if (error) {
        console.error('Error creating thread:', error);
        return;
      }

      // Reload threads and select the new one
      await loadThreads();

      const { data: updatedThreads } = await getChatThreads(projectId);
      const newThread = updatedThreads?.find(t => t.id === threadId);

      if (newThread) {
        setCurrentThread(newThread);
      }
    } catch (error) {
      console.error('Error creating thread:', error);
    } finally {
      setCreatingThread(false);
    }
  };

  // Handle deleting a thread (admin only)
  const handleDeleteThread = async (threadId: string) => {
    if (!confirm('Are you sure you want to delete this chat?')) {
      return;
    }

    try {
      const { success, error } = await deleteChatThread(threadId);

      if (error) {
        console.error('Error deleting thread:', error);
        return;
      }

      if (success) {
        // If we deleted the current thread, clear selection
        if (currentThread?.id === threadId) {
          setCurrentThread(null);
        }

        // Reload threads
        await loadThreads();
      }
    } catch (error) {
      console.error('Error deleting thread:', error);
    }
  };

  // Handle thread selection
  const handleSelectThread = (thread: Thread) => {
    setCurrentThread(thread);
    // Check if this thread has a commercial offer
    setHasOffer(hasCommercialOffer(thread.id));
  };

  // Handle renaming a thread
  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      const { success, error } = await updateChatThreadTitle(threadId, newTitle);

      if (error) {
        console.error('Error renaming thread:', error);
        return;
      }

      if (success) {
        // Reload threads to show updated title
        await loadThreads();
      }
    } catch (error) {
      console.error('Error renaming thread:', error);
    }
  };

  // Handle updates from ChatInterface about commercial offers
  const handleCommercialOfferUpdate = (threadId: string, offerExists: boolean) => {
    setHasOffer(offerExists);
  };

  // Handle first commercial offer accept - trigger doc icon glow and tooltip
  const handleFirstCommercialAccept = useCallback(() => {
    setShowDocGlow(true);
    // Show tooltip pointing to doc icon if in naujokas mode
    if (naujokasMode) {
      setShowDocIconTooltip(true);
    }
    // Clear glow after 5 seconds
    setTimeout(() => {
      setShowDocGlow(false);
    }, 5000);
  }, [naujokasMode]);

  // Handle opening commercial offer panel
  const handleOpenCommercialPanel = () => {
    if (currentThread) {
      setCommercialPanelOpen(true);
    }
  };

  // Update hasOffer when thread changes
  useEffect(() => {
    if (currentThread) {
      setHasOffer(hasCommercialOffer(currentThread.id));
    } else {
      setHasOffer(false);
    }
  }, [currentThread]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-macos-gray-50 flex items-center justify-center">
        <div className="text-center macos-animate-fade">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-macos-gray-200 border-t-macos-blue mx-auto mb-4"></div>
          <p className="text-macos-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-macos-gray-50 flex items-center justify-center">
        <div className="text-center macos-animate-fade">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-macos-gray-200 border-t-macos-blue mx-auto mb-4"></div>
          <p className="text-macos-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (viewMode) {
      case 'chat':
        return (
          <ChatInterface
            user={user}
            projectId={projectId}
            currentThread={currentThread}
            onCommercialOfferUpdate={handleCommercialOfferUpdate}
            onFirstCommercialAccept={handleFirstCommercialAccept}
            onThreadsUpdate={loadThreads}
            onCreateThread={handleCreateThread}
            naujokasMode={naujokasMode}
            isNewVersion={isNewVersion}
          />
        );
      case 'documents':
        return <DocumentsInterface user={user} projectId={projectId} />;
      case 'users':
        return <AdminUsersInterface user={user} />;
      case 'transcripts':
        return <TranscriptsInterface user={user} />;
      case 'instrukcijos':
        return <InstructionsInterface user={user} />;
      case 'nestandartiniai':
        return <NestandardiniaiInterface user={user} projectId={projectId} />;
      case 'sdk':
        return <SDKInterface user={user} projectId={projectId} />;
      default:
        return null;
    }
  };

  return (
    <>
    <Layout
      user={user}
      threads={threads}
      currentThread={currentThread}
      threadsLoading={threadsLoading}
      creatingThread={creatingThread}
      onSelectThread={handleSelectThread}
      onCreateThread={handleCreateThread}
      onDeleteThread={handleDeleteThread}
      onRenameThread={handleRenameThread}
      naujokasMode={naujokasMode}
      onToggleNaujokas={toggleNaujokasMode}
      isNewVersion={isNewVersion}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onToggleNewVersion={toggleNewVersion}
      hasOffer={hasOffer}
      showDocGlow={showDocGlow}
      onOpenCommercialPanel={handleOpenCommercialPanel}
    >
      <div className="flex flex-col h-full">
        {/* Navigation Bar - Hidden when in New Version mode */}
        {!isNewVersion && (
        <div className="bg-white/80 backdrop-blur-macos border-b border-black/5 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left: macOS Segmented Control */}
          <div className="macos-segmented-control">
            <button
              onClick={() => setViewMode('chat')}
              className={`macos-segment flex items-center space-x-2 ${viewMode === 'chat' ? 'active' : ''}`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat</span>
            </button>

            <button
              onClick={() => setViewMode('documents')}
              className={`macos-segment flex items-center space-x-2 ${viewMode === 'documents' ? 'active' : ''}`}
            >
              <FileText className="w-4 h-4" />
              <span>Documents</span>
            </button>

            <button
              onClick={() => setViewMode('transcripts')}
              className={`macos-segment flex items-center space-x-2 ${viewMode === 'transcripts' ? 'active' : ''}`}
            >
              <History className="w-4 h-4" />
              <span>Transcripts</span>
            </button>

            <button
              onClick={() => setViewMode('nestandartiniai')}
              className={`macos-segment flex items-center space-x-2 ${viewMode === 'nestandartiniai' ? 'active' : ''}`}
            >
              <Package className="w-4 h-4" />
              <span>EML Upload</span>
            </button>

            <button
              onClick={() => setViewMode('sdk')}
              className={`macos-segment flex items-center space-x-2 ${viewMode === 'sdk' ? 'active' : ''}`}
            >
              <Bot className="w-4 h-4" />
              <span>SDK</span>
            </button>

            {user.is_admin && (
              <button
                onClick={() => setViewMode('users')}
                className={`macos-segment flex items-center space-x-2 ${viewMode === 'users' ? 'active' : ''}`}
              >
                <Users className="w-4 h-4" />
                <span>Users</span>
              </button>
            )}
          </div>

          {/* Right: New Version Toggle & Commercial Offer Icon */}
          <div className="flex items-center space-x-3 relative">
            {/* New Version Toggle */}
            {viewMode === 'chat' && (
              <button
                onClick={toggleNewVersion}
                className={`macos-btn flex items-center space-x-2 px-3 py-1.5 rounded-macos text-sm transition-all duration-150 ${
                  isNewVersion
                    ? 'macos-btn-primary'
                    : 'macos-btn-secondary'
                }`}
                title={isNewVersion ? 'Naujas variantas (Voiceflow)' : 'Standartinis pokalbis'}
              >
                {isNewVersion ? (
                  <>
                    <ToggleRight className="w-4 h-4" />
                    <span>Nauja</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-4 h-4" />
                    <span>Nauja</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => {
                handleOpenCommercialPanel();
                // Dismiss tooltip when user clicks
                setShowDocIconTooltip(false);
              }}
              className={`p-2 rounded-macos transition-all relative ${
                hasOffer
                  ? 'text-macos-blue bg-macos-blue/10'
                  : 'text-macos-gray-400 bg-macos-gray-100'
              } ${
                showDocGlow
                  ? 'animate-pulse ring-2 ring-macos-purple ring-offset-1 shadow-lg shadow-macos-purple/30'
                  : 'hover:bg-black/5'
              }`}
              title={hasOffer ? 'View Commercial Offer' : 'No commercial offer available'}
            >
              <FileText className="w-4 h-4" />
              {showDocGlow && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-macos-purple opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-macos-purple"></span>
                </span>
              )}
            </button>
            {/* Naujokas tooltip pointing to doc icon */}
            {showDocIconTooltip && naujokasMode && (
              <div className="absolute top-full right-0 mt-2 z-50 macos-animate-spring">
                <div className="bg-macos-gray-900 text-white text-sm px-3 py-2 rounded-macos shadow-macos-lg whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <span>Pasiūlymas išsaugotas! Spauskite čia peržiūrėti</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDocIconTooltip(false);
                      }}
                      className="text-macos-gray-400 hover:text-white ml-1"
                    >
                      <span className="text-xs">✕</span>
                    </button>
                  </div>
                  {/* Arrow pointing up */}
                  <div className="absolute bottom-full right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-macos-gray-900" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden min-h-0">
          {renderContent()}
        </div>
      </div>
    </Layout>

    {/* Commercial Offer Panel */}
    <CommercialOfferPanel
      isOpen={commercialPanelOpen}
      onClose={() => setCommercialPanelOpen(false)}
      threadId={currentThread?.id || null}
    />
    </>
  );
}

export default App;