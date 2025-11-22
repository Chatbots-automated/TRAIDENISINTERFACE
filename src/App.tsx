import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, getOrCreateDefaultProject, getChatThreads, createChatThread, deleteChatThread, updateChatThreadTitle } from './lib/supabase';
import Layout from './components/Layout';
import ChatInterface from './components/ChatInterface';
import DocumentsInterface from './components/DocumentsInterface';
import AdminUsersInterface from './components/AdminUsersInterface';
import AuthForm from './components/AuthForm';
import CommercialOfferPanel from './components/CommercialOfferPanel';
import { hasCommercialOffer } from './lib/commercialOfferStorage';
import { MessageSquare, FileText, Users } from 'lucide-react';
import type { AppUser } from './types';

type ViewMode = 'chat' | 'documents' | 'users';

interface Thread {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  // Thread management state (moved from ChatInterface)
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThread, setCurrentThread] = useState<Thread | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);

  // Commercial offer panel state
  const [commercialPanelOpen, setCommercialPanelOpen] = useState(false);
  const [hasOffer, setHasOffer] = useState(false);
  const [showDocGlow, setShowDocGlow] = useState(false);

  useEffect(() => {
    checkUser();
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

      // Auto-select first thread if none selected
      if (!currentThread && data && data.length > 0) {
        setCurrentThread(data[0]);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setThreadsLoading(false);
    }
  }, [projectId, currentThread]);

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

  // Handle first commercial offer accept - trigger doc icon glow
  const handleFirstCommercialAccept = useCallback(() => {
    setShowDocGlow(true);
    // Clear glow after 5 seconds
    setTimeout(() => {
      setShowDocGlow(false);
    }, 5000);
  }, []);

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
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
          />
        );
      case 'documents':
        return <DocumentsInterface user={user} projectId={projectId} />;
      case 'users':
        return <AdminUsersInterface user={user} />;
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
    >
      <div className="flex flex-col h-full">
        {/* Navigation Bar */}
        <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between px-6">
          {/* Left: Navigation Tabs */}
          <div className="flex space-x-8">
            <button
              onClick={() => setViewMode('chat')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'chat'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-green-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4" />
                <span>Chat</span>
              </div>
            </button>

            <button
              onClick={() => setViewMode('documents')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'documents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Documents</span>
              </div>
            </button>

            {user.is_admin && (
              <button
                onClick={() => setViewMode('users')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  viewMode === 'users'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Users</span>
                </div>
              </button>
            )}
          </div>

          {/* Right: Commercial Offer Icon */}
          <div className="flex items-center space-x-1 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg p-1">
            <button className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all text-green-600">
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenCommercialPanel}
              className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all relative ${
                hasOffer
                  ? 'text-blue-600'
                  : 'text-gray-400'
              } ${
                showDocGlow
                  ? 'animate-pulse ring-2 ring-purple-400 ring-offset-1 shadow-lg shadow-purple-300/50'
                  : ''
              }`}
              title={hasOffer ? 'View Commercial Offer' : 'No commercial offer available'}
            >
              <FileText className="w-4 h-4" />
              {showDocGlow && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

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