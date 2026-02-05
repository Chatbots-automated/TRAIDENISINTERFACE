import React, { useState } from 'react';
import { X, Shield, Database } from 'lucide-react';
import type { AppUser } from '../types';
import LogsViewer from './LogsViewer';
import { colors } from '../lib/designSystem';

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
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
        style={{ border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border.light }}>
          <h2 className="text-xl font-semibold" style={{ color: colors.text.primary }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: colors.text.tertiary }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* User Info */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-3" style={{ color: colors.text.secondary }}>
              Account
            </h3>
            <div className="rounded-lg p-5 space-y-4" style={{ background: colors.bg.secondary, border: `1px solid ${colors.border.default}` }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: colors.text.secondary }}>Email</span>
                <span className="text-sm font-medium" style={{ color: colors.text.primary }}>{user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: colors.text.secondary }}>Display Name</span>
                <span className="text-sm font-medium" style={{ color: colors.text.primary }}>
                  {user.display_name || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: colors.text.secondary }}>Role</span>
                <span className="text-sm font-semibold" style={{ color: user.is_admin ? colors.interactive.accent : colors.text.primary }}>
                  {user.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Admin Section - Only show for admins */}
          {user.is_admin && (
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.text.secondary }}>
                Administration
              </h3>
              <div className="space-y-3">
                {/* Logs Option */}
                <button
                  onClick={() => setShowLogsViewer(true)}
                  className="w-full flex items-center justify-between p-5 rounded-lg transition-all group"
                  style={{ background: colors.bg.secondary, border: `1px solid ${colors.border.default}` }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
                  onMouseLeave={(e) => e.currentTarget.style.background = colors.bg.secondary}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.icon.default }}>
                      <Database className="w-5 h-5" style={{ color: colors.interactive.accent }} />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm" style={{ color: colors.text.primary }}>Logs</p>
                      <p className="text-sm" style={{ color: colors.text.secondary }}>View application logs and activity</p>
                    </div>
                  </div>
                  <Shield className="w-5 h-5" style={{ color: colors.text.tertiary }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
