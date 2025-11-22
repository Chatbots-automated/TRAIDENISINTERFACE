import React, { useState, useEffect } from 'react';
import { getCurrentUser, getOrCreateDefaultProject } from './lib/supabase';
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

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  // Commercial offer panel state
  const [commercialPanelOpen, setCommercialPanelOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [hasOffer, setHasOffer] = useState(false);

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

  // Handle updates from ChatInterface about commercial offers
  const handleCommercialOfferUpdate = (threadId: string, offerExists: boolean) => {
    setCurrentThreadId(threadId);
    setHasOffer(offerExists);
  };

  // Handle thread changes from ChatInterface
  const handleThreadChange = (threadId: string | null) => {
    setCurrentThreadId(threadId);
    // Check if this thread has a commercial offer
    if (threadId) {
      setHasOffer(hasCommercialOffer(threadId));
    } else {
      setHasOffer(false);
    }
  };

  // Handle opening commercial offer panel
  const handleOpenCommercialPanel = () => {
    if (currentThreadId) {
      setCommercialPanelOpen(true);
    }
  };

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
            onCommercialOfferUpdate={handleCommercialOfferUpdate}
            onThreadChange={handleThreadChange}
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
      hasCommercialOffer={hasOffer}
      onOpenCommercialPanel={handleOpenCommercialPanel}
    >
      {/* View Mode Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex space-x-8 px-6">
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
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </Layout>

    {/* Commercial Offer Panel */}
    <CommercialOfferPanel
      isOpen={commercialPanelOpen}
      onClose={() => setCommercialPanelOpen(false)}
      threadId={currentThreadId}
    />
    </>
  );
}

export default App;