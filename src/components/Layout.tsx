import React, { useState, useEffect, useRef } from 'react';
import { signOut } from '../lib/database';
import {
  Menu,
  X,
  Settings,
  Database,
  LogOut,
  Users,
  MessageSquare,
  Zap,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical
} from 'lucide-react';
import type { AppUser } from '../types';
import SettingsModal from './SettingsModal';
import WebhooksModal from './WebhooksModal';

interface LayoutProps {
  user: AppUser;
  children: React.ReactNode;
  naujokasMode?: boolean;
  onToggleNaujokas?: () => void;
  viewMode?: 'documents' | 'users' | 'instrukcijos' | 'nestandartiniai' | 'sdk';
  onViewModeChange?: (mode: 'documents' | 'users' | 'instrukcijos' | 'nestandartiniai' | 'sdk') => void;
  onSidebarCollapseChange?: (collapsed: boolean) => void;
  forceCollapsed?: boolean;
  sdkUnreadCount?: number;
}

export default function Layout({
  user,
  children,
  naujokasMode = true,
  onToggleNaujokas,
  viewMode = 'sdk',
  onViewModeChange,
  onSidebarCollapseChange,
  forceCollapsed,
  sdkUnreadCount = 0
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedRaw] = useState(() => {
    try { return localStorage.getItem('traidenis_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const setSidebarCollapsed = (val: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      try { localStorage.setItem('traidenis_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  // External control: force collapse when requested (e.g., artifact panel open)
  useEffect(() => {
    if (forceCollapsed !== undefined && forceCollapsed !== sidebarCollapsed) {
      setSidebarCollapsed(forceCollapsed);
    }
  }, [forceCollapsed]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);

  // Notify parent when sidebar collapse state changes
  useEffect(() => {
    onSidebarCollapseChange?.(sidebarCollapsed);
  }, [sidebarCollapsed, onSidebarCollapseChange]);

  // Click-outside to close settings dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target as Node)) {
        setSettingsDropdownOpen(false);
      }
    };

    if (settingsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [settingsDropdownOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-macos-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - macOS Glassmorphism */}
      <div className={`
        fixed inset-y-0 left-0 z-50 macos-sidebar transform transition-all duration-300 ease-out
        lg:translate-x-0 lg:static lg:inset-0 lg:h-screen
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${sidebarCollapsed ? 'w-16 sidebar-collapsed' : 'w-52'}
      `}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 flex-shrink-0">
                <img
                  src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj"
                  alt="Traidenis Logo"
                  className="w-8 h-8 object-contain rounded-macos shadow-macos-sm"
                />
              </div>
              <div className={`transition-opacity duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                <h1 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight whitespace-nowrap">Traidenis</h1>
                <p className="text-xs text-macos-gray-500 whitespace-nowrap">Knowledge Base</p>
              </div>
            </div>
            {/* Mobile close button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-md hover:bg-black/5 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-macos-gray-500" />
            </button>
          </div>

          {/* Primary Navigation */}
            <ul className="menu px-2 py-3">
              <li>
                <button
                  onClick={() => onViewModeChange?.('sdk')}
                  className={viewMode === 'sdk' ? 'active' : ''}
                  title={sidebarCollapsed ? 'SDK' : undefined}
                >
                  <div className="relative flex items-center justify-center w-4 flex-shrink-0">
                    <MessageSquare className="w-4 h-4" />
                    {sidebarCollapsed && sdkUnreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: '#f97316', color: 'white' }}>
                        {sdkUnreadCount > 9 ? '9+' : sdkUnreadCount}
                      </span>
                    )}
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <span className="whitespace-nowrap">SDK</span>
                      {sdkUnreadCount > 0 && (
                        <span className="ml-auto w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: '#f97316', color: 'white' }}>
                          {sdkUnreadCount > 9 ? '9+' : sdkUnreadCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onViewModeChange?.('documents')}
                  className={viewMode === 'documents' ? 'active' : ''}
                  title={sidebarCollapsed ? 'Documents' : undefined}
                >
                  <Database className="w-4 h-4" />
                  {!sidebarCollapsed && <span className="whitespace-nowrap">Documents</span>}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onViewModeChange?.('nestandartiniai')}
                  className={viewMode === 'nestandartiniai' ? 'active' : ''}
                  title={sidebarCollapsed ? 'Nestandartiniai Projektai' : undefined}
                >
                  <FlaskConical className="w-4 h-4" />
                  {!sidebarCollapsed && <span className="truncate">Nestandartiniai Projektai</span>}
                </button>
              </li>
            </ul>

          {/* Spacer to push footer to bottom */}
          <div className="flex-1" />

          {/* Footer - Absolute Bottom */}
          <div className="mt-auto">
            {/* Admin Section - Only visible to admins */}
            {user.is_admin && (
              <ul className="menu px-2 pb-2">
                {!sidebarCollapsed && (
                  <li className="menu-title text-[10px] uppercase tracking-wider">Admin</li>
                )}
                <li>
                  <button
                    onClick={() => setWebhooksOpen(true)}
                    title={sidebarCollapsed ? 'Webhooks' : undefined}
                  >
                    <Zap className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Webhooks</span>}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onViewModeChange?.('instrukcijos')}
                    className={viewMode === 'instrukcijos' ? 'active' : ''}
                    title={sidebarCollapsed ? 'Instrukcijos' : undefined}
                  >
                    <BookOpen className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Instrukcijos</span>}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onViewModeChange?.('users')}
                    className={viewMode === 'users' ? 'active' : ''}
                    title={sidebarCollapsed ? 'Users' : undefined}
                  >
                    <Users className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Users</span>}
                  </button>
                </li>
              </ul>
            )}

            {/* Settings & Collapse - unified structure for both states */}
            <div className="relative" ref={settingsDropdownRef}>
              {/* Dropup Menu - only in expanded state */}
              {!sidebarCollapsed && settingsDropdownOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 macos-animate-slide-up">
                  <ul className="menu mx-2 bg-white/95 backdrop-blur-macos rounded-macos border-[0.5px] border-black/10 shadow-macos-lg py-1">
                    {!user.is_admin && (
                      <>
                        <li>
                          <div
                            onClick={() => onToggleNaujokas?.()}
                            className="flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">🎓</span>
                              <span>Naujokas</span>
                            </div>
                            <div
                              className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                                naujokasMode ? 'bg-macos-green' : 'bg-macos-gray-200'
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-macos-sm transition-transform duration-200 ${
                                  naujokasMode ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </div>
                          </div>
                        </li>
                        <li className="divider my-1"></li>
                      </>
                    )}
                    <li>
                      <button onClick={() => { setSettingsOpen(true); setSettingsDropdownOpen(false); }}>
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => { handleSignOut(); setSettingsDropdownOpen(false); }}
                        className="text-error hover:bg-error/10"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {/* Bottom controls - same DOM structure in both states */}
              <ul className="menu px-2 pb-1">
                <li>
                  <button
                    onClick={() => sidebarCollapsed ? setSettingsOpen(true) : setSettingsDropdownOpen(!settingsDropdownOpen)}
                    title={sidebarCollapsed ? 'Settings' : undefined}
                  >
                    <Settings className="w-4 h-4" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Settings</span>}
                  </button>
                </li>
                <li className="hidden lg:flex">
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                  </button>
                </li>
              </ul>
            </div>

            {/* User Info - Absolute Bottom */}
            <div className="py-3 bg-macos-gray-50/50 px-3">
              <div className="flex items-center justify-center space-x-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-macos-blue to-macos-purple rounded-full flex items-center justify-center flex-shrink-0 shadow-macos-sm">
                  <span className="text-white text-sm font-medium">
                    {user.display_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                {!sidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-macos-gray-900 truncate">
                      {user.display_name || user.email}
                    </p>
                    <p className="text-xs text-macos-gray-500 truncate">{user.email}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
      />

      {/* Webhooks Modal - Admin Only */}
      <WebhooksModal
        isOpen={webhooksOpen}
        onClose={() => setWebhooksOpen(false)}
        user={user}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile menu button - only visible on mobile */}
        <div className="lg:hidden bg-white/80 backdrop-blur-macos border-b border-black/5 px-4 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-black/5 transition-colors"
          >
            <Menu className="w-5 h-5 text-macos-gray-600" />
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}