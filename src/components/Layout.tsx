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
  PanelLeft,
  FlaskConical
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
          <div className={`flex items-center border-b border-black/5 ${sidebarCollapsed ? 'justify-center p-2' : 'justify-between p-4'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <img
                  src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj"
                  alt="Traidenis Logo"
                  className="w-8 h-8 object-contain rounded-macos flex-shrink-0 shadow-macos-sm"
                />
                <div>
                  <h1 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight">Traidenis</h1>
                  <p className="text-xs text-macos-gray-500">Knowledge Base</p>
                </div>
              </div>
            )}
            <div className="flex items-center">
              {/* Collapse Toggle Button - Desktop only */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex p-1.5 rounded-md hover:bg-black/5 transition-colors text-macos-gray-500"
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
                className="lg:hidden p-1.5 rounded-md hover:bg-black/5 transition-colors"
              >
                <X className="w-5 h-5 text-macos-gray-500" />
              </button>
            </div>
          </div>

          {/* Primary Navigation - Only Chat and Documents */}
          {isNewVersion && (
            <div className={`border-b border-black/5 py-3 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              <button
                onClick={() => onViewModeChange?.('chat')}
                className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'chat'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Chat' : undefined}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Chat</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('documents')}
                className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'documents'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Documents' : undefined}
              >
                <Database className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Documents</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('transcripts')}
                className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'transcripts'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Transcripts' : undefined}
              >
                <History className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Transcripts</span>}
              </button>

              <button
                onClick={() => onViewModeChange?.('nestandartiniai')}
                className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  sidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  viewMode === 'nestandartiniai'
                    ? 'bg-macos-blue/10 text-macos-blue'
                    : 'text-macos-gray-600 hover:bg-black/5'
                }`}
                title={sidebarCollapsed ? 'Nestandartiniai Projektai' : undefined}
              >
                <FlaskConical className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Nestandartiniai Projektai</span>}
              </button>
            </div>
          )}

          {/* Chat History - Hidden when in New Version mode */}
          {!isNewVersion && (
          <div className="flex-1 p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h2 className="text-sm font-semibold text-macos-gray-900 tracking-macos-tight">Chat History</h2>
              <button
                onClick={onCreateThread}
                disabled={creatingThread}
                className="p-1.5 macos-btn macos-btn-primary rounded-md disabled:opacity-50"
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
                    <div key={i} className="h-12 bg-macos-gray-100 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-4">
                  <MessageSquare className="w-8 h-8 text-macos-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-macos-gray-500">No chats yet</p>
                  <button
                    onClick={onCreateThread}
                    disabled={creatingThread}
                    className="text-xs text-macos-blue hover:text-macos-blue-hover mt-1"
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
                      p-2 rounded-md transition-all duration-150 cursor-pointer group text-left w-full
                      ${currentThread?.id === thread.id
                        ? 'bg-macos-blue/10 border-[0.5px] border-macos-blue/20'
                        : 'hover:bg-black/5'
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
                          className="flex-1 text-xs px-1.5 py-0.5 macos-input rounded-md"
                          autoFocus
                        />
                        <button
                          onClick={(e) => handleSaveEdit(thread.id, e)}
                          className="p-1 rounded-md hover:bg-macos-green/10 text-macos-green transition-all"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 rounded-md hover:bg-black/5 text-macos-gray-400 transition-all"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      /* View mode */
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-macos-gray-900 truncate">
                            {thread.title}
                          </p>
                          <p className="text-xs text-macos-gray-500">
                            {thread.message_count || 0} msgs · {new Date(thread.last_message_at || thread.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => handleStartEdit(thread, e)}
                            className="p-1 rounded-md hover:bg-macos-blue/10 text-macos-gray-400 hover:text-macos-blue transition-all"
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
                              className="p-1 rounded-md hover:bg-macos-red/10 text-macos-gray-400 hover:text-macos-red transition-all"
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
          <div className="border-t border-black/5 mt-auto">
            {/* Admin Section - Only visible to admins */}
            {user.is_admin && (
              <>
                {/* Admin Separator */}
                {!sidebarCollapsed && (
                  <div className="flex items-center px-4 py-2">
                    <div className="flex-1 border-t border-macos-gray-200" />
                    <span className="px-3 text-[10px] text-macos-gray-400 font-semibold uppercase tracking-wider">admin</span>
                    <div className="flex-1 border-t border-macos-gray-200" />
                  </div>
                )}

                {/* Admin Buttons */}
                <div className={`pb-2 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
                  {/* Settings */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150 ${
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
                    className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-all duration-150 ${
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
                    className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    } ${
                      viewMode === 'instrukcijos'
                        ? 'bg-macos-blue/10 text-macos-blue'
                        : 'text-macos-gray-600 hover:bg-black/5'
                    }`}
                    title={sidebarCollapsed ? 'Instrukcijos' : undefined}
                  >
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Instrukcijos</span>}
                  </button>

                  {/* Users */}
                  <button
                    onClick={() => onViewModeChange?.('users')}
                    className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                      sidebarCollapsed ? 'justify-center' : 'space-x-3'
                    } ${
                      viewMode === 'users'
                        ? 'bg-macos-blue/10 text-macos-blue'
                        : 'text-macos-gray-600 hover:bg-black/5'
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
                  <div className="absolute bottom-full left-0 right-0 mb-1 macos-animate-slide-up">
                    <div className="mx-3 bg-white/95 backdrop-blur-macos rounded-macos border-[0.5px] border-black/10 shadow-macos-lg py-1">
                      {/* Offers */}
                      {isNewVersion && (
                        <button
                          onClick={() => {
                            onOpenCommercialPanel?.();
                            setSettingsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-all relative ${
                            hasOffer
                              ? 'text-macos-blue hover:bg-macos-blue/10'
                              : 'text-macos-gray-400 hover:bg-black/5'
                          }`}
                          title={hasOffer ? 'View Commercial Offer' : 'No commercial offer available'}
                        >
                          <div className="flex items-center space-x-3">
                            <Database className="w-4 h-4" />
                            <span>Offers</span>
                          </div>
                          {showDocGlow && (
                            <span className="flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-macos-blue opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-macos-blue"></span>
                            </span>
                          )}
                        </button>
                      )}

                      {/* Divider */}
                      <div className="my-1 border-t border-black/5" />

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

                      {/* Nauja Toggle - Locked */}
                      {isNewVersion && (
                        <button
                          disabled
                          className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium bg-macos-purple/10 text-macos-purple opacity-50 cursor-not-allowed"
                          title="New version is active"
                        >
                          <span className="text-base">✨</span>
                          <span>Nauja</span>
                        </button>
                      )}

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
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 text-macos-gray-600 border-b border-black/5 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </div>
                  <ChevronUp className={`w-4 h-4 transition-transform duration-200 ${settingsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}

            {/* Collapsed non-admin buttons */}
            {!user.is_admin && sidebarCollapsed && (
              <div className="px-2 pb-2 space-y-0.5">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-full flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium text-macos-gray-600 hover:bg-black/5 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium text-macos-red hover:bg-macos-red/10 transition-colors"
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
                className={`w-full flex items-center py-2 text-sm font-medium text-macos-red hover:bg-macos-red/10 transition-colors border-t border-black/5 ${
                  sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-6'
                }`}
                title={sidebarCollapsed ? 'Sign Out' : undefined}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!sidebarCollapsed && <span>Sign Out</span>}
              </button>
            )}

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