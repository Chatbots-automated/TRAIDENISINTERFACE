import React, { useState, useEffect, useRef } from 'react';
import { signOut } from '../lib/supabase';
import {
  Menu,
  X,
  Settings,
  MessageSquare,
  Database,
  LogOut,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Check,
  ChevronUp,
  Users,
  History,
  Zap,
  BookOpen,
  PanelLeftClose,
  PanelLeft
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
  // New version mode props
  isNewVersion?: boolean;
  viewMode?: 'chat' | 'documents' | 'users' | 'transcripts' | 'instrukcijos';
  onViewModeChange?: (mode: 'chat' | 'documents' | 'users' | 'transcripts' | 'instrukcijos') => void;
  onToggleNewVersion?: () => void;
  hasOffer?: boolean;
  showDocGlow?: boolean;
  onOpenCommercialPanel?: () => void;
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
  isNewVersion = false,
  viewMode = 'chat',
  onViewModeChange,
  onToggleNewVersion,
  hasOffer = false,
  showDocGlow = false,
  onOpenCommercialPanel
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const settingsDropdownRef = useRef<HTMLDivElement>(null);

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
    <div className="h-screen overflow-hidden bg-vf-background flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 vf-sidebar transform transition-all duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0 lg:h-screen
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
      `}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className={`flex items-center border-b border-vf-border ${sidebarCollapsed ? 'justify-center p-2' : 'justify-between p-4'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <img
                  src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj"
                  alt="Traidenis Logo"
                  className="w-8 h-8 object-contain rounded-lg flex-shrink-0"
                />
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Traidenis</h1>
                  <p className="text-xs text-vf-secondary">Knowledge Base</p>
                </div>
              </div>
            )}
            <div className="flex items-center">
              {/* Collapse Toggle Button - Desktop only */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-vf-secondary"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <PanelLeft className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
              {/* Mobile close button */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="w-5 h-5 text-vf-secondary" />
              </button>
            </div>
          </div>

          {/* Primary Navigation - Only Chat and Documents */}
          {isNewVersion && (
            <div className={`border-b border-vf-border py-3 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              <button
                onClick={() => onViewModeChange?.('chat')}
                className={`w-full flex items-center px-3 py-2.5 rounded-vf text-sm font-medium transition-all ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'chat'
                    ? 'bg-vf-primary text-white shadow-vf-sm'
                    : 'text-vf-secondary hover:bg-gray-50'
                }`}
                title={sidebarCollapsed ? 'Chat' : undefined}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Chat</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('documents')}
                className={`w-full flex items-center px-3 py-2.5 rounded-vf text-sm font-medium transition-all ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'documents'
                    ? 'bg-vf-primary text-white shadow-vf-sm'
                    : 'text-vf-secondary hover:bg-gray-50'
                }`}
                title={sidebarCollapsed ? 'Documents' : undefined}
              >
                <Database className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Documents</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('transcripts')}
                className={`w-full flex items-center px-3 py-2.5 rounded-vf text-sm font-medium transition-all ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'transcripts'
                    ? 'bg-vf-primary text-white shadow-vf-sm'
                    : 'text-vf-secondary hover:bg-gray-50'
                }`}
                title={sidebarCollapsed ? 'Transcripts' : undefined}
              >
                <History className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Transcripts</span>}
              </button>
            </div>
          )}

          {/* Chat History - Hidden when in New Version mode */}
          {!isNewVersion && (
          <div className="flex-1 p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h2 className="text-sm font-semibold text-green-700">Chat History</h2>
              <button
                onClick={onCreateThread}
                disabled={creatingThread}
                className="p-1.5 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50"
                title="New chat"
              >
                {creatingThread ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Threads List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {threadsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-4">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No chats yet</p>
                  <button
                    onClick={onCreateThread}
                    disabled={creatingThread}
                    className="text-xs text-green-600 hover:text-green-700 mt-1"
                  >
                    Start a chat
                  </button>
                </div>
              ) : (
                threads.map((thread) => (
                  <div
                    key={thread.id}
                    onClick={() => editingThreadId !== thread.id && onSelectThread?.(thread)}
                    className={`
                      p-2 rounded-lg transition-colors cursor-pointer group text-left w-full
                      ${currentThread?.id === thread.id
                        ? 'bg-gradient-to-r from-green-50 to-blue-50 border border-green-200'
                        : 'hover:bg-gray-50'
                      }
                    `}
                  >
                    {editingThreadId === thread.id ? (
                      /* Edit mode */
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(thread.id, e as unknown as React.MouseEvent);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit(e as unknown as React.MouseEvent);
                            }
                          }}
                          className="flex-1 text-xs px-1.5 py-0.5 border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                          autoFocus
                        />
                        <button
                          onClick={(e) => handleSaveEdit(thread.id, e)}
                          className="p-1 rounded hover:bg-green-100 text-green-600 transition-all"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-all"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      /* View mode */
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {thread.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {thread.message_count || 0} msgs · {new Date(thread.last_message_at || thread.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => handleStartEdit(thread, e)}
                            className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-all"
                            title="Rename chat"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {/* Delete button - admin only */}
                          {user.is_admin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteThread?.(thread.id);
                              }}
                              className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                              title="Delete chat"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          )}

          {/* Spacer to push footer to bottom */}
          <div className="flex-1" />

          {/* Footer - Absolute Bottom */}
          <div className="border-t border-vf-border mt-auto">
            {/* Admin Section - Only visible to admins */}
            {user.is_admin && (
              <>
                {/* Admin Separator */}
                {!sidebarCollapsed && (
                  <div className="flex items-center px-4 py-2">
                    <div className="flex-1 border-t border-gray-300" />
                    <span className="px-3 text-xs text-gray-400 font-medium uppercase tracking-wider">admin</span>
                    <div className="flex-1 border-t border-gray-300" />
                  </div>
                )}

                {/* Admin Buttons */}
                <div className={`pb-2 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
                  {/* Settings */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-vf-secondary hover:bg-gray-50 transition-colors ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    }`}
                    title={sidebarCollapsed ? 'Settings' : undefined}
                  >
                    <Settings className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Settings</span>}
                  </button>

                  {/* Webhooks */}
                  <button
                    onClick={() => setWebhooksOpen(true)}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-vf-secondary hover:bg-gray-50 transition-colors ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    }`}
                    title={sidebarCollapsed ? 'Webhooks' : undefined}
                  >
                    <Zap className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Webhooks</span>}
                  </button>

                  {/* Instrukcijos */}
                  <button
                    onClick={() => onViewModeChange?.('instrukcijos')}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    } ${
                      viewMode === 'instrukcijos'
                        ? 'bg-vf-primary text-white'
                        : 'text-vf-secondary hover:bg-gray-50'
                    }`}
                    title={sidebarCollapsed ? 'Instrukcijos' : undefined}
                  >
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Instrukcijos</span>}
                  </button>

                  {/* Users */}
                  <button
                    onClick={() => onViewModeChange?.('users')}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    } ${
                      viewMode === 'users'
                        ? 'bg-vf-primary text-white'
                        : 'text-vf-secondary hover:bg-gray-50'
                    }`}
                    title={sidebarCollapsed ? 'Users' : undefined}
                  >
                    <Users className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Users</span>}
                  </button>
                </div>
              </>
            )}

            {/* Settings Dropdown Button - Only for non-admins */}
            {!user.is_admin && !sidebarCollapsed && (
              <div className="relative" ref={settingsDropdownRef}>
                {/* Dropup Menu */}
                {settingsDropdownOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 animate-slide-in-bottom">
                    <div className="mx-3 bg-white rounded-vf border border-vf-border shadow-vf-lg py-1">
                      {/* Offers */}
                      {isNewVersion && (
                        <button
                          onClick={() => {
                            onOpenCommercialPanel?.();
                            setSettingsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all relative ${
                            hasOffer
                              ? 'text-vf-primary hover:bg-blue-50'
                              : 'text-gray-400 hover:bg-gray-50'
                          }`}
                          title={hasOffer ? 'View Commercial Offer' : 'No commercial offer available'}
                        >
                          <div className="flex items-center space-x-3">
                            <Database className="w-4 h-4" />
                            <span>Offers</span>
                          </div>
                          {showDocGlow && (
                            <span className="flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-vf-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-vf-primary"></span>
                            </span>
                          )}
                        </button>
                      )}

                      {/* Divider */}
                      <div className="my-1 border-t border-vf-border" />

                      {/* Naujokas Mode Toggle */}
                      <div
                        onClick={() => {
                          onToggleNaujokas?.();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-base">🎓</span>
                          <span className="text-sm font-medium text-vf-secondary">Naujokas</span>
                        </div>
                        <div
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            naujokasMode ? 'bg-vf-primary' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              naujokasMode ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Nauja Toggle - Locked */}
                      {isNewVersion && (
                        <button
                          disabled
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium bg-purple-50 text-purple-600 opacity-50 cursor-not-allowed"
                          title="New version is active"
                        >
                          <span className="text-base">✨</span>
                          <span>Nauja</span>
                        </button>
                      )}

                      {/* Divider */}
                      <div className="my-1 border-t border-vf-border" />

                      {/* Settings Modal */}
                      <button
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium text-vf-secondary hover:bg-gray-50 transition-colors"
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
                        className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-vf-secondary border-b border-vf-border transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </div>
                  <ChevronUp className={`w-4 h-4 transition-transform ${settingsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}

            {/* Collapsed non-admin buttons */}
            {!user.is_admin && sidebarCollapsed && (
              <div className="px-2 pb-2 space-y-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-vf-secondary hover:bg-gray-50 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Sign Out Button - For admins (since they don't have the dropdown) */}
            {user.is_admin && (
              <button
                onClick={handleSignOut}
                className={`w-full flex items-center py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-t border-vf-border ${
                  sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-6'
                }`}
                title={sidebarCollapsed ? 'Sign Out' : undefined}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Sign Out</span>}
              </button>
            )}

            {/* User Info - Absolute Bottom */}
            <div className={`py-3 bg-gray-50 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
              <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
                <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">
                    {user.display_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                {!sidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.display_name || user.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
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
        <div className="lg:hidden bg-white/80 backdrop-blur-sm border-b border-green-100 px-4 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
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