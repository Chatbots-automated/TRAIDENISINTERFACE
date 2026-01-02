import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  Edit3,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Shield,
  Sparkles,
  BookOpen,
  Zap,
  Target,
  Layers,
  Settings2,
  Code2
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

// Color themes for cards
const cardThemes = [
  { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-600', icon: Sparkles },
  { bg: 'from-blue-500 to-cyan-500', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', icon: Zap },
  { bg: 'from-emerald-500 to-teal-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', icon: Target },
  { bg: 'from-orange-500 to-amber-500', light: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', icon: Layers },
  { bg: 'from-pink-500 to-rose-500', light: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-600', icon: BookOpen },
  { bg: 'from-indigo-500 to-blue-600', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', icon: Settings2 },
  { bg: 'from-cyan-500 to-blue-500', light: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-600', icon: Code2 },
];

export default function InstructionsInterface({ user }: InstructionsInterfaceProps) {
  const [view, setView] = useState<View>('list');
  const [variables, setVariables] = useState<InstructionVariable[]>([]);
  const [selectedVariable, setSelectedVariable] = useState<InstructionVariable | null>(null);
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

  const handleSelectVariable = (variable: InstructionVariable, index: number) => {
    setSelectedVariable(variable);
    setSelectedIndex(index);
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

  const getTheme = (index: number) => cardThemes[index % cardThemes.length];

  if (!user.is_admin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
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
    const theme = getTheme(selectedIndex);
    const IconComponent = theme.icon;

    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Gradient Header */}
        <div className={`bg-gradient-to-r ${theme.bg} px-6 py-8`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <IconComponent className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedVariable.variable_name}</h2>
                <p className="text-white/80 text-sm">{selectedVariable.description || selectedVariable.variable_key}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => { setEditContent(selectedVariable.content); setIsEditing(false); setIsAuthenticated(false); }}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                  >
                    Atšaukti
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || editContent === selectedVariable.content}
                    className="px-5 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600" />
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
                    className="px-5 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors flex items-center space-x-2 font-medium"
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
          <div className={`px-6 py-5 ${theme.light} border-b ${theme.border}`}>
            <div className="max-w-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold ${theme.text}`}>Patvirtinkite tapatybę</h3>
                <button
                  onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                  className="text-gray-400 hover:text-gray-600"
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
                  className={`flex-1 px-4 py-2.5 border ${theme.border} rounded-lg focus:ring-2 focus:ring-offset-0 focus:outline-none`}
                  autoFocus
                />
                <button
                  onClick={handleAuthenticate}
                  className={`px-6 py-2.5 bg-gradient-to-r ${theme.bg} text-white rounded-lg hover:opacity-90 transition-opacity font-medium`}
                >
                  Patvirtinti
                </button>
              </div>
              {passwordError && (
                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="px-6">
          {error && (
            <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-4 rounded-xl border border-green-200">
              <Check className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{success}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className={`w-full h-full min-h-[500px] px-5 py-4 text-sm text-gray-900 bg-white border-2 ${theme.border} rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-offset-0 shadow-sm`}
              style={{ lineHeight: '1.8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}
              placeholder="Įveskite instrukcijos turinį..."
              autoFocus
            />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 min-h-[300px]">
              <div
                className="text-sm text-gray-700 whitespace-pre-wrap"
                style={{ lineHeight: '1.8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}
              >
                {selectedVariable.content || (
                  <div className="text-center py-12">
                    <div className={`w-16 h-16 ${theme.light} rounded-full flex items-center justify-center mx-auto mb-4`}>
                      <FileText className={`w-8 h-8 ${theme.text}`} />
                    </div>
                    <p className="text-gray-400 italic">Instrukcija tuščia</p>
                  </div>
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
      <div className="h-full flex flex-col bg-gray-50">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Versijų istorija</h2>
              <p className="text-white/80 text-sm">Peržiūrėkite ir grąžinkite ankstesnes versijas</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="px-6">
          {error && (
            <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-4 rounded-xl border border-green-200">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">{success}</span>
            </div>
          )}
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingVersions ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Versijų dar nėra</h3>
              <p className="text-gray-500">Kai pakeisite instrukcijas, versijos bus rodomos čia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version, index) => {
                const theme = getTheme(index);
                return (
                  <div
                    key={version.id}
                    className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all ${index === 0 ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-14 h-14 bg-gradient-to-br ${theme.bg} rounded-xl flex items-center justify-center shadow-lg`}>
                          <span className="text-lg font-bold text-white">v{version.version_number}</span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {version.change_description || version.variable_key}
                            </h3>
                            {index === 0 && (
                              <span className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full">
                                Dabartinė
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {version.changed_by_email || 'Sistema'} • {getRelativeTime(version.created_at)}
                          </p>
                        </div>
                      </div>

                      {index !== 0 && (
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 transition-colors flex items-center space-x-2"
                          title="Grąžinti šią versiją"
                        >
                          {revertingVersion === version.version_number ? (
                            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4" />
                              <span className="text-sm font-medium">Grąžinti</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main List View
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Instrukcijos</h2>
              <p className="text-white/80">Valdykite AI agento instrukcijų kintamuosius</p>
            </div>
          </div>
          <button
            onClick={() => setView('versions')}
            className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors flex items-center space-x-2 font-medium"
          >
            <Clock className="w-4 h-4" />
            <span>Versijų istorija</span>
          </button>
        </div>

        {/* Stats */}
        <div className="mt-6 flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{variables.length}</p>
              <p className="text-xs text-white/70">Instrukcijos</p>
            </div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{variables.filter(v => v.content).length}</p>
              <p className="text-xs text-white/70">Užpildytos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="px-6">
        {error && (
          <div className="mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-xl border border-red-200">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-4 rounded-xl border border-green-200">
            <Check className="w-5 h-5" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        )}
      </div>

      {/* Instructions List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : variables.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-violet-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Instrukcijų nerasta</h3>
            <p className="text-gray-500">Instrukcijų kintamieji bus rodomi čia</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {variables.map((variable, index) => {
              const theme = getTheme(index);
              const IconComponent = theme.icon;

              return (
                <button
                  key={variable.id}
                  onClick={() => handleSelectVariable(variable, index)}
                  className="bg-white rounded-2xl p-5 text-left hover:shadow-lg transition-all duration-200 group border border-gray-100 hover:border-gray-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${theme.bg} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {variable.variable_name}
                        </h3>
                        {!variable.content && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            tuščia
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {variable.variable_key}
                      </p>
                      {variable.content && (
                        <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                          {variable.content.substring(0, 120)}...
                        </p>
                      )}
                    </div>
                    <ChevronRight className={`w-5 h-5 ${theme.text} opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
