import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  Edit3,
  Clock,
  ChevronLeft,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Shield
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

interface InstructionsInterfaceProps {
  user: AppUser;
}

type View = 'list' | 'editor' | 'versions';

export default function InstructionsInterface({ user }: InstructionsInterfaceProps) {
  const [view, setView] = useState<View>('list');
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
    loadVariables();
  }, []);

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
        setSuccess('Išsaugota sėkmingai!');
        setTimeout(() => setSuccess(null), 3000);
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
        setSuccess('Versija grąžinta sėkmingai!');
        setTimeout(() => setSuccess(null), 3000);
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
    setView('list');
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

  if (!user.is_admin) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Prieiga uždrausta
          </h3>
          <p className="text-gray-500">
            Jums reikia administratoriaus teisių
          </p>
        </div>
      </div>
    );
  }

  // Editor View
  if (view === 'editor' && selectedVariable) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedVariable.variable_name}</h2>
                <p className="text-sm text-gray-600">{selectedVariable.description || 'Instrukcijos redagavimas'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => { setEditContent(selectedVariable.content); setIsEditing(false); setIsAuthenticated(false); }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Atšaukti
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || editContent === selectedVariable.content}
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
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
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all flex items-center space-x-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Redaguoti</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Password Input */}
        {showPasswordInput && !isAuthenticated && (
          <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b border-green-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Patvirtinkite tapatybę</h3>
                <button
                  onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                  placeholder="Įveskite slaptažodį"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={handleAuthenticate}
                  className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all"
                >
                  Patvirtinti
                </button>
              </div>
              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg">
            <Check className="w-5 h-5" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full min-h-[400px] px-4 py-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              style={{ lineHeight: '1.7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}
              placeholder="Įveskite instrukcijos turinį..."
              autoFocus
            />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div
                className="text-sm text-gray-700 whitespace-pre-wrap"
                style={{ lineHeight: '1.7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}
              >
                {selectedVariable.content || (
                  <span className="text-gray-400 italic">Instrukcija tuščia</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Versions View
  if (view === 'versions') {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleBack}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Versijų istorija</h2>
              <p className="text-sm text-gray-600">Peržiūrėkite ir grąžinkite ankstesnes versijas</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg">
            <Check className="w-5 h-5" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingVersions ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Versijų dar nėra</h3>
              <p className="text-gray-500">Kai pakeisite instrukcijas, versijos bus rodomos čia</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-green-100 to-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-green-700">v{version.version_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {version.change_description || 'Pakeitimas'}
                          </h3>
                          {index === 0 && (
                            <span className="px-2 py-1 text-xs bg-gradient-to-r from-green-100 to-blue-100 text-green-700 rounded-full">
                              Dabartinė
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {version.variable_key} • {version.changed_by_email || 'Sistema'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {getRelativeTime(version.created_at)}
                        </p>
                      </div>
                    </div>

                    {index !== 0 && (
                      <button
                        onClick={() => handleRevert(version.version_number)}
                        disabled={revertingVersion === version.version_number}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                        title="Grąžinti šią versiją"
                      >
                        {revertingVersion === version.version_number ? (
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                          <RotateCcw className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main List View
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Instrukcijos</h2>
            <p className="text-sm text-gray-600">Valdykite AI agento instrukcijų kintamuosius</p>
          </div>
          <button
            onClick={() => setView('versions')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>Versijų istorija</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg">
          <Check className="w-5 h-5" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Instructions List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-gradient-to-r from-green-100 to-blue-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : variables.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Instrukcijų nerasta</h3>
            <p className="text-gray-500">Instrukcijų kintamieji bus rodomi čia</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {variables.map((variable, index) => (
              <button
                key={variable.id}
                onClick={() => handleSelectVariable(variable)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow text-left w-full"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-100 to-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-green-700">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {variable.variable_name}
                      </h3>
                      {!variable.content && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded-full">
                          tuščia
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {variable.description || variable.variable_key}
                    </p>
                    {variable.content && (
                      <p className="text-xs text-gray-400 truncate mt-1">
                        {variable.content.substring(0, 100)}...
                      </p>
                    )}
                  </div>
                  <Edit3 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
