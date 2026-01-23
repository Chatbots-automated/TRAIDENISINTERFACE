import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  FileText,
  Package,
  Database,
  Settings
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  getWebhooks,
  updateWebhook,
  testWebhook,
  Webhook
} from '../lib/webhooksService';
import { colors } from '../lib/designSystem';

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

type WebhookCategory = 'nestandartiniai' | 'documents' | 'general' | 'all';

interface WebhookGroup {
  category: WebhookCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
  webhookKeys: string[];
}

const WEBHOOK_GROUPS: WebhookGroup[] = [
  {
    category: 'nestandartiniai',
    label: 'Nestandartiniai Gaminiai',
    icon: <Package className="w-4 h-4" />,
    description: 'EML upload and project management webhooks',
    webhookKeys: [
      'n8n_upload_new',
      'n8n_find_similar',
      'n8n_upload_solution'
    ]
  },
  {
    category: 'documents',
    label: 'Documents',
    icon: <FileText className="w-4 h-4" />,
    description: 'Document processing webhooks',
    webhookKeys: [
      'document_upload',
      'document_process'
    ]
  },
  {
    category: 'general',
    label: 'General',
    icon: <Settings className="w-4 h-4" />,
    description: 'General system webhooks',
    webhookKeys: [
      'general_webhook'
    ]
  }
];

export default function WebhooksModal({ isOpen, onClose, user }: WebhooksModalProps) {
  const [activeTab, setActiveTab] = useState<WebhookCategory>('nestandartiniai');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: number; success: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadWebhooks();
    }
  }, [isOpen]);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWebhooks();
      setWebhooks(data);
    } catch (err: any) {
      setError('Nepavyko įkelti webhook\'ų');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingId(webhook.id);
    setEditUrl(webhook.url);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditUrl('');
  };

  const handleSave = async (webhook: Webhook) => {
    if (!editUrl.trim()) return;

    try {
      setSaving(true);
      setError(null);
      const result = await updateWebhook(webhook.webhook_key, editUrl.trim());

      if (result.success) {
        setSuccess('Webhook atnaujintas sėkmingai');
        setTimeout(() => setSuccess(null), 3000);
        setEditingId(null);
        setEditUrl('');
        await loadWebhooks();
      } else {
        setError(result.error || 'Nepavyko išsaugoti');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      setTesting(webhook.id);
      setError(null);
      const result = await testWebhook(webhook.webhook_key, webhook.url);

      setTestResults(prev => ({
        ...prev,
        [webhook.id]: { status: result.status, success: result.success }
      }));

      if (result.success) {
        setSuccess(`Webhook testas sėkmingas: ${result.status} OK`);
        setTimeout(() => setSuccess(null), 3000);
      }

      // Clear result after 5 seconds
      setTimeout(() => {
        setTestResults(prev => {
          const newResults = { ...prev };
          delete newResults[webhook.id];
          return newResults;
        });
      }, 5000);

      await loadWebhooks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(null);
    }
  };

  const getStatusStyles = (status: number) => {
    if (status >= 200 && status < 300) return { background: colors.status.success, color: colors.status.successText, border: `1px solid ${colors.status.successBorder}` };
    if (status >= 400) return { background: colors.status.error, color: colors.status.errorText, border: `1px solid ${colors.status.errorBorder}` };
    if (status === 0) return { background: colors.status.error, color: colors.status.errorText, border: `1px solid ${colors.status.errorBorder}` };
    return { background: colors.bg.secondary, color: colors.text.tertiary, border: `1px solid ${colors.border.default}` };
  };

  const getStatusText = (status: number) => {
    if (status === 0) return 'Connection Error';
    if (status >= 200 && status < 300) return `${status} OK`;
    return `${status} Error`;
  };

  const getFilteredWebhooks = () => {
    const activeGroup = WEBHOOK_GROUPS.find(g => g.category === activeTab);
    if (!activeGroup) return [];

    return webhooks.filter(webhook =>
      activeGroup.webhookKeys.some(key =>
        webhook.webhook_key.toLowerCase().includes(key.toLowerCase())
      )
    );
  };

  const filteredWebhooks = getFilteredWebhooks();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-4xl my-8"
        style={{ border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b" style={{ borderColor: colors.border.light, background: colors.bg.secondary }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.icon.default }}>
                <Zap className="w-5 h-5" style={{ color: colors.interactive.accent }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold" style={{ color: colors.text.primary }}>
                  Webhook Configuration
                </h2>
                <p className="text-sm mt-0.5" style={{ color: colors.text.secondary }}>
                  Manage your n8n webhook endpoints
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" style={{ color: colors.text.tertiary }} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 pb-2 border-b" style={{ borderColor: colors.border.default }}>
          <div className="flex gap-2">
            {WEBHOOK_GROUPS.map((group) => (
              <button
                key={group.category}
                onClick={() => setActiveTab(group.category)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: activeTab === group.category ? colors.interactive.accent : colors.bg.secondary,
                  color: activeTab === group.category ? '#ffffff' : colors.text.secondary,
                  border: `1px solid ${activeTab === group.category ? colors.interactive.accent : colors.border.default}`
                }}
              >
                {group.icon}
                <span>{group.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-3 p-3 rounded-lg text-sm" style={{ background: colors.status.error, color: colors.status.errorText, border: `1px solid ${colors.status.errorBorder}` }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
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
          <div className="mx-6 mt-4 flex items-center gap-3 p-3 rounded-lg text-sm" style={{ background: colors.status.success, color: colors.status.successText, border: `1px solid ${colors.status.successBorder}` }}>
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Tab Description */}
        {WEBHOOK_GROUPS.find(g => g.category === activeTab) && (
          <div className="px-6 pt-4">
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              {WEBHOOK_GROUPS.find(g => g.category === activeTab)?.description}
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="px-6 py-5 min-h-[300px]">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: colors.icon.default }}>
                <Zap className="w-8 h-8" style={{ color: colors.text.tertiary }} />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: colors.text.primary }}>
                Webhook'ų nerasta
              </h3>
              <p className="text-sm" style={{ color: colors.text.secondary }}>
                Šioje kategorijoje nėra sukonfigūruotų webhook'ų
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredWebhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="p-5 rounded-lg transition-all"
                  style={{ background: colors.bg.white, border: `1px solid ${colors.border.default}` }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <h3 className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                          {webhook.webhook_name}
                        </h3>
                        {testResults[webhook.id] && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded" style={getStatusStyles(testResults[webhook.id].status)}>
                            {getStatusText(testResults[webhook.id].status)}
                          </span>
                        )}
                      </div>
                      {webhook.description && (
                        <p className="text-xs" style={{ color: colors.text.secondary }}>
                          {webhook.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* URL Display/Edit */}
                  {editingId === webhook.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-2" style={{ color: colors.text.secondary }}>
                          Webhook URL
                        </label>
                        <input
                          type="text"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm rounded-lg border"
                          style={{
                            borderColor: colors.border.default,
                            background: colors.bg.white,
                            color: colors.text.primary
                          }}
                          placeholder="https://your-n8n-instance.com/webhook/..."
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            background: colors.interactive.buttonInactiveBg,
                            color: colors.interactive.buttonInactiveText
                          }}
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={() => handleSave(webhook)}
                          disabled={saving || !editUrl.trim() || editUrl === webhook.url}
                          className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
                          style={{
                            background: colors.interactive.accent,
                            color: '#ffffff'
                          }}
                        >
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Išsaugoma...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Išsaugoti</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <label className="block text-xs font-medium mb-2" style={{ color: colors.text.secondary }}>
                          Current URL
                        </label>
                        <div className="flex items-center space-x-2">
                          <code className="flex-1 text-xs px-3 py-2.5 rounded-lg border font-mono truncate" style={{
                            background: colors.bg.secondary,
                            color: colors.text.primary,
                            borderColor: colors.border.light
                          }}>
                            {webhook.url}
                          </code>
                          <a
                            href={webhook.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg transition-colors flex-shrink-0"
                            style={{ color: colors.text.tertiary }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = colors.interactive.accent;
                              e.currentTarget.style.background = colors.interactive.accentLight;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = colors.text.tertiary;
                              e.currentTarget.style.background = 'transparent';
                            }}
                            title="Open in browser"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>

                      {/* Last Test Info */}
                      {webhook.last_tested_at && (
                        <div className="mb-4 pb-4 border-b" style={{ borderColor: colors.border.light }}>
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: colors.text.secondary }}>Last tested:</span>
                            <div className="flex items-center space-x-2">
                              <span style={{ color: colors.text.secondary }}>
                                {new Date(webhook.last_tested_at).toLocaleString('lt-LT')}
                              </span>
                              {webhook.last_test_status && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded" style={getStatusStyles(webhook.last_test_status)}>
                                  {getStatusText(webhook.last_test_status)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleEdit(webhook)}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          style={{
                            background: colors.interactive.buttonInactiveBg,
                            color: colors.interactive.buttonInactiveText
                          }}
                        >
                          Redaguoti URL
                        </button>
                        <button
                          onClick={() => handleTest(webhook)}
                          disabled={testing === webhook.id}
                          className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center space-x-2"
                          style={{
                            background: colors.interactive.accent,
                            color: '#ffffff'
                          }}
                          onMouseEnter={(e) => !testing && (e.currentTarget.style.background = colors.interactive.accentHover)}
                          onMouseLeave={(e) => !testing && (e.currentTarget.style.background = colors.interactive.accent)}
                        >
                          {testing === webhook.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Testuojama...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              <span>Test Endpoint</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t rounded-b-xl" style={{
          borderColor: colors.border.light,
          background: colors.bg.secondary
        }}>
          <div className="flex items-center justify-between text-xs" style={{ color: colors.text.secondary }}>
            <div className="flex items-center space-x-2">
              <Database className="w-3.5 h-3.5" />
              <span>
                {filteredWebhooks.length} webhook{filteredWebhooks.length !== 1 ? 's' : ''} in this category
              </span>
            </div>
            <button
              onClick={onClose}
              className="font-medium transition-colors"
              style={{ color: colors.text.secondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = colors.text.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = colors.text.secondary}
            >
              Uždaryti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
