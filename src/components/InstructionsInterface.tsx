import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Save,
  Edit3,
  Clock,
  ChevronRight,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Shield,
  BookOpen,
  Lock,
  ChevronDown,
  Eye,
  Pencil
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

type View = 'editor' | 'versions';

export default function InstructionsInterface({ user }: InstructionsInterfaceProps) {
  const [view, setView] = useState<View>('editor');
  const [variables, setVariables] = useState<InstructionVariable[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
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
  const contentRef = useRef<HTMLDivElement>(null);

  const selectedVariable = variables[selectedIndex] || null;

  useEffect(() => {
    loadVariables();
  }, []);

  useEffect(() => {
    if (view === 'versions') {
      loadVersions();
    }
  }, [view]);

  useEffect(() => {
    if (selectedVariable) {
      setEditContent(selectedVariable.content);
      setIsEditing(false);
      setIsAuthenticated(false);
      setShowPasswordInput(false);
      setPassword('');
      setPasswordError('');
    }
  }, [selectedIndex, variables]);

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
        setTimeout(() => setSuccess(null), 3000);
        setIsEditing(false);
        setIsAuthenticated(false);
        await loadVariables();
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

  const handleCancelEdit = () => {
    if (selectedVariable) {
      setEditContent(selectedVariable.content);
    }
    setIsEditing(false);
    setIsAuthenticated(false);
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
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Prieiga uždrausta</h3>
          <p className="text-gray-500">Jums reikia administratoriaus teisių</p>
        </div>
      </div>
    );
  }

  // Versions View
  if (view === 'versions') {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Simple Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setView('editor')}
                className="text-gray-500 hover:text-violet-700 transition-colors"
              >
                ← Atgal
              </button>
              <div className="w-px h-5 bg-gray-300" />
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Versijų istorija</h2>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="px-6 pt-4">
            {error && (
              <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
              </div>
            )}
            {success && (
              <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                <Check className="w-4 h-4" />
                <span className="text-sm">{success}</span>
              </div>
            )}
          </div>
        )}

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingVersions ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-white rounded-lg animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>Versijų dar nėra</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className={`bg-white rounded-lg p-4 border ${index === 0 ? 'border-violet-300 bg-violet-50/50' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm font-mono px-2 py-1 rounded ${index === 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>
                        v{version.version_number}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {version.variable_key}
                        </p>
                        <p className="text-xs text-gray-500">
                          {version.changed_by_email || 'Sistema'} • {getRelativeTime(version.created_at)}
                        </p>
                      </div>
                    </div>
                    {index === 0 ? (
                      <span className="text-xs text-violet-600 font-medium">Dabartinė</span>
                    ) : (
                      <button
                        onClick={() => handleRevert(version.version_number)}
                        disabled={revertingVersion === version.version_number}
                        className="text-sm text-gray-500 hover:text-violet-700 flex items-center space-x-1 transition-colors"
                      >
                        {revertingVersion === version.version_number ? (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Grąžinti</span>
                          </>
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

  // Main Editor View - Document Style
  return (
    <div className="h-full flex bg-white">
      {/* Left Sidebar - Table of Contents */}
      <div className="w-72 border-r border-gray-200 flex flex-col bg-gray-50">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">AI Agento Instrukcijos</h2>
          </div>
          <p className="text-xs text-gray-500 ml-8">
            {variables.filter(v => v.content).length} iš {variables.length} užpildyta
          </p>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <nav className="space-y-0.5 px-2">
              {variables.map((variable, index) => (
                <button
                  key={variable.id}
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
                    selectedIndex === index
                      ? 'bg-white shadow-sm border border-violet-200 border-l-2 border-l-violet-500'
                      : 'hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className={`text-xs font-mono mt-0.5 ${
                      selectedIndex === index ? 'text-violet-600' : 'text-gray-400'
                    }`}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        selectedIndex === index ? 'text-gray-900' : 'text-gray-700'
                      }`}>
                        {variable.variable_name}
                      </p>
                      {!variable.content && (
                        <p className="text-xs text-amber-600 mt-0.5">Tuščia</p>
                      )}
                    </div>
                    {selectedIndex === index && (
                      <ChevronRight className="w-4 h-4 text-violet-400 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={() => setView('versions')}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
          >
            <Clock className="w-4 h-4" />
            <span>Versijų istorija</span>
          </button>
        </div>
      </div>

      {/* Right Panel - Content Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedVariable ? (
          <>
            {/* Content Header */}
            <div className="border-b border-gray-200 px-8 py-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                      {selectedVariable.variable_key}
                    </span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400">
                      Sekcija {selectedIndex + 1} iš {variables.length}
                    </span>
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {selectedVariable.variable_name}
                  </h1>
                  {selectedVariable.description && (
                    <p className="text-sm text-gray-500 mt-1">{selectedVariable.description}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Atšaukti
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || editContent === selectedVariable.content}
                        className="px-4 py-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
                      >
                        {saving ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>Išsaugoti</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowPasswordInput(true)}
                      className="px-4 py-2 text-sm text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 border border-violet-200 transition-colors flex items-center space-x-2"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Redaguoti</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Password Input */}
              {showPasswordInput && !isAuthenticated && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">Patvirtinkite tapatybę</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                      placeholder="Įveskite slaptažodį"
                      className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      autoFocus
                    />
                    <button
                      onClick={handleAuthenticate}
                      className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      Patvirtinti
                    </button>
                    <button
                      onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      Atšaukti
                    </button>
                  </div>
                  {passwordError && (
                    <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                  )}
                </div>
              )}

              {/* Messages */}
              {error && (
                <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
              )}
              {success && (
                <div className="mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">{success}</span>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto" ref={contentRef}>
              <div className="px-8 py-6">
                {isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-h-[500px] p-4 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white transition-colors"
                    style={{
                      lineHeight: '1.75',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                    }}
                    placeholder="Įveskite instrukcijos turinį..."
                    autoFocus
                  />
                ) : (
                  <div className="prose prose-sm max-w-none">
                    {selectedVariable.content ? (
                      <pre
                        className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-6 rounded-lg border border-gray-100"
                        style={{
                          lineHeight: '1.75',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                        }}
                      >
                        {selectedVariable.content}
                      </pre>
                    ) : (
                      <div className="text-center py-16 bg-gradient-to-b from-violet-50/50 to-gray-50 rounded-lg border-2 border-dashed border-violet-200">
                        <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
                          <FileText className="w-6 h-6 text-violet-400" />
                        </div>
                        <p className="text-gray-500 mb-4">Ši sekcija dar neužpildyta</p>
                        <button
                          onClick={() => setShowPasswordInput(true)}
                          className="px-4 py-2 text-sm text-violet-600 hover:text-violet-700 border border-violet-300 rounded-lg hover:bg-violet-50 transition-colors"
                        >
                          Pridėti turinį
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation Footer */}
              <div className="px-8 py-4 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                    disabled={selectedIndex === 0}
                    className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span>←</span>
                    <span>Ankstesnė sekcija</span>
                  </button>
                  <span className="text-xs text-gray-400">
                    {selectedIndex + 1} / {variables.length}
                  </span>
                  <button
                    onClick={() => setSelectedIndex(Math.min(variables.length - 1, selectedIndex + 1))}
                    disabled={selectedIndex === variables.length - 1}
                    className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span>Kita sekcija</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>Pasirinkite instrukciją iš sąrašo</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
