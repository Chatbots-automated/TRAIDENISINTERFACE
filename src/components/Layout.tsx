import React, { useState, useEffect, useRef } from 'react';
import { signOut } from '../lib/supabase';
import {
  Menu,
  X,
  Settings,
  MessageSquare,
  MessagesSquare,
  Database,
  LogOut,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Check,
  Users,
  History,
  Zap,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Bot
} from 'lucide-react';
import type { AppUser } from '../types';
import SettingsModal from './SettingsModal';
import WebhooksModal from './WebhooksModal';

interface Thread {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

interface LayoutProps {
  user: AppUser;
  children: React.ReactNode;
  threads?: Thread[];
  currentThread?: Thread | null;
  threadsLoading?: boolean;
  creatingThread?: boolean;
  onSelectThread?: (thread: Thread) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (threadId: string) => void;
  onRenameThread?: (threadId: string, newTitle: string) => void;
  naujokasMode?: boolean;
  onToggleNaujokas?: () => void;
  viewMode?: 'chat' | 'documents' | 'users' | 'transcripts' | 'instrukcijos' | 'nestandartiniai' | 'sdk';
  onViewModeChange?: (mode: 'chat' | 'documents' | 'users' | 'transcripts' | 'instrukcijos' | 'nestandartiniai' | 'sdk') => void;
  onSidebarCollapseChange?: (collapsed: boolean) => void;
}

export default function Layout({
  user,
  children,
  threads = [],
  currentThread = null,
  threadsLoading = false,
  creatingThread = false,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onRenameThread,
  naujokasMode = true,
  onToggleNaujokas,
  viewMode = 'chat',
  onViewModeChange,
  onSidebarCollapseChange
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
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

  const handleStartEdit = (thread: Thread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const handleSaveEdit = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingTitle.trim() && onRenameThread) {
      onRenameThread(threadId, editingTitle.trim());
    }
    setEditingThreadId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(null);
    setEditingTitle('');
  };

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
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
      `}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className={`flex items-center justify-between p-4`}>
            <div className="flex items-center space-x-3 min-w-0">
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

          {/* Primary Navigation - Only Chat and Documents */}
            <div className={`py-3 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              <button
                onClick={() => onViewModeChange?.('chat')}
                className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                } ${
                  viewMode === 'chat'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Chat' : undefined}
              >
                <div className="flex items-center justify-center w-4 flex-shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Chat</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('documents')}
                className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                } ${
                  viewMode === 'documents'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Documents' : undefined}
              >
                <div className="flex items-center justify-center w-4 flex-shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Documents</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('transcripts')}
                className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                } ${
                  viewMode === 'transcripts'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Transcripts' : undefined}
              >
                <div className="flex items-center justify-center w-4 flex-shrink-0">
                  <History className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Transcripts</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('nestandartiniai')}
                className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                } ${
                  viewMode === 'nestandartiniai'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Nestandartiniai Projektai' : undefined}
              >
                <div className="flex items-center justify-center w-4 flex-shrink-0">
                  <FlaskConical className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Nestandartiniai Projektai</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('sdk')}
                className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                } ${
                  viewMode === 'sdk'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'SDK' : undefined}
              >
                <div className="flex items-center justify-center w-4 flex-shrink-0">
                  <MessagesSquare className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">SDK</span>}
              </button>
            </div>

          {/* Spacer to push footer to bottom */}
          <div className="flex-1" />

          {/* Footer - Absolute Bottom */}
          <div className="border-t border-black/5 mt-auto">
            {/* Admin Section - Only visible to admins */}
            {user.is_admin && (
              <>
                {/* Admin Separator */}
                <div className="flex items-center px-4 py-2">
                  {!sidebarCollapsed && (
                    <>
                      <div className="flex-1 border-t border-macos-gray-200" />
                      <span className="px-3 text-[10px] text-macos-gray-400 font-semibold uppercase tracking-wider">admin</span>
                      <div className="flex-1 border-t border-macos-gray-200" />
                    </>
                  )}
                </div>

                {/* Admin Buttons */}
                <div className={`pb-2 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
                  {/* Settings */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className={`w-full flex items-center rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                    }`}
                    title={sidebarCollapsed ? 'Settings' : undefined}
                  >
                    <div className="flex items-center justify-center w-4 flex-shrink-0">
                      <Settings className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Settings</span>}
                  </button>

                  {/* Webhooks */}
                  <button
                    onClick={() => setWebhooksOpen(true)}
                    className={`w-full flex items-center rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                    }`}
                    title={sidebarCollapsed ? 'Webhooks' : undefined}
                  >
                    <div className="flex items-center justify-center w-4 flex-shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Webhooks</span>}
                  </button>

                  {/* Instrukcijos */}
                  <button
                    onClick={() => onViewModeChange?.('instrukcijos')}
                    className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                    } ${
                      viewMode === 'instrukcijos'
                        ? 'bg-macos-blue/10 text-macos-blue'
                        : 'text-macos-gray-600 hover:bg-black/5'
                    }`}
                    title={sidebarCollapsed ? 'Instrukcijos' : undefined}
                  >
                    <div className="flex items-center justify-center w-4 flex-shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Instrukcijos</span>}
                  </button>

                  {/* Users */}
                  <button
                    onClick={() => onViewModeChange?.('users')}
                    className={`w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center px-3 py-2' : 'px-3 py-2'
                    } ${
                      viewMode === 'users'
                        ? 'bg-macos-blue/10 text-macos-blue'
                        : 'text-macos-gray-600 hover:bg-black/5'
                    }`}
                    title={sidebarCollapsed ? 'Users' : undefined}
                  >
                    <div className="flex items-center justify-center w-4 flex-shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="ml-3 whitespace-nowrap">Users</span>}
                  </button>
                </div>
              </>
            )}

            {/* Admin Settings Dropdown - collapsed state */}
            {user.is_admin && !sidebarCollapsed && (
              <div className="relative" ref={settingsDropdownRef}>
                {/* Dropup Menu */}
                {settingsDropdownOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 macos-animate-slide-up">
                    <div className="mx-3 bg-white/95 backdrop-blur-macos rounded-macos border-[0.5px] border-black/10 shadow-macos-lg py-1">
                      {/* Settings Modal */}
                      <button
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>

                      {/* Sign Out */}
                      <button
                        onClick={() => {
                          handleSignOut();
                          setSettingsDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-macos-red hover:bg-macos-red/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Settings Button */}
                <button
                  onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
                  className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150"
                >
                  <div className="flex items-center justify-center w-4 flex-shrink-0">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span className="ml-3 whitespace-nowrap">Settings</span>
                </button>
              </div>
            )}

            {/* Settings Dropdown Button - Only for non-admins */}
            {!user.is_admin && !sidebarCollapsed && (
              <div className="relative" ref={settingsDropdownRef}>
                {/* Dropup Menu */}
                {settingsDropdownOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 macos-animate-slide-up">
                    <div className="mx-3 bg-white/95 backdrop-blur-macos rounded-macos border-[0.5px] border-black/10 shadow-macos-lg py-1">

                      {/* Naujokas Mode Toggle */}
                      <div
                        onClick={() => {
                          onToggleNaujokas?.();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-black/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-base">🎓</span>
                          <span className="text-sm font-medium text-macos-gray-600">Naujokas</span>
                        </div>
                        <div
                          className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                            naujokasMode ? 'bg-macos-green' : 'bg-macos-gray-200'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-macos-sm transition-transform duration-200 ${
                              naujokasMode ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="my-1 border-t border-black/5" />

                      {/* Settings Modal */}
                      <button
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>

                      {/* Sign Out */}
                      <button
                        onClick={() => {
                          handleSignOut();
                          setSettingsDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-macos-red hover:bg-macos-red/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Settings Button */}
                <button
                  onClick={() => setSettingsDropdownOpen(!settingsDropdownOpen)}
                  className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150"
                >
                  <div className="flex items-center justify-center w-4 flex-shrink-0">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span className="ml-3 whitespace-nowrap">Settings</span>
                </button>
              </div>
            )}

            {/* Collapsed settings button - for all users */}
            {sidebarCollapsed && (
              <div className="px-2 pb-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-full flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Collapse Toggle Button - At bottom for all users */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`w-full hidden lg:flex items-center py-3 text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-300 ${
                sidebarCollapsed ? 'justify-center' : 'justify-end pr-6'
              }`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <ChevronsLeft className="w-4 h-4" />
              )}
            </button>

            {/* User Info - Absolute Bottom */}
            <div className={`py-3 bg-macos-gray-50/50 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
              <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
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