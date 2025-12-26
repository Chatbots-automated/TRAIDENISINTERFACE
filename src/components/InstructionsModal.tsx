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
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div
          className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                {selectedVariable.variable_name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Messages */}
          {(error || success) && (
            <div className={`mx-6 mt-4 px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2 ${
              error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              <span>{error || success}</span>
              {error && (
                <button onClick={() => setError(null)} className="ml-auto hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {isEditing ? (
              <div className="flex-1 p-6">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] px-4 py-3 text-[15px] text-gray-800 bg-white border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif', lineHeight: '1.7' }}
                  placeholder="Įveskite instrukcijos turinį..."
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6">
                <div
                  className="text-[15px] text-gray-700 whitespace-pre-wrap"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif', lineHeight: '1.7' }}
                >
                  {selectedVariable.content || (
                    <span className="text-gray-400 italic">Instrukcija tuščia</span>
                  )}
                </div>
              </div>
            )}

            {/* Password Input */}
            {showPasswordInput && !isAuthenticated && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                    placeholder="Įveskite slaptažodį"
                    className="flex-1 h-10 px-4 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    onClick={handleAuthenticate}
                    className="h-10 px-5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
                  >
                    Patvirtinti
                  </button>
                  <button
                    onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                    className="h-10 px-4 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Atšaukti
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => { setEditContent(selectedVariable.content); setIsEditing(false); setIsAuthenticated(false); }}
                  className="h-10 px-5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || editContent === selectedVariable.content}
                  className="h-10 px-5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{saving ? 'Saugoma...' : 'Išsaugoti'}</span>
                </button>
              </>
            ) : (
              !showPasswordInput && (
                <button
                  onClick={() => setShowPasswordInput(true)}
                  className="h-10 px-5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors flex items-center gap-2"
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div
        className="bg-white rounded-lg w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            {view === 'versions' && (
              <button
                onClick={() => setView('cards')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              {view === 'cards' ? 'Instrukcijos' : 'Versijų istorija'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2 ${
            error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            <span>{error || success}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Cards View */}
          {view === 'cards' && (
            <div className="p-6">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 text-left rounded-md hover:bg-gray-100 transition-colors group"
                    >
                      <span className="w-6 text-sm font-medium text-gray-400 tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="flex-1 text-[15px] text-gray-900 font-medium group-hover:text-gray-700">
                        {variable.variable_name}
                      </span>
                      {!variable.content && (
                        <span className="text-xs text-gray-400 uppercase tracking-wide">tuščia</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Version History */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setView('versions')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                >
                  <Clock className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                  <span className="text-[15px] text-gray-700 font-medium group-hover:text-gray-900">
                    Versijų istorija
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Versions View */}
          {view === 'versions' && (
            <div className="p-6">
              {loadingVersions ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-gray-500 text-[15px]">Versijų dar nėra</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between px-4 py-3.5 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-sm font-semibold text-gray-500 tabular-nums">
                          v{version.version_number}
                        </span>
                        <span className="text-[15px] text-gray-900 truncate">
                          {version.change_description || 'Pakeitimas'}
                        </span>
                        <span className="text-sm text-gray-400 flex-shrink-0">
                          {getRelativeTime(version.created_at)}
                        </span>
                      </div>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="ml-4 w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                          title="Grąžinti"
                        >
                          {revertingVersion === version.version_number ? (
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
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
