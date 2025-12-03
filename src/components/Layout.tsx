import React, { useState } from 'react';
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
  Check
} from 'lucide-react';
import type { AppUser } from '../types';
import SettingsModal from './SettingsModal';

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
  viewMode?: 'chat' | 'documents' | 'users';
  onViewModeChange?: (mode: 'chat' | 'documents' | 'users') => void;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

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
    <div className="h-screen overflow-hidden bg-gradient-to-br from-green-50 via-blue-50 to-teal-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0 lg:h-screen
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-3">
              <img 
                src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj" 
                alt="Traidenis Logo" 
                className="w-8 h-8 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Traidenis</h1>
                <p className="text-xs text-green-600 font-medium">Knowledge Base</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User info */}
          <div className="p-4 border-b bg-gradient-to-r from-green-50 to-blue-50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.display_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.display_name || user.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation buttons when in New Version mode */}
          {isNewVersion && (
            <div className="border-b border-gray-200">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => onViewModeChange?.('chat')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'chat'
                      ? 'bg-gradient-to-r from-green-50 to-blue-50 text-green-700 border border-green-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Chat</span>
                </button>

                <button
                  onClick={() => onViewModeChange?.('documents')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'documents'
                      ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>Documents</span>
                </button>

                {user.is_admin && (
                  <button
                    onClick={() => onViewModeChange?.('users')}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'users'
                        ? 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-200'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    <span>Users</span>
                  </button>
                )}
              </div>

              {/* Controls section */}
              <div className="p-2 border-t border-gray-100 space-y-1">
                {/* Nauja Toggle */}
                <button
                  onClick={onToggleNewVersion}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isNewVersion
                      ? 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-base">✨</span>
                  <span>Nauja</span>
                </button>

                {/* Docs Icon */}
                <button
                  onClick={onOpenCommercialPanel}
                  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                    hasOffer
                      ? 'bg-gradient-to-r from-green-100 to-blue-100 text-blue-700'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  } ${
                    showDocGlow
                      ? 'animate-pulse ring-2 ring-purple-400 ring-offset-1'
                      : ''
                  }`}
                  title={hasOffer ? 'View Commercial Offer' : 'No commercial offer available'}
                >
                  <Database className="w-4 h-4" />
                  <span>Offers</span>
                  {showDocGlow && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Chat History */}
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

          {/* Footer */}
          <div className="p-4 border-t">
            <div className="space-y-1">
              {/* Naujokas Mode Toggle */}
              <div
                onClick={onToggleNaujokas}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-gray-700 cursor-pointer transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-base">🎓</span>
                  <span className="text-sm">Naujokas</span>
                </div>
                {/* Toggle Switch */}
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    naujokasMode ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      naujokasMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 text-gray-700"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Settings</span>
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center space-x-3 p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </button>
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