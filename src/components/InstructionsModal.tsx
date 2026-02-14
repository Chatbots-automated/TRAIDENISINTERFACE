import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Edit3,
  Clock,
  ChevronLeft,
  RotateCcw,
  Check,
  AlertCircle
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  getInstructionVariables,
  saveInstructionVariable,
  verifyUserPassword,
  getVersionHistory,
  revertToVersion,
  InstructionVariable,
  InstructionVersion
} from '../lib/instructionsService';
import { colors } from '../lib/designSystem';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

type View = 'cards' | 'editor' | 'versions';

export default function InstructionsModal({ isOpen, onClose, user }: InstructionsModalProps) {
  const [view, setView] = useState<View>('cards');
  const [variables, setVariables] = useState<InstructionVariable[]>([]);
  const [selectedVariable, setSelectedVariable] = useState<InstructionVariable | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [versions, setVersions] = useState<InstructionVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVariables();
    }
  }, [isOpen]);

  useEffect(() => {
    if (view === 'versions') {
      loadVersions();
    }
  }, [view]);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const data = await getInstructionVariables();
      setVariables(data);
    } catch (err: any) {
      setError('Nepavyko įkelti instrukcijų');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      setLoadingVersions(true);
      const data = await getVersionHistory(50);
      setVersions(data);
    } catch (err: any) {
      console.error('Error loading versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSelectVariable = (variable: InstructionVariable) => {
    setSelectedVariable(variable);
    setEditContent(variable.content);
    setIsEditing(false);
    setIsAuthenticated(false);
    setShowPasswordInput(false);
    setPassword('');
    setPasswordError('');
    setView('editor');
  };

  const handleAuthenticate = async () => {
    setPasswordError('');
    const isValid = await verifyUserPassword(user.email, password);
    if (isValid) {
      setIsAuthenticated(true);
      setIsEditing(true);
      setShowPasswordInput(false);
      setPassword('');
    } else {
      setPasswordError('Neteisingas slaptažodis');
    }
  };

  const handleSave = async () => {
    if (!selectedVariable) return;

    try {
      setSaving(true);
      setError(null);

      const result = await saveInstructionVariable(
        selectedVariable.variable_key,
        editContent,
        user.id,
        user.email,
        true
      );

      if (result.success) {
        setSuccess('Išsaugota');
        setTimeout(() => setSuccess(null), 2000);
        setIsEditing(false);
        setIsAuthenticated(false);

        await loadVariables();
        setSelectedVariable(prev => prev ? { ...prev, content: editContent } : null);
      } else {
        setError(result.error || 'Nepavyko išsaugoti');
      }
    } catch (err: any) {
      setError(err.message || 'Klaida saugant instrukciją');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (versionNumber: number) => {
    if (!confirm(`Grąžinti versiją #${versionNumber}?`)) {
      return;
    }

    try {
      setRevertingVersion(versionNumber);
      const result = await revertToVersion(versionNumber, user.id, user.email);

      if (result.success) {
        setSuccess('Versija grąžinta');
        setTimeout(() => setSuccess(null), 2000);
        await loadVariables();
        await loadVersions();
      } else {
        setError(result.error || 'Nepavyko grąžinti versijos');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRevertingVersion(null);
    }
  };

  const handleBack = () => {
    if (view === 'editor') {
      if (isEditing && editContent !== selectedVariable?.content) {
        if (!confirm('Išeiti be išsaugojimo?')) {
          return;
        }
      }
      setSelectedVariable(null);
      setIsEditing(false);
      setIsAuthenticated(false);
      setShowPasswordInput(false);
    }
    setView('cards');
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ką tik';
    if (diffMins < 60) return `${diffMins} min.`;
    if (diffHours < 24) return `${diffHours} val.`;
    if (diffDays < 30) return `${diffDays} d.`;
    return date.toLocaleDateString('lt-LT');
  };

  if (!isOpen) return null;

  // Editor View
  if (view === 'editor' && selectedVariable) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20"
        style={{ background: 'rgba(0, 0, 0, 0.3)' }}
        onClick={onClose}
      >
        <div
          className="rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
          style={{ background: colors.bg.white, border: `1px solid ${colors.border.light}` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b rounded-t-xl" style={{
            borderColor: colors.border.light,
            background: colors.bg.secondary
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleBack}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: colors.text.tertiary }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-semibold" style={{ color: colors.text.primary }}>
                  {selectedVariable.variable_name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors"
                style={{ color: colors.text.tertiary }}
                onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="alert alert-soft alert-error mx-6 mt-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="alert alert-soft alert-success mx-6 mt-4 text-sm">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Modal Body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {isEditing ? (
              <div className="flex-1 px-6 py-5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[350px] px-4 py-3 text-sm rounded-lg resize-none border focus:outline-none"
                  style={{
                    lineHeight: '1.7',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
                    borderColor: colors.border.default,
                    background: colors.bg.white,
                    color: colors.text.primary
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                  placeholder="Įveskite instrukcijos turinį..."
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div
                  className="text-sm whitespace-pre-wrap"
                  style={{
                    lineHeight: '1.7',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
                    color: colors.text.primary
                  }}
                >
                  {selectedVariable.content || (
                    <span className="italic" style={{ color: colors.text.tertiary }}>Instrukcija tuščia</span>
                  )}
                </div>
              </div>
            )}

            {/* Password Input */}
            {showPasswordInput && !isAuthenticated && (
              <div className="px-6 py-4 border-t" style={{
                borderColor: colors.border.light,
                background: colors.bg.secondary
              }}>
                <div className="flex items-center space-x-3">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                    placeholder="Įveskite slaptažodį"
                    className="flex-1 px-3 py-2.5 text-sm border rounded-lg focus:outline-none"
                    style={{
                      borderColor: colors.border.default,
                      background: colors.bg.white,
                      color: colors.text.primary
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                    autoFocus
                  />
                  <button
                    onClick={handleAuthenticate}
                    className="px-5 py-2.5 text-sm font-medium rounded-lg transition-colors"
                    style={{
                      background: colors.interactive.accent,
                      color: '#ffffff'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.interactive.accentHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = colors.interactive.accent}
                  >
                    Patvirtinti
                  </button>
                  <button
                    onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                    style={{
                      background: colors.interactive.buttonInactiveBg,
                      color: colors.interactive.buttonInactiveText
                    }}
                  >
                    Atšaukti
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-2 text-sm" style={{ color: colors.status.errorText }}>{passwordError}</p>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-end space-x-3" style={{ borderColor: colors.border.light }}>
            {isEditing ? (
              <>
                <button
                  onClick={() => { setEditContent(selectedVariable.content); setIsEditing(false); setIsAuthenticated(false); }}
                  className="px-6 py-3 rounded-lg font-medium transition-colors"
                  style={{
                    background: colors.interactive.buttonInactiveBg,
                    color: colors.interactive.buttonInactiveText
                  }}
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || editContent === selectedVariable.content}
                  className="px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  style={{
                    background: colors.interactive.accent,
                    color: '#ffffff'
                  }}
                  onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accentHover)}
                  onMouseLeave={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accent)}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span>Saugoma...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Išsaugoti</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              !showPasswordInput && (
                <button
                  onClick={() => setShowPasswordInput(true)}
                  className="px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2"
                  style={{
                    background: colors.interactive.accent,
                    color: '#ffffff'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.interactive.accentHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = colors.interactive.accent}
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Redaguoti</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        style={{
          background: colors.bg.white,
          border: `1px solid ${colors.border.light}`,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b rounded-t-xl" style={{
          borderColor: colors.border.light,
          background: colors.bg.secondary
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {view === 'versions' && (
                <button
                  onClick={() => setView('cards')}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: colors.text.tertiary }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-base font-semibold" style={{ color: colors.text.primary }}>
                {view === 'cards' ? 'Instrukcijos' : 'Versijų istorija'}
              </h2>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 rounded-lg transition-colors"
              style={{ color: colors.text.tertiary }}
              onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.primary}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="alert alert-soft alert-error mx-6 mt-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-soft alert-success mx-6 mt-4 text-sm">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Cards View */}
          {view === 'cards' && (
            <div className="space-y-5">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="w-full flex items-center space-x-4 px-4 py-3 text-left rounded-lg transition-colors group"
                      onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span className="w-6 text-sm font-medium tabular-nums" style={{ color: colors.text.tertiary }}>
                        {index + 1}.
                      </span>
                      <span className="flex-1 text-sm font-medium" style={{ color: colors.text.primary }}>
                        {variable.variable_name}
                      </span>
                      {!variable.content && (
                        <span className="text-xs" style={{ color: colors.text.tertiary }}>tuščia</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Version History */}
              <div className="pt-5 border-t" style={{ borderColor: colors.border.default }}>
                <button
                  onClick={() => setView('versions')}
                  className="w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg border transition-all group"
                  style={{
                    borderColor: colors.border.default,
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.border.active;
                    e.currentTarget.style.background = colors.bg.secondary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.border.default;
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Clock className="w-5 h-5" style={{ color: colors.text.secondary }} />
                  <span className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                    Versijų istorija
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Versions View */}
          {view === 'versions' && (
            <div>
              {loadingVersions ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm" style={{ color: colors.text.secondary }}>Versijų dar nėra</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors"
                      onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div className="flex items-center space-x-4 min-w-0">
                        <span className="text-sm font-semibold tabular-nums" style={{ color: colors.text.secondary }}>
                          v{version.version_number}
                        </span>
                        <span className="text-sm truncate" style={{ color: colors.text.primary }}>
                          {version.change_description || 'Pakeitimas'}
                        </span>
                        <span className="text-xs flex-shrink-0" style={{ color: colors.text.tertiary }}>
                          {getRelativeTime(version.created_at)}
                        </span>
                      </div>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="ml-4 p-2 rounded-lg disabled:opacity-50 transition-colors"
                          style={{ color: colors.text.tertiary }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = colors.interactive.accent;
                            e.currentTarget.style.background = colors.interactive.accentLight;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = colors.text.tertiary;
                            e.currentTarget.style.background = 'transparent';
                          }}
                          title="Grąžinti"
                        >
                          {revertingVersion === version.version_number ? (
                            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{
                              borderColor: colors.border.default,
                              borderTopColor: colors.interactive.accent
                            }} />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
