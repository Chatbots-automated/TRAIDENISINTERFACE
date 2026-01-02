import React, { useState } from 'react';
import { X, Shield, Database } from 'lucide-react';
import type { AppUser } from '../types';
import LogsViewer from './LogsViewer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

export default function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
  const [showLogsViewer, setShowLogsViewer] = useState(false);

  if (!isOpen) return null;

  if (showLogsViewer) {
    return (
      <LogsViewer
        isOpen={showLogsViewer}
        onClose={() => setShowLogsViewer(false)}
        user={user}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="macos-animate-spring bg-white/95 backdrop-blur-macos rounded-macos-xl shadow-macos-window max-w-2xl w-full max-h-[90vh] overflow-hidden border-[0.5px] border-black/10">
        {/* Header with macOS window controls */}
        <div className="flex items-center justify-between p-5 border-b border-black/5">
          <div className="flex items-center space-x-3">
            {/* macOS Window Controls */}
            <div className="macos-window-controls p-0">
              <button onClick={onClose} className="macos-dot macos-dot-close hover:opacity-80 transition-opacity" />
              <div className="macos-dot macos-dot-minimize opacity-60" />
              <div className="macos-dot macos-dot-maximize opacity-60" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-macos-gray-900 tracking-macos-tight absolute left-1/2 transform -translate-x-1/2">Settings</h2>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* User Info */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-macos-gray-500 uppercase tracking-wider mb-3">
              Account
            </h3>
            <div className="bg-macos-gray-50 rounded-macos-lg p-4 space-y-3 border-[0.5px] border-black/5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-macos-gray-500">Email</span>
                <span className="text-sm font-medium text-macos-gray-900">{user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-macos-gray-500">Display Name</span>
                <span className="text-sm font-medium text-macos-gray-900">
                  {user.display_name || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-macos-gray-500">Role</span>
                <span className={`text-sm font-medium ${user.is_admin ? 'text-macos-purple' : 'text-macos-gray-900'}`}>
                  {user.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Admin Section - Only show for admins */}
          {user.is_admin && (
            <div>
              <h3 className="text-xs font-semibold text-macos-gray-500 uppercase tracking-wider mb-3">
                Administration
              </h3>
              <div className="space-y-2">
                {/* Logs Option */}
                <button
                  onClick={() => setShowLogsViewer(true)}
                  className="w-full flex items-center justify-between p-4 bg-macos-gray-50 hover:bg-macos-gray-100 rounded-macos-lg transition-all group border-[0.5px] border-black/5"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white rounded-macos shadow-macos-sm group-hover:shadow-macos transition-shadow">
                      <Database className="w-5 h-5 text-macos-blue" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-macos-gray-900">Logs</p>
                      <p className="text-sm text-macos-gray-500">View application logs and activity</p>
                    </div>
                  </div>
                  <Shield className="w-5 h-5 text-macos-gray-400 group-hover:text-macos-blue transition-colors" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
