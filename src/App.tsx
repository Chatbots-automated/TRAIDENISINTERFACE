import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, getOrCreateDefaultProject } from './lib/database';
import Layout from './components/Layout';
import DocumentsInterface from './components/DocumentsInterface';
import AdminUsersInterface from './components/AdminUsersInterface';
import InstructionsInterface from './components/InstructionsInterface';
import NestandardiniaiInterface from './components/NestandardiniaiInterface';
import SDKInterface from './components/SDKInterfaceNew';
import AuthForm from './components/AuthForm';
import type { AppUser } from './types';

type ViewMode = 'documents' | 'users' | 'instrukcijos' | 'nestandartiniai' | 'sdk';

// localStorage keys for persistence
const STORAGE_KEYS = {
  NAUJOKAS_MODE: 'traidenis_naujokas_mode',
};

// Map routes to view modes
const routeToViewMode: Record<string, ViewMode> = {
  '/': 'sdk',
  '/documents': 'documents',
  '/users': 'users',
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

  // Derive viewMode from current route (/sdk/anything → 'sdk')
  const viewMode: ViewMode = location.pathname.startsWith('/sdk')
    ? 'sdk'
    : routeToViewMode[location.pathname] || 'sdk';

  // Naujokas (newbie) mode - shows helpful tooltips and guides
  const [naujokasMode, setNaujokasMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NAUJOKAS_MODE);
    // Default to true for new users (no saved preference)
    return saved === null ? true : saved === 'true';
  });

  // Main sidebar collapse state (for SDK interface positioning)
  const [mainSidebarCollapsed, setMainSidebarCollapsed] = useState(false);
  // Force-collapse main sidebar (e.g., when artifact panel opens)
  const [forceMainSidebarCollapsed, setForceMainSidebarCollapsed] = useState<boolean | undefined>(undefined);

  // SDK unread shared conversations count (for main sidebar badge)
  const [sdkUnreadCount, setSdkUnreadCount] = useState(0);

  useEffect(() => {
    checkUser();
  }, []);

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

  // Handle view mode change (navigation)
  const handleViewModeChange = (newViewMode: ViewMode) => {
    // Special case for SDK - navigate to /sdk explicitly
    if (newViewMode === 'sdk') {
      navigate('/sdk');
      return;
    }

    const route = Object.keys(routeToViewMode).find(
      key => routeToViewMode[key] === newViewMode
    );
    if (route && route !== '/') {
      navigate(route);
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
      naujokasMode={naujokasMode}
      onToggleNaujokas={toggleNaujokasMode}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      onSidebarCollapseChange={setMainSidebarCollapsed}
      forceCollapsed={forceMainSidebarCollapsed}
      sdkUnreadCount={sdkUnreadCount}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/sdk" replace />} />
        <Route
          path="/documents"
          element={<DocumentsInterface user={user} projectId={projectId} />}
        />
        <Route
          path="/users"
          element={<AdminUsersInterface user={user} />}
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
          path="/sdk/:conversationId?"
          element={<SDKInterface user={user} projectId={projectId} mainSidebarCollapsed={mainSidebarCollapsed} onUnreadCountChange={setSdkUnreadCount} onRequestMainSidebarCollapse={setForceMainSidebarCollapsed} />}
        />
        {/* Catch-all redirect to sdk */}
        <Route path="*" element={<Navigate to="/sdk" replace />} />
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
