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
  FileText
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
    setView('editor');
  };

  const handleAuthenticate = async () => {
    setPasswordError('');
    const isValid = await verifyUserPassword(user.email, password);
    if (isValid) {
      setIsAuthenticated(true);
      setIsEditing(true);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center space-x-3">
            {view !== 'cards' && (
              <button
                onClick={handleBack}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {view === 'cards' && 'Agento Instrukcijos'}
                {view === 'editor' && selectedVariable?.variable_name}
                {view === 'help' && 'Pagalba'}
                {view === 'versions' && 'Versijų istorija'}
              </h2>
              {view === 'cards' && (
                <p className="text-sm text-gray-600 mt-0.5">
                  Sistemos instrukcijų valdymas
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {view === 'cards' && (
              <>
                <button
                  onClick={() => setView('versions')}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  title="Versijų istorija"
                >
                  <History className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => setView('help')}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  title="Pagalba"
                >
                  <HelpCircle className="w-5 h-5 text-gray-600" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-5 mt-4 flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-5 mt-4 flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-lg">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Cards View */}
          {view === 'cards' && (
            <>
              {/* Warning Banner */}
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-800">Dėmesio!</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Šios instrukcijos tiesiogiai veikia agento elgseną. Neteisingi pakeitimai gali sugadinti
                      agento funkcionalumą. Prieš redaguojant rekomenduojame peržiūrėti pagalbos skiltį.
                    </p>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {variables.map((variable, index) => (
                    <button
                      key={variable.id}
                      onClick={() => handleSelectVariable(variable)}
                      className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-amber-300 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-sm flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 group-hover:text-amber-700 transition-colors">
                            {variable.variable_name}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {variable.content
                              ? `${variable.content.substring(0, 60)}...`
                              : 'Tuščia instrukcija'
                            }
                          </p>
                        </div>
                        <Edit3 className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors flex-shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Editor View */}
          {view === 'editor' && selectedVariable && (
            <div className="space-y-4">
              {/* Password Gate */}
              {!isAuthenticated && !isEditing ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Peržiūrėti instrukciją
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 mb-6 max-h-[300px] overflow-y-auto text-left">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {selectedVariable.content || 'Ši instrukcija dar neužpildyta.'}
                    </pre>
                  </div>
                  <button
                    onClick={() => {
                      setPassword('');
                      setPasswordError('');
                    }}
                    className="px-6 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors inline-flex items-center space-x-2"
                    data-action="show-password"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Redaguoti</span>
                  </button>

                  {/* Password Input (shows when clicking Edit) */}
                  {password !== undefined && (
                    <div className="mt-6 max-w-sm mx-auto">
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                        Įveskite savo slaptažodį
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        autoFocus
                      />
                      {passwordError && (
                        <p className="text-sm text-red-600 mt-2">{passwordError}</p>
                      )}
                      <button
                        onClick={handleAuthenticate}
                        className="w-full mt-3 px-6 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors"
                      >
                        Patvirtinti
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Editor */}
                  <div className="relative">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      disabled={!isEditing}
                      className="w-full h-[400px] p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-600 font-sans text-sm leading-relaxed"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        lineHeight: '1.6'
                      }}
                      placeholder="Įveskite instrukcijos turinį..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-gray-500">
                      {selectedVariable.updated_at && (
                        <span>
                          Atnaujinta: {formatDate(selectedVariable.updated_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      {isEditing && (
                        <>
                          <button
                            onClick={() => {
                              setEditContent(selectedVariable.content);
                              setIsEditing(false);
                              setIsAuthenticated(false);
                            }}
                            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                          >
                            Atšaukti
                          </button>
                          <button
                            onClick={handleSave}
                            disabled={saving || editContent === selectedVariable.content}
                            className="px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center space-x-2"
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
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Help View */}
          {view === 'help' && (
            <div className="prose prose-sm max-w-none">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Kaip naudotis instrukcijomis</h3>

              <div className="space-y-6">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-medium text-blue-900 mb-2">Kas yra agento instrukcijos?</h4>
                  <p className="text-sm text-blue-800">
                    Instrukcijos yra sistemos prompt'ai, kurie nurodo agentui kaip elgtis skirtingose situacijose.
                    Kiekviena instrukcija atitinka tam tikrą darbo eigos fazę arba funkcionalumą.
                  </p>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl">
                  <h4 className="font-medium text-amber-900 mb-2">Svarbu prieš redaguojant</h4>
                  <ul className="text-sm text-amber-800 space-y-2 list-disc pl-5">
                    <li>Visada išsaugokite dabartinę versiją prieš keisdami (sistema tai daro automatiškai)</li>
                    <li>Testuokite pakeitimus mažais žingsniais</li>
                    <li>Venkite trinti esamas instrukcijas - geriau jas papildyti</li>
                    <li>Naudokite aiškią, struktūrizuotą kalbą</li>
                  </ul>
                </div>

                <div className="p-4 bg-green-50 rounded-xl">
                  <h4 className="font-medium text-green-900 mb-2">Versijų valdymas</h4>
                  <p className="text-sm text-green-800 mb-2">
                    Sistema automatiškai išsaugo kiekvieno pakeitimo versiją. Galite:
                  </p>
                  <ul className="text-sm text-green-800 space-y-1 list-disc pl-5">
                    <li>Peržiūrėti visą pakeitimų istoriją</li>
                    <li>Grįžti prie bet kurios ankstesnės versijos</li>
                    <li>Prieš grįžimą sistema automatiškai sukurs atsarginę kopiją</li>
                  </ul>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-medium text-gray-900 mb-2">Instrukcijų eiliškumas</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Instrukcijos yra išdėstytos pagal agento darbo eigos logiką:
                  </p>
                  <ol className="text-sm text-gray-700 space-y-1 list-decimal pl-5">
                    <li><strong>Darbo eigos apžvalga</strong> - bendras proceso aprašymas</li>
                    <li><strong>Būsenos valdymas</strong> - kaip sekti pokalbio būseną</li>
                    <li><strong>1-4 Fazės</strong> - konkretūs darbo etapai</li>
                    <li><strong>Patikros ir klaidų sprendimas</strong> - kokybės užtikrinimas</li>
                    <li><strong>Pavyzdžiai ir atvaizdavimas</strong> - papildoma informacija</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Versions View */}
          {view === 'versions' && (
            <div>
              {loadingVersions ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">Nėra versijų</h3>
                  <p className="text-sm text-gray-500">
                    Versijos bus sukurtos kai atliksite pakeitimus
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900">
                              Versija #{version.version_number}
                            </span>
                            {version.is_revert && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                Grąžinta
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {version.change_description || 'Pakeitimas'}
                          </p>
                          <p className="text-xs text-gray-400 mt-2">
                            {formatDate(version.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevert(version.version_number)}
                          disabled={revertingVersion === version.version_number}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-amber-100 hover:text-amber-700 transition-colors disabled:opacity-50 inline-flex items-center space-x-1.5"
                        >
                          {revertingVersion === version.version_number ? (
                            <>
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-600" />
                              <span>Grąžinama...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
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
