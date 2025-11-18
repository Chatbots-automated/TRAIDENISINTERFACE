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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* User Info */}
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
              Account
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Email</span>
                <span className="text-sm font-medium text-gray-900">{user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Display Name</span>
                <span className="text-sm font-medium text-gray-900">
                  {user.display_name || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Role</span>
                <span className="text-sm font-medium text-gray-900">
                  {user.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Admin Section - Only show for admins */}
          {user.is_admin && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Administration
              </h3>
              <div className="space-y-3">
                {/* Logs Option */}
                <button
                  onClick={() => setShowLogsViewer(true)}
                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-blue-50 hover:from-green-100 hover:to-blue-100 rounded-xl transition-all group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm group-hover:shadow transition-shadow">
                      <Database className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Logs</p>
                      <p className="text-sm text-gray-600">View application logs and activity</p>
                    </div>
                  </div>
                  <Shield className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
