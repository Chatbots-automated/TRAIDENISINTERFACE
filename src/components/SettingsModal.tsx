import React, { useEffect, useState } from 'react';
import { X, Shield, Database, Save, Loader2 } from 'lucide-react';
import type { AppUser } from '../types';
import LogsViewer from './LogsViewer';
import { DEFAULT_CLAUDE_MODEL, getClaudeModel, saveClaudeModel } from '../lib/modelSettingsService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

export default function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
  const [showLogsViewer, setShowLogsViewer] = useState(false);
  const [claudeModel, setClaudeModel] = useState(DEFAULT_CLAUDE_MODEL);
  const [savedClaudeModel, setSavedClaudeModel] = useState(DEFAULT_CLAUDE_MODEL);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setModelLoading(true);
    setModelError(null);
    setModelMessage(null);

    getClaudeModel()
      .then((model) => {
        if (cancelled) return;
        setClaudeModel(model);
        setSavedClaudeModel(model);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load Claude model setting:', error);
        setClaudeModel(DEFAULT_CLAUDE_MODEL);
        setSavedClaudeModel(DEFAULT_CLAUDE_MODEL);
        setModelError('Nepavyko įkelti modelio nustatymo. Rodomas numatytasis modelis.');
      })
      .finally(() => {
        if (!cancelled) setModelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSaveModel = async () => {
    setModelSaving(true);
    setModelError(null);
    setModelMessage(null);

    const result = await saveClaudeModel(claudeModel, user);
    if (result.success) {
      const normalized = claudeModel.trim() || DEFAULT_CLAUDE_MODEL;
      setClaudeModel(normalized);
      setSavedClaudeModel(normalized);
      setModelMessage('Modelis išsaugotas');
    } else {
      setModelError(result.error || 'Nepavyko išsaugoti modelio');
    }

    setModelSaving(false);
  };

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

          {/* LLM Settings */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-base-content/45">
              DI modelis
            </h3>
            <div className="sdk-data-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-base-content">LLM</p>
                  <p className="text-xs text-base-content/50">
                    Šiuo metu naudojamas: <span className="font-mono text-base-content/70">{savedClaudeModel}</span>
                  </p>
                </div>
                {modelLoading && <Loader2 className="w-4 h-4 animate-spin text-base-content/40" />}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={claudeModel}
                  onChange={(event) => {
                    setClaudeModel(event.target.value);
                    setModelMessage(null);
                    setModelError(null);
                  }}
                  placeholder={DEFAULT_CLAUDE_MODEL}
                  className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-mono text-base-content outline-none transition focus:border-primary"
                  style={{ borderColor: 'var(--app-border)' }}
                  disabled={modelLoading || modelSaving}
                />
                <button
                  onClick={handleSaveModel}
                  disabled={modelLoading || modelSaving || claudeModel.trim() === savedClaudeModel}
                  className="app-primary-btn h-10 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {modelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Išsaugoti</span>
                </button>
              </div>

              {modelMessage && <p className="text-xs text-emerald-600">{modelMessage}</p>}
              {modelError && <p className="text-xs text-red-600">{modelError}</p>}
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
