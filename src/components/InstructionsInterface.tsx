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
import { colors } from '../lib/designSystem';

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
      <div className="flex-1 flex items-center justify-center" style={{ background: colors.bg.secondary }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{
            background: colors.status.error,
            color: colors.status.errorText
          }}>
            <Shield className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>Prieiga uždrausta</h3>
          <p style={{ color: colors.text.secondary }}>Jums reikia administratoriaus teisių</p>
        </div>
      </div>
    );
  }

  // Versions View
  if (view === 'versions') {
    return (
      <div className="h-full flex flex-col" style={{ background: colors.bg.secondary }}>
        {/* Simple Header */}
        <div className="px-6 py-4" style={{
          background: colors.bg.white,
          borderBottom: `1px solid ${colors.border.default}`
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BackButton onClick={() => setView('editor')} />
              <div className="w-px h-5" style={{ background: colors.border.default }} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: colors.interactive.accent }}>
                <Clock className="w-4 h-4" style={{ color: colors.bg.white }} />
              </div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>Versijų istorija</h2>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="px-6 pt-4">
            {error && (
              <div className="flex items-center space-x-2 p-3 rounded-lg" style={{
                color: colors.status.errorText,
                background: colors.status.error,
                border: `1px solid ${colors.status.errorBorder}`
              }}>
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
              </div>
            )}
            {success && (
              <div className="flex items-center space-x-2 p-3 rounded-lg" style={{
                color: colors.status.successText,
                background: colors.status.success,
                border: `1px solid ${colors.status.successBorder}`
              }}>
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
                <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: colors.bg.white }} />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-16" style={{ color: colors.text.secondary }}>
              <Clock className="w-12 h-12 mx-auto mb-3" style={{ color: colors.border.default }} />
              <p>Versijų dar nėra</p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {versions.map((version, index) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  index={index}
                  onRevert={handleRevert}
                  revertingVersion={revertingVersion}
                  getRelativeTime={getRelativeTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Editor View - Document Style
  return (
    <div className="h-full flex" style={{ background: colors.bg.white }}>
      {/* Left Sidebar - Table of Contents */}
      <div className="w-72 flex flex-col" style={{
        borderRight: `1px solid ${colors.border.default}`,
        background: colors.bg.secondary
      }}>
        {/* Sidebar Header */}
        <div className="p-4" style={{
          borderBottom: `1px solid ${colors.border.default}`,
          background: colors.interactive.accentLight
        }}>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: colors.interactive.accent }}>
              <BookOpen className="w-3.5 h-3.5" style={{ color: colors.bg.white }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: colors.text.primary }}>AI Agento Instrukcijos</h2>
          </div>
          <p className="text-xs ml-8" style={{ color: colors.text.secondary }}>
            {variables.filter(v => v.content).length} iš {variables.length} užpildyta
          </p>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 rounded animate-pulse" style={{ background: colors.border.default }} />
              ))}
            </div>
          ) : (
            <nav className="space-y-0.5 px-2">
              {variables.map((variable, index) => (
                <NavButton
                  key={variable.id}
                  variable={variable}
                  index={index}
                  isSelected={selectedIndex === index}
                  onClick={() => setSelectedIndex(index)}
                />
              ))}
            </nav>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3" style={{ borderTop: `1px solid ${colors.border.default}` }}>
          <VersionHistoryButton onClick={() => setView('versions')} />
        </div>
      </div>

      {/* Right Panel - Content Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedVariable ? (
          <>
            {/* Content Header */}
            <div className="px-8 py-5" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                      color: colors.interactive.accent,
                      background: colors.interactive.accentLight,
                      border: `1px solid ${colors.interactive.accent}33`
                    }}>
                      {selectedVariable.variable_key}
                    </span>
                    <span className="text-xs" style={{ color: colors.border.default }}>•</span>
                    <span className="text-xs" style={{ color: colors.text.tertiary }}>
                      Sekcija {selectedIndex + 1} iš {variables.length}
                    </span>
                  </div>
                  <h1 className="text-xl font-semibold" style={{ color: colors.text.primary }}>
                    {selectedVariable.variable_name}
                  </h1>
                  {selectedVariable.description && (
                    <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>{selectedVariable.description}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {isEditing ? (
                    <>
                      <CancelButton onClick={handleCancelEdit} />
                      <SaveButton
                        onClick={handleSave}
                        disabled={saving || editContent === selectedVariable.content}
                        saving={saving}
                      />
                    </>
                  ) : (
                    <EditButton onClick={() => setShowPasswordInput(true)} />
                  )}
                </div>
              </div>

              {/* Password Input */}
              {showPasswordInput && !isAuthenticated && (
                <PasswordInput
                  password={password}
                  passwordError={passwordError}
                  onPasswordChange={(e) => setPassword(e.target.value)}
                  onAuthenticate={handleAuthenticate}
                  onCancel={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
                />
              )}

              {/* Messages */}
              {error && (
                <div className="mt-4 flex items-center space-x-2 p-3 rounded-lg" style={{
                  color: colors.status.errorText,
                  background: colors.status.error,
                  border: `1px solid ${colors.status.errorBorder}`
                }}>
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
              )}
              {success && (
                <div className="mt-4 flex items-center space-x-2 p-3 rounded-lg" style={{
                  color: colors.status.successText,
                  background: colors.status.success,
                  border: `1px solid ${colors.status.successBorder}`
                }}>
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
                    className="w-full min-h-[500px] p-4 text-sm resize-none focus:outline-none transition-colors"
                    style={{
                      color: colors.text.primary,
                      background: colors.bg.secondary,
                      border: `1px solid ${colors.border.default}`,
                      borderRadius: '8px',
                      lineHeight: '1.75',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                    }}
                    onFocus={(e) => {
                      e.target.style.background = colors.bg.white;
                      e.target.style.border = `2px solid ${colors.interactive.accent}`;
                    }}
                    onBlur={(e) => {
                      e.target.style.background = colors.bg.secondary;
                      e.target.style.border = `1px solid ${colors.border.default}`;
                    }}
                    placeholder="Įveskite instrukcijos turinį..."
                    autoFocus
                  />
                ) : (
                  <div className="prose prose-sm max-w-none">
                    {selectedVariable.content ? (
                      <pre
                        className="whitespace-pre-wrap text-sm p-6 rounded-lg"
                        style={{
                          color: colors.text.secondary,
                          background: colors.bg.secondary,
                          border: `1px solid ${colors.border.light}`,
                          lineHeight: '1.75',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'
                        }}
                      >
                        {selectedVariable.content}
                      </pre>
                    ) : (
                      <EmptyContentPlaceholder onClick={() => setShowPasswordInput(true)} />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Footer - Fixed at bottom */}
            <div className="px-8 py-4 flex-shrink-0" style={{
              borderTop: `1px solid ${colors.border.default}`,
              background: colors.bg.white
            }}>
              <div className="flex items-center justify-between">
                <PrevButton
                  onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                  disabled={selectedIndex === 0}
                />
                <span className="text-sm font-medium" style={{ color: colors.text.tertiary }}>
                  {selectedIndex + 1} / {variables.length}
                </span>
                <NextButton
                  onClick={() => setSelectedIndex(Math.min(variables.length - 1, selectedIndex + 1))}
                  disabled={selectedIndex === variables.length - 1}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ color: colors.text.secondary }}>
            <div className="text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-3" style={{ color: colors.border.default }} />
              <p>Pasirinkite instrukciją iš sąrašo</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components

function BackButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="transition-colors"
      style={{ color: isHovered ? colors.interactive.accent : colors.text.secondary }}
    >
      ← Atgal
    </button>
  );
}

function VersionCard({
  version,
  index,
  onRevert,
  revertingVersion,
  getRelativeTime
}: {
  version: InstructionVersion;
  index: number;
  onRevert: (versionNumber: number) => void;
  revertingVersion: number | null;
  getRelativeTime: (date: string) => string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const isCurrent = index === 0;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: isCurrent ? colors.interactive.accentLight : colors.bg.white,
        border: `1px solid ${isCurrent ? colors.interactive.accent + '33' : colors.border.default}`
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-mono px-2 py-1 rounded" style={{
            background: isCurrent ? colors.interactive.accentLight : colors.bg.secondary,
            color: isCurrent ? colors.interactive.accent : colors.text.secondary
          }}>
            v{version.version_number}
          </span>
          <div>
            <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
              {version.variable_key}
            </p>
            <p className="text-xs" style={{ color: colors.text.tertiary }}>
              {version.changed_by_email || 'Sistema'} • {getRelativeTime(version.created_at)}
            </p>
          </div>
        </div>
        {isCurrent ? (
          <span className="text-xs font-medium" style={{ color: colors.interactive.accent }}>Dabartinė</span>
        ) : (
          <button
            onClick={() => onRevert(version.version_number)}
            disabled={revertingVersion === version.version_number}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="text-sm flex items-center space-x-1 transition-colors"
            style={{ color: isHovered ? colors.interactive.accent : colors.text.secondary }}
          >
            {revertingVersion === version.version_number ? (
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{
                borderColor: colors.border.default,
                borderTopColor: colors.text.primary
              }} />
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
  );
}

function NavButton({
  variable,
  index,
  isSelected,
  onClick
}: {
  variable: InstructionVariable;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all group"
      style={{
        background: isSelected ? colors.bg.white : (isHovered ? colors.bg.white + '99' : 'transparent'),
        boxShadow: isSelected ? '0 1px 3px 0 rgba(0, 0, 0, 0.05)' : 'none',
        border: isSelected ? `1px solid ${colors.interactive.accent}33` : '1px solid transparent',
        borderLeft: isSelected ? `2px solid ${colors.interactive.accent}` : '2px solid transparent'
      }}
    >
      <div className="flex items-start space-x-3">
        <span className="text-xs font-mono mt-0.5" style={{
          color: isSelected ? colors.interactive.accent : colors.text.tertiary
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{
            color: isSelected ? colors.text.primary : colors.text.secondary
          }}>
            {variable.variable_name}
          </p>
          {!variable.content && (
            <p className="text-xs mt-0.5" style={{ color: colors.status.warningText }}>Tuščia</p>
          )}
        </div>
        {isSelected && (
          <ChevronRight className="w-4 h-4 mt-0.5" style={{ color: colors.interactive.accent }} />
        )}
      </div>
    </button>
  );
}

function VersionHistoryButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors"
      style={{
        color: isHovered ? colors.interactive.accent : colors.text.secondary,
        background: isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <Clock className="w-4 h-4" />
      <span>Versijų istorija</span>
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg transition-colors"
      style={{
        color: isHovered ? colors.text.primary : colors.text.secondary,
        border: `1px solid ${colors.border.default}`,
        background: isHovered ? colors.bg.secondary : 'transparent'
      }}
    >
      Atšaukti
    </button>
  );
}

function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
      style={{
        background: disabled ? colors.interactive.accent : (isHovered ? colors.interactive.accentHover : colors.interactive.accent),
        color: colors.bg.white
      }}
    >
      {saving ? (
        <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{
          borderColor: colors.bg.white + '33',
          borderTopColor: colors.bg.white
        }} />
      ) : (
        <Save className="w-4 h-4" />
      )}
      <span>Išsaugoti</span>
    </button>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center space-x-2"
      style={{
        color: colors.interactive.accent,
        background: isHovered ? colors.interactive.accentLight : colors.interactive.accentLight + '80',
        border: `1px solid ${colors.interactive.accent}33`
      }}
    >
      <Pencil className="w-4 h-4" />
      <span>Redaguoti</span>
    </button>
  );
}

function PasswordInput({
  password,
  passwordError,
  onPasswordChange,
  onAuthenticate,
  onCancel
}: {
  password: string;
  passwordError: string;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAuthenticate: () => void;
  onCancel: () => void;
}) {
  const [confirmHovered, setConfirmHovered] = React.useState(false);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8"
        style={{ border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lock Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: colors.interactive.accentLight }}
          >
            <Lock className="w-8 h-8" style={{ color: colors.interactive.accent }} />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-center text-lg font-semibold mb-6" style={{ color: colors.text.primary }}>
          Dokumentas apsaugotas
        </h3>

        {/* Password Input */}
        <input
          type="password"
          value={password}
          onChange={onPasswordChange}
          onKeyDown={(e) => e.key === 'Enter' && onAuthenticate()}
          placeholder="Slaptažodis"
          className="w-full px-4 py-3 text-sm rounded-lg focus:outline-none transition-all mb-4"
          style={{
            border: `2px solid ${passwordError ? colors.status.errorBorder : colors.border.default}`,
            background: colors.bg.white,
            color: colors.text.primary
          }}
          onFocus={(e) => e.target.style.borderColor = colors.interactive.accent}
          onBlur={(e) => e.target.style.borderColor = passwordError ? colors.status.errorBorder : colors.border.default}
          autoFocus
        />

        {/* Error Message */}
        {passwordError && (
          <p className="text-xs text-center mb-4" style={{ color: colors.status.errorText }}>
            {passwordError}
          </p>
        )}

        {/* Confirm Button */}
        <button
          onClick={onAuthenticate}
          onMouseEnter={() => setConfirmHovered(true)}
          onMouseLeave={() => setConfirmHovered(false)}
          className="w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors"
          style={{
            color: colors.bg.white,
            background: confirmHovered ? colors.interactive.accentHover : colors.interactive.accent
          }}
        >
          Patvirtinti
        </button>
      </div>
    </div>
  );
}

function EmptyContentPlaceholder({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div className="text-center py-16 rounded-lg border-2 border-dashed" style={{
      background: `linear-gradient(to bottom, ${colors.interactive.accentLight}80, ${colors.bg.secondary})`,
      borderColor: colors.interactive.accent + '33'
    }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{
        background: colors.interactive.accentLight
      }}>
        <FileText className="w-6 h-6" style={{ color: colors.interactive.accent }} />
      </div>
      <p className="mb-4" style={{ color: colors.text.secondary }}>Ši sekcija dar neužpildyta</p>
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="px-4 py-2 text-sm rounded-lg transition-colors"
        style={{
          color: colors.interactive.accent,
          border: `1px solid ${colors.interactive.accent}`,
          background: isHovered ? colors.interactive.accentLight : 'transparent'
        }}
      >
        Pridėti turinį
      </button>
    </div>
  );
}

function PrevButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center space-x-2 px-4 py-2 text-sm rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        color: disabled ? colors.text.tertiary : (isHovered ? colors.interactive.accent : colors.text.secondary),
        background: !disabled && isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <span>←</span>
      <span>Ankstesnė</span>
    </button>
  );
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center space-x-2 px-4 py-2 text-sm rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        color: disabled ? colors.text.tertiary : (isHovered ? colors.interactive.accent : colors.text.secondary),
        background: !disabled && isHovered ? colors.interactive.accentLight : 'transparent'
      }}
    >
      <span>Kita</span>
      <span>→</span>
    </button>
  );
}
