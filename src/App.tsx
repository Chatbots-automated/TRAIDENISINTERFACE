import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, getOrCreateDefaultProject, getChatThreads, createChatThread, deleteChatThread, updateChatThreadTitle } from './lib/supabase';
import Layout from './components/Layout';
import ChatInterface from './components/ChatInterface';
import DocumentsInterface from './components/DocumentsInterface';
import AdminUsersInterface from './components/AdminUsersInterface';
import TranscriptsInterface from './components/TranscriptsInterface';
import InstructionsInterface from './components/InstructionsInterface';
import NestandardiniaiInterface from './components/NestandardiniaiInterface';
import SDKInterface from './components/SDKInterfaceNew';
import AuthForm from './components/AuthForm';
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
  CURRENT_THREAD_ID: 'traidenis_current_thread_id',
  NAUJOKAS_MODE: 'traidenis_naujokas_mode',
};

// Map routes to view modes
const routeToViewMode: Record<string, ViewMode> = {
  '/': 'chat',
  '/chat': 'chat',
  '/documents': 'documents',
  '/users': 'users',
  '/transcripts': 'transcripts',
  '/instrukcijos': 'instrukcijos',
  '/nestandartiniai': 'nestandartiniai',
  '/sdk': 'sdk',
};

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState<AppUser | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Derive viewMode from current route
  const viewMode: ViewMode = routeToViewMode[location.pathname] || 'chat';

  // Thread management state (moved from ChatInterface)
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [restoredThreadId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_THREAD_ID);
  });

  // Naujokas (newbie) mode - shows helpful tooltips and guides
  const [naujokasMode, setNaujokasMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NAUJOKAS_MODE);
    // Default to true for new users (no saved preference)
    return saved === null ? true : saved === 'true';
  });

  // Main sidebar collapse state (for SDK interface positioning)
  const [mainSidebarCollapsed, setMainSidebarCollapsed] = useState(false);

  // Commercial offer state
  const [hasOffer, setHasOffer] = useState(false);
  const [showDocGlow, setShowDocGlow] = useState(false);
  const [showDocIconTooltip, setShowDocIconTooltip] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

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

  // Handle view mode change (navigation)
  const handleViewModeChange = (newViewMode: ViewMode) => {
    const route = Object.keys(routeToViewMode).find(
      key => routeToViewMode[key] === newViewMode
    );
    if (route && route !== '/') {
      navigate(route);
    } else if (newViewMode === 'chat') {
      navigate('/chat');
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-sm" style={{ color: '#8a857f' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fdfcfb' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-sm" style={{ color: '#8a857f' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
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
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      onSidebarCollapseChange={setMainSidebarCollapsed}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route
          path="/chat"
          element={
            <ChatInterface
              user={user}
              projectId={projectId}
              currentThread={currentThread}
              onCommercialOfferUpdate={handleCommercialOfferUpdate}
              onFirstCommercialAccept={handleFirstCommercialAccept}
              onThreadsUpdate={loadThreads}
              onCreateThread={handleCreateThread}
              naujokasMode={naujokasMode}
              isNewVersion={true}
            />
          }
        />
        <Route
          path="/documents"
          element={<DocumentsInterface user={user} projectId={projectId} />}
        />
        <Route
          path="/users"
          element={<AdminUsersInterface user={user} />}
        />
        <Route
          path="/transcripts"
          element={<TranscriptsInterface user={user} />}
        />
        <Route
          path="/instrukcijos"
          element={<InstructionsInterface user={user} />}
        />
        <Route
          path="/nestandartiniai"
          element={<NestandardiniaiInterface user={user} projectId={projectId} />}
        />
        <Route
          path="/sdk"
          element={<SDKInterface user={user} projectId={projectId} mainSidebarCollapsed={mainSidebarCollapsed} />}
        />
        {/* Catch-all redirect to chat */}
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
