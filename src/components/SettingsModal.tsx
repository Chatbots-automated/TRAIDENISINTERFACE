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
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ background: 'rgba(36,35,34,0.18)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white max-w-2xl w-full max-h-[90vh] overflow-hidden border"
        style={{ borderColor: 'var(--app-border)', borderRadius: '18px', boxShadow: '0 18px 54px rgba(36,35,34,0.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <h2 className="text-sm font-semibold text-base-content">
            Nustatymai
          </h2>
          <button
            onClick={onClose}
            className="app-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* User Info */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-base-content/45">
              Paskyra
            </h3>
            <div className="sdk-data-card p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/55">El. paštas</span>
                <span className="text-sm font-medium text-base-content">{user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/55">Rodomas vardas</span>
                <span className="text-sm font-medium text-base-content">
                  {user.display_name || 'Nenustatytas'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/55">Rolė</span>
                <span className={`text-sm font-semibold ${user.is_admin ? 'text-primary' : 'text-base-content'}`}>
                  {user.is_admin ? 'Administratorius' : 'Naudotojas'}
                </span>
              </div>
            </div>
          </div>

          {/* Admin Section - Only show for admins */}
          {user.is_admin && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-base-content/45">
                Administravimas
              </h3>
              <div className="space-y-3">
                {/* Logs Option */}
                <button
                  onClick={() => setShowLogsViewer(true)}
                  className="w-full flex items-center justify-between p-4 rounded-lg transition-all group border border-base-content/10 bg-base-content/[0.025] hover:bg-base-content/[0.04]"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10">
                      <Database className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm text-base-content">Žurnalai</p>
                      <p className="text-sm text-base-content/50">Peržiūrėti programos žurnalus ir veiklą</p>
                    </div>
                  </div>
                  <Shield className="w-5 h-5 text-base-content/25" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
