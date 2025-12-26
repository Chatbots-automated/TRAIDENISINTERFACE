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
        setSuccess('Išsaugota!');
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
        setSuccess('Versija grąžinta!');
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <button onClick={handleBack} className="p-1 hover:bg-gray-100 rounded-lg">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
              <span className="font-medium text-gray-900">{selectedVariable.variable_name}</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          {(error || success) && (
            <div className={`mx-4 mt-3 px-3 py-2 rounded-lg text-sm flex items-center space-x-2 ${
              error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              <span>{error || success}</span>
              {error && <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 m-4 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                style={{ fontFamily: 'system-ui', lineHeight: '1.6' }}
                placeholder="Įveskite instrukcijos turinį..."
                autoFocus
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-5">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans" style={{ lineHeight: '1.6' }}>
                  {selectedVariable.content || <span className="text-gray-400">Tuščia</span>}
                </pre>
              </div>
            )}

            {/* Password Input */}
            {showPasswordInput && !isAuthenticated && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                    placeholder="Slaptažodis"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleAuthenticate}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Atšaukti
                  </button>
                </div>
                {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => { setEditContent(selectedVariable.content); setIsEditing(false); setIsAuthenticated(false); }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm"
                >
                  Atšaukti
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || editContent === selectedVariable.content}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-40 flex items-center space-x-1.5"
                >
                  {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saving ? 'Saugoma...' : 'Išsaugoti'}</span>
                </button>
              </>
            ) : (
              !showPasswordInput && (
                <button
                  onClick={() => setShowPasswordInput(true)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 flex items-center space-x-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Redaguoti</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main View (Cards or Versions)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            {view === 'versions' && (
              <button onClick={() => setView('cards')} className="p-1 hover:bg-gray-100 rounded-lg">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
            )}
            <span className="font-medium text-gray-900">
              {view === 'cards' ? 'Instrukcijos' : 'Versijos'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mx-4 mt-3 px-3 py-2 rounded-lg text-sm flex items-center space-x-2 ${
            error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
          }`}>
            {error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            <span>{error || success}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Cards View */}
          {view === 'cards' && (
            <div className="p-4">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="w-full px-4 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center">
                        <span className="w-6 text-xs text-gray-400 font-medium">{index + 1}.</span>
                        <span className="flex-1 text-sm text-gray-900 group-hover:text-gray-700">
                          {variable.variable_name}
                        </span>
                        {!variable.content && (
                          <span className="text-xs text-gray-400">tuščia</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Version History Link */}
              <button
                onClick={() => setView('versions')}
                className="w-full mt-4 px-4 py-3 text-left rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <Clock className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900">Versijų istorija</span>
                </div>
              </button>
            </div>
          )}

          {/* Versions View */}
          {view === 'versions' && (
            <div className="p-4">
              {loadingVersions ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Versijų dar nėra
                </div>
              ) : (
                <div className="space-y-1">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-gray-400 font-medium">v{version.version_number}</span>
                        <span className="text-sm text-gray-700">
                          {version.change_description || 'Pakeitimas'}
                        </span>
                        <span className="text-xs text-gray-400">{getRelativeTime(version.created_at)}</span>
                      </div>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                          title="Grąžinti šią versiją"
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
