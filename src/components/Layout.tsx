import React, { useState } from 'react';
import { signOut } from '../lib/supabase';
import {
  Menu,
  X,
  Settings,
  MessageSquare,
  FileText,
  Database,
  LogOut,
  Plus,
  Trash2,
  Loader2
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
  hasCommercialOffer?: boolean;
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
  hasCommercialOffer = false,
  onOpenCommercialPanel
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-teal-50 flex">
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
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
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

          {/* Chat History */}
          <div className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
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
            <div className="flex-1 overflow-y-auto space-y-1">
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
                    onClick={() => onSelectThread?.(thread)}
                    className={`
                      p-2 rounded-lg transition-colors cursor-pointer group text-left w-full
                      ${currentThread?.id === thread.id
                        ? 'bg-gradient-to-r from-green-50 to-blue-50 border border-green-200'
                        : 'hover:bg-gray-50'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {thread.title}
                        </p>
                        <p className="text-xs text-gray-400">
                          {thread.message_count || 0} msgs · {new Date(thread.last_message_at || thread.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {/* Delete button - admin only */}
                      {user.is_admin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteThread?.(thread.id);
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            <div className="space-y-1">
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
        {/* Top bar */}
        <div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-green-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-100"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div>
                <img 
                  src="https://yt3.googleusercontent.com/ytc/AIdro_lQ6KhO739Y9QuJQJu3pJ5sSNHHCwPuL_q0SZIn3i5x6g=s900-c-k-c0x00ffffff-no-rj" 
                  alt="Traidenis Logo" 
                  className="w-6 h-6 object-contain lg:hidden"
                />
                  <h1 className="text-lg font-semibold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                    Traidenis Knowledge Base
                </h1>
                  <p className="text-sm text-green-600">
                  Chat with AI and manage documents
                </p>
              </div>
              </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg p-1">
                <button className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all text-green-600">
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenCommercialPanel}
                  className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all ${
                    hasCommercialOffer
                      ? 'text-blue-600'
                      : 'text-gray-400'
                  }`}
                  title={hasCommercialOffer ? 'View Commercial Offer' : 'No commercial offer available'}
                >
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}