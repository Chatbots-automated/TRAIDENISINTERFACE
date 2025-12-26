import React, { useState, useEffect } from 'react';
import {
  X,
  HelpCircle,
  AlertTriangle,
  Save,
  Edit3,
  Clock,
  ChevronLeft,
  RotateCcw,
  Check,
  AlertCircle,
  ChevronRight,
  FileText,
  Info
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

type View = 'cards' | 'editor' | 'help' | 'versions';

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
        setSuccess('Instrukcija sėkmingai išsaugota!');
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
    if (!confirm(`Ar tikrai norite grįžti prie versijos #${versionNumber}? Dabartinė versija bus automatiškai išsaugota kaip atsarginė kopija.`)) {
      return;
    }

    try {
      setRevertingVersion(versionNumber);
      const result = await revertToVersion(versionNumber, user.id, user.email);

      if (result.success) {
        setSuccess(`Sėkmingai grąžinta į versiją #${versionNumber}`);
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
        if (!confirm('Turite neišsaugotų pakeitimų. Ar tikrai norite išeiti?')) {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('lt-LT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ką tik';
    if (diffMins < 60) return `Prieš ${diffMins} min.`;
    if (diffHours < 24) return `Prieš ${diffHours} val.`;
    if (diffDays < 7) return `Prieš ${diffDays} d.`;
    return formatDate(dateString);
  };

  if (!isOpen) return null;

  // Editor popup - Voiceflow style
  if (view === 'editor' && selectedVariable) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {selectedVariable.variable_name}
                </h2>
                <p className="text-xs text-gray-500">Instrukcija</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="mx-5 mt-3 flex items-center space-x-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {success && (
            <div className="mx-5 mt-3 flex items-center space-x-2 text-green-600 bg-green-50 p-2.5 rounded-lg text-sm">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isEditing ? (
              <div className="flex-1 flex flex-col p-5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm leading-relaxed bg-white"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: '1.7',
                    minHeight: '350px'
                  }}
                  placeholder="Įveskite instrukcijos turinį..."
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div
                  className="p-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: '1.7'
                  }}
                >
                  {selectedVariable.content || (
                    <span className="text-gray-400 italic">Ši instrukcija dar neužpildyta.</span>
                  )}
                </div>
              </div>
            )}

            {/* Password Input Area */}
            {showPasswordInput && !isAuthenticated && (
              <div className="px-5 pb-4 pt-3 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                      placeholder="Įveskite slaptažodį..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                    {passwordError && (
                      <p className="text-xs text-red-600 mt-1">{passwordError}</p>
                    )}
                  </div>
                  <button
                    onClick={handleAuthenticate}
                    className="px-4 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Patvirtinti
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordInput(false);
                      setPassword('');
                      setPasswordError('');
                    }}
                    className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                  >
                    Atšaukti
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {selectedVariable.updated_at && (
                <span>Atnaujinta: {getRelativeTime(selectedVariable.updated_at)}</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setEditContent(selectedVariable.content);
                      setIsEditing(false);
                      setIsAuthenticated(false);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                  >
                    Atšaukti
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || editContent === selectedVariable.content}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center space-x-1.5"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        <span>Saugoma...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Išsaugoti</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                !showPasswordInput && (
                  <button
                    onClick={() => setShowPasswordInput(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors inline-flex items-center space-x-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Redaguoti</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            {(view === 'help' || view === 'versions') && (
              <button
                onClick={() => setView('cards')}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {view === 'cards' && 'Agento instrukcijos'}
                {view === 'help' && 'Pagalba'}
                {view === 'versions' && 'Versijų istorija'}
              </h2>
              {view === 'cards' && (
                <p className="text-xs text-gray-500 mt-0.5">Valdykite sistemos nurodymus</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {view === 'cards' && (
              <button
                onClick={() => setView('help')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Pagalba"
              >
                <HelpCircle className="w-4 h-4 text-gray-400" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-5 mt-3 flex items-center space-x-2 text-red-600 bg-red-50 p-2.5 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-5 mt-3 flex items-center space-x-2 text-green-600 bg-green-50 p-2.5 rounded-lg text-sm">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Cards View */}
          {view === 'cards' && (
            <div className="space-y-4">
              {/* Warning Banner */}
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Šios instrukcijos tiesiogiai veikia agento elgseną. Neteisingi pakeitimai gali sugadinti agento funkcionalumą.
                  </p>
                </div>
              </div>

              {/* Instructions List */}
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="w-full p-4 bg-gray-50 hover:bg-white border border-transparent hover:border-gray-200 rounded-xl text-left transition-all group hover:shadow-sm"
                    >
                      <div className="flex items-center">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors"
                          style={{
                            backgroundColor: variable.content ? '#dbeafe' : '#f3f4f6',
                            color: variable.content ? '#2563eb' : '#9ca3af'
                          }}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1 ml-3 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                              {variable.variable_name}
                            </h3>
                            {!variable.content && (
                              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] rounded font-medium">
                                Tuščia
                              </span>
                            )}
                          </div>
                          {variable.content && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {variable.content.substring(0, 70)}...
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors ml-2" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Version History Button - More Prominent */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  onClick={() => setView('versions')}
                  className="w-full p-4 bg-gradient-to-r from-slate-50 to-gray-50 hover:from-slate-100 hover:to-gray-100 border border-gray-200 rounded-xl text-left transition-all group"
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-blue-300 transition-colors">
                      <Clock className="w-5 h-5 text-gray-500 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <div className="flex-1 ml-3">
                      <h3 className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                        Versijų istorija
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Peržiūrėkite pakeitimus ir grąžinkite ankstesnes versijas
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Help View */}
          {view === 'help' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 text-sm mb-1">Kas yra agento instrukcijos?</h4>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Instrukcijos yra sistemos prompt'ai, kurie nurodo agentui kaip elgtis skirtingose situacijose.
                      Kiekviena instrukcija atitinka tam tikrą darbo eigos fazę arba funkcionalumą.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-900 text-sm mb-1">Svarbu prieš redaguojant</h4>
                    <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4 leading-relaxed">
                      <li>Sistema automatiškai išsaugo kiekvieno pakeitimo versiją</li>
                      <li>Testuokite pakeitimus mažais žingsniais</li>
                      <li>Venkite trinti esamas instrukcijas - geriau jas papildyti</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Clock className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-green-900 text-sm mb-1">Versijų valdymas</h4>
                    <p className="text-xs text-green-800 leading-relaxed">
                      Galite peržiūrėti visą pakeitimų istoriją ir grįžti prie bet kurios ankstesnės versijos.
                      Prieš grįžimą sistema automatiškai sukurs atsarginę kopiją.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Versions View */}
          {view === 'versions' && (
            <div>
              {loadingVersions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-1">Nėra versijų</h3>
                  <p className="text-xs text-gray-500">
                    Versijos bus sukurtos kai atliksite pakeitimus
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="p-4 bg-gray-50 hover:bg-white border border-transparent hover:border-gray-200 rounded-xl transition-all hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                            index === 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {version.version_number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm text-gray-900">
                                Versija {version.version_number}
                              </span>
                              {index === 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                                  Dabartinė
                                </span>
                              )}
                              {version.is_revert && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                                  Grąžinta
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {version.change_description || 'Pakeitimas'} • {getRelativeTime(version.created_at)}
                            </p>
                          </div>
                        </div>
                        {index !== 0 && (
                          <button
                            onClick={() => handleRevert(version.version_number)}
                            disabled={revertingVersion === version.version_number}
                            className="ml-3 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all disabled:opacity-50 inline-flex items-center space-x-1.5"
                          >
                            {revertingVersion === version.version_number ? (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-600" />
                            ) : (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
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
          )}
        </div>
      </div>
    </div>
  );
}
