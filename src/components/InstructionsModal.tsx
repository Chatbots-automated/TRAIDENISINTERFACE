import React, { useState, useEffect } from 'react';
import {
  X,
  HelpCircle,
  AlertTriangle,
  Lock,
  Save,
  Edit3,
  History,
  ChevronLeft,
  RotateCcw,
  Check,
  AlertCircle,
  ChevronRight
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

        // Refresh variables
        await loadVariables();

        // Update selected variable with new content
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
      // Check for unsaved changes
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

  if (!isOpen) return null;

  // Editor popup - Voiceflow style
  if (view === 'editor' && selectedVariable) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          {/* Simple Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="text-base font-semibold text-gray-900">
                {selectedVariable.variable_name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
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
              /* Edit Mode */
              <div className="flex-1 flex flex-col p-5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm leading-relaxed bg-white"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    lineHeight: '1.7',
                    minHeight: '350px'
                  }}
                  placeholder="Įveskite instrukcijos turinį..."
                  autoFocus
                />
              </div>
            ) : (
              /* View Mode - Voiceflow style */
              <div className="flex-1 overflow-y-auto">
                <div
                  className="p-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
              <div className="px-5 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                      placeholder="Įveskite slaptažodį..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                    {passwordError && (
                      <p className="text-xs text-red-600 mt-1">{passwordError}</p>
                    )}
                  </div>
                  <button
                    onClick={handleAuthenticate}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Patvirtinti
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordInput(false);
                      setPassword('');
                      setPasswordError('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                  >
                    Atšaukti
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Actions */}
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {selectedVariable.updated_at && (
                <span>Atnaujinta: {formatDate(selectedVariable.updated_at)}</span>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {(view === 'help' || view === 'versions') && (
              <button
                onClick={() => setView('cards')}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">
              {view === 'cards' && 'Instrukcijos'}
              {view === 'help' && 'Pagalba'}
              {view === 'versions' && 'Versijų istorija'}
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            {view === 'cards' && (
              <>
                <button
                  onClick={() => setView('versions')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Versijų istorija"
                >
                  <History className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => setView('help')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Pagalba"
                >
                  <HelpCircle className="w-4 h-4 text-gray-500" />
                </button>
              </>
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
            <>
              {/* Warning Banner */}
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Šios instrukcijos tiesiogiai veikia agento elgseną. Neteisingi pakeitimai gali sugadinti agento funkcionalumą.
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="w-full p-3.5 bg-white border border-gray-200 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
                    >
                      <div className="flex items-center">
                        <div className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center text-gray-600 group-hover:text-blue-600 font-medium text-xs flex-shrink-0 transition-colors">
                          {index + 1}
                        </div>
                        <div className="flex-1 ml-3 min-w-0">
                          <h3 className="font-medium text-sm text-gray-900 group-hover:text-blue-700 transition-colors">
                            {variable.variable_name}
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {variable.content
                              ? variable.content.substring(0, 80) + (variable.content.length > 80 ? '...' : '')
                              : 'Tuščia instrukcija'
                            }
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Help View */}
          {view === 'help' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-medium text-blue-900 text-sm mb-2">Kas yra agento instrukcijos?</h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Instrukcijos yra sistemos prompt'ai, kurie nurodo agentui kaip elgtis skirtingose situacijose.
                  Kiekviena instrukcija atitinka tam tikrą darbo eigos fazę arba funkcionalumą.
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl">
                <h4 className="font-medium text-amber-900 text-sm mb-2">Svarbu prieš redaguojant</h4>
                <ul className="text-xs text-amber-800 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>Sistema automatiškai išsaugo kiekvieno pakeitimo versiją</li>
                  <li>Testuokite pakeitimus mažais žingsniais</li>
                  <li>Venkite trinti esamas instrukcijas - geriau jas papildyti</li>
                  <li>Naudokite aiškią, struktūrizuotą kalbą</li>
                </ul>
              </div>

              <div className="p-4 bg-green-50 rounded-xl">
                <h4 className="font-medium text-green-900 text-sm mb-2">Versijų valdymas</h4>
                <p className="text-xs text-green-800 leading-relaxed">
                  Galite peržiūrėti visą pakeitimų istoriją ir grįžti prie bet kurios ankstesnės versijos.
                  Prieš grįžimą sistema automatiškai sukurs atsarginę kopiją.
                </p>
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
                <div className="text-center py-12">
                  <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-gray-900 mb-1">Nėra versijų</h3>
                  <p className="text-xs text-gray-500">
                    Versijos bus sukurtos kai atliksite pakeitimus
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="p-3.5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm text-gray-900">
                              v{version.version_number}
                            </span>
                            {version.is_revert && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">
                                Grąžinta
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {version.change_description || 'Pakeitimas'} • {formatDate(version.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="ml-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-blue-100 hover:text-blue-700 transition-colors disabled:opacity-50 inline-flex items-center space-x-1"
                        >
                          {revertingVersion === version.version_number ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600" />
                          ) : (
                            <>
                              <RotateCcw className="w-3 h-3" />
                              <span>Grąžinti</span>
                            </>
                          )}
                        </button>
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
